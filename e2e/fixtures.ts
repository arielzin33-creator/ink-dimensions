// Shared end-to-end helpers: unique accounts and a tiny real PNG built in memory.
import { expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function pngFile(name = 'photo.png') {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 90, 160, 0, 160, 90]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name, mimeType: 'image/png', buffer: png };
}

let n = 0;
export const uniqueEmail = () => `e2e-${Date.now()}-${++n}@example.com`;
export const PASSWORD = 'e2e password 12345';

export async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/signup');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your comics' })).toBeVisible();
  return email;
}

export async function createProject(page: Page, title: string, path: 'Real photos' | 'Invented characters'): Promise<void> {
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('radio', { name: new RegExp(path) }).check();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Characters', level: 2 })).toBeVisible();
}
