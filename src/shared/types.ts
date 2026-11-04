// Response shapes of the JSON API, shared by the server and the UI.
import type { ProjectPath, Script } from './schemas.js';
import type { StyleId } from './styles.js';

export interface UserDto {
  id: string;
  email: string;
}

export interface CharacterImageDto {
  id: string;
  kind: 'photo' | 'reference';
  contentType: string;
  byteSize: number;
  consentAt: string | null;
  createdAt: string;
}

export interface CharacterDto {
  id: string;
  name: string;
  description: string;
  images: CharacterImageDto[];
}

export interface ProjectSummaryDto {
  id: string;
  title: string;
  path: ProjectPath;
  stylePreset: StyleId;
  updatedAt: string;
}

export interface ProjectDto extends ProjectSummaryDto {
  plot: string;
  characters: CharacterDto[];
  createdAt: string;
}

export interface PanelStatusDto {
  panelId: string;
  rendered: boolean;
  renderedAt: string | null;
}

export interface ScriptDto {
  version: number;
  script: Script;
  updatedAt: string;
  panels: PanelStatusDto[];
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface PanelResultDto {
  panelId: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

export interface RenderJobDto {
  id: string;
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  results: PanelResultDto[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown; release?: string };
}
