import { describe, expect, it } from 'vitest';
import { clearSessionCookie, parseCookies, readSessionToken, serializeSessionCookie } from '../../src/auth/cookies.js';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';
import { createRateLimiter } from '../../src/auth/rate-limit.js';
import { hashSessionToken, isWellFormedToken, newSessionToken } from '../../src/auth/sessions.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('correct horse batterz', h)).toBe(false);
  });

  it('uses a different salt for every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same password 1'), hashPassword('same password 1')]);
    expect(a).not.toBe(b);
    expect(a.split('$')[4]).not.toBe(b.split('$')[4]);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$0$8$1$aa$bb')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$1$1$aa$bb')).toBe(false);
  });
});

describe('session tokens', () => {
  it('are 256-bit, url-safe and stored only as a SHA-256 hash', () => {
    const t = newSessionToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(hashSessionToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(t)).not.toContain(t);
    expect(newSessionToken()).not.toBe(t);
    expect(isWellFormedToken('short')).toBe(false);
  });
});

describe('session cookie', () => {
  it('is HttpOnly and SameSite=Strict, Secure with __Host- in production', () => {
    const prod = serializeSessionCookie('tok', true);
    expect(prod).toMatch(/^__Host-ink_session=tok;/);
    expect(prod).toContain('HttpOnly');
    expect(prod).toContain('SameSite=Strict');
    expect(prod).toContain('Secure');
    expect(prod).toContain('Path=/');
    const dev = serializeSessionCookie('tok', false);
    expect(dev).toMatch(/^ink_session=tok;/);
    expect(dev).not.toContain('Secure');
    expect(clearSessionCookie(true)).toContain('Max-Age=0');
  });

  it('parses cookie headers and keeps the first value of a name', () => {
    expect(parseCookies('a=1; ink_session=abc; a=2')).toEqual({ a: '1', ink_session: 'abc' });
    expect(readSessionToken('ink_session=abc', false)).toBe('abc');
    expect(readSessionToken('ink_session=abc', true)).toBeUndefined();
  });
});

describe('sign-in rate limiter', () => {
  it('blocks after 10 failures in 15 minutes and recovers after the window', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, now: () => t });
    for (let i = 0; i < 9; i++) rl.recordFailure('a@example.com');
    expect(rl.isLimited('a@example.com')).toBe(false);
    rl.recordFailure('a@example.com');
    expect(rl.isLimited('a@example.com')).toBe(true);
    expect(rl.isLimited('b@example.com')).toBe(false);
    t += 15 * 60 * 1000 + 1;
    expect(rl.isLimited('a@example.com')).toBe(false);
    rl.recordFailure('a@example.com');
    rl.reset('a@example.com');
    expect(rl.isLimited('a@example.com')).toBe(false);
  });
});
