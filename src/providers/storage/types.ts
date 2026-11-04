// StorageProvider: private storage for photos, reference art and panel images.
// Keys are slash-separated, scoped per user and project: u/<userId>/p/<projectId>/...

export interface StoredObject {
  data: Buffer;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix` (which must end with '/'). */
  deletePrefix(prefix: string): Promise<void>;
  /** Lists keys under a prefix (used by tests and audits). */
  list(prefix: string): Promise<string[]>;
}

const KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;

export function assertKey(key: string): void {
  if (!KEY.test(key) || key.split('/').some((s) => s === '.' || s === '..') || key.length > 512) {
    throw new Error(`invalid storage key: ${JSON.stringify(key)}`);
  }
}

export function assertPrefix(prefix: string): void {
  if (!prefix.endsWith('/')) throw new Error('storage prefix must end with /');
  assertKey(prefix.slice(0, -1));
}

export const storageKeys = {
  userPrefix: (userId: string) => `u/${userId}/`,
  projectPrefix: (userId: string, projectId: string) => `u/${userId}/p/${projectId}/`,
  characterImage: (userId: string, projectId: string, imageId: string) => `u/${userId}/p/${projectId}/img/${imageId}`,
  panelImage: (userId: string, projectId: string, panelId: string) => `u/${userId}/p/${projectId}/panel/${panelId}`,
};
