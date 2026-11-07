// Gera todos os apps do portal AMT.
//   node scripts/build-all.mjs pages   → ../escala e ../emenda (publicados pelo GitHub Pages)
//   node scripts/build-all.mjs         → dist/escala e dist/emenda
// Para cada app: build de arquivo único, copia os arquivos compartilhados
// (logos, app-update.js) e grava a versão do cache no service worker.
import { build } from 'vite';
import { copyFileSync, readdirSync, renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  // instalado no celular, qualquer app abre o portal (um único app com todos os módulos)
  if (mode === 'pages') {
    const html = join(out, 'index.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('<link rel="manifest" href="manifest.json"', '<link rel="manifest" href="../manifest.json"'));
  }
  for (const f of readdirSync(join(root, 'public', 'shared'))) copyFileSync(join(root, 'public', 'shared', f), join(out, f));
  console.log(`${app}: ${stamp(out)}`);
}

// portal (página inicial + Medidas): versão do cache do service worker da raiz
if (mode === 'pages') {
  const raiz = join(root, '..');
  const sw = join(raiz, 'service-worker.js');
  const hash = createHash('sha256');
  for (const f of ['index.html', 'manifest.json', join('medidas', 'index.html')]) hash.update(readFileSync(join(raiz, f)));
  const v = `portal-amt-${hash.digest('hex').slice(0, 12)}`;
  writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${v}';`));
  console.log(`portal: ${v}`);
}
