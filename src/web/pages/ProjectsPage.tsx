// Project list (US-2).
import { useEffect, useState } from 'react';
import { STYLE_PRESETS } from '../../shared/styles.js';
import type { ProjectSummaryDto } from '../../shared/types.js';
import { api, errorMessage } from '../api.js';
import { Notice } from '../components/Field.js';
import { Link } from '../router.js';

export const PATH_LABEL = { photo: 'Real photos', invented: 'Invented characters' } as const;

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Your comics · Ink Dimensions';
    api<{ projects: ProjectSummaryDto[] }>('GET', '/api/projects')
      .then((r) => setProjects(r.projects))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  return (
    <section>
      <h1>Your comics</h1>
      <div className="actions">
        <Link to="/projects/new" className="button">
          New project
        </Link>
      </div>
      <Notice error={error} />
      {projects === null ? (
        <p className="muted">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p>You have no projects yet. Start one to choose your path: real photos or invented characters.</p>
      ) : (
        <ul className="card-list" aria-label="Projects">
          {projects.map((p) => (
            <li key={p.id} className="card">
              <h2>
                <Link to={`/projects/${p.id}`}>{p.title}</Link>
              </h2>
              <p className="muted">
                <span className="badge">{PATH_LABEL[p.path]}</span> · {STYLE_PRESETS.find((s) => s.id === p.stylePreset)?.label ?? p.stylePreset} · updated{' '}
                {new Date(p.updatedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
