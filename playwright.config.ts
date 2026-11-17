import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the built server with twins, in-memory PGlite and in-memory
// storage: no network, no keys. Uses the machine's pre-installed Chromium
// (PLAYWRIGHT_BROWSERS_PATH); @playwright/test is pinned to the installed Playwright version.
const PORT = Number(process.env.E2E_PORT ?? 3917);

const server = (port: number, env: Record<string, string>) => ({
  command: 'node dist/node/server/main.js',
  url: `http://127.0.0.1:${port}/readyz`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    PGLITE_DIR: 'memory://',
    STORAGE_PROVIDER: 'memory',
    LLM_PROVIDER: 'twin',
    IMAGE_PROVIDER: 'twin',
    MODERATION_PROVIDER: 'rules',
    LOG_LEVEL: 'warn',
    RELEASE: 'e2e',
    ...env,
  },
});
export const SETUP_CODE = 'e2e-setup-code-0123456789-0123456789';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /invites\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT}` } },
    { name: 'invites', testMatch: /invites\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT + 1}` } },
  ],
  webServer: [server(PORT, { REGISTRATION_OPEN: 'true' }), server(PORT + 1, { ADMIN_BOOTSTRAP_CODE: SETUP_CODE })],
});
