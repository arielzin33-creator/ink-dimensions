// Characters (US-3, US-4, US-10). Real-photo projects take photos with a consent confirmation
// per upload; invented projects take a description and optional reference art.
import { useId, useState, type FormEvent } from 'react';
import type { CharacterDto } from '../../shared/types.js';
import { api, errorMessage, readImageFile } from '../api.js';
import { Notice, TextArea, TextField } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

const CONSENT_TEXT = "I confirm I have this person's permission to use their photo in this comic.";

function ConsentBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="consent">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>
    </div>
  );
}

function AddImageForm({ projectId, character, photo, onDone }: { projectId: string; character: CharacterDto; photo: boolean; onDone: () => Promise<void> }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const noun = photo ? 'photo' : 'reference art';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!file) return setError(`Choose a ${noun} file first.`);
    if (photo && !consent) return setError('Confirm that you have permission before uploading a photo.');
    try {
      const image = await readImageFile(file);
      await api('POST', `/api/projects/${projectId}/characters/${character.id}/images`, { kind: photo ? 'photo' : 'reference', consent: photo ? consent : undefined, ...image });
      setFile(null);
      setConsent(false);
      (e.target as HTMLFormElement).reset();
      setStatus(`Added ${noun} for ${character.name}.`);
      await onDone();
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? err.message : errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Add ${noun} for ${character.name}`}>
      <div className="field">
        <label htmlFor={`${id}-file`}>{photo ? `Add a photo of ${character.name}` : `Add reference art for ${character.name}`}</label>
        <p className="hint" id={`${id}-hint`}>
          PNG, JPEG or WebP, up to 5 MB.
        </p>
        <input id={`${id}-file`} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${id}-hint`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {photo ? <ConsentBox checked={consent} onChange={setConsent} /> : null}
      <Notice error={error} status={status} />
      <button type="submit" className="button button-secondary button-small">
        Upload {noun}
      </button>
    </form>
  );
}

function CharacterCard({ projectId, character, photo, reload }: { projectId: string; character: CharacterDto; photo: boolean; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function deleteImage(imageId: string, index: number) {
    setError(null);
    try {
      const r = await api<{ unrenderedPanels: string[] }>('DELETE', `/api/projects/${projectId}/characters/${character.id}/images/${imageId}`);
      setStatus(
        `Deleted ${photo ? 'photo' : 'image'} ${index + 1} of ${character.name}${r.unrenderedPanels.length ? ` and ${r.unrenderedPanels.length} panel image(s) made from it` : ''}.`,
      );
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteCharacter() {
    if (!window.confirm(`Delete ${character.name}, their images and every panel image showing them?`)) return;
    try {
      await api('DELETE', `/api/projects/${projectId}/characters/${character.id}`);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="card">
      <h3>{character.name}</h3>
      {character.description ? <p>{character.description}</p> : null}
      {character.images.length ? (
        <ul className="thumbs" aria-label={`Images of ${character.name}`}>
          {character.images.map((img, i) => (
            <li key={img.id}>
              <img src={`/api/projects/${projectId}/characters/${character.id}/images/${img.id}`} alt={`${photo ? 'Photo' : 'Reference art'} ${i + 1} of ${character.name}`} />
              <button type="button" className="button button-secondary button-small" onClick={() => void deleteImage(img.id, i)}>
                Delete {photo ? 'photo' : 'image'} {i + 1} of {character.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{photo ? 'No photo yet. Add at least one before writing the script.' : 'No reference art.'}</p>
      )}
      <Notice error={error} status={status} />
      {character.images.length < 5 ? <AddImageForm projectId={projectId} character={character} photo={photo} onDone={reload} /> : null}
      <div className="actions">
        <button type="button" className="button button-danger button-small" onClick={() => void deleteCharacter()}>
          Delete {character.name}
        </button>
      </div>
    </li>
  );
}

export function CharactersStep({ project, reload, goTo }: StepProps) {
  const photo = project.path === 'photo';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileId = useId();

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!name.trim()) return setError('Give the character a name.');
    if (!photo && !description.trim() && !file) return setError('Describe the character, add reference art, or both.');
    if (photo && file && !consent) return setError('Confirm that you have permission before uploading a photo.');
    try {
      const image = file ? await readImageFile(file) : undefined;
      await api('POST', `/api/projects/${project.id}/characters`, { name, description, ...(image ? { image, consent: photo ? consent : undefined } : {}) });
      setName('');
      setDescription('');
      setFile(null);
      setConsent(false);
      (e.target as HTMLFormElement).reset();
      setStatus(`Added ${name}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? err.message : errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="characters-heading">
      <h2 id="characters-heading">Characters</h2>
      {photo ? (
        <p>
          This comic uses <strong>real photos</strong>. Upload photos only of people who agreed to it. Photos stay private, are used only for this
          project, and can be deleted at any time together with every image made from them.
        </p>
      ) : (
        <p>
          This comic uses <strong>invented characters</strong>. Describe each one, add reference art, or both.
        </p>
      )}
      {project.characters.length ? (
        <ul className="card-list" aria-label="Characters">
          {project.characters.map((c) => (
            <CharacterCard key={c.id} projectId={project.id} character={c} photo={photo} reload={reload} />
          ))}
        </ul>
      ) : (
        <p className="muted">No characters yet.</p>
      )}

      <form onSubmit={onAdd} noValidate className="form card" aria-labelledby="add-character-heading">
        <h3 id="add-character-heading">Add a character</h3>
        <TextField label="Name" name="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <TextArea
          label={photo ? 'Notes (optional)' : 'Description'}
          hint={photo ? 'For example their age group or what they usually wear.' : 'Appearance, personality, clothes.'}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="field">
          <label htmlFor={fileId}>{photo ? 'Photo' : 'Reference art (optional)'}</label>
          <p className="hint" id={`${fileId}-hint`}>
            PNG, JPEG or WebP, up to 5 MB.
          </p>
          <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${fileId}-hint`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {photo ? <ConsentBox checked={consent} onChange={setConsent} /> : null}
        <Notice error={error} status={status} />
        <button type="submit" className="button">
          Add character
        </button>
      </form>

      <div className="actions">
        <button type="button" className="button button-secondary" onClick={() => goTo('story')}>
          Next: style and plot
        </button>
      </div>
    </section>
  );
}
