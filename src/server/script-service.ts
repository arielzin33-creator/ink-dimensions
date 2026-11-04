// Script generation and normalisation (FR-016 – FR-018). The LLM is asked for JSON only; its
// output is validated with the shared schema and given stable panel ids.
import { randomUUID } from 'node:crypto';
import { ProviderError } from '../providers/errors.js';
import type { LlmProvider, ScriptRequest } from '../providers/llm/types.js';
import { LIMITS, scriptSchema, type ParsedScript, type Script } from '../shared/schemas.js';
import type { PanelStatusDto, ScriptDto } from '../shared/types.js';
import type { Queryable } from './db.js';
import { HttpError, providerError } from './errors.js';
import type { Logger } from './logger.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function buildScriptPrompt(req: ScriptRequest): { system: string; prompt: string } {
  const system = [
    'You are a comic script writer. Reply with one JSON object and nothing else: no prose, no code fences.',
    'Schema: {"title": string, "pages": [{"panels": [{"description": string, "characters": [string], "dialogue": [{"speaker": string, "text": string}], "caption": string}]}]}',
    `Rules: exactly ${req.pages} page(s); 3 to ${LIMITS.panelsPerPageMax} panels per page; at most ${LIMITS.dialoguePerPanelMax} dialogue lines per panel.`,
    `"description" says what the picture shows (setting, action, framing) in at most ${LIMITS.panelDescriptionMax} characters and never asks for text inside the image.`,
    '"characters" and "speaker" use only names from the cast (or "Narrator" for speaker). Keep dialogue short enough for a speech bubble.',
    'Keep the story suitable for all ages.',
    req.realPeople
      ? 'The cast are real people: never show them in sexual, violent, harmful, humiliating or defamatory situations.'
      : 'The cast are invented characters.',
  ].join('\n');
  const cast = req.characters.map((c) => `- ${c.name}: ${c.description || '(see reference art)'}`).join('\n') || '- (no named characters)';
  const prompt = [
    `Title: ${req.title}`,
    `Visual style: ${req.style.label} — ${req.style.description}`,
    `Cast:\n${cast}`,
    `Pages: ${req.pages}`,
    `Plot:\n${req.plot}`,
  ].join('\n\n');
  return { system, prompt };
}

export function parseScriptOutput(text: string, pages: number): ParsedScript {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const invalid = (why: string) => new HttpError(502, 'llm_invalid_output', `The script generator returned an unusable script (${why}). Try again.`);
  if (start < 0 || end <= start) throw invalid('no JSON object');
  let data: unknown;
  try {
    data = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw invalid('malformed JSON');
  }
  if (data && typeof data === 'object' && Array.isArray((data as { pages?: unknown }).pages)) {
    (data as { pages: unknown[] }).pages = (data as { pages: unknown[] }).pages.slice(0, pages);
  }
  const parsed = scriptSchema.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'schema mismatch');
  return parsed.data;
}

/** Gives every panel a unique id, keeping valid existing ids. */
export function normaliseScript(s: ParsedScript): Script {
  const seen = new Set<string>();
  return {
    title: s.title,
    pages: s.pages.map((p) => ({
      panels: p.panels.map((panel) => {
        let id = panel.id && UUID.test(panel.id) && !seen.has(panel.id) ? panel.id : randomUUID();
        if (seen.has(id)) id = randomUUID();
        seen.add(id);
        return { ...panel, id };
      }),
    })),
  };
}

export function scriptTexts(s: Script | ParsedScript): string[] {
  return [s.title, ...s.pages.flatMap((p) => p.panels.flatMap((x) => [x.description, x.caption, ...x.dialogue.map((d) => d.text)]))];
}

export async function generateScript(llm: LlmProvider, req: ScriptRequest, log: Logger): Promise<Script> {
  const { system, prompt } = buildScriptPrompt(req);
  let text: string;
  try {
    text = await llm.complete({ system, prompt, script: req });
  } catch (err) {
    if (err instanceof ProviderError) {
      log.warn('llm provider failed', { provider: err.provider, status: err.status, message: err.message });
      throw providerError('The script generator is unavailable right now. Try again in a moment.');
    }
    throw err;
  }
  const parsed = parseScriptOutput(text, req.pages);
  return normaliseScript(parsed);
}

export interface ScriptRow {
  project_id: string;
  version: number;
  content: Script;
  updated_at: Date;
}

export async function scriptDto(db: Queryable, row: ScriptRow): Promise<ScriptDto> {
  const { rows } = await db.query<{ panel_id: string; created_at: Date }>('SELECT panel_id, created_at FROM panel_images WHERE project_id = $1', [row.project_id]);
  const rendered = new Map(rows.map((r) => [r.panel_id, new Date(r.created_at).toISOString()]));
  const panels: PanelStatusDto[] = row.content.pages.flatMap((p) =>
    p.panels.map((x) => ({ panelId: x.id, rendered: rendered.has(x.id), renderedAt: rendered.get(x.id) ?? null })),
  );
  return { version: row.version, script: row.content, updatedAt: new Date(row.updated_at).toISOString(), panels };
}

export function panelIds(s: Script): string[] {
  return s.pages.flatMap((p) => p.panels.map((x) => x.id));
}
