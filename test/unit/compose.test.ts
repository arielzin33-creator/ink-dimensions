import { describe, expect, it } from 'vitest';
import { composePage, layoutPanels, PAGE_HEIGHT, PAGE_WIDTH, pageTranscript } from '../../src/shared/compose.js';
import type { Page, Panel } from '../../src/shared/schemas.js';

const panel = (i: number, extra: Partial<Panel> = {}): Panel => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  description: `Panel ${i} description`,
  characters: [],
  dialogue: [],
  caption: '',
  ...extra,
});

describe('layout', () => {
  it.each([1, 2, 3, 4, 5, 6])('places %i panels inside the page without overlap', (n) => {
    const rects = layoutPanels(n);
    expect(rects).toHaveLength(n);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(PAGE_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });
});

describe('composePage', () => {
  const page: Page = {
    panels: [
      panel(1, { caption: 'Meanwhile, at <midnight> & later', dialogue: [{ speaker: 'Mo', text: 'Who took the "biscuits"?' }, { speaker: 'Ada', text: "Not me!" }] }),
      panel(2),
    ],
  };
  const images = new Map([[panel(1).id, { contentType: 'image/svg+xml', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') }]]);
  const svg = composePage(page, images, { pageNumber: 1, totalPages: 2, title: 'Biscuit Case' });

  it('embeds rendered images as data URIs and frames unrendered panels', () => {
    expect(svg).toContain('href="data:image/svg+xml;base64,');
    expect(svg).toContain('Not rendered yet');
    expect((svg.match(/class="panel"/g) ?? []).length).toBe(2);
  });

  it('puts escaped dialogue in bubbles labelled by speaker and captions in boxes', () => {
    expect((svg.match(/class="bubble"/g) ?? []).length).toBe(2);
    expect(svg).toContain('>Mo</text>');
    expect(svg).toContain('&quot;biscuits&quot;?');
    expect(svg).toContain('class="caption"');
    expect(svg).toContain('&lt;midnight&gt; &amp;');
    expect(svg).not.toContain('<midnight>');
  });

  it('is accessible and self-contained', () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('<title id="p1-title">Biscuit Case, page 1 of 2</title>');
    expect(svg).toContain('Mo: Who took the &quot;biscuits&quot;?');
    expect(svg).not.toMatch(/<script|on\w+=|href="http/i);
  });

  it('produces a readable transcript', () => {
    expect(pageTranscript(page, 3)).toBe(
      'Page 3\n\nPanel 1: Panel 1 description\nCaption: Meanwhile, at <midnight> & later\nMo: Who took the "biscuits"?\nAda: Not me!\n\nPanel 2: Panel 2 description',
    );
  });
});
