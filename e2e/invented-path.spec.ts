import { expect, test } from '@playwright/test';
import { createProject, pngFile, signUp } from './fixtures.js';

test('invented characters: from a new project to an exported comic', async ({ page }) => {
  // Any CSP violation or script error in the app fails the test.
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(m.text());
  });
  await signUp(page);
  await createProject(page, 'The Biscuit Case', 'Invented characters');

  // Characters: one described, one with reference art only.
  await page.getByLabel('Name', { exact: true }).fill('Mo');
  await page.getByLabel('Description', { exact: true }).fill('A grey cat detective in a trench coat.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('heading', { name: 'Mo', level: 3 })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Pip');
  await page.getByLabel('Reference art (optional)').setInputFiles(pngFile('pip.png'));
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('img', { name: 'Reference art 1 of Pip' })).toBeVisible();

  // Style and plot.
  await page.getByRole('button', { name: 'Next: style and plot' }).click();
  await page.getByRole('radio', { name: /Noir/ }).check();
  await page.getByLabel('Plot', { exact: true }).fill('Mo wakes up. The biscuits are gone! Pip saw something. Together they follow the crumbs.');
  await page.getByRole('button', { name: 'Save style and plot' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Style and plot saved.' })).toBeVisible();

  // Script: generate, edit, save.
  await page.getByRole('button', { name: 'Next: script' }).click();
  await page.getByLabel('Number of pages').selectOption('2');
  await page.getByRole('button', { name: 'Generate script' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Script generated' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Page 2', exact: true })).toBeVisible();
  await page.getByLabel('Page 1 panel 1: caption').fill('Midnight, in the kitchen.');
  await page.getByLabel('Page 1 panel 1: line 1 text').fill('Who took my biscuits?');
  await page.getByRole('button', { name: 'Save script' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Script saved.' })).toBeVisible();

  // Render all panels and wait for the job to finish.
  await page.getByRole('button', { name: 'Next: render' }).click();
  await page.getByRole('button', { name: 'Render all panels' }).click();
  await expect(page.getByText(/Render job: succeeded — 7 of 7 panels done/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: /Page 1 panel 1:/ })).toBeVisible();

  // Read.
  await page.getByRole('button', { name: 'Next: read the comic' }).click();
  const pageImg = page.getByRole('img', { name: /page 1 of 2/ });
  await expect(pageImg).toBeVisible();
  expect(await pageImg.evaluate((img: { complete?: boolean; naturalWidth: number }) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.transcript')).toContainText('Caption: Midnight, in the kitchen.');
  await expect(page.locator('.transcript')).toContainText('Who took my biscuits?');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('img', { name: /page 2 of 2/ })).toBeVisible();

  // Export: SVG download, ZIP and print page.
  await page.getByRole('button', { name: 'Next: export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download page 1 (SVG)' }).click()]);
  expect(download.suggestedFilename()).toBe('the-biscuit-case-page-01.svg');
  const svgPath = await download.path();
  const { readFile } = await import('node:fs/promises');
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('Who took my biscuits?');
  expect(svg).toContain('class="bubble"');
  expect(svg).not.toContain('Not rendered yet');

  const zipHref = await page.getByRole('link', { name: /Download all pages/ }).getAttribute('href');
  const zip = await page.request.get(zipHref ?? '');
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toBe('application/zip');
  expect((await zip.body()).subarray(0, 2).toString('latin1')).toBe('PK');

  const [print] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: /Open print-ready page/ }).click()]);
  await print.waitForLoadState();
  await expect(print.locator('section.sheet')).toHaveCount(2);
  await expect(print.getByRole('img', { name: 'The Biscuit Case, page 2 of 2' })).toBeVisible();
  const pdf = await print.pdf({ format: 'A4' });
  expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(problems).toEqual([]);
});
