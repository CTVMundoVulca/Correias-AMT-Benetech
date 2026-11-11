/** Regras da Programação da Vulcanização no emulador (npm run test:firebase). */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;
type Db = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>;
const dbs = new Map<string, Db>();
const anon = (uid = 'anon-uid') => {
  if (!dbs.has(uid)) dbs.set(uid, env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } } as never).firestore());
  return dbs.get(uid)!;
};
const as = (email: string) => {
  if (!dbs.has(email)) dbs.set(email, env.authenticatedContext(email, { email, email_verified: true }).firestore());
  return dbs.get(email)!;
};
const semLogin = () => {
  if (!dbs.has('none')) dbs.set('none', env.unauthenticatedContext().firestore());
  return dbs.get('none')!;
};
const ADMIN = 'glauber.dutra@benetechbrasil.com.br';
const OUTRO = 'fulano@benetechbrasil.com.br';

const atividade = { id: 'a1', data: '2026-11-11', area: 'COQUERIA', pessoas: 4, classe: 'programada' };
const solic = {
  id: 's1',
  area: 'COQUERIA',
  equipamento: 'C-3',
  om: '900033748430',
  descricao: 'TROCAR CORREIA C-3',
  urgencia: 'normal',
  dataDesejada: '2026-11-18',
  solicitante: 'Programador Coqueria',
  contato: 'ramal 1234',
  criadoUid: 'anon-uid',
  criadoEm: '2026-11-11T10:00:00.000Z',
  status: 'aberta',
  resposta: '',
  atividadeId: '',
  dataProgramada: '',
  atualizadoEm: '2026-11-11T10:00:00.000Z',
  atualizadoPor: 'anônimo',
};

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
});

describe('Programação: todos veem, só administradores programam', () => {
  it('administrador grava o mês, as OMs e as áreas', async () => {
    await assertSucceeds(as(ADMIN).doc('prog_mes/2026-11').set({ itens: { a1: atividade }, atualizadoEm: 'x', atualizadoPor: ADMIN }, { merge: true }));
    await assertSucceeds(as(ADMIN).doc('prog_oms/2026').set({ oms: { '900033748430': { situacao: 'aberta' } }, atualizadoEm: 'x', atualizadoPor: ADMIN }, { merge: true }));
    await assertSucceeds(as(ADMIN).doc('prog_config/areas').set({ lista: [{ nome: 'COQUERIA', contato: 'ramal 1' }] }));
  });

  it('qualquer sessão do app lê; sem sessão, nada', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('prog_mes/2026-11').set({ itens: { a1: atividade } }));
    await assertSucceeds(anon().doc('prog_mes/2026-11').get());
    await assertSucceeds(anon().doc('prog_oms/2026').get());
    await assertSucceeds(anon().doc('prog_config/areas').get());
    await assertFails(semLogin().doc('prog_mes/2026-11').get());
  });

  it('anônimo e não administrador não programam', async () => {
    await assertFails(anon().doc('prog_mes/2026-11').set({ itens: { a1: atividade } }, { merge: true }));
    await assertFails(as(OUTRO).doc('prog_mes/2026-11').set({ itens: { a1: atividade } }, { merge: true }));
    await assertFails(anon().doc('prog_oms/2026').set({ oms: {} }, { merge: true }));
    await assertFails(anon().doc('prog_config/areas').set({ lista: [] }));
  });

  it('documento do mês: id AAAA-MM e só os campos previstos; ninguém apaga o mês', async () => {
    await assertFails(as(ADMIN).doc('prog_mes/novembro').set({ itens: {} }));
    await assertFails(as(ADMIN).doc('prog_mes/2026-11').set({ itens: {}, outro: 1 }));
    await assertFails(as(ADMIN).doc('prog_oms/26').set({ oms: {} }));
    await assertSucceeds(as(ADMIN).doc('prog_mes/2026-11').set({ itens: {} }));
    await assertFails(as(ADMIN).doc('prog_mes/2026-11').delete());
  });
});

describe('Solicitações das áreas', () => {
  it('qualquer pessoa com o link pede (sessão própria, aberta, sem resposta)', async () => {
    await assertSucceeds(anon().doc('prog_solicitacoes/s1').set(solic));
    await assertFails(anon('outro-uid').doc('prog_solicitacoes/s2').set({ ...solic, id: 's2' })); // criadoUid de outra sessão
    await assertFails(anon().doc('prog_solicitacoes/s3').set({ ...solic, id: 's3', status: 'programada' }));
    await assertFails(anon().doc('prog_solicitacoes/s4').set({ ...solic, id: 's4', om: 'OM-123' }));
    await assertFails(anon().doc('prog_solicitacoes/s5').set({ ...solic, id: 's5', descricao: '' }));
    await assertFails(semLogin().doc('prog_solicitacoes/s6').set({ ...solic, id: 's6' }));
  });

  it('quem pediu corrige ou cancela enquanto está aberta; não se programa sozinho', async () => {
    await assertSucceeds(anon().doc('prog_solicitacoes/s1').set(solic));
    await assertSucceeds(anon().doc('prog_solicitacoes/s1').set({ ...solic, descricao: 'TROCAR CORREIA C-3 (URGENTE)' }));
    await assertFails(anon().doc('prog_solicitacoes/s1').set({ ...solic, status: 'programada' }));
    await assertFails(anon('outro-uid').doc('prog_solicitacoes/s1').set({ ...solic, status: 'cancelada' }));
    await assertSucceeds(anon().doc('prog_solicitacoes/s1').set({ ...solic, status: 'cancelada' }));
    // cancelada: não reabre
    await assertFails(anon().doc('prog_solicitacoes/s1').set({ ...solic, status: 'aberta' }));
    await assertFails(anon().doc('prog_solicitacoes/s1').delete());
  });

  it('administrador programa ou recusa; não troca o autor', async () => {
    await assertSucceeds(anon().doc('prog_solicitacoes/s1').set(solic));
    await assertSucceeds(
      as(ADMIN).doc('prog_solicitacoes/s1').set({ ...solic, status: 'programada', atividadeId: 'a1', dataProgramada: '2026-11-18', atualizadoPor: ADMIN }),
    );
    await assertFails(as(ADMIN).doc('prog_solicitacoes/s1').set({ ...solic, criadoUid: 'outro' }));
    await assertSucceeds(as(ADMIN).doc('prog_solicitacoes/s1').set({ ...solic, status: 'recusada', resposta: 'Sem material' }));
    await assertSucceeds(as(ADMIN).doc('prog_solicitacoes/s1').delete());
  });
});
