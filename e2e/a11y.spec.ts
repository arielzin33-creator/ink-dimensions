import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createProject, pngFile, signUp } from './fixtures.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `axe violations on ${name}`).toEqual([]);
}

test('main pages have no WCAG 2.2 AA violations', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await scan(page, 'sign in');
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await scan(page, 'sign up');

  await signUp(page);
  await scan(page, 'empty project list');
  await page.getByRole('link', { name: 'New project' }).click();
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
  await scan(page, 'new project');

  await page.goto('/projects');
  await createProject(page, 'Accessible photo comic', 'Real photos');
  await page.getByLabel('Name', { exact: true }).fill('Ada');
  await page.getByLabel('Photo', { exact: true }).setInputFiles(pngFile());
  await page.getByLabel("I confirm I have this person's permission to use their photo in this comic.").check();
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('img', { name: 'Photo 1 of Ada' })).toBeVisible();
  await scan(page, 'characters (photo path)');

  await page.goto('/projects');
  await expect(page.getByRole('list', { name: 'Projects' })).toBeVisible();
  await scan(page, 'project list');

  await createProject(page, 'Accessible invented comic', 'Invented characters');
  await page.getByLabel('Name', { exact: true }).fill('Mo');
  await page.getByLabel('Description', { exact: true }).fill('A grey cat.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('heading', { name: 'Mo', level: 3 })).toBeVisible();
  await scan(page, 'characters (invented path)');

  await page.getByRole('button', { name: 'Next: style and plot' }).click();
  await page.getByLabel('Plot', { exact: true }).fill('Mo finds a clue. Mo solves the case.');
  await page.getByRole('button', { name: 'Save style and plot' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible();
  await scan(page, 'style and plot');

  await page.getByRole('button', { name: 'Next: script' }).click();
  await page.getByRole('button', { name: 'Generate script' }).click();
  await expect(page.getByRole('group', { name: 'Page 2', exact: true })).toBeVisible();
  await scan(page, 'script editor');

  await page.getByRole('button', { name: 'Next: render' }).click();
  await page.getByRole('button', { name: 'Render all panels' }).click();
  await expect(page.getByText(/Render job: succeeded/)).toBeVisible({ timeout: 30_000 });
  await scan(page, 'render');

  await page.getByRole('button', { name: 'Next: read the comic' }).click();
  await expect(page.getByRole('img', { name: /page 1 of 2/ })).toBeVisible();
  await scan(page, 'reader');

  await page.getByRole('button', { name: 'Next: export' }).click();
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();
  await scan(page, 'export');

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible();
  await scan(page, 'account');
});
