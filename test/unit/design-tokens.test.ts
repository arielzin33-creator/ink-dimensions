import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokens } from '../../src/web/styles/tokens.js';

type Name = keyof typeof tokens;

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[Name, Name]> = [
  ['color.text', 'color.bg'],
  ['color.text', 'color.surface'],
  ['color.text', 'color.surface-strong'],
  ['color.text-muted', 'color.bg'],
  ['color.text-muted', 'color.surface'],
  ['color.on-primary', 'color.primary'],
  ['color.on-primary', 'color.primary-hover'],
  ['color.primary', 'color.bg'],
  ['color.primary', 'color.surface'],
  ['color.on-danger', 'color.danger'],
  ['color.danger', 'color.bg'],
  ['color.success', 'color.bg'],
  ['color.warning-text', 'color.warning-bg'],
  ['color.comic.ink', 'color.comic.paper'],
  ['color.comic.ink', 'color.comic.caption'],
  ['color.comic.placeholder-text', 'color.comic.placeholder-fill'],
];
const NON_TEXT_PAIRS: Array<[Name, Name]> = [
  ['color.border', 'color.bg'],
  ['color.border', 'color.surface'],
  ['color.focus', 'color.bg'],
];

describe('design tokens', () => {
  it.each(TEXT_PAIRS)('%s on %s meets WCAG AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NON_TEXT_PAIRS)('%s on %s meets WCAG AA for UI components (3:1)', (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });

  it('component styles use only CSS variables: no literal colours or pixel sizes', () => {
    const root = join(import.meta.dirname, '../../src/web');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(css|tsx)$/.test(name) && name !== 'tokens.css') files.push(p);
      }
    };
    walk(root);
    const offences: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(line) && !/href=|id=|aria-|url\(#/.test(line)) offences.push(`${f}:${i + 1}: colour`);
        if (/\b\d+(\.\d+)?px\b/.test(line)) offences.push(`${f}:${i + 1}: px`);
        if (/\b(rgb|rgba|hsl|hsla)\(/.test(line)) offences.push(`${f}:${i + 1}: colour function`);
      });
    }
    expect(offences).toEqual([]);
  });
});
