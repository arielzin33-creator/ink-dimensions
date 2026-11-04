// New project with the path choice (US-2). The path cannot be changed later.
import { useEffect, useState, type FormEvent } from 'react';
import type { ProjectPath } from '../../shared/schemas.js';
import type { ProjectDto } from '../../shared/types.js';
import { api, errorMessage } from '../api.js';
import { Notice, TextField } from '../components/Field.js';
import { useFeatures } from '../features.js';
import { useRouter } from '../router.js';

export function NewProjectPage() {
  const { navigate } = useRouter();
  const [title, setTitle] = useState('');
  const [path, setPath] = useState<ProjectPath | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const features = useFeatures();
  const photoOff = features?.photoPathEnabled === false;
  useEffect(() => {
    document.title = 'New project · Ink Dimensions';
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Give your comic a title.');
    if (!path) return setError('Choose a path: real photos or invented characters.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ project: ProjectDto }>('POST', '/api/projects', { title, path });
      navigate(`/projects/${r.project.id}/characters`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="form">
      <h1>New project</h1>
      <form onSubmit={onSubmit} noValidate>
        <TextField label="Title" name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <fieldset>
          <legend>Choose your path</legend>
          <p className="hint">You choose once. The path stays the same for the whole project.</p>
          <label className="choice">
            <input
              type="radio"
              name="path"
              value="photo"
              disabled={photoOff}
              aria-describedby={photoOff ? 'photo-off' : undefined}
              checked={path === 'photo'}
              onChange={() => setPath('photo')}
            />
            <span>
              <strong>Real photos</strong>
              Use photos of real people as the characters. You must have each person&apos;s permission, and some scenes are not allowed for real
              people.
              {photoOff ? (
                <em id="photo-off" className="hint">
                  {' '}
                  Not available at the moment.
                </em>
              ) : null}
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="path" value="invented" checked={path === 'invented'} onChange={() => setPath('invented')} />
            <span>
              <strong>Invented characters</strong>
              Describe characters in words and, if you like, add reference art.
            </span>
          </label>
        </fieldset>
        <Notice error={error} />
        <div className="actions">
          <button type="submit" className="button" disabled={busy}>
            Create project
          </button>
        </div>
      </form>
    </section>
  );
}
