import { defineConfig } from 'vitest/config';

// Unit and integration tests only: no network (loopback fakes only), no browser.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
  },
});
