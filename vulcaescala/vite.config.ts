/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Vários apps no mesmo projeto (portal AMT). Cada um vira um HTML único
// (CSS/JS embutidos), como os demais apps CTV. APP=escala | emenda | programacao
const APP = process.env.APP === 'emenda' || process.env.APP === 'programacao' ? process.env.APP : 'escala';
const ENTRY = APP === 'escala' ? 'index.html' : `${APP}.html`;

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
