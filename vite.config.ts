import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Front end only. The API server mounts Vite in middleware mode for `npm run dev`, and serves
// dist/web in production. No inline scripts are emitted, so the strict CSP holds.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: true,
    modulePreload: { polyfill: false },
  },
});
