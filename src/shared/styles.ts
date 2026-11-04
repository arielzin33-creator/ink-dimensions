// Style presets (FR-014). Prompts describe genres and techniques only; they never name
// living artists, studios or copyrighted characters.

export const STYLE_IDS = ['manga', 'noir', 'western', 'watercolor', 'line-art'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface StylePreset {
  id: StyleId;
  label: string;
  description: string;
  prompt: string;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'manga',
    label: 'Manga',
    description: 'Black-and-white ink, screentone shading, expressive faces and speed lines.',
    prompt: 'black and white manga illustration, clean ink lines, screentone shading, expressive faces, dynamic speed lines',
  },
  {
    id: 'noir',
    label: 'Noir',
    description: 'High-contrast shadows, rain, venetian-blind light and a moody palette.',
    prompt: 'film noir comic illustration, high contrast chiaroscuro, deep shadows, limited moody palette, dramatic lighting',
  },
  {
    id: 'western',
    label: 'Western comic',
    description: 'Bold outlines, flat bright colours and halftone dots of classic comic books.',
    prompt: 'classic western comic book illustration, bold black outlines, flat saturated colours, halftone dot shading',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    description: 'Soft washes, paper texture and gentle edges.',
    prompt: 'watercolor illustration, soft translucent washes, visible paper texture, gentle edges, light pencil underdrawing',
  },
  {
    id: 'line-art',
    label: 'Line-art',
    description: 'Clean monochrome outlines with no shading.',
    prompt: 'minimal monochrome line art illustration, clean uniform outlines, no shading, white background',
  },
];

export function getStyle(id: string | null | undefined): StylePreset {
  return STYLE_PRESETS.find((s) => s.id === id) ?? (STYLE_PRESETS[0] as StylePreset);
}
