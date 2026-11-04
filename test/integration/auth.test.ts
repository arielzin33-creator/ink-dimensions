import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

describe('authentication', () => {
  it('signs up, sets an HttpOnly SameSite=Strict cookie and returns the user', async () => {
    const c = t.client();
    const r = await c.signUp('Ann@Example.com');
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('ann@example.com');
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^ink_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect((await c.get('/api/auth/me')).body.user.email).toBe('ann@example.com');
    const stored = await t.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email = 'ann@example.com'");
    expect(stored.rows[0]?.password_hash).toMatch(/^scrypt\$/);
  });

  it('refuses a duplicate email in any letter case and weak passwords', async () => {
    const c = t.client();
    await c.signUp('dup@example.com');
    expect((await t.client().signUp('DUP@example.com')).status).toBe(409);
    expect((await t.client().signUp('weak@example.com', 'short')).status).toBe(400);
  });

  it('signs in, and gives the same generic error for a wrong password or unknown email', async () => {
    await t.client().signUp('bo@example.com', 'bo password 123');
    const ok = await t.client().post('/api/auth/login', { email: 'BO@example.com', password: 'bo password 123' });
    expect(ok.status).toBe(200);
    const wrong = await t.client().post('/api/auth/login', { email: 'bo@example.com', password: 'nope nope nope' });
    const unknown = await t.client().post('/api/auth/login', { email: 'nobody@example.com', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.message).toBe('Email or password is incorrect.');
  });

  it('rate-limits repeated failed sign-ins for one email', async () => {
    await t.client().signUp('rl@example.com', 'rl password 123');
    for (let i = 0; i < 10; i++) await t.client().post('/api/auth/login', { email: 'rl@example.com', password: 'wrong password' });
    const blocked = await t.client().post('/api/auth/login', { email: 'rl@example.com', password: 'rl password 123' });
    expect(blocked.status).toBe(429);
  });

  it('signs out and ends the session', async () => {
    const c = t.client();
    await c.signUp();
    const cookie = c.cookie;
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect(c.cookie).toBeUndefined();
    const reuse = await t.client().req('GET', '/api/auth/me', undefined, { cookie: cookie ?? '' });
    expect(reuse.status).toBe(401);
  });

  it('rejects requests without a session and with forged tokens', async () => {
    expect((await t.client().get('/api/auth/me')).status).toBe(401);
    const forged = await t.client().req('GET', '/api/auth/me', undefined, { cookie: `ink_session=${'a'.repeat(43)}` });
    expect(forged.status).toBe(401);
  });

  it('deletes the account with its files only after the password is confirmed', async () => {
    const c = t.client();
    const r = await c.signUp('gone@example.com', 'gone password 1');
    const id = r.body.user.id as string;
    await t.providers.storage.put(`u/${id}/p/x/img/y`, Buffer.from('x'), 'image/png');
    expect((await c.del('/api/auth/account', { password: 'wrong password' })).status).toBe(401);
    expect((await c.del('/api/auth/account', { password: 'gone password 1' })).status).toBe(204);
    expect(await t.providers.storage.list(`u/${id}/`)).toEqual([]);
    const { rows } = await t.db.query("SELECT 1 FROM users WHERE email = 'gone@example.com'");
    expect(rows).toHaveLength(0);
    expect((await t.client().post('/api/auth/login', { email: 'gone@example.com', password: 'gone password 1' })).status).toBe(401);
  });
});
