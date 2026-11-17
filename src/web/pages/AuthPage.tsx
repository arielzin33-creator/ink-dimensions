// Sign in and sign up (US-1).
import { useEffect, useState, type FormEvent } from 'react';
import type { UserDto } from '../../shared/types.js';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../auth.js';
import { Notice, TextField } from '../components/Field.js';
import { Link, useRouter } from '../router.js';

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { setUser } = useAuth();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  useEffect(() => {
    document.title = `${signup ? 'Create an account' : 'Sign in'} · Ink Dimensions`;
  }, [signup]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (signup && !ageConfirmed) {
      setBusy(false);
      return setError('Confirm that you are 18 or over to create an account.');
    }
    try {
      const r = await api<{ user: UserDto }>('POST', signup ? '/api/auth/signup' : '/api/auth/login', signup ? { email, password, ageConfirmed, ...(invite.trim() ? { invite: invite.trim() } : {}) } : { email, password });
      setUser(r.user);
      navigate('/projects');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form">
      <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
      <p className="muted">Turn your characters, plot and style into a comic.</p>
      <form onSubmit={onSubmit} noValidate>
        <TextField label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          required
          minLength={signup ? 10 : undefined}
          hint={signup ? 'At least 10 characters.' : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signup ? (
          <>
            <TextField
              label="Invitation code"
              name="invite"
              autoComplete="off"
              hint="Filled in from your invitation link. Setting up a new installation? Enter its setup code."
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
            <div className="field">
              <label className="check">
                <input type="checkbox" name="ageConfirmed" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />
                <span>I am 18 or over.</span>
              </label>
            </div>
          </>
        ) : null}
        <Notice error={error} />
        <div className="actions">
          <button type="submit" className="button" disabled={busy}>
            {signup ? 'Create account' : 'Sign in'}
          </button>
          {signup ? <Link to="/signin">I already have an account</Link> : <Link to="/signup">Create an account</Link>}
        </div>
      </form>
    </section>
  );
}
