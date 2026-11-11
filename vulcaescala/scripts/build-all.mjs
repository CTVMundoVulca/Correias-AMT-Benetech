// Gera todos os apps do portal AMT.
//   node scripts/build-all.mjs pages   → ../escala, ../emenda e ../programacao (publicados pelo GitHub Pages)
//                                         + ../app-update.js e versão do ../service-worker.js (único)
//   node scripts/build-all.mjs         → dist/escala, dist/emenda e dist/programacao
// Para cada app: build de arquivo único, copia os arquivos compartilhados
// (logos, app-update.js) e grava a versão do cache no service worker.
import { build } from 'vite';
import { copyFileSync, readdirSync, renameSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stamp } from './stamp-sw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'pages' ? 'pages' : 'production';

const raiz = join(root, '..');
const shared = join(root, 'public', 'shared');

for (const app of ['escala', 'emenda', 'programacao']) {
  process.env.APP = app;
  await build({ root, mode, logLevel: 'warn' });
  const out = mode === 'pages' ? join(raiz, app) : join(root, 'dist', app);
  if (existsSync(join(out, `${app}.html`))) renameSync(join(out, `${app}.html`), join(out, 'index.html'));
  for (const f of readdirSync(shared)) copyFileSync(join(shared, f), join(out, f));
  if (mode === 'pages') {
    // Portal = um app só: manifest e atualização (app-update.js + service worker) ficam na raiz
    const html = join(out, 'index.html');
    writeFileSync(
      html,
      readFileSync(html, 'utf8')
        .replace('<link rel="manifest" href="manifest.json"', '<link rel="manifest" href="../manifest.json"')
        .replace('<script src="app-update.js"></script>', '<script src="../app-update.js"></script>'),
    );
    rmSync(join(out, 'app-update.js'), { force: true });
    console.log(`${app}: ok`);
  } else console.log(`${app}: ${existsSync(join(out, 'service-worker.js')) ? stamp(out) : 'ok'}`);
}

// Service worker ÚNICO na raiz: a versão muda quando qualquer arquivo do app shell muda,
// e todos os aparelhos se atualizam sozinhos (mesma regra dos Apps CTV Campo).
if (mode === 'pages') {
  copyFileSync(join(shared, 'app-update.js'), join(raiz, 'app-update.js'));
  const sw = join(raiz, 'service-worker.js');
  const src = readFileSync(sw, 'utf8');
  const lista = /const APP_SHELL = \[([\s\S]*?)\];/.exec(src)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  const hash = createHash('sha256');
  for (const u of lista) {
    const f = join(raiz, u.endsWith('/') ? u + 'index.html' : u);
    hash.update(u);
    hash.update(readFileSync(f)); // arquivo faltando = erro no build (melhor que cache incompleto)
  }
  hash.update(src.replace(/const CACHE_VERSION = '[^']*';/, ''));
  const v = `amt-${hash.digest('hex').slice(0, 12)}`;
  writeFileSync(sw, src.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${v}';`));
  console.log(`service worker único: ${v}`);
}
