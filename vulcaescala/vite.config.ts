/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Vários apps no mesmo projeto (portal AMT). Cada um vira um HTML único
// (CSS/JS embutidos), como os demais apps CTV. APP=escala | emenda
const APP = process.env.APP === 'emenda' ? 'emenda' : 'escala';
const ENTRY = APP === 'emenda' ? 'emenda.html' : 'index.html';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  publicDir: `public/${APP}`,
  build: {
    outDir: mode === 'pages' ? `../${APP}` : `dist/${APP}`,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: ENTRY },
  },
  test: { include: ['src/**/*.test.ts'] },
}));
