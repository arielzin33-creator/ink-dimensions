// Comic reader (US-8): one composed page at a time, with a text transcript.
import { useEffect, useState } from 'react';
import { pageTranscript } from '../../shared/compose.js';
import type { ScriptDto } from '../../shared/types.js';
import { api, ApiError, errorMessage } from '../api.js';
import { Notice } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

export function ReaderStep({ project, goTo }: StepProps) {
  const [script, setScript] = useState<ScriptDto | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<ScriptDto>('GET', `/api/projects/${project.id}/script`)
      .then(setScript)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.status === 404)) setError(errorMessage(err));
      })
      .finally(() => setLoaded(true));
  }, [project.id]);

  if (!loaded) return <p className="muted">Loading comic…</p>;
  if (!script) return <p>Generate a script first.</p>;
  const total = script.script.pages.length;
  const current = script.script.pages[page - 1];
  const title = script.script.title || project.title;

  return (
    <section aria-labelledby="reader-heading" className="reader">
      <h2 id="reader-heading">Read: {title}</h2>
      <Notice error={error} />
      <nav aria-label="Pages" className="actions">
        <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous page
        </button>
        <span aria-live="polite">
          Page {page} of {total}
        </span>
        <button type="button" className="button button-secondary" disabled={page >= total} onClick={() => setPage((p) => p + 1)}>
          Next page
        </button>
      </nav>
      <img src={`/api/projects/${project.id}/pages/${page}.svg?v=${encodeURIComponent(script.updatedAt)}`} alt={`${title}, page ${page} of ${total}. The transcript follows.`} />
      {current ? (
        <div className="transcript">
          <h3>Transcript of page {page}</h3>
          {pageTranscript(current, page).split('\n\n').slice(1).join('\n\n')}
        </div>
      ) : null}
      <div className="actions">
        <button type="button" className="button" onClick={() => goTo('export')}>
          Next: export
        </button>
      </div>
    </section>
  );
}
