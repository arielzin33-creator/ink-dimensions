// Error type used by every route; rendered as { error: { code, message, requestId, release } }.

export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'invalid_request', message, details);
export const unauthenticated = () => new HttpError(401, 'unauthenticated', 'Please sign in.');
export const forbidden = (message = 'Forbidden.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const tooLarge = (message = 'Request body is too large.') => new HttpError(413, 'payload_too_large', message);
export const unsupportedMedia = (message = 'Send application/json.') => new HttpError(415, 'unsupported_media_type', message);
export const refused = (reasons: string[]) =>
  new HttpError(422, 'refused_by_moderation', 'This request was refused: real people cannot be shown in sexual, violent-harm or defamatory scenes.', { reasons });
export const rateLimited = (message = 'Too many attempts. Try again later.') => new HttpError(429, 'rate_limited', message);
export const providerError = (message: string) => new HttpError(502, 'provider_error', message);
