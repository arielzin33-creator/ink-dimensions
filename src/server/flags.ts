// Feature flags through OpenFeature (FR-036). Each app instance binds its own provider to a
// unique OpenFeature domain, so tests can run several apps with different flag files.
import { randomUUID } from 'node:crypto';
import { OpenFeature, type Provider } from '@openfeature/server-sdk';
import { FlagdFileProvider } from '../providers/flags/flagd-file.js';
import type { Logger } from './logger.js';

export const FLAG_KEYS = { photoPath: 'photo-path-enabled', render: 'render-enabled' } as const;

export interface FeatureFlags {
  photoPathEnabled(): Promise<boolean>;
  renderEnabled(): Promise<boolean>;
}

export function createFeatureFlags(opts: { file?: string; provider?: Provider; log?: Logger }): FeatureFlags {
  const provider =
    opts.provider ??
    new FlagdFileProvider({ path: opts.file ?? 'flags/flags.json', onWarning: (message) => opts.log?.warn('feature flags', { message }) });
  const domain = `ink-dimensions-${randomUUID()}`;
  OpenFeature.setProvider(domain, provider);
  const client = OpenFeature.getClient(domain);
  // Both capabilities are on by default (spec FR-036): a missing flag never switches them off.
  return {
    photoPathEnabled: () => client.getBooleanValue(FLAG_KEYS.photoPath, true),
    renderEnabled: () => client.getBooleanValue(FLAG_KEYS.render, true),
  };
}
