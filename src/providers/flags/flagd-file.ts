// A small OpenFeature provider that reads flags from a file in flagd's JSON format
// (https://flagd.dev/reference/flag-definitions/). Used instead of @openfeature/flagd-provider,
// which needs gRPC. Supported: "state" (ENABLED/DISABLED), "variants", "defaultVariant".
// Not supported in v1: "targeting" rules and "$evaluators" (the default variant is used and the
// reason says so). The file is re-read when its modification time changes, so a flag can be
// switched by editing or re-mounting the file, without a deploy.
import { readFile, stat } from 'node:fs/promises';
import { ErrorCode, StandardResolutionReasons, type JsonValue, type Provider, type ResolutionDetails } from '@openfeature/server-sdk';

interface FlagDefinition {
  state?: string;
  variants?: Record<string, JsonValue>;
  defaultVariant?: string;
  targeting?: unknown;
}

interface FlagFile {
  flags?: Record<string, FlagDefinition>;
}

export interface FlagdFileProviderOptions {
  path: string;
  /** Minimum time between file checks. */
  checkIntervalMs?: number;
  onWarning?: (message: string) => void;
}

export class FlagdFileProvider implements Provider {
  readonly metadata = { name: 'flagd-file' } as const;
  readonly runsOn = 'server' as const;
  private flags: Record<string, FlagDefinition> | null = null;
  private mtimeMs = -1;
  private lastCheck = 0;
  private loadError: string | null = null;

  constructor(private readonly opts: FlagdFileProviderOptions) {}

  private async refresh(): Promise<void> {
    const now = Date.now();
    if (this.flags !== null && now - this.lastCheck < (this.opts.checkIntervalMs ?? 1000)) return;
    this.lastCheck = now;
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(this.opts.path)).mtimeMs;
    } catch {
      if (this.loadError !== 'missing') this.opts.onWarning?.(`flag file ${this.opts.path} not found; using defaults`);
      this.loadError = 'missing';
      this.flags = this.flags ?? {};
      return;
    }
    if (mtimeMs === this.mtimeMs && this.flags !== null) return;
    try {
      const parsed = JSON.parse(await readFile(this.opts.path, 'utf8')) as FlagFile;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.flags !== 'object' || parsed.flags === null) throw new Error('missing "flags" object');
      this.flags = parsed.flags;
      this.mtimeMs = mtimeMs;
      this.loadError = null;
    } catch (err) {
      // Keep the last good configuration; never fail open into a half-written file.
      this.loadError = (err as Error).message;
      this.opts.onWarning?.(`flag file ${this.opts.path} is invalid (${this.loadError}); keeping the previous flags`);
      this.flags = this.flags ?? {};
    }
  }

  private async resolve<T extends JsonValue>(key: string, defaultValue: T, type: string): Promise<ResolutionDetails<T>> {
    await this.refresh();
    const flag = this.flags?.[key];
    if (!flag) {
      return { value: defaultValue, reason: StandardResolutionReasons.ERROR, errorCode: ErrorCode.FLAG_NOT_FOUND, errorMessage: `flag ${key} not found` };
    }
    if (flag.state === 'DISABLED') return { value: defaultValue, reason: StandardResolutionReasons.DISABLED };
    const variant = flag.defaultVariant;
    const value = variant !== undefined ? flag.variants?.[variant] : undefined;
    if (variant === undefined || value === undefined) {
      return { value: defaultValue, reason: StandardResolutionReasons.ERROR, errorCode: ErrorCode.PARSE_ERROR, errorMessage: `flag ${key} has no valid defaultVariant` };
    }
    const actual = Array.isArray(value) ? 'object' : value === null ? 'object' : typeof value;
    if (actual !== type) {
      return { value: defaultValue, reason: StandardResolutionReasons.ERROR, errorCode: ErrorCode.TYPE_MISMATCH, errorMessage: `flag ${key} is ${actual}, not ${type}` };
    }
    if (flag.targeting !== undefined && JSON.stringify(flag.targeting) !== '{}') {
      this.opts.onWarning?.(`flag ${key}: targeting rules are not supported by flagd-file; using the default variant`);
      return { value: value as T, variant, reason: StandardResolutionReasons.DEFAULT };
    }
    return { value: value as T, variant, reason: StandardResolutionReasons.STATIC };
  }

  resolveBooleanEvaluation(key: string, defaultValue: boolean): Promise<ResolutionDetails<boolean>> {
    return this.resolve(key, defaultValue, 'boolean');
  }
  resolveStringEvaluation(key: string, defaultValue: string): Promise<ResolutionDetails<string>> {
    return this.resolve(key, defaultValue, 'string');
  }
  resolveNumberEvaluation(key: string, defaultValue: number): Promise<ResolutionDetails<number>> {
    return this.resolve(key, defaultValue, 'number');
  }
  resolveObjectEvaluation<T extends JsonValue>(key: string, defaultValue: T): Promise<ResolutionDetails<T>> {
    return this.resolve(key, defaultValue, 'object');
  }
}
