// Project workspace: one step at a time, in the order of the flow.
import { useCallback, useEffect, useState } from 'react';
import type { ProjectDto } from '../../shared/types.js';
import { api, errorMessage } from '../api.js';
import { Notice } from '../components/Field.js';
import { CharactersStep } from '../project/CharactersStep.js';
import { ExportStep } from '../project/ExportStep.js';
import { ReaderStep } from '../project/ReaderStep.js';
import { RenderStep } from '../project/RenderStep.js';
import { ScriptStep } from '../project/ScriptStep.js';
import { StoryStep } from '../project/StoryStep.js';
import { Link, useRouter } from '../router.js';
import { PATH_LABEL } from './ProjectsPage.js';

export const STEPS = [
  { id: 'characters', label: 'Characters' },
  { id: 'story', label: 'Style and plot' },
  { id: 'script', label: 'Script' },
  { id: 'render', label: 'Render' },
  { id: 'read', label: 'Read' },
  { id: 'export', label: 'Export' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

export interface StepProps {
  project: ProjectDto;
  reload: () => Promise<void>;
  goTo: (step: StepId) => void;
}

export function ProjectPage({ id, step }: { id: string; step: string }) {
  const { navigate } = useRouter();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = (STEPS.find((s) => s.id === step) ?? STEPS[0]).id;

  const reload = useCallback(async () => {
    try {
      setProject((await api<{ project: ProjectDto }>('GET', `/api/projects/${id}`)).project);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (project) document.title = `${STEPS.find((s) => s.id === current)?.label} · ${project.title} · Ink Dimensions`;
  }, [project, current]);

  const goTo = useCallback((s: StepId) => navigate(`/projects/${id}/${s}`), [id, navigate]);

  async function onDelete() {
    if (!window.confirm('Delete this project, its photos and every generated image?')) return;
    try {
      await api('DELETE', `/api/projects/${id}`);
      navigate('/projects');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!project) {
    return error ? <Notice error={error} /> : <p className="muted">Loading project…</p>;
  }

  const props: StepProps = { project, reload, goTo };
  return (
    <article>
      <h1>{project.title}</h1>
      <p className="muted">
        <span className="badge">{PATH_LABEL[project.path]}</span>
      </p>
      <nav aria-label="Project steps">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <Link to={`/projects/${id}/${s.id}`} aria-current={s.id === current ? 'step' : undefined}>
                {i + 1}. {s.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <Notice error={error} />
      {current === 'characters' && <CharactersStep {...props} />}
      {current === 'story' && <StoryStep {...props} />}
      {current === 'script' && <ScriptStep {...props} />}
      {current === 'render' && <RenderStep {...props} />}
      {current === 'read' && <ReaderStep {...props} />}
      {current === 'export' && <ExportStep {...props} />}
      <hr />
      <div className="actions">
        <button type="button" className="button button-danger button-small" onClick={() => void onDelete()}>
          Delete project
        </button>
      </div>
    </article>
  );
}
