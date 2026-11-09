/**
 * Testa a sincronização (src/cloud/sync.ts) no emulador do Firebase, com o SDK real.
 * Rodar com: npm run test:firebase
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import * as authMod from 'firebase/auth';
import * as fsMod from 'firebase/firestore';
import { CloudSync, COL_DIAS } from '../../src/cloud/sync';
import type { FirebaseApi } from '../../src/cloud/firebase';
import { getDay, pendingWorkers } from '../../src/domain/schedule';
import { AUSENCIAS_PADRAO, FUNCOES_PADRAO } from '../../src/domain/types';

const PROJECT = 'demo-vulcaescala';
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const ADMIN = 'glauber.dutra@benetechbrasil.com.br';
const LIDER = 'warley.silva@benetechbrasil.com.br'; // segundo administrador
const INTRUSO = 'intruso@gmail.com';
const W = '2026-W45';

const apps: FirebaseApp[] = [];
const syncs: CloudSync[] = [];

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** Um "aparelho": app Firebase próprio, usuário logado com e-mail confirmado. */
async function device(email: string, fsPort = Number(FS_PORT)): Promise<FirebaseApi> {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: 'x' }, `dev-${apps.length}`);
  apps.push(app);
  const auth = authMod.getAuth(app);
  authMod.connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const fs = fsMod.getFirestore(app);
  fsMod.connectFirestoreEmulator(fs, FS_HOST, fsPort);
  let cred: authMod.UserCredential;
  try {
    cred = await authMod.createUserWithEmailAndPassword(auth, email, 'senha123');
  } catch {
    cred = await authMod.signInWithEmailAndPassword(auth, email, 'senha123');
  }
  // as regras não exigem confirmação de e-mail; marcar como confirmado aqui é indiferente
  // (mantido para o teste valer com qualquer uma das duas situações)
  await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: cred.user.uid, emailVerified: true }),
  });
  await cred.user.reload();
  await cred.user.getIdToken(true);
  expect(auth.currentUser?.emailVerified).toBe(true);
  return { auth, fs, authMod, fsMod };
}

function newSync(api: FirebaseApi, email: string, storage = new MemStorage()) {
  const s = new CloudSync(storage as unknown as Storage, 3000);
  s.attach(api, email);
  syncs.push(s);
  return s;
}

async function until(cond: () => boolean, ms = 10_000, debug?: () => unknown) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando condição ' + (debug ? JSON.stringify(debug()) : ''));
    await new Promise((r) => setTimeout(r, 50));
  }
}

let adminApi: FirebaseApi;
let liderApi: FirebaseApi;

