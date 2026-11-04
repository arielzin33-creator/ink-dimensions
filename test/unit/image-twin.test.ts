import { describe, expect, it } from 'vitest';
import { createTwinImage } from '../../src/providers/image/twin.js';
import type { PanelRenderRequest } from '../../src/providers/image/types.js';
import { getStyle } from '../../src/shared/styles.js';
import { wrapText } from '../../src/shared/svg.js';

const req: PanelRenderRequest = {
  panelId: 'p1',
  width: 800,
  height: 600,
  style: getStyle('watercolor'),
  description: 'Mo <looks> at the "empty" biscuit tin & sighs',
  characters: [{ name: 'Mo', description: 'a grey cat' }, { name: 'Ada', description: 'a girl' }],
  prompt: 'x',
  negativePrompt: '',
  references: [],
  seed: 42,
};

describe('image twin', () => {
  it('returns the same well-formed, escaped SVG for the same request', async () => {
    const twin = createTwinImage();
    const a = await twin.render(req);
    const b = await twin.render(req);
    expect(a.contentType).toBe('image/svg+xml');
    expect(a.data.equals(b.data)).toBe(true);
    const svg = a.data.toString('utf8');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('&lt;looks&gt;');
    expect(svg).toContain('&quot;empty&quot;');
    expect(svg).toContain('Placeholder · Watercolor');
    expect(svg).toContain('>Mo<');
    expect(svg).toContain('>Ada<');
  });

  it('contains no external references, scripts or raster imagery', async () => {
    const svg = (await createTwinImage().render(req)).data.toString('utf8');
    expect(svg).not.toMatch(/<script|<image|href=|url\(|<foreignObject|on\w+=/i);
  });

  it('wraps text by characters with an ellipsis on overflow', () => {
    expect(wrapText('one two three four', 8)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('one two three four', 8, 2)).toEqual(['one two', 'three…']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
