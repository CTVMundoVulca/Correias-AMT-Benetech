/**
 * Testa as regras do Firestore no emulador. Rodar com: npm run test:firebase
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;
const ADMIN = 'glauber.dutra@benetechbrasil.com.br';
const LIDER = 'lider@empresa.com';

type Db = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>;
// um contexto por usuário (o SDK não permite reconfigurar o mesmo app)
const dbs = new Map<string, Db>();
const getDoc = (r: ReturnType<Db['doc']>) => r.get();
const setDoc = (r: ReturnType<Db['doc']>, data: object) => r.set(data);
const deleteDoc = (r: ReturnType<Db['doc']>) => r.delete();
const doc = (db: Db, path: string) => db.doc(path);
const as = (email: string | null, verified = true) => {
  const key = `${email}|${verified}`;
  if (!dbs.has(key))
    dbs.set(
      key,
      email
        ? env.authenticatedContext(key, { email, email_verified: verified }).firestore()
        : env.unauthenticatedContext().firestore(),
    );
  return dbs.get(key)!;
};

const worker = { id: 'w1', nome: 'ADILSON', funcao: 'Vulcanizador', ativo: true };
const day = { activities: [{ id: 'a1', nome: 'EMENDA', workerIds: ['w1'] }], absences: [], weekKey: '2026-W45', dayIndex: 0 };

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-vulcaescala',
    firestore: { host, port: Number(port), rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});
afterAll(() => env?.cleanup());
beforeEach(async () => {
  // o emulador às vezes recusa a limpeza logo após conexões encerradas por outro arquivo de teste
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
    await setDoc(doc(db, 'escala_config/membros'), { emails: [LIDER] });
    await setDoc(doc(db, 'escala_efetivo/w1'), worker);
  });
});

describe('acesso', () => {
  it('sem login: nada', async () => {
    await assertFails(getDoc(doc(as(null), 'escala_efetivo/w1')));
    await assertFails(getDoc(doc(as(null), 'escala_dias/2026-W45_0')));
    await assertFails(setDoc(doc(as(null), 'escala_dias/2026-W45_0'), day));
  });

  it('logado mas não liberado (qualquer um pode criar conta): nada', async () => {
    const db = as('curioso@gmail.com');
    await assertFails(getDoc(doc(db, 'escala_dias/2026-W45_0')));
    await assertFails(getDoc(doc(db, 'escala_config/membros')));
    await assertFails(setDoc(doc(db, 'escala_dias/2026-W45_0'), day));
  });

  it('não exige confirmação de e-mail: liberado entra direto', async () => {
    await assertSucceeds(getDoc(doc(as(LIDER, false), 'escala_efetivo/w1')));
    await assertSucceeds(getDoc(doc(as(ADMIN, false), 'escala_config/admin')));
  });

  it('detecção de administrador: só admin lê escala_config/admin; ninguém grava', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'escala_config/admin')));
    await assertSucceeds(getDoc(doc(as('Warley.Silva@benetechbrasil.com.br'), 'escala_config/admin')));
    await assertSucceeds(getDoc(doc(as('plantao.amt@benetechbrasil.com.br'), 'escala_config/admin')));
    await assertFails(getDoc(doc(as(LIDER), 'escala_config/admin')));
    await assertFails(getDoc(doc(as('michael.lopes@benetechbrasil.com.br'), 'escala_config/admin')));
    await assertFails(setDoc(doc(as(ADMIN), 'escala_config/admin'), { x: 1 }));
  });

  it('membro lê e grava escala e efetivo', async () => {
    const db = as(LIDER);
    await assertSucceeds(getDoc(doc(db, 'escala_efetivo/w1')));
    await assertSucceeds(setDoc(doc(db, 'escala_dias/2026-W45_0'), day));
    await assertSucceeds(setDoc(doc(db, 'escala_efetivo/w2'), { ...worker, id: 'w2', nome: 'ALLAN' }));
    await assertSucceeds(deleteDoc(doc(db, 'escala_efetivo/w2')));
    await assertSucceeds(getDoc(doc(db, 'escala_config/membros')));
  });

  it('e-mail com maiúsculas também é reconhecido', async () => {
    await assertSucceeds(getDoc(doc(as('Lider@Empresa.com'), 'escala_efetivo/w1')));
  });

  it('membro não altera a lista de membros; admin altera', async () => {
    await assertFails(setDoc(doc(as(LIDER), 'escala_config/membros'), { emails: [LIDER, 'x@y.com'] }));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'escala_config/membros'), { emails: [LIDER, 'x@y.com'] }));
  });

  it('admin tem acesso mesmo sem a lista existir', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'escala_config/membros')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'escala_dias/2026-W45_0')));
    await assertFails(getDoc(doc(as(LIDER), 'escala_dias/2026-W45_0')));
  });

  it('outras coleções bloqueadas', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'qualquer/coisa'), { a: 1 }));
  });
});

describe('validação de formato', () => {
  it('id do dia precisa ser AAAA-Www_D', async () => {
    await assertFails(setDoc(doc(as(LIDER), 'escala_dias/semana1'), day));
    await assertFails(setDoc(doc(as(LIDER), 'escala_dias/2026-W45_7'), day));
  });

  it('colaborador: id coerente, função preenchida (qualquer da lista), nome limitado', async () => {
    const db = as(LIDER);
    await assertFails(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'outro' }));
    await assertSucceeds(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'w9', funcao: 'Montador' }));
    await assertFails(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'w9', funcao: '' }));
    await assertFails(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'w9', funcao: 'X'.repeat(41) }));
    await assertFails(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'w9', funcao: 3 }));
    await assertFails(setDoc(doc(db, 'escala_efetivo/w9'), { ...worker, id: 'w9', nome: 'X'.repeat(81) }));
  });

  it('lista de funções: membro lê e grava; formato validado; não liberado não acessa', async () => {
    await assertSucceeds(setDoc(doc(as(LIDER), 'escala_config/funcoes'), { lista: ['Vulcanizador', 'Montador'] }));
    await assertSucceeds(getDoc(doc(as(LIDER), 'escala_config/funcoes')));
    await assertFails(setDoc(doc(as(LIDER), 'escala_config/funcoes'), { lista: [] }));
    await assertFails(setDoc(doc(as(LIDER), 'escala_config/funcoes'), { lista: ['A'], outro: 1 }));
    await assertFails(getDoc(doc(as('curioso@gmail.com'), 'escala_config/funcoes')));
    await assertFails(setDoc(doc(as('curioso@gmail.com'), 'escala_config/funcoes'), { lista: ['X'] }));
  });
});
