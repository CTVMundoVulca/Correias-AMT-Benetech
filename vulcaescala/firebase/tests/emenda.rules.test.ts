/** Regras do Registro de Emenda no emulador (npm run test:firebase). */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;
type Db = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>;
const dbs = new Map<string, Db>();
// anônimo: token sem e-mail, provedor "anonymous"
const anon = () => {
  if (!dbs.has('anon')) dbs.set('anon', env.authenticatedContext('anon-uid', { firebase: { sign_in_provider: 'anonymous' } } as never).firestore());
  return dbs.get('anon')!;
};
const as = (email: string) => {
  if (!dbs.has(email)) dbs.set(email, env.authenticatedContext(email, { email, email_verified: true }).firestore());
  return dbs.get(email)!;
};
const semLogin = () => {
  if (!dbs.has('none')) dbs.set('none', env.unauthenticatedContext().firestore());
  return dbs.get('none')!;
};
const ADMIN = 'warley.silva@benetechbrasil.com.br';
const emenda = { id: 'e1', tag: 'TR-05', data: '2026-11-07', numero: '12', om: '', efetivo: [] };
const foto = { id: 'f1', ordem: 0, legenda: 'Emenda', data: 'data:image/jpeg;base64,AAAA', criadoEm: 'x' };

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-vulcaescala',
    firestore: { host, port: Number(port), rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});
afterAll(() => env?.cleanup());
beforeEach(async () => {
  for (let i = 0; ; i++) {
    try {
      await env.clearFirestore();
      break;
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('escala_efetivo/w1').set({ id: 'w1', nome: 'ADILSON', funcao: 'Vulcanizador', ativo: true, matricula: '123' });
    await db.doc('escala_dias/2026-W45_0').set({ activities: [], absences: [{ workerId: 'w1', tipo: 'atestado' }] });
  });
});

describe('Registro de Emenda: qualquer pessoa com o link (sessão anônima)', () => {
  it('sem sessão nenhuma: nada (só o app consegue gravar)', async () => {
    await assertFails(semLogin().doc('emendas/e1').set(emenda));
    await assertFails(semLogin().doc('escala_efetivo/w1').get());
  });

  it('anônimo cria, edita e lê emendas e fotos; lê o efetivo', async () => {
    await assertSucceeds(anon().doc('emendas/e1').set(emenda));
    await assertSucceeds(anon().doc('emendas/e1').set({ ...emenda, tag: 'TR-06' }, { merge: true }));
    await assertSucceeds(anon().doc('emendas/e1').get());
    await assertSucceeds(anon().doc('emendas/e1/fotos/f1').set(foto));
    await assertSucceeds(anon().doc('emendas/e1/fotos/f1').delete());
    await assertSucceeds(anon().doc('escala_efetivo/w1').get());
    await assertSucceeds(anon().doc('emenda_config/listas').set({ materiaisEmenda: ['A'], materiaisManta: ['B'], fabricantes: ['C'] }));
  });

  it('anônimo NÃO vê a escala (atestados), não altera o efetivo, não exclui emenda', async () => {
    await assertFails(anon().doc('escala_dias/2026-W45_0').get());
    await assertFails(anon().doc('escala_efetivo/w2').set({ id: 'w2', nome: 'X', funcao: 'Vulcanizador', ativo: true }));
    await assertFails(anon().doc('escala_config/admin').get());
    await anon().doc('emendas/e1').set(emenda);
    await assertFails(anon().doc('emendas/e1').delete());
  });

  it('administrador exclui emenda', async () => {
    await anon().doc('emendas/e1').set(emenda);
    await assertSucceeds(as(ADMIN).doc('emendas/e1').delete());
  });

  it('validação: data AAAA-MM-DD (usada para organizar por mês), foto até ~1 MB', async () => {
    await assertFails(anon().doc('emendas/e2').set({ ...emenda, data: '07/11/2026' }));
    await assertFails(anon().doc('emendas/e2').set({ ...emenda, tag: 'X'.repeat(61) }));
    await assertFails(anon().doc('emendas/e1/fotos/f2').set({ ...foto, data: 'x'.repeat(1_000_001) }));
    await assertFails(anon().doc('emendas/e1/fotos/f2').set({ ...foto, outro: 1 }));
  });

  it('matrícula no cadastro do efetivo: opcional, até 30 caracteres', async () => {
    const lider = 'lider@empresa.com';
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('escala_config/membros').set({ emails: [lider] }));
    await assertSucceeds(as(lider).doc('escala_efetivo/w3').set({ id: 'w3', nome: 'B', funcao: 'Vulcanizador', ativo: true, matricula: '98765' }));
    await assertFails(as(lider).doc('escala_efetivo/w4').set({ id: 'w4', nome: 'C', funcao: 'Vulcanizador', ativo: true, matricula: 'X'.repeat(31) }));
  });
});
