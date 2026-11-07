import type { FirebaseApi } from '../cloud/firebase';
import type { Worker } from '../domain/types';
import { sortByName } from '../domain/schedule';
import { COL_EFETIVO, DOC_ADMIN } from '../cloud/sync';
import { completarEmenda, intervaloMes, LISTAS_PADRAO, type Emenda, type Foto, type Listas } from './model';

/**
 * Firestore do Registro de Emenda (projeto Firebase do AMT):
 *   emendas/{id}                 um relatório (campos planos)
 *   emendas/{id}/fotos/{fotoId}  uma foto comprimida por documento
 *   emenda_config/listas         materiais e fabricantes ("Gerenciar")
 * O efetivo vem do mesmo cadastro da escala (escala_efetivo, só leitura aqui).
 *
 * Sem internet o próprio Firestore guarda as gravações no aparelho e envia
 * depois (cache persistente); a tela mostra o que está pendente.
 */
export const COL_EMENDAS = 'emendas';
export const DOC_LISTAS = 'emenda_config/listas';

export interface Pendencia {
  /** há gravações deste aparelho ainda não confirmadas pela nuvem */
  pendente: boolean;
  /** dados vindos só do cache (sem conexão) */
  offline: boolean;
}

type Unsub = () => void;

/** Emendas de um mês ("AAAA-MM"), pela data do relatório. */
export function ouvirMes(api: FirebaseApi, ym: string, cb: (lista: Emenda[], p: Pendencia) => void, onErr: (e: unknown) => void): Unsub {
  const { fsMod, fs } = api;
  const [de, ate] = intervaloMes(ym);
  const q = fsMod.query(fsMod.collection(fs, COL_EMENDAS), fsMod.where('data', '>=', de), fsMod.where('data', '<=', ate));
  return fsMod.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => completarEmenda({ ...(d.data() as Partial<Emenda>), id: d.id })),
        { pendente: snap.metadata.hasPendingWrites, offline: snap.metadata.fromCache },
      ),
    onErr,
  );
}

/** Busca pela TAG exata em todos os meses. */
export async function buscarTag(api: FirebaseApi, tag: string): Promise<Emenda[]> {
  const { fsMod, fs } = api;
  const snap = await fsMod.getDocs(fsMod.query(fsMod.collection(fs, COL_EMENDAS), fsMod.where('tag', '==', tag)));
  return snap.docs.map((d) => completarEmenda({ ...(d.data() as Partial<Emenda>), id: d.id }));
}

export function ouvirEmenda(api: FirebaseApi, id: string, cb: (e: Emenda | null, p: Pendencia) => void, onErr: (e: unknown) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, COL_EMENDAS, id),
    { includeMetadataChanges: true },
    (snap) =>
      cb(snap.exists() ? completarEmenda({ ...(snap.data() as Partial<Emenda>), id }) : null, {
        pendente: snap.metadata.hasPendingWrites,
        offline: snap.metadata.fromCache,
      }),
    onErr,
  );
}

/**
 * Grava só os campos alterados (merge). Não espera a nuvem responder: sem internet o
 * Firestore guarda no aparelho e envia depois; o estado "pendente" aparece na tela.
 */
export function gravarCampos(api: FirebaseApi, id: string, campos: Partial<Emenda>, por: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(
    fsMod.doc(fs, COL_EMENDAS, id),
    { ...campos, atualizadoEm: new Date().toISOString(), atualizadoPor: por },
    { merge: true },
  );
}

export function criarEmenda(api: FirebaseApi, e: Emenda): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_EMENDAS, e.id), e);
}

/** Exclui a emenda e as fotos (a regra só permite a administradores). */
export async function excluirEmenda(api: FirebaseApi, id: string): Promise<void> {
  const { fsMod, fs } = api;
  const fotos = await fsMod.getDocs(fsMod.collection(fs, COL_EMENDAS, id, 'fotos'));
  const batch = fsMod.writeBatch(fs);
  fotos.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(fsMod.doc(fs, COL_EMENDAS, id));
  await batch.commit();
}

export function ouvirFotos(api: FirebaseApi, id: string, cb: (fotos: Foto[]) => void, onErr: (e: unknown) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.collection(fs, COL_EMENDAS, id, 'fotos'),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Foto), id: d.id })).sort((a, b) => a.ordem - b.ordem)),
    onErr,
  );
}

export function gravarFoto(api: FirebaseApi, emendaId: string, foto: Foto): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_EMENDAS, emendaId, 'fotos', foto.id), foto);
}

export function legendaFoto(api: FirebaseApi, emendaId: string, fotoId: string, legenda: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_EMENDAS, emendaId, 'fotos', fotoId), { legenda }, { merge: true });
}

export function excluirFoto(api: FirebaseApi, emendaId: string, fotoId: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.deleteDoc(fsMod.doc(fs, COL_EMENDAS, emendaId, 'fotos', fotoId));
}

export function ouvirListas(api: FirebaseApi, cb: (l: Listas) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, DOC_LISTAS),
    (snap) => {
      const d = (snap.data() ?? {}) as Partial<Listas>;
      cb({
        materiaisEmenda: Array.isArray(d.materiaisEmenda) && d.materiaisEmenda.length ? d.materiaisEmenda : LISTAS_PADRAO.materiaisEmenda,
        materiaisManta: Array.isArray(d.materiaisManta) && d.materiaisManta.length ? d.materiaisManta : LISTAS_PADRAO.materiaisManta,
        fabricantes: Array.isArray(d.fabricantes) && d.fabricantes.length ? d.fabricantes : LISTAS_PADRAO.fabricantes,
      });
    },
    () => cb(LISTAS_PADRAO),
  );
}

export function gravarListas(api: FirebaseApi, l: Listas): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, DOC_LISTAS), l);
}

/** Efetivo ativo do cadastro da escala, em ordem alfabética. */
export function ouvirEfetivo(api: FirebaseApi, cb: (w: Worker[]) => void, onErr: (e: unknown) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.collection(fs, COL_EFETIVO),
    (snap) => {
      const ws = snap.docs.map((d) => ({ ...(d.data() as Worker), id: d.id })).filter((w) => w.ativo !== false && w.nome);
      cb(sortByName(ws));
    },
    onErr,
  );
}

/** Administrador? (a regra do Firestore decide; o mesmo teste da escala) */
export async function souAdmin(api: FirebaseApi): Promise<boolean> {
  try {
    await api.fsMod.getDoc(api.fsMod.doc(api.fs, DOC_ADMIN));
    return true;
  } catch {
    return false;
  }
}

/** Comprime a foto no aparelho (máx. 1280 px, JPEG) para caber num documento do Firestore. */
export async function comprimirFoto(file: Blob, maxLado = 1280, limiteBytes = 700_000): Promise<string> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  for (const q of [0.72, 0.6, 0.5, 0.4, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= limiteBytes) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.25);
}
