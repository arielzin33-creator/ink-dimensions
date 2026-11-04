import { describe, expect, it } from 'vitest';
import { createPermissiveModeration } from '../../src/providers/moderation/permissive.js';
import { createRulesModeration } from '../../src/providers/moderation/rules.js';

const rules = createRulesModeration();

describe('rules moderation for real people', () => {
  it.each([
    ['sexual', 'Dana poses naked on the beach'],
    ['sexual', 'a sexy scene in the hotel'],
    ['violent_harm', 'Sam stabs his neighbour'],
    ['violent_harm', 'the gang beat him up behind the bar'],
    ['violent_harm', 'Alex is shot dead at the station'],
    ['defamatory', 'Rita is arrested for fraud'],
    ['defamatory', 'Our boss is secretly a drug dealer'],
  ])('refuses %s content: %s', async (category, text) => {
    const r = await rules.check({ realPeople: true, texts: ['A nice day.', text] });
    expect(r.allowed).toBe(false);
    expect(r.categories).toContain(category);
  });

  it('allows harmless stories about real people', async () => {
    const r = await rules.check({
      realPeople: true,
      texts: ['Grandma bakes a giant cake and the dog tries to steal a slice.', 'A photo shoot at the park, everyone laughs.'],
    });
    expect(r).toEqual({ allowed: true, categories: [] });
  });

  it('does not apply the real-person rule to invented characters', async () => {
    const r = await rules.check({ realPeople: false, texts: ['The knight kills the dragon in a bloody battle.'] });
    expect(r.allowed).toBe(true);
  });
});

describe('permissive twin', () => {
  it('allows everything', async () => {
    const r = await createPermissiveModeration().check({ realPeople: true, texts: ['naked'] });
    expect(r.allowed).toBe(true);
  });
});
