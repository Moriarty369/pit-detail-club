import { defineConfig } from 'vite';

// The same source works at a domain root and under a GitHub Pages repository.
// WebKit can retain a failed module preload across retries. Fetch the small
// app module normally so a reload can recover from interrupted downloads.
export default defineConfig({ base: process.env.PIT_BASE_PATH || '/', build: { modulePreload: false } });
