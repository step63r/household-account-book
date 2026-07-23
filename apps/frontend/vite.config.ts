import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `amazon-cognito-identity-js` (and its crypto dependencies) reference the Node.js
  // global `global` at module load time. Unlike webpack, Vite doesn't polyfill this in
  // the browser, so without this define every page crashes on load with
  // `ReferenceError: global is not defined` as soon as src/lib/auth.ts is imported.
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  // @household/shared is a workspace package with no build step; it ships raw
  // TypeScript source (see packages/shared/package.json "exports"). Vite's
  // esbuild pipeline transpiles it like any other source file, but we still
  // need to make sure the dependency pre-bundler doesn't try to treat it as
  // an opaque prebuilt dep and that changes to it trigger HMR during local
  // monorepo development.
  optimizeDeps: {
    exclude: ['@household/shared'],
  },
  server: {
    fs: {
      // allow importing the shared workspace package source from outside apps/frontend
      allow: [path.resolve(dirname, '../..')],
    },
  },
});
