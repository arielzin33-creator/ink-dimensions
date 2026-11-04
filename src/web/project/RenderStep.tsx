// Render panels as a background job and poll its progress (US-7).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderJobDto, ScriptDto } from '../../shared/types.js';
import { api, ApiError, errorMessage } from '../api.js';
import { Notice } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

const POLL_MS = 1000;

export function RenderStep({ project, goTo }: StepProps) {
  const [script, setScript] = useState<ScriptDto | null>(null);
  const [job, setJob] = useState<RenderJobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const loadScript = useCallback(async () => {
    try {
      setScript(await api<ScriptDto>('GET', `/api/projects/${project.id}/script`));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) setError(errorMessage(err));
    }
  }, [project.id]);

  const poll = useCallback(
    async (jobId: string) => {
      try {
        const r = await api<{ job: RenderJobDto }>('GET', `/api/projects/${project.id}/render-jobs/${jobId}`);
        setJob(r.job);
        if (r.job.status === 'queued' || r.job.status === 'running') {
          timer.current = window.setTimeout(() => void poll(jobId), POLL_MS);
        } else {
          setBust((b) => b + 1);
          await loadScript();
        }
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [project.id, loadScript],
  );

  useEffect(() => {
    void loadScript();
    api<{ job: RenderJobDto | null }>('GET', `/api/projects/${project.id}/render-jobs/latest`)
      .then((r) => {
        setJob(r.job);
        if (r.job && (r.job.status === 'queued' || r.job.status === 'running')) void poll(r.job.id);
      })
      .catch(() => undefined);
    return () => window.clearTimeout(timer.current);
  }, [project.id, loadScript, poll]);

  async function start(panelIds?: string[]) {
    setError(null);
    try {
      const r = await api<{ job: RenderJobDto }>('POST', `/api/projects/${project.id}/render`, panelIds ? { panelIds } : {});
      setJob(r.job);
      void poll(r.job.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'render_in_progress') {
        const id = (err.details as { jobId?: string } | undefined)?.jobId;
        if (id) void poll(id);
      }
      setError(errorMessage(err));
    }
  }

  const active = job?.status === 'queued' || job?.status === 'running';
  const panels = script ? script.script.pages.flatMap((p, pi) => p.panels.map((x, xi) => ({ ...x, label: `Page ${pi + 1} panel ${xi + 1}` }))) : [];
  const rendered = new Set(script?.panels.filter((p) => p.rendered).map((p) => p.panelId));

  return (
    <section aria-labelledby="render-heading">
      <h2 id="render-heading">Render panels</h2>
      {!script ? (
        <p>Generate a script first.</p>
      ) : (
        <>
          <p>
            {rendered.size} of {panels.length} panels rendered.
          </p>
          <div className="actions">
            <button type="button" className="button" disabled={active} onClick={() => void start()}>
              {rendered.size ? 'Render all panels again' : 'Render all panels'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => goTo('read')}>
              Next: read the comic
            </button>
          </div>
        </>
      )}
      <Notice error={error} />
      {job ? (
        <div aria-live="polite">
          <label htmlFor="render-progress">
            Render job: {job.status} — {job.done} of {job.total} panels done{job.failed ? `, ${job.failed} failed` : ''}
          </label>
          <progress id="render-progress" max={job.total} value={job.done} />
          {job.error ? <p className="field-error">{job.error}</p> : null}
        </div>
      ) : null}
      {script ? (
        <ul className="panel-grid" aria-label="Panels">
          {panels.map((p) => {
            const result = job?.results.find((r) => r.panelId === p.id);
            return (
              <li key={p.id} className="card">
                <h3>{p.label}</h3>
                {rendered.has(p.id) ? (
                  <img src={`/api/projects/${project.id}/panels/${p.id}/image?v=${bust}`} alt={`${p.label}: ${p.description}`} />
                ) : (
                  <div className="placeholder-frame">Not rendered yet</div>
                )}
                {result?.status === 'failed' ? <p className="field-error">{result.error}</p> : null}
                <div className="actions">
                  <button type="button" className="button button-secondary button-small" disabled={active} onClick={() => void start([p.id])}>
                    Re-render {p.label.toLowerCase()}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
