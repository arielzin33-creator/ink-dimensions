import { describe, expect, it } from 'vitest';
import { createTwinLlm } from '../../src/providers/llm/twin.js';
import type { LlmRequest } from '../../src/providers/llm/types.js';
import { scriptSchema } from '../../src/shared/schemas.js';
import { getStyle } from '../../src/shared/styles.js';

const req = (pages: number, names: string[]): LlmRequest => ({
  system: 's',
  prompt: 'p',
  script: {
    title: 'Biscuit Case',
    plot: 'The cat wakes up. The biscuits are gone! A search begins.',
    style: getStyle('noir'),
    characters: names.map((name) => ({ name, description: `${name} description` })),
    pages,
    realPeople: false,
  },
});

describe('LLM twin', () => {
  it('returns the same valid script JSON for the same input', async () => {
    const llm = createTwinLlm();
    const a = await llm.complete(req(2, ['Mo', 'Ada']));
    expect(await llm.complete(req(2, ['Mo', 'Ada']))).toBe(a);
    const s = scriptSchema.parse(JSON.parse(a));
    expect(s.pages).toHaveLength(2);
    expect(s.pages.map((p) => p.panels.length)).toEqual([3, 4]);
    const names = new Set(s.pages.flatMap((p) => p.panels.flatMap((x) => x.characters)));
    expect([...names].sort()).toEqual(['Ada', 'Mo']);
  });

  it('respects the page count and works with no characters', async () => {
    const s = scriptSchema.parse(JSON.parse(await createTwinLlm().complete(req(6, []))));
    expect(s.pages).toHaveLength(6);
    expect(s.pages[0]?.panels[0]?.characters).toEqual(['Narrator']);
  });
});
