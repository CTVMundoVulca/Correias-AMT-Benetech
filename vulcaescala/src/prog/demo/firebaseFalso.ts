/**
 * MODO TESTE da Programação: imita o Firebase na memória do navegador.
 * Nada vai para a nuvem; recarregar a página volta ao estado inicial.
 * Usado só no build de teste (APP=prog-teste), que troca ../cloud/firebase por este arquivo.
 */
import type { FirebaseApi } from '../../cloud/firebase';

type Dados = Record<string, unknown>;
const APAGAR = Symbol('deleteField');
const store = new Map<string, Dados>();
type Ouvinte = { alvo: Ref | Consulta; cb: (s: unknown) => void };
const ouvintes = new Set<Ouvinte>();

interface Ref {
  tipo: 'doc';
  path: string;
  id: string;
}
interface Col {
  tipo: 'col';
  path: string;
}
interface Filtro {
  campo: string;
  op: string;
  valor: unknown;
}
interface Consulta {
  tipo: 'query';
  col: Col;
  filtros: Filtro[];
}

const juntar = (seg: string[]) => seg.join('/').replace(/\/+/g, '/');
const clonar = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function mesclar(base: Dados, novo: Dados): Dados {
  const out: Dados = { ...base };
  for (const [k, v] of Object.entries(novo)) {
    if (v === APAGAR) delete out[k];
    else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]))
      out[k] = mesclar(out[k] as Dados, v as Dados);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = mesclar({}, v as Dados);
    else out[k] = clonar(v);
  }
  return out;
}

const meta = { hasPendingWrites: false, fromCache: false };
const snapDoc = (r: Ref) => {
  const d = store.get(r.path);
  return { id: r.id, ref: r, exists: () => !!d, data: () => clonar(d), metadata: meta };
};
const passa = (d: Dados, f: Filtro, id = '') => {
  const v = f.campo === '__id__' ? id : d[f.campo];
  if (f.op === '==') return v === f.valor;
  if (f.op === '>=') return String(v ?? '') >= String(f.valor);
  if (f.op === '<=') return String(v ?? '') <= String(f.valor);
  return true;
};
const snapConsulta = (q: Consulta) => {
  const docs = [...store.entries()]
    .filter(([p]) => p.startsWith(q.col.path + '/') && !p.slice(q.col.path.length + 1).includes('/'))
    .filter(([p, d]) => q.filtros.every((f) => passa(d, f, p.split('/').pop())))
    .map(([p]) => snapDoc({ tipo: 'doc', path: p, id: p.split('/').pop()! }));
  return { docs, metadata: meta };
};
const afeta = (o: Ouvinte, path: string) =>
  o.alvo.tipo === 'doc' ? o.alvo.path === path : path.startsWith(o.alvo.col.path + '/');
function avisar(path: string) {
  for (const o of ouvintes) if (afeta(o, path)) setTimeout(() => o.cb(o.alvo.tipo === 'doc' ? snapDoc(o.alvo) : snapConsulta(o.alvo)), 0);
}
function gravar(r: Ref, d: Dados, opts?: { merge?: boolean }) {
  store.set(r.path, opts?.merge ? mesclar(store.get(r.path) ?? {}, d) : mesclar({}, d));
  avisar(r.path);
}

// ---------------------------------------------------------------- autenticação falsa
type Usuario = { uid: string; email: string | null; isAnonymous: boolean };
let atual: Usuario | null = null;
const authOuvintes = new Set<(u: Usuario | null) => void>();
const mudarUsuario = (u: Usuario | null) => {
  atual = u;
  authOuvintes.forEach((cb) => setTimeout(() => cb(u), 0));
};
/** no teste, só admin@teste.com é administrador "da escala"; os demais papéis vêm de prog_config/papeis */
const ehAdmin = () => atual?.email === 'admin@teste.com';

const fsMod = {
  doc: (_fs: unknown, ...seg: string[]): Ref => {
    const path = juntar(seg);
    return { tipo: 'doc', path, id: path.split('/').pop()! };
  },
  collection: (_fs: unknown, ...seg: string[]): Col => ({ tipo: 'col', path: juntar(seg) }),
  where: (campo: string, op: string, valor: unknown): Filtro => ({ campo, op, valor }),
  query: (col: Col, ...filtros: Filtro[]): Consulta => ({ tipo: 'query', col, filtros }),
  deleteField: () => APAGAR,
  documentId: () => '__id__',
  onSnapshot: (alvo: Ref | Consulta, a: unknown, b?: unknown) => {
    const cb = (typeof a === 'function' ? a : b) as (s: unknown) => void;
    const o: Ouvinte = { alvo, cb };
    ouvintes.add(o);
    setTimeout(() => ouvintes.has(o) && cb(alvo.tipo === 'doc' ? snapDoc(alvo) : snapConsulta(alvo)), 0);
    return () => ouvintes.delete(o);
  },
  setDoc: async (r: Ref, d: Dados, opts?: { merge?: boolean }) => gravar(r, d, opts),
  deleteDoc: async (r: Ref) => {
    store.delete(r.path);
    avisar(r.path);
  },
  getDoc: async (r: Ref) => {
    // as regras reais só deixam administradores lerem este documento
    if (r.path === 'escala_config/admin' && !ehAdmin()) throw new Error('permission-denied');
    return snapDoc(r);
  },
  getDocFromServer: async (r: Ref) => snapDoc(r),
  getDocs: async (q: Consulta | Col) => snapConsulta(q.tipo === 'col' ? { tipo: 'query', col: q, filtros: [] } : q),
  writeBatch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (r: Ref, d: Dados, o?: { merge?: boolean }) => void ops.push(() => gravar(r, d, o)),
      delete: (r: Ref) => void ops.push(() => (store.delete(r.path), avisar(r.path))),
      commit: async () => ops.forEach((f) => f()),
    };
  },
};

const authMod = {
  onAuthStateChanged: (_a: unknown, cb: (u: Usuario | null) => void) => {
    authOuvintes.add(cb);
    setTimeout(() => cb(atual), 0);
    return () => authOuvintes.delete(cb);
  },
  signInAnonymously: async () => mudarUsuario({ uid: 'teste-anonimo', email: null, isAnonymous: true }),
  signInWithEmailAndPassword: async (_a: unknown, email: string) => mudarUsuario({ uid: 'teste-admin', email: email.toLowerCase(), isAnonymous: false }),
  signOut: async () => mudarUsuario(null),
  sendPasswordResetEmail: async () => {
    throw new Error('Modo teste: não envia e-mail.');
  },
};

/** Coloca dados iniciais (antes do app abrir). */
export function semear(path: string, d: Dados) {
  store.set(path, mesclar(store.get(path) ?? {}, d));
}

const api = { auth: {}, fs: {}, authMod, fsMod } as unknown as FirebaseApi;
export type { FirebaseApi };
export const loadFirebase = () => Promise.resolve(api);