beforeAll(async () => {
  await fetch(`http://${FS_HOST}:${FS_PORT}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  adminApi = await device(ADMIN);
  liderApi = await device(LIDER);
});

afterAll(async () => {
  syncs.forEach((s) => s.detach());
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('sincronização entre aparelhos', () => {
  let a: CloudSync; // admin
  let b: CloudSync; // líder

  it('dois administradores: o segundo aparelho também lê', async () => {
    a = newSync(adminApi, ADMIN);
    await until(() => a.getInfo().loaded);
    expect(a.getInfo().cloudEmpty).toBe(true);
    // primeira carga: a nuvem deixa de estar "vazia" na hora (não pode ser preenchida duas vezes)
    await a.replaceAll({ version: 3, workers: [], funcoes: [...FUNCOES_PADRAO], ausencias: AUSENCIAS_PADRAO.map((x) => ({ ...x })), weeks: {} });
    expect(a.getInfo().cloudEmpty).toBe(false);

    b = newSync(liderApi, LIDER);
    await until(() => b.getInfo().loaded);
    expect(b.getInfo().status).toBe('ok');
    // administrador é descoberto pela regra do Firestore
    await until(() => a.getInfo().isAdmin);
    await until(() => b.getInfo().isAdmin);
  });

  it('o que um lança aparece no outro', async () => {
    a.dispatch({ type: 'worker/add', id: 'w1', nome: 'adilson', funcao: 'Vulcanizador' });
    a.dispatch({ type: 'worker/add', id: 'w2', nome: 'allan', funcao: 'Vulcanizador' });
    a.dispatch({ type: 'worker/add', id: 'w3', nome: 'bruno', funcao: 'Líder' });
    a.dispatch({ type: 'activity/add', weekKey: W, dayIndex: 0, id: 'x', nome: 'emenda tr-05' });
    // aparece na hora no aparelho de quem lançou, antes de chegar na nuvem
    expect(getDay(a.getState(), W, 0).activities[0].nome).toBe('EMENDA TR-05');
    await until(() => a.getInfo().pending === 0);
    await until(() => b.getState().workers.length === 3 && getDay(b.getState(), W, 0).activities.length === 1);
    expect(b.getState().workers.map((w) => w.nome).sort()).toEqual(['ADILSON', 'ALLAN', 'BRUNO']);
  });

  it('dois aparelhos alocando ao mesmo tempo na mesma atividade: ninguém perde', async () => {
    a.dispatch({ type: 'activity/setWorker', weekKey: W, dayIndex: 0, activityId: 'x', workerId: 'w1', allocated: true });
    b.dispatch({ type: 'activity/setWorker', weekKey: W, dayIndex: 0, activityId: 'x', workerId: 'w2', allocated: true });
    await until(() => a.getInfo().pending === 0 && b.getInfo().pending === 0);
    const ok = (s: CloudSync) => [...getDay(s.getState(), W, 0).activities[0].workerIds].sort().join() === 'w1,w2';
    await until(() => ok(a) && ok(b));
    const day = getDay(b.getState(), W, 0);
    expect(pendingWorkers(day, b.getState().workers).map((w) => w.nome)).toEqual(['BRUNO']);
  });

  it('ausência num aparelho e alocação no outro, mesmo dia', async () => {
    a.dispatch({ type: 'absence/set', weekKey: W, dayIndex: 0, workerId: 'w3', tipo: 'atestado' });
    b.dispatch({ type: 'activity/add', weekKey: W, dayIndex: 0, id: 'y', nome: 'reparo' });
    await until(() => a.getInfo().pending === 0 && b.getInfo().pending === 0);
    await until(() => getDay(a.getState(), W, 0).activities.length === 2 && getDay(b.getState(), W, 0).absences.length === 1);
    expect(pendingWorkers(getDay(a.getState(), W, 0), a.getState().workers)).toEqual([]);
  });

  it('sem internet: fica na fila (inclusive após fechar o app) e envia quando volta', async () => {
    const storage = new MemStorage();
    // primeiro, aparelho online carrega os dados (fica com a cópia local)
    const c0 = newSync(liderApi, LIDER, storage);
    await until(() => c0.getInfo().loaded);
    c0.detach();

    // mesmo aparelho, agora sem sinal: o Firestore aponta para uma porta que não responde
    const semSinal = await device(LIDER, 1);
    const c = new CloudSync(storage as unknown as Storage, 1500);
    syncs.push(c);
    expect(c.getState().workers.length).toBe(3); // abre com os dados da cópia local
    c.attach(semSinal, LIDER);
    c.dispatch({ type: 'activity/add', weekKey: W, dayIndex: 1, id: 'z', nome: 'inspeção' });
    expect(getDay(c.getState(), W, 1).activities[0].nome).toBe('INSPEÇÃO'); // visível na hora
    c.detach();
    expect(c.getInfo().pending).toBe(1);

    // "fecha o app" e abre de novo com internet: a fila salva no aparelho é enviada
    const c2 = new CloudSync(storage as unknown as Storage, 3000);
    syncs.push(c2);
    expect(c2.getInfo().pending).toBe(1);
    expect(getDay(c2.getState(), W, 1).activities[0].nome).toBe('INSPEÇÃO');
    c2.attach(liderApi, LIDER);
    await until(() => c2.getInfo().pending === 0 && c2.getInfo().status === 'ok', 30_000, () => c2.getInfo());
    await until(() => getDay(a.getState(), W, 1).activities.length === 1);
  }, 60_000);

  it('envio sem resposta (sinal fraco) vira "offline" e a ação continua na fila', async () => {
    const semSinal = await device(LIDER, 1);
    const c = new CloudSync(new MemStorage() as unknown as Storage, 1000);
    syncs.push(c);
    c.attach(semSinal, LIDER);
    // força o estado "carregado" para tentar enviar (sem sinal a 1ª leitura nunca chega)
    (c as unknown as { info: { loaded: boolean } }).info.loaded = true;
    c.dispatch({ type: 'absence/set', weekKey: W, dayIndex: 2, workerId: 'w2', tipo: 'folga' });
    await until(() => c.getInfo().status === 'offline', 15_000, () => c.getInfo());
    expect(c.getInfo().pending).toBe(1);
    c.detach();
  }, 30_000);

  it('funções: adicionar e renomear num aparelho atualiza a lista e os colaboradores no outro', async () => {
    a.dispatch({ type: 'funcao/add', nome: 'montador' });
    a.dispatch({ type: 'funcao/rename', de: 'Vulcanizador', para: 'Vulcanizador de correia' });
    await until(() => a.getInfo().pending === 0);
    await until(() => b.getState().funcoes.includes('Montador') && b.getState().funcoes[0] === 'Vulcanizador de correia');
    await until(() => b.getState().workers.filter((w) => w.funcao === 'Vulcanizador de correia').length === 2);
    expect(b.getState().workers.find((w) => w.id === 'w3')!.funcao).toBe('Líder');
    // remover função em uso é recusado também na nuvem (verificado dentro da transação)
    b.dispatch({ type: 'funcao/remove', nome: 'Líder' });
    b.dispatch({ type: 'funcao/remove', nome: 'Soldador' });
    await until(() => b.getInfo().pending === 0);
    await until(() => !a.getState().funcoes.includes('Soldador'));
    expect(a.getState().funcoes).toContain('Líder');
    const snap = await fsMod.getDoc(fsMod.doc(adminApi.fs, 'escala_config/funcoes'));
    expect(snap.data()!.lista).toEqual(['Vulcanizador de correia', 'Líder', 'Encarregado', 'Mecânico', 'Auxiliar', 'Montador']);
  });

  it('feriado municipal cadastrado num aparelho vale no outro', async () => {
    a.dispatch({ type: 'feriado/set', data: '2026-11-05', nome: 'Feriado municipal de teste' });
    await until(() => a.getInfo().pending === 0);
    await until(() => b.getState().feriados['2026-11-05'] === 'Feriado municipal de teste');
    b.dispatch({ type: 'feriado/set', data: '2026-11-05', nome: null });
    await until(() => b.getInfo().pending === 0);
    await until(() => !('2026-11-05' in a.getState().feriados));
  });

  it('tipos de ausência: criar num aparelho, usar no outro, renomear e o histórico acompanha', async () => {
    a.dispatch({ type: 'ausencia/add', id: 'trein', nome: 'treinamento', sigla: 'T', cor: 'verde' });
    await until(() => a.getInfo().pending === 0);
    await until(() => b.getState().ausencias.some((t) => t.id === 'trein'));
    b.dispatch({ type: 'absence/set', weekKey: W, dayIndex: 3, workerId: 'w2', tipo: 'trein' });
    await until(() => b.getInfo().pending === 0);
    a.dispatch({ type: 'ausencia/update', id: 'trein', nome: 'Treinamento NR-10' });
    await until(() => a.getInfo().pending === 0);
    await until(() => b.getState().ausencias.find((t) => t.id === 'trein')?.nome === 'Treinamento NR-10');
    expect(getDay(b.getState(), W, 3).absences).toEqual([{ workerId: 'w2', tipo: 'trein' }]);
    // em uso: remover é recusado também na nuvem
    a.dispatch({ type: 'ausencia/remove', id: 'trein' });
    await until(() => a.getInfo().pending === 0);
    const snap = await fsMod.getDoc(fsMod.doc(adminApi.fs, 'escala_config/ausencias'));
    expect((snap.data()!.lista as { id: string }[]).map((t) => t.id)).toContain('trein');
    b.dispatch({ type: 'absence/set', weekKey: W, dayIndex: 3, workerId: 'w2', tipo: null });
    await until(() => b.getInfo().pending === 0);
  });

  it('alteração recusada pela nuvem não trava a fila; fica guardada até tentar de novo ou descartar', async () => {
    // nome com mais de 80 letras: a regra do Firestore recusa (permissão negada)
    b.dispatch({ type: 'worker/add', id: 'longo', nome: 'X'.repeat(90), funcao: 'Líder' });
    b.dispatch({ type: 'activity/add', weekKey: W, dayIndex: 4, id: 'depois', nome: 'depois da recusa' });
    await until(() => b.getInfo().pending === 0 && b.getInfo().blocked === 1, 15_000, () => b.getInfo());
    // a alteração seguinte foi enviada normalmente
    await until(() => getDay(a.getState(), W, 4).activities.some((x) => x.id === 'depois'));
    // a recusada continua visível só neste aparelho
    expect(b.getState().workers.some((w) => w.id === 'longo')).toBe(true);
    expect(a.getState().workers.some((w) => w.id === 'longo')).toBe(false);
    b.retryBlocked();
    await until(() => b.getInfo().pending === 0 && b.getInfo().blocked === 1, 15_000, () => b.getInfo());
    b.discardBlocked();
    expect(b.getInfo().blocked).toBe(0);
    expect(b.getState().workers.some((w) => w.id === 'longo')).toBe(false);
    a.dispatch({ type: 'activity/remove', weekKey: W, dayIndex: 4, activityId: 'depois' });
    await until(() => a.getInfo().pending === 0);
  });

  it('excluir colaborador limpa todas as escalas na nuvem', async () => {
    b.dispatch({ type: 'worker/remove', id: 'w1' });
    await until(() => b.getInfo().pending === 0);
    await until(() => !a.getState().workers.some((w) => w.id === 'w1'));
    const snap = await fsMod.getDoc(fsMod.doc(adminApi.fs, COL_DIAS, `${W}_0`));
    expect(JSON.stringify(snap.data())).not.toContain('"w1"');
    expect(snap.data()!.activities[0].workerIds).toEqual(['w2']);
  });

  it('dia que fica vazio é apagado da nuvem', async () => {
    a.dispatch({ type: 'activity/remove', weekKey: W, dayIndex: 1, activityId: 'z' });
    await until(() => a.getInfo().pending === 0);
    const snap = await fsMod.getDoc(fsMod.doc(adminApi.fs, COL_DIAS, `${W}_1`));
    expect(snap.exists()).toBe(false);
  });

  it('alteração feita DURANTE a primeira carga/importação não se perde', async () => {
    const carga = a.replaceAll({
      version: 3,
      workers: [{ id: 'k0', nome: 'KAUÃ', funcao: 'Vulcanizador', ativo: true }],
      funcoes: ['Vulcanizador'],
      ausencias: [{ id: 'folga', nome: 'Folga', sigla: 'F', cor: 'cinza', ativo: true }],
      weeks: {},
    });
    // enquanto a carga grava, alguém cria um tipo de ausência e uma função
    a.dispatch({ type: 'ausencia/add', id: 'durante', nome: 'Durante a carga', sigla: 'DC', cor: 'azul' });
    a.dispatch({ type: 'funcao/add', nome: 'Montador' });
    await carga;
    await until(() => a.getInfo().pending === 0);
    const aus = await fsMod.getDoc(fsMod.doc(adminApi.fs, 'escala_config/ausencias'));
    expect((aus.data()!.lista as { id: string }[]).map((t) => t.id)).toEqual(['folga', 'durante']);
    const fun = await fsMod.getDoc(fsMod.doc(adminApi.fs, 'escala_config/funcoes'));
    expect(fun.data()!.lista).toEqual(['Vulcanizador', 'Montador']);
    await until(() => b.getState().ausencias.some((t) => t.id === 'durante'));
  });

  it('importar backup substitui tudo (admin)', async () => {
    await a.replaceAll({
      version: 2,
      workers: [{ id: 'k1', nome: 'KLEBSON', funcao: 'Vulcanizador', ativo: true }],
      funcoes: ['Vulcanizador', 'Soldador'],
      weeks: {},
    });
    await until(() => b.getState().workers.length === 1 && Object.keys(b.getState().weeks).length === 0);
    expect(b.getState().workers[0].nome).toBe('KLEBSON');
    await until(() => b.getState().funcoes.join() === 'Vulcanizador,Soldador');
  });

  it('sair da conta apaga a cópia local', () => {
    const storage = new MemStorage();
    const s = new CloudSync(storage as unknown as Storage);
    s.dispatch({ type: 'worker/add', id: 'q', nome: 'q', funcao: 'Auxiliar' });
    expect(storage.m.size).toBe(1);
    s.clearLocal();
    expect(storage.m.size).toBe(0);
    expect(s.getState().workers).toEqual([]);
  });
});

describe('usuário não liberado', () => {
  it('recebe "denied" e não lê nada', async () => {
    const api = await device(INTRUSO);
    const s = newSync(api, INTRUSO);
    await until(() => s.getInfo().status === 'denied');
    // a escala (dias, ausências) não carrega; o app mostra "Acesso não liberado"
    expect(s.getInfo().loaded).toBe(false);
    expect(Object.keys(s.getState().weeks)).toEqual([]);
  });
});
