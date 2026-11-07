/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Arquivo HTML único (CSS/JS embutidos), como os demais apps CTV.
// `npm run build:pages` gera a pasta ../escala, publicada pelo GitHub Pages.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: mode === 'pages' ? '../escala' : 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
  test: { include: ['src/**/*.test.ts'] },
}));
