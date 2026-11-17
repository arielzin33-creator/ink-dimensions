import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';

const SETUP = 'setup-code-0123456789-0123456789-abcdef';
const PW = 'correct horse battery';
const lines: string[] = [];
const secrets: string[] = [];
let t: TestApp;
let admin: Client;

beforeAll(async () => {
  t = await startTestApp({ env: { REGISTRATION_OPEN: 'false', ADMIN_BOOTSTRAP_CODE: SETUP }, logLines: lines });
  admin = t.client();
});
afterAll(() => t.close());

const signUp = (c: Client, email: string, invite?: string, ageConfirmed: unknown = true) =>
  c.post('/api/auth/signup', { email, password: PW, ageConfirmed, ...(invite ? { invite } : {}) });
async function invite(email: string): Promise<string> {
  const r = await admin.post('/api/admin/invites', { email });
  expect(r.status, email).toBe(201);
  secrets.push(r.body.secret);
  return r.body.secret as string;
}
const accounts = async (email: string) => (await t.db.query('SELECT 1 FROM users WHERE email = $1', [email])).rows.length;

describe('invitations (spec 002)', () => {
  it('lets the setup code create the first administrator, once (FR-106)', async () => {
    expect((await signUp(t.client(), 'nobody@example.com')).status).toBe(403);
    const r = await signUp(admin, 'owner@example.com', SETUP);
    expect(r.status).toBe(201);
    expect(r.body.user.isAdmin).toBe(true);
    expect((await admin.get('/api/auth/me')).body.user.isAdmin).toBe(true);
    expect((await signUp(t.client(), 'second@example.com', SETUP)).status).toBe(403);
    expect(await accounts('second@example.com')).toBe(0);
  });

  it('creates exactly one administrator when two sign-ups use the setup code at once (FR-106)', async () => {
    const fresh = await startTestApp({ env: { REGISTRATION_OPEN: 'false', ADMIN_BOOTSTRAP_CODE: SETUP } }); // no administrator yet
    try {
      const rs = await Promise.all(['race1@example.com', 'race2@example.com'].map((e) => signUp(fresh.client(), e, SETUP)));
      expect(rs.map((r) => r.status).sort()).toEqual([201, 403]);
      expect(rs.find((r) => r.status === 403)!.body.error.code).toBe('invite_invalid');
      expect((await fresh.db.query('SELECT 1 FROM users WHERE is_admin = true')).rows).toHaveLength(1);
    } finally {
      await fresh.close();
    }
  });

  it('refuses every invalid invitation with one message and creates no account (FR-101, FR-102, SC-101)', async () => {
    const used = await invite('used@example.com');
    expect((await signUp(t.client(), 'used@example.com', used)).status).toBe(201);
    const revoked = await invite('revoked@example.com');
    const list = (await admin.get('/api/admin/invites')).body.invites as Array<{ id: string; email: string }>;
    expect((await admin.del(`/api/admin/invites/${list.find((i) => i.email === 'revoked@example.com')!.id}`)).status).toBe(204);
    const expired = await invite('expired@example.com');
    await t.db.query("UPDATE invites SET expires_at = now() - interval '1 second' WHERE email = 'expired@example.com'");
    const forSomeoneElse = await invite('right@example.com');
    const cases: Array<[string, string | undefined]> = [
      ['none@example.com', undefined],
      ['used2@example.com', used],
      ['revoked@example.com', revoked],
      ['expired@example.com', expired],
      ['wrong@example.com', forSomeoneElse],
      ['made-up@example.com', 'x'.repeat(43)],
    ];
    const messages = new Set<string>();
    for (const [email, secret] of cases) {
      const r = await signUp(t.client(), email, secret);
      expect(r.status, email).toBe(403);
      expect(r.body.error.code, email).toBe('invite_invalid');
      messages.add(r.body.error.message);
      expect(await accounts(email), email).toBe(0);
    }
    expect(messages.size).toBe(1);
  });

  it('matches the invited email in any letter case', async () => {
    const s = await invite('Case@Example.com');
    expect((await signUp(t.client(), ' CASE@example.COM ', s)).status).toBe(201);
  });

  it('creates one account when two sign-ups race for one invitation (SC-101)', async () => {
    const s = await invite('race@example.com');
    const rs = await Promise.all([signUp(t.client(), 'race@example.com', s), signUp(t.client(), 'race@example.com', s)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(await accounts('race@example.com')).toBe(1);
  });

  it('requires the 18+ confirmation, records it, and keeps the invitation usable after a refusal (FR-109)', async () => {
    const s = await invite('young@example.com');
    expect((await signUp(t.client(), 'young@example.com', s, false)).status).toBe(400);
    expect((await t.client().post('/api/auth/signup', { email: 'young@example.com', password: PW, invite: s })).status).toBe(400);
    expect((await signUp(t.client(), 'young@example.com', s)).status).toBe(201);
    const { rows } = await t.db.query<{ age_confirmed_at: Date | null }>("SELECT age_confirmed_at FROM users WHERE email = 'young@example.com'");
    expect(rows[0]?.age_confirmed_at).toBeInstanceOf(Date);
  });

  it('stores only the hash of a secret and never lists it (FR-103)', async () => {
    const s = await invite('hash@example.com');
    const { rows } = await t.db.query<{ token_hash: string }>("SELECT token_hash FROM invites WHERE email = 'hash@example.com'");
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify((await admin.get('/api/admin/invites')).body)).not.toContain(s);
  });

  it('refuses invitations for accounts and live invitations, and allows one after expiry (FR-105)', async () => {
    expect((await admin.post('/api/admin/invites', { email: 'owner@example.com' })).status).toBe(409);
    await invite('twice@example.com');
    expect((await admin.post('/api/admin/invites', { email: 'TWICE@example.com' })).status).toBe(409);
    await t.db.query("UPDATE invites SET expires_at = now() - interval '1 second' WHERE email = 'twice@example.com'");
    await invite('twice@example.com');
  });

  it('lists statuses, and answers everyone else like a missing route (FR-104)', async () => {
    const list = (await admin.get('/api/admin/invites')).body.invites as Array<{ email: string; status: string; createdAt: string; expiresAt: string }>;
    const status = (e: string) => list.find((i) => i.email === e)?.status;
    expect([status('used@example.com'), status('revoked@example.com'), status('expired@example.com'), status('right@example.com')]).toEqual(['used', 'revoked', 'expired', 'live']);
    const member = t.client();
    await signUp(member, 'member@example.com', await invite('member@example.com'));
    const missing = await member.get('/api/no-such-route');
    for (const r of [await member.get('/api/admin/invites'), await member.post('/api/admin/invites', { email: 'x@example.com' }), await t.client().get('/api/admin/invites')]) {
      expect(r.status).toBe(404);
      expect(r.body.error.message).toBe(missing.body.error.message);
    }
  });

  it('deletes a used invitation with its account (FR-108)', async () => {
    const c = t.client();
    await signUp(c, 'leaver@example.com', await invite('leaver@example.com'));
    expect((await c.del('/api/auth/account', { password: PW })).status).toBe(204);
    expect((await t.db.query("SELECT 1 FROM invites WHERE email = 'leaver@example.com'")).rows).toHaveLength(0);
  });

  it('never logs secrets, the setup code or email addresses (NFR-102)', () => {
    const log = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const s of [SETUP, ...secrets]) expect(log).not.toContain(s);
    expect(log).not.toContain('@example.com');
  });
});
