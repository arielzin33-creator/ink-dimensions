import { describe, expect, it } from 'vitest';
import { createProjectSchema, scriptSchema, signUpSchema, updateProjectSchema, imageUploadSchema } from '../../src/shared/schemas.js';
import { STYLE_PRESETS, getStyle } from '../../src/shared/styles.js';

const panel = { description: 'A detective enters a dark office.', characters: ['Mo'], dialogue: [{ speaker: 'Mo', text: 'Hello?' }] };

describe('shared schemas', () => {
  it('accepts a valid script and fills defaults', () => {
    const s = scriptSchema.parse({ pages: [{ panels: [panel] }] });
    expect(s.pages[0]?.panels[0]?.caption).toBe('');
    expect(s.title).toBe('');
  });

  it('rejects 7 panels on a page, 7 pages and empty descriptions', () => {
    expect(scriptSchema.safeParse({ pages: [{ panels: Array(7).fill(panel) }] }).success).toBe(false);
    expect(scriptSchema.safeParse({ pages: Array(7).fill({ panels: [panel] }) }).success).toBe(false);
    expect(scriptSchema.safeParse({ pages: [{ panels: [{ ...panel, description: '  ' }] }] }).success).toBe(false);
    expect(scriptSchema.safeParse({ pages: [{ panels: [{ ...panel, dialogue: Array(5).fill(panel.dialogue[0]) }] }] }).success).toBe(false);
  });

  it('limits the plot to 4,000 characters and forbids changing the path', () => {
    expect(updateProjectSchema.safeParse({ plot: 'x'.repeat(4000) }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ plot: 'x'.repeat(4001) }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ path: 'photo' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ stylePreset: 'pixar' }).success).toBe(false);
  });

  it('normalises emails and requires 10-character passwords', () => {
    expect(signUpSchema.parse({ email: ' Ann@Example.COM ', password: '0123456789' }).email).toBe('ann@example.com');
    expect(signUpSchema.safeParse({ email: 'ann@example.com', password: 'short' }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: 'not-an-email', password: '0123456789' }).success).toBe(false);
  });

  it('requires a path for new projects and a supported image type', () => {
    expect(createProjectSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ kind: 'photo', contentType: 'image/svg+xml', dataBase64: 'AA==' }).success).toBe(false);
  });

  it('offers exactly the five genre presets and none names an artist', () => {
    expect(STYLE_PRESETS.map((s) => s.id)).toEqual(['manga', 'noir', 'western', 'watercolor', 'line-art']);
    for (const s of STYLE_PRESETS) expect(s.prompt).not.toMatch(/\bby\b|in the style of/i);
    expect(getStyle('unknown').id).toBe('manga');
  });
});
