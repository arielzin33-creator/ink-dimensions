// Local filesystem StorageProvider. Each object is two files: the bytes and a small JSON
// sidecar with the content type. Files are created with mode 0600 inside STORAGE_DIR.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { assertKey, assertPrefix, type StorageProvider } from './types.js';

export function createLocalStorage(dir: string): StorageProvider {
  const root = resolve(dir);
  const pathFor = (key: string) => {
    assertKey(key);
    const p = resolve(root, ...key.split('/'));
    if (!p.startsWith(root + sep)) throw new Error('storage key escapes the root');
    return p;
  };

  async function walk(d: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (!e.name.endsWith('.meta.json')) out.push(relative(root, p).split(sep).join('/'));
    }
    return out;
  }

  return {
    name: 'local',
    async put(key, data, contentType) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true, mode: 0o700 });
      await writeFile(p, data, { mode: 0o600 });
      await writeFile(`${p}.meta.json`, JSON.stringify({ contentType }), { mode: 0o600 });
    },
    async get(key) {
      const p = pathFor(key);
      try {
        const [data, meta] = await Promise.all([readFile(p), readFile(`${p}.meta.json`, 'utf8')]);
        return { data, contentType: String((JSON.parse(meta) as { contentType?: string }).contentType ?? 'application/octet-stream') };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      const p = pathFor(key);
      await rm(p, { force: true });
      await rm(`${p}.meta.json`, { force: true });
    },
    async deletePrefix(prefix) {
      assertPrefix(prefix);
      // Prefixes always end at a directory boundary in this app's key scheme.
      await rm(pathFor(prefix.slice(0, -1)), { recursive: true, force: true });
    },
    async list(prefix) {
      assertPrefix(prefix);
      return (await walk(pathFor(prefix.slice(0, -1)))).sort();
    },
  };
}
