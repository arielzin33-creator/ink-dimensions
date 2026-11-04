// Composes one comic page as a self-contained SVG (FR-024): panels in a grid, panel images
// embedded as data URIs, dialogue in speech bubbles labelled by speaker, captions in boxes,
// and a neutral "not rendered yet" frame for panels without an image. Pure function, shared
// by the API (page and export routes) and usable in tests.
import { tokens } from '../web/styles/tokens.js';
import type { Page, Panel } from './schemas.js';
import { escapeXml, wrapText } from './svg.js';

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;
const MARGIN = 40;
const GUTTER = 20;
const FOOTER = 40;
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

export interface PanelImage {
  contentType: string;
  /** Image bytes, base64-encoded (keeps this module free of Node-only types). */
  base64: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rows of panels for 1 to 6 panels per page. */
export const LAYOUTS: Record<number, number[]> = { 1: [1], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2], 6: [2, 2, 2] };

export function layoutPanels(count: number): Rect[] {
  const rows = LAYOUTS[Math.min(Math.max(count, 1), 6)] as number[];
  const innerW = PAGE_WIDTH - 2 * MARGIN;
  const innerH = PAGE_HEIGHT - 2 * MARGIN - FOOTER;
  const rowH = (innerH - GUTTER * (rows.length - 1)) / rows.length;
  const rects: Rect[] = [];
  rows.forEach((cols, r) => {
    const colW = (innerW - GUTTER * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      rects.push({ x: MARGIN + c * (colW + GUTTER), y: MARGIN + r * (rowH + GUTTER), w: colW, h: rowH });
    }
  });
  return rects.slice(0, count);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function caption(text: string, cell: Rect): { svg: string; bottom: number } {
  if (!text) return { svg: '', bottom: cell.y };
  const size = 20;
  const maxW = cell.w * 0.72;
  const lines = wrapText(text, Math.floor(maxW / (size * 0.55)), 3);
  const w = Math.min(maxW, Math.max(...lines.map((l) => l.length)) * size * 0.55 + 24);
  const h = lines.length * size * 1.25 + 16;
  const x = cell.x + 10;
  const y = cell.y + 10;
  const textSvg = lines
    .map((l, i) => `<text x="${r1(x + 12)}" y="${r1(y + 8 + size + i * size * 1.25)}" font-family="${FONT}" font-size="${size}" font-style="italic" fill="${tokens['color.comic.ink']}">${escapeXml(l)}</text>`)
    .join('');
  return {
    svg: `<g class="caption"><rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${tokens['color.comic.caption']}" stroke="${tokens['color.comic.ink']}" stroke-width="2"/>${textSvg}</g>`,
    bottom: y + h,
  };
}

function bubble(speaker: string, text: string, cell: Rect, top: number, index: number): { svg: string; bottom: number } {
  const size = 19;
  const maxW = cell.w * 0.62;
  const lines = wrapText(text, Math.max(10, Math.floor((maxW - 32) / (size * 0.55))), 4);
  const label = speaker.slice(0, 40);
  const longest = Math.max(label.length * 1.05, ...lines.map((l) => l.length));
  const w = Math.min(maxW, longest * size * 0.55 + 36);
  const h = (lines.length + 1) * size * 1.2 + 22;
  const left = index % 2 === 0;
  const x = left ? cell.x + 14 : cell.x + cell.w - w - 14;
  const y = top + 12;
  const tailX = left ? x + w * 0.3 : x + w * 0.7;
  const tail = `<path d="M ${r1(tailX - 12)} ${r1(y + h - 2)} L ${r1(tailX + (left ? -18 : 18))} ${r1(y + h + 26)} L ${r1(tailX + 12)} ${r1(y + h - 2)} Z" fill="${tokens['color.comic.bubble']}" stroke="${tokens['color.comic.ink']}" stroke-width="2" stroke-linejoin="round"/>`;
  const cover = `<line x1="${r1(tailX - 10)}" y1="${r1(y + h - 2)}" x2="${r1(tailX + 10)}" y2="${r1(y + h - 2)}" stroke="${tokens['color.comic.bubble']}" stroke-width="4"/>`;
  const body = `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(Math.min(h / 2, 28))}" fill="${tokens['color.comic.bubble']}" stroke="${tokens['color.comic.ink']}" stroke-width="2"/>`;
  const who = `<text x="${r1(x + 18)}" y="${r1(y + 10 + size)}" font-family="${FONT}" font-size="${size - 2}" font-weight="700" fill="${tokens['color.comic.ink']}">${escapeXml(label)}</text>`;
  const said = lines
    .map((l, i) => `<text x="${r1(x + 18)}" y="${r1(y + 10 + size + (i + 1) * size * 1.2)}" font-family="${FONT}" font-size="${size}" fill="${tokens['color.comic.ink']}">${escapeXml(l)}</text>`)
    .join('');
  return { svg: `<g class="bubble">${tail}${body}${cover}${who}${said}</g>`, bottom: y + h + 26 };
}

function panelSvg(panel: Panel, cell: Rect, image: PanelImage | undefined, id: string): string {
  const clip = `<clipPath id="${id}"><rect x="${r1(cell.x)}" y="${r1(cell.y)}" width="${r1(cell.w)}" height="${r1(cell.h)}"/></clipPath>`;
  let art: string;
  if (image) {
    const href = `data:${image.contentType};base64,${image.base64}`;
    art = `<image href="${href}" x="${r1(cell.x)}" y="${r1(cell.y)}" width="${r1(cell.w)}" height="${r1(cell.h)}" preserveAspectRatio="xMidYMid slice"/>`;
  } else {
    art = [
      `<rect x="${r1(cell.x)}" y="${r1(cell.y)}" width="${r1(cell.w)}" height="${r1(cell.h)}" fill="${tokens['color.comic.placeholder-fill']}"/>`,
      `<text x="${r1(cell.x + cell.w / 2)}" y="${r1(cell.y + cell.h - 24)}" text-anchor="middle" font-family="${FONT}" font-size="18" fill="${tokens['color.comic.placeholder-text']}">Not rendered yet</text>`,
    ].join('');
  }
  const cap = caption(panel.caption, cell);
  let top = cap.bottom;
  const bubbles = panel.dialogue.map((d, i) => {
    const b = bubble(d.speaker, d.text, cell, top, i);
    top = b.bottom;
    return b.svg;
  });
  const frame = `<rect x="${r1(cell.x)}" y="${r1(cell.y)}" width="${r1(cell.w)}" height="${r1(cell.h)}" fill="none" stroke="${tokens['color.comic.ink']}" stroke-width="4"/>`;
  return `${clip}<g class="panel" data-panel-id="${escapeXml(panel.id)}" clip-path="url(#${id})">${art}${cap.svg}${bubbles.join('')}</g>${frame}`;
}

export function pageTranscript(page: Page, pageNumber: number): string {
  const parts = page.panels.map((p, i) => {
    const lines = [`Panel ${i + 1}: ${p.description}`];
    if (p.caption) lines.push(`Caption: ${p.caption}`);
    for (const d of p.dialogue) lines.push(`${d.speaker}: ${d.text}`);
    return lines.join('\n');
  });
  return [`Page ${pageNumber}`, ...parts].join('\n\n');
}

export function composePage(page: Page, images: Map<string, PanelImage>, opts: { pageNumber: number; totalPages: number; title: string }): string {
  const cells = layoutPanels(page.panels.length);
  const prefix = `p${opts.pageNumber}`;
  const panels = page.panels.map((p, i) => panelSvg(p, cells[i] as Rect, images.get(p.id), `${prefix}-c${i + 1}`)).join('');
  const footer = `${opts.title || 'Untitled comic'} · page ${opts.pageNumber} of ${opts.totalPages}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">`,
    `<title id="${prefix}-title">${escapeXml(`${opts.title || 'Comic'}, page ${opts.pageNumber} of ${opts.totalPages}`)}</title>`,
    `<desc id="${prefix}-desc">${escapeXml(pageTranscript(page, opts.pageNumber))}</desc>`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${tokens['color.comic.paper']}"/>`,
    panels,
    `<text x="${PAGE_WIDTH / 2}" y="${PAGE_HEIGHT - MARGIN / 2 - 6}" text-anchor="middle" font-family="${FONT}" font-size="18" fill="${tokens['color.comic.ink']}">${escapeXml(footer)}</text>`,
    '</svg>',
  ].join('');
}
