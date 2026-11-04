// JSON API client. Same-origin cookies carry the session; the server enforces everything.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: unknown } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status}).`, data?.error?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? (err.details as Array<{ path?: string; message?: string }>) : [];
    const first = details[0];
    return first?.message ? `${err.message} ${first.path ? `${first.path}: ` : ''}${first.message}` : err.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Reads a chosen file as base64 after checking its type and size in the browser. */
export async function readImageFile(file: File): Promise<{ contentType: (typeof UPLOAD_TYPES)[number]; dataBase64: string }> {
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Images must be at most 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { contentType: file.type as (typeof UPLOAD_TYPES)[number], dataBase64: btoa(binary) };
}
