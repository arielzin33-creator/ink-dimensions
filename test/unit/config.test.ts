import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config.js';
import { createLogger } from '../../src/server/logger.js';

describe('loadConfig', () => {
  it('defaults every provider to its twin with no environment', () => {
    const c = loadConfig({});
    expect(c.llm).toEqual({ provider: 'twin' });
    expect(c.image).toEqual({ provider: 'twin' });
    expect(c.moderation).toBe('rules');
    expect(c.storage).toEqual({ provider: 'local', dir: '.data/storage' });
    expect(c.databaseUrl).toBeUndefined();
    expect(c.cookieSecure).toBe(false);
    expect(c.release).toBe('dev');
  });

  it('names the missing variable for a selected provider', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY is required/);
    expect(() => loadConfig({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toThrow(/ANTHROPIC_MODEL/);
    expect(() => loadConfig({ LLM_PROVIDER: 'local' })).toThrow(/LOCAL_LLM_URL/);
    expect(() => loadConfig({ IMAGE_PROVIDER: 'hosted', HOSTED_IMAGE_URL: 'https://img.example' })).toThrow(/HOSTED_IMAGE_API_KEY/);
    expect(() => loadConfig({ IMAGE_PROVIDER: 'comfyui', COMFYUI_URL: 'http://127.0.0.1:8188' })).toThrow(/COMFYUI_WORKFLOW_PATH/);
  });

  it('parses a full anthropic and comfyui configuration', () => {
    const c = loadConfig({
      LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm',
      IMAGE_PROVIDER: 'comfyui', COMFYUI_URL: 'http://127.0.0.1:8188/', COMFYUI_WORKFLOW_PATH: 'wf.json',
    });
    expect(c.llm).toMatchObject({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'm' });
    expect(c.image).toMatchObject({ provider: 'comfyui', url: 'http://127.0.0.1:8188' });
  });

  it('keeps photos away from hosted image providers unless allowed', () => {
    const c = loadConfig({ IMAGE_PROVIDER: 'hosted', HOSTED_IMAGE_URL: 'https://img.example', HOSTED_IMAGE_API_KEY: 'k' });
    expect(c.image).toMatchObject({ allowPhotos: false });
  });

  it('rejects invalid values and unsafe production settings', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'gpt' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ LOCAL_LLM_URL: 'ftp://x', LLM_PROVIDER: 'local', LOCAL_LLM_MODEL: 'm' })).toThrow(/http/);
    expect(() => loadConfig({ NODE_ENV: 'production', MODERATION_PROVIDER: 'permissive' })).toThrow(/article 8/);
    expect(() => loadConfig({ NODE_ENV: 'production', STORAGE_PROVIDER: 'memory' })).toThrow(ConfigError);
    expect(loadConfig({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });
});

describe('logger', () => {
  it('writes one JSON line with release and respects the level', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'info', release: '1.2.3', write: (l) => lines.push(l) });
    log.debug('hidden');
    log.child({ reqId: 'r1' }).error('boom', { status: 500 });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0] ?? '{}');
    expect(rec).toMatchObject({ level: 'error', msg: 'boom', release: '1.2.3', reqId: 'r1', status: 500 });
  });
});
