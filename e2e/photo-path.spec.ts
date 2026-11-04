import { expect, test } from '@playwright/test';
import { createProject, pngFile, signUp } from './fixtures.js';

test('real photos: consent is required, a photo uploads, and deleting it removes it', async ({ page }) => {
  await signUp(page);
  await createProject(page, 'Grandma’s Garden', 'Real photos');
  await expect(page.getByText('Upload photos only of people who agreed to it.')).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Grandma');
  await page.getByRole('button', { name: 'Add character' }).click();
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Grandma' }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('No photo yet.')).toBeVisible();

  // Without consent: refused in the browser.
  await card.getByLabel('Add a photo of Grandma').setInputFiles(pngFile());
  await card.getByRole('button', { name: 'Upload photo' }).click();
  await expect(card.getByRole('alert').filter({ hasText: /./ })).toHaveText('Confirm that you have permission before uploading a photo.');
  await expect(card.getByRole('img')).toHaveCount(0);

  // The server refuses too, even if the browser check is bypassed.
  const projectId = page.url().split('/projects/')[1]?.split('/')[0];
  const project = await (await page.request.get(`/api/projects/${projectId}`)).json();
  const characterId = project.project.characters[0].id;
  const direct = await page.request.post(`/api/projects/${projectId}/characters/${characterId}/images`, {
    data: { kind: 'photo', contentType: 'image/png', dataBase64: pngFile().buffer.toString('base64') },
  });
  expect(direct.status()).toBe(400);
  expect((await direct.json()).error.code).toBe('consent_required');

  // With consent: stored and shown.
  await card.getByLabel("I confirm I have this person's permission to use their photo in this comic.").check();
  await card.getByRole('button', { name: 'Upload photo' }).click();
  await expect(card.getByRole('status').filter({ hasText: /./ })).toHaveText('Added photo for Grandma.');
  const thumb = card.getByRole('img', { name: 'Photo 1 of Grandma' });
  await expect(thumb).toBeVisible();
  expect(await thumb.evaluate((img: { complete?: boolean; naturalWidth: number }) => img.naturalWidth)).toBe(2);

  // Harmful plots about real people are refused.
  await page.getByRole('button', { name: 'Next: style and plot' }).click();
  await page.getByLabel('Plot', { exact: true }).fill('Grandma is arrested for fraud.');
  await page.getByRole('button', { name: 'Save style and plot' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText('real people cannot be shown');

  // Delete the photo.
  await page.getByRole('link', { name: /Characters/ }).click();
  await page.getByRole('button', { name: 'Delete photo 1 of Grandma' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted photo 1 of Grandma' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo 1 of Grandma' })).toHaveCount(0);
  const after = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(after.project.characters[0].images).toEqual([]);
});
