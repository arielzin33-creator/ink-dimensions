// Rule-based moderation (default). A deliberately conservative keyword floor, not a
// classifier: it can be evaded with paraphrase and it will refuse some harmless text.
// It applies only when real people are depicted (the photo path); invented characters may
// appear in fictional fights, mysteries and so on.
import type { ModerationCategory, ModerationProvider } from './types.js';

const RULES: Record<ModerationCategory, RegExp[]> = {
  sexual: [
    /\b(nude|nudes|nudity|naked|sex|sexual|sexually|sexy|porn\w*|erotic\w*|explicit|nsfw|topless|lingerie|orgasm\w*|intercourse|fetish\w*|seduc\w*|aroused|undress\w*|strip ?tease|in bed with)\b/,
  ],
  violent_harm: [
    /\b(kill|kills|killed|killing|murder\w*|stab\w*|behead\w*|decapitat\w*|tortur\w*|strangl\w*|lynch\w*|massacre\w*|dismember\w*|gore|gory|bloody|bleeding|assault\w*|kidnap\w*|suicide|self-harm|execut(e|ed|es|ing|ion))\b/,
    /\b(shot dead|shoots? (at )?(him|her|them)|gunned down|beat(s|en)? (him|her|them) up|beaten up|set on fire|hanged|run over)\b/,
  ],
  defamatory: [
    /\b(criminal|crook|thief|thieves|fraud\w*|scam(mer|mers|s)?|corrupt\w*|brib\w*|embezzl\w*|arrested|mugshot|convicted|rapist|pedophile|paedophile|molest\w*|abuser|drug dealer|drug addict|addict|drunkard|racist|nazi|terrorist|cheats on|cheating on|affair with|liar)\b/,
  ],
};

export function matchCategories(text: string): ModerationCategory[] {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  return (Object.keys(RULES) as ModerationCategory[]).filter((c) => RULES[c].some((re) => re.test(t)));
}

export function createRulesModeration(): ModerationProvider {
  return {
    name: 'rules',
    async check({ realPeople, texts }) {
      if (!realPeople) return { allowed: true, categories: [] };
      const found = new Set<ModerationCategory>();
      for (const t of texts) for (const c of matchCategories(t)) found.add(c);
      const categories = [...found];
      return { allowed: categories.length === 0, categories };
    },
  };
}
