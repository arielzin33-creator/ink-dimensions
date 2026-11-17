import { expect, test } from '@playwright/test';
import { PASSWORD, scan, SETUP_CODE } from './fixtures.js';

test('setup code, invitation link, sign-up; the page is hidden from everyone else (US-1, US-2, SC-105)', async ({ page, browser }, info) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await scan(page, 'sign up (invitations required)');
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Invitation code', { exact: true }).fill(SETUP_CODE);
  await page.getByLabel('I am 18 or over.').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your comics' })).toBeVisible();

  await page.getByRole('link', { name: 'Invitations' }).click();
  await expect(page.getByRole('heading', { name: 'Invitations', level: 1 })).toBeVisible();
  await page.getByLabel('Email to invite').fill('friend@example.com');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = await page.getByLabel('Invitation link').inputValue();
  expect(link).toMatch(/\/signup#invite=[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole('cell', { name: 'friend@example.com', exact: true })).toBeVisible();
  await scan(page, 'invitations');

  const guest = await browser.newContext({ baseURL: info.project.use.baseURL });
  const p2 = await guest.newPage();
  await p2.goto(link);
  await expect(p2.getByLabel('Invitation code', { exact: true })).not.toHaveValue('');
  await p2.getByLabel('Email', { exact: true }).fill('friend@example.com');
  await p2.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await p2.getByLabel('I am 18 or over.').check();
  await p2.getByRole('button', { name: 'Create account' }).click();
  await expect(p2.getByRole('heading', { name: 'Your comics' })).toBeVisible();
  await expect(p2.getByRole('link', { name: 'Invitations' })).toHaveCount(0);
  await p2.goto('/admin/invites');
  await expect(p2.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await guest.close();
});
