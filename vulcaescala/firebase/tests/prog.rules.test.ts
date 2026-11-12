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
    await assertSucceeds(as(ADMIN).doc('prog_paradas/2026').set({ paradas: { p1: { tipo: 'geral', inicio: '2026-11-18' } }, atualizadoEm: 'x', atualizadoPor: ADMIN }, { merge: true }));
  });

  it('paradas confirmadas: todos veem; só a programação lança', async () => {
    await assertSucceeds(anon().doc('prog_paradas/2026').get());
    await assertFails(anon().doc('prog_paradas/2026').set({ paradas: {} }, { merge: true }));
    await assertFails(as(OUTRO).doc('prog_paradas/2026').set({ paradas: {} }, { merge: true }));
    await assertFails(as(ADMIN).doc('prog_paradas/2026').set({ paradas: {}, extra: 1 }));
  });

  it('qualquer sessão do app lê a programação; OMs só a gestão; sem sessão, nada', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('prog_mes/2026-11').set({ itens: { a1: atividade } }));
    await assertSucceeds(anon().doc('prog_mes/2026-11').get());
    await assertSucceeds(anon().doc('prog_config/areas').get());
    await assertFails(anon().doc('prog_oms/2026').get());
    await assertFails(as(OUTRO).doc('prog_oms/2026').get());
    await assertSucceeds(as(ADMIN).doc('prog_oms/2026').get());
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

describe('Papéis da gestão (cadastrados pelo administrador no app)', () => {
  const PROG = 'programador@benetechbrasil.com.br';
  const SUP = 'supervisor@benetechbrasil.com.br';
  const papeis = { admins: [], programadores: [PROG], supervisores: [SUP] };

  it('só administrador cadastra papéis; quem está logado lê; anônimo não', async () => {
    await assertFails(as(OUTRO).doc('prog_config/papeis').set(papeis));
    await assertSucceeds(as(ADMIN).doc('prog_config/papeis').set(papeis));
    await assertSucceeds(as(OUTRO).doc('prog_config/papeis').get());
    await assertFails(anon().doc('prog_config/papeis').get());
    await assertFails(as(ADMIN).doc('prog_config/papeis').set({ ...papeis, outro: [] }));
  });

  it('programador programa, confirma paradas e dá baixa; não marca retorno nem cadastra papéis', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('prog_config/papeis').set(papeis));
    await assertSucceeds(as(PROG).doc('prog_mes/2026-11').set({ itens: { a1: atividade } }, { merge: true }));
    await assertSucceeds(as(PROG).doc('prog_oms/2026').set({ oms: { '900033748430': { situacao: 'baixada' } } }, { merge: true }));
    await assertSucceeds(as(PROG).doc('prog_paradas/2026').set({ paradas: { p1: { tipo: 'geral' } } }, { merge: true }));
    await assertFails(as(PROG).doc('prog_retornos/2026').set({ retornos: {} }, { merge: true }));
    await assertFails(as(PROG).doc('prog_config/papeis').set(papeis));
  });

  it('supervisor só marca o retorno: não altera programação, baixa nem paradas', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('prog_config/papeis').set(papeis));
    await assertSucceeds(as(SUP).doc('prog_retornos/2026').set({ retornos: { '900033748430': { realizada: true, em: 'x', por: SUP } } }, { merge: true }));
    await assertSucceeds(as(SUP).doc('prog_oms/2026').get());
    await assertFails(as(SUP).doc('prog_oms/2026').set({ oms: {} }, { merge: true }));
    await assertFails(as(SUP).doc('prog_mes/2026-11').set({ itens: {} }, { merge: true }));
    await assertFails(as(SUP).doc('prog_paradas/2026').set({ paradas: {} }, { merge: true }));
    await assertFails(anon().doc('prog_retornos/2026').set({ retornos: {} }, { merge: true }));
  });
});

describe('Paradas informadas pelas áreas', () => {
  const ped = {
    id: 'pp1', tipo: 'geral', area: 'COQUERIA', equipamento: '', descricao: 'Parada da bateria', inicio: '2026-11-18', fim: '2026-11-20',
    solicitante: 'Programador Coqueria', contato: '', criadoUid: 'anon-uid', criadoEm: '2026-11-12T10:00:00Z', status: 'pendente', resposta: '',
    atualizadoEm: 'x', atualizadoPor: 'anônimo',
  };
  it('área informa (pendente); não confirma sozinha; pode cancelar', async () => {
    await assertSucceeds(anon().doc('prog_paradas_pedidos/pp1').set(ped));
    await assertFails(anon().doc('prog_paradas_pedidos/pp2').set({ ...ped, id: 'pp2', status: 'confirmada' }));
    await assertFails(anon().doc('prog_paradas_pedidos/pp3').set({ ...ped, id: 'pp3', fim: '2026-11-01' }));
    await assertFails(anon().doc('prog_paradas_pedidos/pp1').set({ ...ped, status: 'confirmada' }));
    await assertFails(anon('outro-uid').doc('prog_paradas_pedidos/pp1').set({ ...ped, status: 'cancelada' }));
    await assertSucceeds(anon().doc('prog_paradas_pedidos/pp1').set({ ...ped, status: 'cancelada' }));
  });
  it('programação confirma ou recusa', async () => {
    await assertSucceeds(anon().doc('prog_paradas_pedidos/pp1').set(ped));
    await assertSucceeds(as(ADMIN).doc('prog_paradas_pedidos/pp1').set({ ...ped, status: 'confirmada', atualizadoPor: ADMIN }));
    await assertSucceeds(as(ADMIN).doc('prog_paradas_pedidos/pp1').set({ ...ped, status: 'recusada', resposta: 'Data conflita' }));
  });
});
