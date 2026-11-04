// Account deletion (US-1, FR-004).
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../auth.js';
import { Notice, TextField } from '../components/Field.js';
import { useRouter } from '../router.js';

export function AccountPage() {
  const { user, setUser } = useAuth();
  const { navigate } = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Account · Ink Dimensions';
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirm) return setError('Tick the box to confirm that you want to delete everything.');
    try {
      await api('DELETE', '/api/auth/account', { password });
      setUser(null);
      navigate('/signin');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="form">
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <h2>Delete account</h2>
      <p>This deletes your account, every project, every photo and reference image, and every generated panel. It cannot be undone.</p>
      <form onSubmit={onSubmit} noValidate>
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>I understand that all my data will be deleted.</span>
        </label>
        <Notice error={error} />
        <div className="actions">
          <button type="submit" className="button button-danger">
            Delete my account
          </button>
        </div>
      </form>
    </section>
  );
}
