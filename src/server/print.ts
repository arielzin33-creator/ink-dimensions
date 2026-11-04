// Print-ready HTML (FR-026): one comic page per A4 sheet; the browser's "Print to PDF" makes
// the PDF. Standalone document with no script; images are the composed page SVGs as data URIs.
import { escapeXml } from '../shared/svg.js';
import { tokens } from '../web/styles/tokens.js';

export const PRINT_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";

export function printHtml(title: string, pages: string[]): string {
  const sheets = pages
    .map(
      (svg, i) =>
        `<section class="sheet"><img src="data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}" alt="${escapeXml(`${title}, page ${i + 1} of ${pages.length}`)}"></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)} (print)</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: ${tokens['color.surface-strong']}; color: ${tokens['color.text']}; font-family: ${tokens['font.family.sans']}; }
  .note { max-width: 210mm; margin: 0 auto; padding: 4mm 0; font-size: 11pt; }
  .sheet { box-sizing: border-box; width: 210mm; height: 297mm; margin: 0 auto 6mm; padding: 6mm; background: ${tokens['color.comic.paper']};
           display: flex; align-items: center; justify-content: center; break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .sheet img { max-width: 100%; max-height: 100%; }
  @media print { html, body { background: ${tokens['color.comic.paper']}; } .note { display: none; } .sheet { margin: 0; } }
</style>
</head>
<body>
<main>
<h1 class="note">${escapeXml(title)}</h1>
<p class="note">To save a PDF, use your browser's Print command and choose "Save as PDF". Each comic page prints on its own A4 sheet.</p>
${sheets}
</main>
</body>
</html>
`;
}
