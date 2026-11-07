// Após o build: grava no service-worker.js uma versão de cache derivada do conteúdo
// do app. Assim todo deploy com mudança força a atualização nos aparelhos
// (regra "CACHE_VERSION deve ser incrementado a cada deploy" dos apps CTV),
// sem depender de alguém lembrar de trocar o número.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const files = ['index.html', 'app-update.js', 'manifest.json'];
const hash = createHash('sha256');
for (const f of files) hash.update(readFileSync(join(dir, f)));
const version = 'vulcaescala-amt-' + hash.digest('hex').slice(0, 12);
const swPath = join(dir, 'service-worker.js');
const sw = readFileSync(swPath, 'utf8').replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`);
writeFileSync(swPath, sw);
console.log('service-worker.js →', version);
