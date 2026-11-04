// Export (US-9): SVG per page, all pages as ZIP, and a print-ready page for PDF.
import { useEffect, useState } from 'react';
import type { ScriptDto } from '../../shared/types.js';
import { api, ApiError, errorMessage } from '../api.js';
import { Notice } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

export function ExportStep({ project }: StepProps) {
  const [script, setScript] = useState<ScriptDto | null>(null);
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

  if (!loaded) return <p className="muted">Loading…</p>;
  if (!script) return <p>Generate a script first.</p>;
  const base = `/api/projects/${project.id}`;
  const unrendered = script.panels.filter((p) => !p.rendered).length;

  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading">Export</h2>
      <Notice error={error} />
      {unrendered ? <p className="muted">{unrendered} panel(s) are not rendered yet and will show as empty frames.</p> : null}
      <h3>SVG pages</h3>
      <ul className="link-list">
        {script.script.pages.map((_p, i) => (
          <li key={i}>
            <a href={`${base}/pages/${i + 1}.svg?download=1`} download>
              Download page {i + 1} (SVG)
            </a>
          </li>
        ))}
        <li>
          <a href={`${base}/export/comic.zip`} download>
            Download all pages (ZIP of SVG files)
          </a>
        </li>
      </ul>
      <h3>Print or PDF</h3>
      <p>Open the print-ready page, then use your browser&apos;s Print command and choose &ldquo;Save as PDF&rdquo;.</p>
      <p>
        <a href={`${base}/export/print.html`} target="_blank" rel="noopener">
          Open print-ready page (opens in a new tab)
        </a>
      </p>
    </section>
  );
}
