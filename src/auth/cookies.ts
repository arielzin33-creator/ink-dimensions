// Session cookie (load-bearing): HttpOnly, SameSite=Strict, Path=/, Secure in production.
// With Secure the __Host- prefix is used, which browsers bind to this exact host.
import { SESSION_TTL_MS } from './sessions.js';

export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-ink_session' : 'ink_session';
}

export function serializeSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${sessionCookieName(secure)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${sessionCookieName(secure)}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

export function readSessionToken(cookieHeader: string | undefined, secure: boolean): string | undefined {
  return parseCookies(cookieHeader)[sessionCookieName(secure)];
}
