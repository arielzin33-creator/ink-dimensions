// Deterministic LLM twin: turns the structured request into a script JSON string with no
// network. Same input, same output. Used in tests and by default in development.
import type { LlmProvider, ScriptRequest } from './types.js';

function beats(plot: string): string[] {
  const parts = plot
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/[.!?]+$/, ''))
    .filter((s) => s.length > 0);
  return parts.length ? parts : ['Our story begins'];
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function twinScript(req: ScriptRequest) {
  const b = beats(req.plot);
  const cast = req.characters.length ? req.characters.map((c) => c.name) : ['Narrator'];
  let n = 0;
  const pages = Array.from({ length: req.pages }, (_p, pi) => {
    const count = pi % 2 === 0 ? 3 : 4;
    const panels = Array.from({ length: count }, (_x, i) => {
      const beat = b[n % b.length] as string;
      const who = cast[n % cast.length] as string;
      const other = cast[(n + 1) % cast.length] as string;
      n += 1;
      const present = who === other ? [who] : [who, other];
      return {
        description: clip(`${req.style.label} panel ${i + 1} of page ${pi + 1}: ${beat}. ${present.join(' and ')} in frame.`, 600),
        characters: present,
        dialogue: [{ speaker: who, text: clip(i === 0 ? `${beat}!` : `What happens next, ${other}?`, 300) }],
        caption: i === 0 ? clip(pi === 0 ? (req.title || 'Our story begins') : `Page ${pi + 1}`, 200) : '',
      };
    });
    return { panels };
  });
  return { title: clip(req.title || 'Untitled comic', 120), pages };
}

export function createTwinLlm(): LlmProvider {
  return {
    name: 'twin',
    async complete(req) {
      return JSON.stringify(twinScript(req.script));
    },
  };
}
