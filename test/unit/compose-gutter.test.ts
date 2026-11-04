import { describe, expect, it } from 'vitest';
import { layoutPanels } from '../../src/shared/compose.js';

// Panels that merely touch pass the no-overlap test in compose.test.ts, so check the gap itself.
const GUTTER = 20;
const TOLERANCE = 0.01;

describe('layoutPanels gutters', () => {
  it.each([2, 3, 4, 5, 6])('keeps the gutter between neighbours with %i panels', (n) => {
    const rects = layoutPanels(n);
    const rowTops = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b);
    for (const [i, top] of rowTops.entries()) {
      const row = rects.filter((r) => r.y === top).sort((a, b) => a.x - b.x);
      for (const [j, panel] of row.entries()) {
        if (j > 0) expect(panel.x - (row[j - 1]!.x + row[j - 1]!.w)).toBeGreaterThanOrEqual(GUTTER - TOLERANCE);
      }
      if (i > 0) {
        const above = rects.find((r) => r.y === rowTops[i - 1])!;
        expect(top - (above.y + above.h)).toBeGreaterThanOrEqual(GUTTER - TOLERANCE);
      }
    }
  });
});
