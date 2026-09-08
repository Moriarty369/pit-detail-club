import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('admin'), publicDir: resolve('public'),
  base: process.env.PIT_ADMIN_BASE_PATH || '/',
  build: { outDir: resolve('dist-admin'), emptyOutDir: true, modulePreload: false },
});
