// Invitations (spec 002 US-2). Only administrators see this page; the API answers 404 to anyone else.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { InviteDto } from '../../shared/types.js';
import { api, errorMessage } from '../api.js';
import { Notice, TextField } from '../components/Field.js';

const STATUS: Record<InviteDto['status'], string> = { live: 'Waiting', used: 'Used', expired: 'Expired', revoked: 'Revoked' };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

export function InvitesPage() {
  const [invites, setInvites] = useState<InviteDto[] | null>(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites((await api<{ invites: InviteDto[] }>('GET', '/api/admin/invites')).invites);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    document.title = 'Invitations · Ink Dimensions';
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLink(null);
    try {
      const r = await api<{ invite: InviteDto; secret: string }>('POST', '/api/admin/invites', { email });
      setLink(`${window.location.origin}/signup#invite=${r.secret}`);
      setEmail('');
      setStatus(`Invitation created for ${r.invite.email}. Copy the link now: it is shown only once.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onRevoke(i: InviteDto) {
    setError(null);
    try {
      await api('DELETE', `/api/admin/invites/${i.id}`);
      setStatus(`Revoked the invitation for ${i.email}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link ?? '');
      setStatus('Link copied.');
    } catch {
      setError('Copying failed. Select the link and copy it yourself.');
    }
  }

  return (
    <section>
      <h1>Invitations</h1>
      <form className="form" onSubmit={onCreate} noValidate>
        <TextField label="Email to invite" type="email" name="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="actions">
          <button type="submit" className="button">Create invitation</button>
        </div>
      </form>
      <Notice error={error} status={status} />
      {link ? (
        <div className="actions">
          <TextField label="Invitation link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="button button-secondary" onClick={() => void onCopy()}>Copy link</button>
        </div>
      ) : null}
      {invites === null ? (
        <p className="muted">Loading invitations…</p>
      ) : invites.length === 0 ? (
        <p>No invitations yet.</p>
      ) : (
        <table>
          <caption className="visually-hidden">Invitations</caption>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Expires</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{STATUS[i.status]}</td>
                <td>{day(i.createdAt)}</td>
                <td>{day(i.expiresAt)}</td>
                <td>
                  {i.status === 'live' ? (
                    <button type="button" className="button button-secondary button-small" aria-label={`Revoke the invitation for ${i.email}`} onClick={() => void onRevoke(i)}>
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
