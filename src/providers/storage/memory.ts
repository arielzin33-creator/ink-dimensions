// In-memory StorageProvider twin for tests.
import { assertKey, assertPrefix, type StorageProvider, type StoredObject } from './types.js';

export function createMemoryStorage(): StorageProvider {
  const objects = new Map<string, StoredObject>();
  return {
    name: 'memory',
    async put(key, data, contentType) {
      assertKey(key);
      objects.set(key, { data: Buffer.from(data), contentType });
    },
    async get(key) {
      assertKey(key);
      const o = objects.get(key);
      return o ? { data: Buffer.from(o.data), contentType: o.contentType } : null;
    },
    async delete(key) {
      assertKey(key);
      objects.delete(key);
    },
    async deletePrefix(prefix) {
      assertPrefix(prefix);
      for (const k of [...objects.keys()]) if (k.startsWith(prefix)) objects.delete(k);
    },
    async list(prefix) {
      assertPrefix(prefix);
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
