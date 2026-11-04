// Style preset and plot (US-5).
import { useState, type FormEvent } from 'react';
import { LIMITS } from '../../shared/schemas.js';
import { STYLE_PRESETS, type StyleId } from '../../shared/styles.js';
import { api, errorMessage } from '../api.js';
import { Notice, TextArea } from '../components/Field.js';
import type { StepProps } from '../pages/ProjectPage.js';

export function StoryStep({ project, reload, goTo }: StepProps) {
  const [style, setStyle] = useState<StyleId>(project.stylePreset);
  const [plot, setPlot] = useState(project.plot);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    try {
      await api('PATCH', `/api/projects/${project.id}`, { stylePreset: style, plot });
      setStatus('Style and plot saved.');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="story-heading">
      <h2 id="story-heading">Style and plot</h2>
      <form onSubmit={onSave} noValidate className="form">
        <fieldset>
          <legend>Style</legend>
          {STYLE_PRESETS.map((s) => (
            <label key={s.id} className="choice">
              <input type="radio" name="style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} />
              <span>
                <strong>{s.label}</strong>
                {s.description}
              </span>
            </label>
          ))}
        </fieldset>
        <TextArea
          label="Plot"
          hint={`What happens, in a few sentences. ${plot.length} of ${LIMITS.plotMax} characters.`}
          maxLength={LIMITS.plotMax}
          rows={8}
          value={plot}
          onChange={(e) => setPlot(e.target.value)}
        />
        <Notice error={error} status={status} />
        <div className="actions">
          <button type="submit" className="button">
            Save style and plot
          </button>
          <button type="button" className="button button-secondary" onClick={() => goTo('script')}>
            Next: script
          </button>
        </div>
      </form>
    </section>
  );
}
