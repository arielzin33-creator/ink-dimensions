import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalStorage } from '../../src/providers/storage/local.js';
import { createMemoryStorage } from '../../src/providers/storage/memory.js';
import { storageKeys, type StorageProvider } from '../../src/providers/storage/types.js';

const dir = mkdtempSync(join(tmpdir(), 'store-'));
const adapters: Array<[string, () => StorageProvider]> = [
  ['memory', () => createMemoryStorage()],
  ['local', () => createLocalStorage(join(dir, String(Math.random()).slice(2)))],
];

describe.each(adapters)('%s storage contract', (_name, make) => {
  it('puts, gets and deletes objects', async () => {
    const s = make();
    const key = storageKeys.characterImage('u1', 'p1', 'i1');
    await s.put(key, Buffer.from('png-bytes'), 'image/png');
    expect(await s.get(key)).toEqual({ data: Buffer.from('png-bytes'), contentType: 'image/png' });
    await s.delete(key);
    expect(await s.get(key)).toBeNull();
    await s.delete(key);
  });

  it('deletes by prefix without touching other projects or users', async () => {
    const s = make();
    await s.put(storageKeys.characterImage('u1', 'p1', 'a'), Buffer.from('a'), 'image/png');
    await s.put(storageKeys.panelImage('u1', 'p1', 'b'), Buffer.from('b'), 'image/svg+xml');
    await s.put(storageKeys.panelImage('u1', 'p2', 'c'), Buffer.from('c'), 'image/svg+xml');
    await s.put(storageKeys.panelImage('u2', 'p1', 'd'), Buffer.from('d'), 'image/svg+xml');
    await s.deletePrefix(storageKeys.projectPrefix('u1', 'p1'));
    expect(await s.list('u/u1/')).toEqual(['u/u1/p/p2/panel/c']);
    expect(await s.list('u/u2/')).toEqual(['u/u2/p/p1/panel/d']);
    await s.deletePrefix(storageKeys.userPrefix('u1'));
    expect(await s.list('u/u1/')).toEqual([]);
  });

  it('rejects keys that could escape their scope', async () => {
    const s = make();
    for (const bad of ['../x', 'u/../../etc', '/abs', 'a//b', 'a/./b', '']) {
      await expect(s.put(bad, Buffer.from('x'), 'text/plain')).rejects.toThrow(/invalid storage key/);
    }
    await expect(s.deletePrefix('u1')).rejects.toThrow(/end with/);
  });
});

describe('local storage files', () => {
  it('are private to the server user (mode 0600)', async () => {
    const root = join(dir, 'perm');
    const s = createLocalStorage(root);
    await s.put('u/x/p/y/img/z', Buffer.from('x'), 'image/png');
    const file = join(root, 'u', 'x', 'p', 'y', 'img', 'z');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(root, 'u', 'x', 'p', 'y', 'img')).sort()).toEqual(['z', 'z.meta.json']);
  });
});
