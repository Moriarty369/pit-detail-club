import { defineConfig } from 'vite';

// The same source works at a domain root and under a GitHub Pages repository.
// WebKit can retain a failed module preload across retries. Fetch the small
// app module normally so a reload can recover from interrupted downloads.
export default defineConfig(({ mode }) => ({
  base: process.env.PIT_BASE_PATH || '/',
  define: { 'import.meta.env.VITE_DATA_SOURCE': JSON.stringify(mode === 'connected' ? 'api' : 'demo') },
  build: { modulePreload: false, outDir: mode === 'connected' ? 'dist-customer' : 'dist' },
}));
