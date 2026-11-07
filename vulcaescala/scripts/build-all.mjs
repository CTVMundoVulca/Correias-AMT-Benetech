// Gera todos os apps do portal AMT.
//   node scripts/build-all.mjs pages   → ../escala e ../emenda (publicados pelo GitHub Pages)
//   node scripts/build-all.mjs         → dist/escala e dist/emenda
// Para cada app: build de arquivo único, copia os arquivos compartilhados
// (logos, app-update.js) e grava a versão do cache no service worker.
import { build } from 'vite';
import { copyFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stamp } from './stamp-sw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'pages' ? 'pages' : 'production';

for (const app of ['escala', 'emenda']) {
  process.env.APP = app;
  await build({ root, mode, logLevel: 'warn' });
  const out = mode === 'pages' ? join(root, '..', app) : join(root, 'dist', app);
  if (existsSync(join(out, 'emenda.html'))) renameSync(join(out, 'emenda.html'), join(out, 'index.html'));
  for (const f of readdirSync(join(root, 'public', 'shared'))) copyFileSync(join(root, 'public', 'shared', f), join(out, f));
  console.log(`${app}: ${stamp(out)}`);
}
