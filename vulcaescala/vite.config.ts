/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Vários apps no mesmo projeto (portal AMT). Cada um vira um HTML único
// (CSS/JS embutidos), como os demais apps CTV. APP=escala | emenda | programacao
const APP = ['emenda', 'programacao', 'areas', 'prog-teste'].includes(process.env.APP ?? '') ? process.env.APP! : 'escala';
const ENTRY = APP === 'escala' ? 'index.html' : `${APP}.html`;
// modo teste da Programação: troca o Firebase por uma imitação na memória (nada vai para a nuvem)
const TESTE = APP === 'prog-teste';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  publicDir: `public/${TESTE ? 'programacao' : APP}`,
  resolve: TESTE ? { alias: [{ find: /^.*\/cloud\/firebase$/, replacement: fileURLToPath(new URL('./src/prog/demo/firebaseFalso.ts', import.meta.url)) }] } : undefined,
  build: {
    outDir: mode === 'pages' ? `../${APP}` : `dist/${APP}`,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: ENTRY },
  },
  test: { include: ['src/**/*.test.ts'] },
}));
