// Error raised by provider adapters; the API maps it to 502 provider_error.
export class ProviderError extends Error {
  override name = 'ProviderError';
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}

/** fetch with a timeout; network failures and timeouts become ProviderError. */
export async function fetchWithTimeout(provider: string, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new ProviderError(provider, `timed out after ${timeoutMs} ms`);
    throw new ProviderError(provider, `request failed: ${e.message}`);
  }
}

/** Reads at most `max` characters of an error body for diagnostics (never logged with secrets). */
export async function errorSnippet(res: Response, max = 300): Promise<string> {
  try {
    return (await res.text()).slice(0, max);
  } catch {
    return '';
  }
}
