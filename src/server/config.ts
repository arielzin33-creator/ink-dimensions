// Configuration comes only from environment variables (documented in .env.example).
// Twins are the default for every provider, so the app runs with no network and no keys.

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export type LlmConfig =
  | { provider: 'twin' }
  | { provider: 'anthropic'; apiKey: string; model: string; baseUrl: string; timeoutMs: number; maxTokens: number }
  | { provider: 'local'; url: string; model: string; apiKey: string | undefined; timeoutMs: number; maxTokens: number };

export type ImageConfig =
  | { provider: 'twin' }
  | { provider: 'hosted'; url: string; apiKey: string; timeoutMs: number; allowPhotos: boolean }
  | { provider: 'comfyui'; url: string; workflowPath: string; timeoutMs: number; pollMs: number };

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  release: string;
  logLevel: LogLevel;
  databaseUrl: string | undefined;
  pgliteDir: string;
  storage: { provider: 'local'; dir: string } | { provider: 'memory' };
  webDir: string;
  migrationsDir: string;
  flagsFile: string;
  devVite: boolean;
  cookieSecure: boolean;
  uploadMaxBytes: number;
  llm: LlmConfig;
  image: ImageConfig;
  moderation: 'rules' | 'permissive';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type Env = Record<string, string | undefined>;

function str(env: Env, name: string): string | undefined {
  const v = env[name];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
}

function required(env: Env, name: string, why: string): string {
  const v = str(env, name);
  if (!v) throw new ConfigError(`${name} is required ${why}`);
  return v;
}

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const v = str(env, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const v = str(env, name);
  if (v === undefined) return fallback;
  if (['1', 'true', 'yes'].includes(v.toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(v.toLowerCase())) return false;
  throw new ConfigError(`${name} must be true or false`);
}

function oneOf<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const v = str(env, name) ?? fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new ConfigError(`${name} must be one of ${allowed.join(', ')}`);
  return v as T;
}

function url(env: Env, name: string, why: string): string {
  const v = required(env, name, why);
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new ConfigError(`${name} must be an http(s) URL`);
  }
  return v.replace(/\/+$/, '');
}

export function loadConfig(env: Env = process.env): Config {
  const nodeEnv = oneOf(env, 'NODE_ENV', ['development', 'production', 'test'] as const, 'development');
  const production = nodeEnv === 'production';

  const llmProvider = oneOf(env, 'LLM_PROVIDER', ['twin', 'anthropic', 'local'] as const, 'twin');
  let llm: LlmConfig;
  const llmTimeoutMs = int(env, 'LLM_TIMEOUT_MS', 120_000, 1_000, 600_000);
  const llmMaxTokens = int(env, 'LLM_MAX_TOKENS', 8_000, 256, 64_000);
  if (llmProvider === 'anthropic') {
    const why = 'when LLM_PROVIDER=anthropic';
    llm = {
      provider: 'anthropic',
      apiKey: required(env, 'ANTHROPIC_API_KEY', why),
      model: required(env, 'ANTHROPIC_MODEL', why),
      baseUrl: str(env, 'ANTHROPIC_BASE_URL') ? url(env, 'ANTHROPIC_BASE_URL', why) : 'https://api.anthropic.com',
      timeoutMs: llmTimeoutMs,
      maxTokens: llmMaxTokens,
    };
  } else if (llmProvider === 'local') {
    const why = 'when LLM_PROVIDER=local';
    llm = {
      provider: 'local',
      url: url(env, 'LOCAL_LLM_URL', why),
      model: required(env, 'LOCAL_LLM_MODEL', why),
      apiKey: str(env, 'LOCAL_LLM_API_KEY'),
      timeoutMs: llmTimeoutMs,
      maxTokens: llmMaxTokens,
    };
  } else {
    llm = { provider: 'twin' };
  }

  const imageProvider = oneOf(env, 'IMAGE_PROVIDER', ['twin', 'hosted', 'comfyui'] as const, 'twin');
  const imageTimeoutMs = int(env, 'IMAGE_TIMEOUT_MS', 180_000, 1_000, 900_000);
  let image: ImageConfig;
  if (imageProvider === 'hosted') {
    const why = 'when IMAGE_PROVIDER=hosted';
    image = {
      provider: 'hosted',
      url: url(env, 'HOSTED_IMAGE_URL', why),
      apiKey: required(env, 'HOSTED_IMAGE_API_KEY', why),
      timeoutMs: imageTimeoutMs,
      allowPhotos: bool(env, 'HOSTED_IMAGE_ALLOW_PHOTOS', false),
    };
  } else if (imageProvider === 'comfyui') {
    const why = 'when IMAGE_PROVIDER=comfyui';
    image = {
      provider: 'comfyui',
      url: url(env, 'COMFYUI_URL', why),
      workflowPath: required(env, 'COMFYUI_WORKFLOW_PATH', why),
      timeoutMs: imageTimeoutMs,
      pollMs: int(env, 'COMFYUI_POLL_MS', 1_000, 50, 60_000),
    };
  } else {
    image = { provider: 'twin' };
  }

  const moderation = oneOf(env, 'MODERATION_PROVIDER', ['rules', 'permissive'] as const, 'rules');
  if (production && moderation === 'permissive') {
    throw new ConfigError('MODERATION_PROVIDER=permissive is not allowed in production (constitution article 8)');
  }

  const storageProvider = oneOf(env, 'STORAGE_PROVIDER', ['local', 'memory'] as const, 'local');
  if (production && storageProvider === 'memory') {
    throw new ConfigError('STORAGE_PROVIDER=memory is not allowed in production');
  }

  return {
    nodeEnv,
    host: str(env, 'HOST') ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: int(env, 'PORT', 3000, 0, 65535),
    release: str(env, 'RELEASE') ?? 'dev',
    logLevel: oneOf(env, 'LOG_LEVEL', ['debug', 'info', 'warn', 'error', 'silent'] as const, 'info'),
    databaseUrl: str(env, 'DATABASE_URL'),
    pgliteDir: str(env, 'PGLITE_DIR') ?? '.data/pglite',
    storage: storageProvider === 'memory' ? { provider: 'memory' } : { provider: 'local', dir: str(env, 'STORAGE_DIR') ?? '.data/storage' },
    webDir: str(env, 'WEB_DIR') ?? 'dist/web',
    migrationsDir: str(env, 'MIGRATIONS_DIR') ?? 'migrations',
    flagsFile: str(env, 'FLAGS_FILE') ?? 'flags/flags.json',
    devVite: bool(env, 'DEV_VITE', false),
    cookieSecure: bool(env, 'COOKIE_SECURE', production),
    uploadMaxBytes: int(env, 'UPLOAD_MAX_BYTES', 5 * 1024 * 1024, 1024, 20 * 1024 * 1024),
    llm,
    image,
    moderation,
  };
}
