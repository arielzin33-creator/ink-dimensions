import { expect, test } from '@playwright/test';
import { PASSWORD, signUp } from './fixtures.js';

test('sign up, sign out and sign in again', async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('You have no projects yet')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toHaveText('Email or password is incorrect.');

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your comics' })).toBeVisible();

  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'ink_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Strict');
});

test('the sign-up form can be completed with the keyboard only', async ({ page }) => {
  await page.goto('/signup');
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab'); // brand link
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.type(`kb-${Date.now()}@example.com`);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your comics' })).toBeVisible();
});
