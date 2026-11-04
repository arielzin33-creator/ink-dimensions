// Generate and edit the script (US-6): pages -> panels with description, characters,
// dialogue and caption. Saves are versioned; an out-of-date save is refused by the server.
import { useCallback, useEffect, useId, useState } from 'react';
import { LIMITS, type Panel, type Script } from '../../shared/schemas.js';
import type { ScriptDto } from '../../shared/types.js';
import { api, ApiError, errorMessage } from '../api.js';
import { Notice, TextArea, TextField } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

type DraftPanel = Omit<Panel, 'id'> & { id?: string };
type Draft = { title: string; pages: Array<{ panels: DraftPanel[] }> };

const emptyPanel = (): DraftPanel => ({ description: '', characters: [], dialogue: [], caption: '' });

function PanelEditor({
  panel,
  label,
  cast,
  onChange,
  onRemove,
}: {
  panel: DraftPanel;
  label: string;
  cast: string[];
  onChange: (p: DraftPanel) => void;
  onRemove: (() => void) | null;
}) {
  const id = useId();
  return (
    <div className="panel-editor" role="group" aria-labelledby={`${id}-h`}>
      <h4 id={`${id}-h`}>{label}</h4>
      <TextArea
        label={`${label}: description`}
        hint="What the picture shows."
        rows={3}
        maxLength={LIMITS.panelDescriptionMax}
        value={panel.description}
        onChange={(e) => onChange({ ...panel, description: e.target.value })}
      />
      {cast.length ? (
        <fieldset>
          <legend>{label}: characters in this panel</legend>
          {cast.map((name) => (
            <label key={name} className="check">
              <input
                type="checkbox"
                checked={panel.characters.some((c) => c.toLowerCase() === name.toLowerCase())}
                onChange={(e) =>
                  onChange({
                    ...panel,
                    characters: e.target.checked ? [...panel.characters, name] : panel.characters.filter((c) => c.toLowerCase() !== name.toLowerCase()),
                  })
                }
              />
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <TextField label={`${label}: caption`} maxLength={LIMITS.captionMax} value={panel.caption} onChange={(e) => onChange({ ...panel, caption: e.target.value })} />
      {panel.dialogue.map((d, i) => (
        <div className="dialogue-row" key={i}>
          <TextField
            label={`${label}: line ${i + 1} speaker`}
            maxLength={60}
            value={d.speaker}
            onChange={(e) => onChange({ ...panel, dialogue: panel.dialogue.map((x, j) => (j === i ? { ...x, speaker: e.target.value } : x)) })}
          />
          <TextField
            label={`${label}: line ${i + 1} text`}
            maxLength={LIMITS.dialogueTextMax}
            value={d.text}
            onChange={(e) => onChange({ ...panel, dialogue: panel.dialogue.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
          />
          <button type="button" className="button button-secondary button-small" onClick={() => onChange({ ...panel, dialogue: panel.dialogue.filter((_x, j) => j !== i) })}>
            Remove line {i + 1}
          </button>
        </div>
      ))}
      <div className="actions">
        {panel.dialogue.length < LIMITS.dialoguePerPanelMax ? (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onChange({ ...panel, dialogue: [...panel.dialogue, { speaker: cast[0] ?? 'Narrator', text: '' }] })}
          >
            Add dialogue line to {label.toLowerCase()}
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="button button-secondary button-small" onClick={onRemove}>
            Remove {label.toLowerCase()}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ScriptStep({ project, goTo }: StepProps) {
  const [dto, setDto] = useState<ScriptDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pages, setPages] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const cast = project.characters.map((c) => c.name);
  const pagesId = useId();

  const accept = useCallback((d: ScriptDto) => {
    setDto(d);
    setDraft(structuredClone(d.script));
  }, []);

  useEffect(() => {
    api<ScriptDto>('GET', `/api/projects/${project.id}/script`)
      .then(accept)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.status === 404)) setError(errorMessage(err));
      })
      .finally(() => setLoaded(true));
  }, [project.id, accept]);

  async function generate() {
    if (dto && !window.confirm('Replace the current script with a new one?')) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      accept(await api<ScriptDto>('POST', `/api/projects/${project.id}/script/generate`, { pages }));
      setStatus('Script generated. Review and edit it, then save.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || !dto) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      accept(await api<ScriptDto>('PUT', `/api/projects/${project.id}/script`, { version: dto.version, script: draft as Script }));
      setStatus('Script saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const update = (fn: (d: Draft) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  return (
    <section aria-labelledby="script-heading">
      <h2 id="script-heading">Script</h2>
      {!project.plot.trim() ? <p className="muted">Write the plot in the previous step first.</p> : null}
      <div className="actions">
        <label htmlFor={pagesId}>Number of pages</label>
        <select id={pagesId} value={pages} onChange={(e) => setPages(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="button" disabled={busy} onClick={() => void generate()}>
          {dto ? 'Generate a new script' : 'Generate script'}
        </button>
      </div>
      <Notice error={error} status={status} />
      {busy ? <p className="muted">Working…</p> : null}
      {!loaded ? <p className="muted">Loading script…</p> : null}
      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          <TextField label="Comic title" maxLength={LIMITS.titleMax} value={draft.title} onChange={(e) => update((d) => void (d.title = e.target.value))} />
          {draft.pages.map((page, pi) => (
            <fieldset key={pi}>
              <legend>Page {pi + 1}</legend>
              {page.panels.map((panel, xi) => (
                <PanelEditor
                  key={panel.id ?? `new-${pi}-${xi}`}
                  panel={panel}
                  label={`Page ${pi + 1} panel ${xi + 1}`}
                  cast={cast}
                  onChange={(p) => update((d) => void ((d.pages[pi] as { panels: DraftPanel[] }).panels[xi] = p))}
                  onRemove={page.panels.length > 1 ? () => update((d) => void (d.pages[pi] as { panels: DraftPanel[] }).panels.splice(xi, 1)) : null}
                />
              ))}
              <div className="actions">
                {page.panels.length < LIMITS.panelsPerPageMax ? (
                  <button type="button" className="button button-secondary button-small" onClick={() => update((d) => void (d.pages[pi] as { panels: DraftPanel[] }).panels.push(emptyPanel()))}>
                    Add panel to page {pi + 1}
                  </button>
                ) : null}
                {draft.pages.length > 1 ? (
                  <button type="button" className="button button-secondary button-small" onClick={() => update((d) => void d.pages.splice(pi, 1))}>
                    Remove page {pi + 1}
                  </button>
                ) : null}
              </div>
            </fieldset>
          ))}
          <div className="actions">
            {draft.pages.length < LIMITS.pagesMax ? (
              <button type="button" className="button button-secondary" onClick={() => update((d) => void d.pages.push({ panels: [emptyPanel()] }))}>
                Add page
              </button>
            ) : null}
            <button type="submit" className="button" disabled={busy}>
              Save script
            </button>
            <button type="button" className="button button-secondary" onClick={() => goTo('render')}>
              Next: render
            </button>
          </div>
        </form>
      ) : loaded ? (
        <p>No script yet. Choose the number of pages and generate one.</p>
      ) : null}
    </section>
  );
}
