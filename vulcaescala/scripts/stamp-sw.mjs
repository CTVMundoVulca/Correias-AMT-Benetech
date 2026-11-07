// Grava no service-worker.js uma versão de cache derivada do conteúdo do app.
// Assim todo deploy com mudança força a atualização nos aparelhos
// (regra "CACHE_VERSION deve ser incrementado a cada deploy" dos apps CTV).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function stamp(dir) {
  const hash = createHash('sha256');
  for (const f of ['index.html', 'app-update.js', 'manifest.json']) hash.update(readFileSync(join(dir, f)));
  const swPath = join(dir, 'service-worker.js');
  let version = '';
  const sw = readFileSync(swPath, 'utf8').replace(/const CACHE_VERSION = '([a-z-]+?)-[a-z0-9]+';/, (_, prefix) => {
    version = `${prefix}-${hash.digest('hex').slice(0, 12)}`;
    return `const CACHE_VERSION = '${version}';`;
  });
  if (!version) throw new Error('CACHE_VERSION não encontrado em ' + swPath);
  writeFileSync(swPath, sw);
  return version;
}
