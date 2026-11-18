/** Regras do checklist da ponte rolante no emulador (npm run test:firebase). */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
type Db = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>;
const dbs = new Map<string, Db>();
const anon = (uid = 'anon-uid') => {
  if (!dbs.has(uid)) dbs.set(uid, env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } } as never).firestore());
  return dbs.get(uid)!;
};
const as = (email: string, uid = email) => {
  const k = uid + '|' + email;
  if (!dbs.has(k)) dbs.set(k, env.authenticatedContext(uid, { email }).firestore());
  return dbs.get(k)!;
};
const ADMIN = 'glauber.dutra@benetechbrasil.com.br';
const OP = 'op-abc@operadores.vulcaescala.example.com';
const OP2 = 'op-xyz@operadores.vulcaescala.example.com';
const futuro = Date.now() + 30 * 86_400_000;
const operadores = {
  o1: { nome: 'FULANO DE TAL', matricula: '12345', validade: '2099-01-01', validadeAte: futuro, authEmail: OP, ativo: true, atualizadoEm: 'x' },
  o2: { nome: 'CICRANO VENCIDO', matricula: '999', validade: '2020-01-01', validadeAte: Date.now() - 86_400_000, authEmail: OP2, ativo: true, atualizadoEm: 'x' },
};
const checklist = (x: Record<string, unknown> = {}) => ({
  data: '2026-11-16',
  feitoEm: '2026-11-16T10:00:00.000Z',
  recebidoEm: serverTimestamp(),
  operadorId: 'o1',
  nome: 'FULANO DE TAL',
  matricula: '12345',
  modeloVersao: 'v1',
  itens: [{ id: 'p1', grupo: 'G', texto: 'T', bloqueia: true }],
  respostas: { p1: { r: 'C', obs: '' } },
  resultado: 'liberada',
  apto: true,
  observacao: '',
  criadoUid: OP,
  fotos: 0,
  ...x,
});

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
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('ponte_config/operadores').set({ operadores }));
});

describe('Ponte rolante: operadores e checklist', () => {
  it('todos veem operadores e checklists; só administrador cadastra operador', async () => {
    await assertSucceeds(anon().doc('ponte_config/operadores').get());
    await assertSucceeds(anon().collection('ponte_checklists').get());
    await assertFails(anon().doc('ponte_config/operadores').set({ operadores: {} }));
    await assertFails(as(OP).doc('ponte_config/operadores').set({ operadores: {} }, { merge: true }));
    await assertSucceeds(as(ADMIN).doc('ponte_config/operadores').set({ operadores: { o3: { nome: 'NOVO' } }, atualizadoEm: 'x', atualizadoPor: ADMIN }, { merge: true }));
    await assertFails(as(ADMIN).doc('ponte_config/operadores').set({ operadores: {}, extra: 1 }, { merge: true }));
  });

  it('o próprio operador, com treinamento válido, cria o checklist', async () => {
    await assertSucceeds(as(OP).doc('ponte_checklists/c1').set(checklist()));
  });

  it('ninguém assina por outra pessoa nem com dados trocados', async () => {
    await assertFails(anon().doc('ponte_checklists/c1').set(checklist({ criadoUid: 'anon-uid' })));
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').set(checklist({ criadoUid: ADMIN })));
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ nome: 'OUTRO NOME' })));
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ matricula: '1' })));
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ operadorId: 'o2', nome: 'CICRANO VENCIDO', matricula: '999' })));
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ recebidoEm: Timestamp.fromMillis(0) })));
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ extra: 1 })));
    // "não está em condições" precisa sair como interditada
    await assertFails(as(OP).doc('ponte_checklists/c1').set(checklist({ apto: false, resultado: 'liberada' })));
    await assertSucceeds(as(OP).doc('ponte_checklists/c9').set(checklist({ apto: false, resultado: 'bloqueada' })));
  });

  it('treinamento vencido ou operador desativado: bloqueado', async () => {
    await assertFails(as(OP2).doc('ponte_checklists/c2').set(checklist({ operadorId: 'o2', nome: 'CICRANO VENCIDO', matricula: '999', criadoUid: OP2 })));
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('ponte_config/operadores').set({ operadores: { o1: { ...operadores.o1, ativo: false } } }, { merge: true }));
    await assertFails(as(OP).doc('ponte_checklists/c3').set(checklist()));
  });

  it('registro de auditoria: ninguém altera nem apaga', async () => {
    await assertSucceeds(as(OP).doc('ponte_checklists/c1').set(checklist()));
    await assertFails(as(OP).doc('ponte_checklists/c1').update({ resultado: 'bloqueada' }));
    await assertFails(as(OP).doc('ponte_checklists/c1').delete());
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').delete());
  });

  it('administrador exclui com motivo (fica o histórico); ninguém mais', async () => {
    await assertSucceeds(as(OP).doc('ponte_checklists/c1').set(checklist()));
    const exc = { excluidoEm: '2026-11-18T12:00:00Z', excluidoPor: ADMIN, excluidoMotivo: 'Checklist de teste do sistema' };
    await assertFails(as(OP).doc('ponte_checklists/c1').update({ ...exc, excluidoPor: OP }));
    await assertFails(anon().doc('ponte_checklists/c1').update(exc));
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').update({ ...exc, excluidoMotivo: 'curto' }));
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').update({ ...exc, excluidoPor: 'outro@x.com' }));
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').update({ ...exc, resultado: 'bloqueada' }));
    await assertSucceeds(as(ADMIN).doc('ponte_checklists/c1').update(exc));
    // já excluído: não muda de novo; e apagar de verdade continua proibido
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').update({ excluidoMotivo: 'outro motivo qualquer' }));
    await assertFails(as(ADMIN).doc('ponte_checklists/c1').delete());
  });

  it('fotos: só junto com o checklist do próprio operador', async () => {
    const db = as(OP);
    const b = db.batch();
    b.set(db.doc('ponte_checklists/c1'), checklist({ fotos: 1 }));
    b.set(db.doc('ponte_checklists/c1/fotos/1'), { itemId: 'p1', dataUrl: 'data:image/jpeg;base64,AAA' });
    await assertSucceeds(b.commit());
    await assertFails(anon().doc('ponte_checklists/c1/fotos/2').set({ itemId: 'p1', dataUrl: 'x' }));
    await assertFails(db.doc('ponte_checklists/c1/fotos/1').delete());
  });
});
