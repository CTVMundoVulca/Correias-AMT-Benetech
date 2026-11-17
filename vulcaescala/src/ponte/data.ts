import type { FirebaseApi } from '../cloud/firebase';
import { completarChecklist, completarOperador, type Checklist, type Operador } from './model';

/**
 * Firestore da ponte rolante:
 *   ponte_config/operadores            { operadores: { id: Operador } } — só administradores gravam
 *   ponte_checklists/{id}              um checklist (só o próprio operador cria; ninguém altera nem apaga)
 *   ponte_checklists/{id}/fotos/{n}    fotos comprimidas dos itens não conformes
 */
export const DOC_OPERADORES = 'ponte_config/operadores';
export const COL_CHECKLISTS = 'ponte_checklists';

type Unsub = () => void;

/** cb recebe a lista e se ela veio só do cache do aparelho (sem confirmação da nuvem) */
export function ouvirOperadores(api: FirebaseApi, cb: (l: Operador[], soCache: boolean) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, DOC_OPERADORES),
    { includeMetadataChanges: true },
    (snap) => {
      const m = (snap.data()?.operadores ?? {}) as Record<string, unknown>;
      cb(Object.entries(m).flatMap(([id, v]) => completarOperador(id, v) ?? []), snap.metadata.fromCache);
    },
    onErr,
  );
}

/** grava (merge) um operador; os demais ficam como estão */
export function gravarOperador(api: FirebaseApi, op: Operador, por: string): Promise<void> {
  const { fsMod, fs } = api;
  const { id, ...dados } = op;
  return fsMod.setDoc(fsMod.doc(fs, DOC_OPERADORES), { operadores: { [id]: dados }, atualizadoEm: new Date().toISOString(), atualizadoPor: por }, { merge: true });
}

/** checklists a partir de uma data (inclusive) */
export function ouvirChecklists(api: FirebaseApi, desde: string, cb: (l: Checklist[], pendente: boolean) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  const q = fsMod.query(fsMod.collection(fs, COL_CHECKLISTS), fsMod.where('data', '>=', desde));
  return fsMod.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.flatMap((d) => completarChecklist(d.id, d.data({ serverTimestamps: 'estimate' })) ?? []).sort((a, b) => b.feitoEm.localeCompare(a.feitoEm)),
        snap.metadata.hasPendingWrites,
      ),
    onErr,
  );
}

export function ouvirChecklist(api: FirebaseApi, id: string, cb: (c: Checklist | null) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, COL_CHECKLISTS, id),
    (snap) => cb(snap.exists() ? completarChecklist(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    () => cb(null),
  );
}

export interface FotoItem {
  itemId: string;
  dataUrl: string;
}

export function ouvirFotos(api: FirebaseApi, id: string, cb: (l: FotoItem[]) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.collection(fs, COL_CHECKLISTS, id, 'fotos'),
    (snap) => cb(snap.docs.map((d) => d.data() as FotoItem).filter((f) => typeof f.dataUrl === 'string')),
    () => cb([]),
  );
}

/**
 * Grava o checklist e as fotos de uma vez (lote). Sem internet, o Firestore guarda no
 * aparelho e envia quando a conexão voltar; a promessa só resolve quando a nuvem recebe.
 */
export function gravarChecklist(api: FirebaseApi, c: Omit<Checklist, 'recebidoEm'>, fotos: FotoItem[]): Promise<void> {
  const { fsMod, fs } = api;
  const b = fsMod.writeBatch(fs);
  const { id, ...dados } = c;
  b.set(fsMod.doc(fs, COL_CHECKLISTS, id), { ...dados, fotos: fotos.length, recebidoEm: fsMod.serverTimestamp() });
  fotos.forEach((f, i) => b.set(fsMod.doc(fs, COL_CHECKLISTS, id, 'fotos', String(i + 1)), f));
  return b.commit();
}
