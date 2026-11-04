import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenFeature } from '@openfeature/server-sdk';
import { describe, expect, it } from 'vitest';
import { FlagdFileProvider } from '../../src/providers/flags/flagd-file.js';
import { createFeatureFlags } from '../../src/server/flags.js';

const flag = (defaultVariant: string, extra: Record<string, unknown> = {}) => ({ state: 'ENABLED', variants: { on: true, off: false }, defaultVariant, ...extra });

function write(path: string, flags: Record<string, unknown>, mtime: number) {
  writeFileSync(path, JSON.stringify({ flags }));
  utimesSync(path, mtime, mtime);
}

describe('flagd file provider through OpenFeature', () => {
  it('resolves enabled, disabled, missing and mismatched flags', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flags-'));
    const path = join(dir, 'flags.json');
    write(path, { a: flag('off'), b: flag('on', { state: 'DISABLED' }), s: { state: 'ENABLED', variants: { x: 'text' }, defaultVariant: 'x' } }, 1000);
    OpenFeature.setProvider('flags-test-1', new FlagdFileProvider({ path, checkIntervalMs: 0 }));
    const client = OpenFeature.getClient('flags-test-1');
    expect(await client.getBooleanDetails('a', true)).toMatchObject({ value: false, variant: 'off', reason: 'STATIC' });
    expect(await client.getBooleanDetails('b', true)).toMatchObject({ value: true, reason: 'DISABLED' });
    expect(await client.getBooleanDetails('missing', true)).toMatchObject({ value: true, errorCode: 'FLAG_NOT_FOUND' });
    expect(await client.getBooleanDetails('s', true)).toMatchObject({ value: true, errorCode: 'TYPE_MISMATCH' });
    expect(await client.getStringValue('s', 'd')).toBe('text');
  });

  it('picks up a changed file without a restart and keeps the last good flags on a bad write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flags-'));
    const path = join(dir, 'flags.json');
    write(path, { 'photo-path-enabled': flag('on') }, 1000);
    const warnings: string[] = [];
    const flags = createFeatureFlags({ provider: new FlagdFileProvider({ path, checkIntervalMs: 0, onWarning: (m) => warnings.push(m) }) });
    expect(await flags.photoPathEnabled()).toBe(true);
    write(path, { 'photo-path-enabled': flag('off') }, 2000);
    expect(await flags.photoPathEnabled()).toBe(false);
    writeFileSync(path, '{ "flags": ');
    utimesSync(path, 3000, 3000);
    expect(await flags.photoPathEnabled()).toBe(false);
    expect(warnings.some((w) => w.includes('invalid'))).toBe(true);
  });

  it('defaults both capabilities to on when the file or a flag is missing', async () => {
    const flags = createFeatureFlags({ provider: new FlagdFileProvider({ path: '/nonexistent/flags.json' }) });
    expect(await flags.photoPathEnabled()).toBe(true);
    expect(await flags.renderEnabled()).toBe(true);
  });

  it('ships flags/flags.json with both flags on', async () => {
    const flags = createFeatureFlags({ file: join(import.meta.dirname, '../../flags/flags.json') });
    expect(await flags.photoPathEnabled()).toBe(true);
    expect(await flags.renderEnabled()).toBe(true);
  });
});
