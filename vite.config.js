import { defineConfig } from 'vite';

// The same source works at a domain root and under a GitHub Pages repository.
export default defineConfig({ base: process.env.PIT_BASE_PATH || '/' });
