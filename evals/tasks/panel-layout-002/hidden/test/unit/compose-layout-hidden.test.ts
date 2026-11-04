import { describe, expect, it } from 'vitest';
import { layoutPanels } from '../../src/shared/compose.js';

// Hidden fail-to-pass test for eval task panel-layout-002: neighbouring panels keep the
// 20-unit gutter, horizontally and vertically, and never overlap.
const GUTTER = 20;

describe('layoutPanels keeps gutters', () => {
  for (let n = 2; n <= 6; n++) {
    it(`${n} panels`, () => {
      const rects = layoutPanels(n);
      expect(rects).toHaveLength(n);
      const rows = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b);
      for (let i = 1; i < rows.length; i++) {
        const above = rects.find((r) => r.y === rows[i - 1])!;
        expect(rows[i]! - (above.y + above.h)).toBeGreaterThanOrEqual(GUTTER - 0.01);
      }
      for (const y of rows) {
        const row = rects.filter((r) => r.y === y).sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) expect(row[i]!.x - (row[i - 1]!.x + row[i - 1]!.w)).toBeGreaterThanOrEqual(GUTTER - 0.01);
      }
    });
  }
});
