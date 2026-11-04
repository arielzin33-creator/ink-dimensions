// Deterministic image twin: neutral placeholder panel art as SVG. Simple shapes and labels
// only (constitution article 9) — no generated imagery, no external references, no script.
import { escapeXml, wrapText } from '../../shared/svg.js';
import { tokens } from '../../web/styles/tokens.js';
import type { ImageProvider, PanelRenderRequest } from './types.js';

export function twinPanelSvg(req: PanelRenderRequest): string {
  const { width: w, height: h } = req;
  const fill = tokens['color.comic.placeholder-fill'];
  const shape = tokens['color.comic.placeholder-shape'];
  const ink = tokens['color.comic.placeholder-text'];
  const font = 'system-ui, sans-serif';
  const cast = req.characters.slice(0, 4);
  const slot = w / (cast.length + 1);
  const groundY = h * 0.78;
  const figures = cast
    .map((c, i) => {
      const cx = Math.round(slot * (i + 1));
      const r = Math.round(Math.min(h * 0.09, slot * 0.22));
      const bodyW = r * 2.4;
      const bodyH = r * 2.6;
      return [
        `<circle cx="${cx}" cy="${Math.round(groundY - bodyH - r)}" r="${r}" fill="${shape}"/>`,
        `<rect x="${Math.round(cx - bodyW / 2)}" y="${Math.round(groundY - bodyH)}" width="${Math.round(bodyW)}" height="${Math.round(bodyH)}" rx="${Math.round(r * 0.6)}" fill="${shape}"/>`,
        `<text x="${cx}" y="${Math.round(groundY + h * 0.07)}" text-anchor="middle" font-family="${font}" font-size="${Math.round(h * 0.045)}" fill="${ink}">${escapeXml(c.name.slice(0, 24))}</text>`,
      ].join('');
    })
    .join('');
  const descLines = wrapText(req.description, Math.max(20, Math.floor(w / (h * 0.026))), 2)
    .map((l, i) => `<text x="${Math.round(w * 0.04)}" y="${Math.round(h * 0.18 + i * h * 0.06)}" font-family="${font}" font-size="${Math.round(h * 0.042)}" fill="${ink}">${escapeXml(l)}</text>`)
    .join('');
  // A deterministic horizon line varies a little per panel so panels are distinguishable.
  const horizon = Math.round(h * (0.5 + ((req.seed % 7) - 3) * 0.02));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Placeholder panel">`,
    `<rect width="${w}" height="${h}" fill="${fill}"/>`,
    `<line x1="0" y1="${horizon}" x2="${w}" y2="${horizon}" stroke="${shape}" stroke-width="${Math.max(2, Math.round(h * 0.006))}" stroke-dasharray="12 10"/>`,
    `<text x="${Math.round(w * 0.04)}" y="${Math.round(h * 0.09)}" font-family="${font}" font-size="${Math.round(h * 0.04)}" font-weight="700" fill="${ink}">${escapeXml(`Placeholder · ${req.style.label}`)}</text>`,
    descLines,
    figures,
    `</svg>`,
  ].join('');
}

export function createTwinImage(): ImageProvider {
  return {
    name: 'twin',
    // Nothing leaves the process, so photos may be "sent" (the twin ignores their content).
    acceptsPhotos: true,
    async render(req) {
      return { contentType: 'image/svg+xml', data: Buffer.from(twinPanelSvg(req), 'utf8') };
    },
  };
}
