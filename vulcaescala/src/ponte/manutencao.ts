import type { FirebaseApi } from '../cloud/firebase';
import { comprimirFoto } from '../emenda/data';
import { newId } from '../domain/ids';

/**
 * Histórico de manutenções da ponte (feitas pela ArcelorMittal): OM, laudos, fotos e PDFs.
 *   ponte_manutencoes/{id}                   o registro (data, tipo, OM, executante, descrição, lista de anexos)
 *   ponte_manutencoes/{id}/arquivos/{n}      partes dos anexos (base64, até ~700 mil caracteres cada)
 * Os arquivos ficam no próprio Firestore, em partes, para funcionar no plano atual do Firebase e
 * com sinal fraco (o Firestore guarda no aparelho e envia quando a conexão voltar).
 * Lançam: administradores e operadores habilitados (com o PIN). Ninguém apaga: o administrador
 * exclui com motivo (fica no histórico de exclusão), como no checklist.
 */
export const COL_MANUT = 'ponte_manutencoes';
export const TIPOS_MANUT = ['Preventiva', 'Corretiva', 'Inspeção/Laudo', 'Outro'] as const;
export type TipoManut = (typeof TIPOS_MANUT)[number];
export const EXECUTANTE_PADRAO = 'ArcelorMittal';
export const MAX_ARQUIVO = 10 * 1024 * 1024;
export const MAX_ANEXOS = 20;
export const DESCRICAO_MAX = 2000;
/** caracteres base64 por documento de parte (o limite do Firestore é 1 MiB por documento) */
export const PARTE = 700_000;
/** partes por gravação em lote (cada envio ao Firestore tem limite de 10 MiB) */
const PARTES_POR_LOTE = 10;

export interface Anexo {
  id: string;
  nome: string;
  /** "application/pdf", "image/jpeg"… */
  mime: string;
  /** bytes */
  tamanho: number;
  partes: number;
}

export interface Manutencao {
  id: string;
  /** "AAAA-MM-DD" */
  data: string;
  tipo: TipoManut;
  /** número da OM ('' = sem OM) */
  om: string;
  executante: string;
  descricao: string;
  anexos: Anexo[];
  /** operador que lançou ('' = administrador) */
  operadorId: string;
  /** nome de quem lançou (operador ou e-mail do administrador) */
  criadoNome: string;
  criadoPor: string;
  criadoUid: string;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string;
  excluidoEm: string;
  excluidoPor: string;
  excluidoMotivo: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function completarManutencao(id: string, v: unknown): Manutencao | null {
  const m = (v ?? {}) as Partial<Manutencao>;
  if (typeof m.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.data)) return null;
  const anexos = (Array.isArray(m.anexos) ? m.anexos : [])
    .map((a) => a as Partial<Anexo>)
    .filter((a): a is Anexo => typeof a?.id === 'string' && typeof a.nome === 'string' && typeof a.partes === 'number' && a.partes > 0)
    .map((a) => ({ id: a.id, nome: a.nome, mime: str(a.mime, 100) || 'application/octet-stream', tamanho: typeof a.tamanho === 'number' ? a.tamanho : 0, partes: a.partes }));
  return {
    id,
    data: m.data,
    tipo: (TIPOS_MANUT as readonly string[]).includes(m.tipo as string) ? (m.tipo as TipoManut) : 'Outro',
    om: str(m.om, 20),
    executante: str(m.executante, 80),
    descricao: str(m.descricao, DESCRICAO_MAX),
    anexos,
    operadorId: str(m.operadorId, 60),
    criadoNome: str(m.criadoNome, 120),
    criadoPor: str(m.criadoPor, 120),
    criadoUid: str(m.criadoUid, 128),
    criadoEm: str(m.criadoEm, 40),
    atualizadoEm: str(m.atualizadoEm, 40),
    atualizadoPor: str(m.atualizadoPor, 120),
    excluidoEm: str(m.excluidoEm, 40),
    excluidoPor: str(m.excluidoPor, 120),
    excluidoMotivo: str(m.excluidoMotivo, 500),
  };
}

/** mais recentes primeiro (data da manutenção, depois lançamento) */
export const ordenarManutencoes = (l: Manutencao[]) => [...l].sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));

export const fmtTamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const ehImagem = (a: Pick<Anexo, 'mime'>) => a.mime.startsWith('image/');
export const ehPdf = (a: Pick<Anexo, 'mime'>) => a.mime === 'application/pdf';

type Unsub = () => void;

export function ouvirManutencoes(api: FirebaseApi, cb: (l: Manutencao[], pendente: boolean) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.collection(fs, COL_MANUT),
    { includeMetadataChanges: true },
    (snap) => cb(ordenarManutencoes(snap.docs.flatMap((d) => completarManutencao(d.id, d.data()) ?? [])), snap.metadata.hasPendingWrites),
    onErr,
  );
}

/** Arquivo escolhido no aparelho, já preparado para gravar (base64 + metadados). */
export interface ArquivoNovo {
  anexo: Anexo;
  base64: string;
}

const lerBase64 = (f: Blob) =>
  new Promise<string>((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => erro(r.error);
    r.readAsDataURL(f);
  });

/** Fotos são comprimidas (como no checklist); PDF e outros vão como estão, até 10 MB. */
export async function prepararArquivo(f: File): Promise<ArquivoNovo> {
  const imagem = f.type.startsWith('image/');
  let base64: string;
  let mime = f.type || 'application/octet-stream';
  let nome = f.name || 'arquivo';
  if (imagem) {
    const url = await comprimirFoto(f, 1600, 900_000);
    base64 = url.split(',')[1] ?? '';
    mime = 'image/jpeg';
    nome = nome.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg';
  } else {
    if (f.size > MAX_ARQUIVO) throw new Error(`"${nome}" tem ${fmtTamanho(f.size)}: o limite é ${fmtTamanho(MAX_ARQUIVO)} por arquivo.`);
    base64 = await lerBase64(f);
  }
  const tamanho = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  return { anexo: { id: newId(), nome: nome.slice(0, 120), mime, tamanho, partes: Math.max(1, Math.ceil(base64.length / PARTE)) }, base64 };
}

/**
 * Grava o registro e as partes dos arquivos novos. O registro vai no primeiro lote (a regra das
 * partes confere quem lançou o registro). Sem internet, tudo fica na fila do aparelho.
 */
export async function gravarManutencao(api: FirebaseApi, m: Manutencao, novos: ArquivoNovo[]): Promise<void> {
  const { fsMod, fs } = api;
  const { id, ...dados } = m;
  const partes: { doc: string; dados: { anexoId: string; parte: number; dados: string } }[] = [];
  for (const n of novos)
    for (let i = 0; i < n.anexo.partes; i++) partes.push({ doc: `${n.anexo.id}_${i}`, dados: { anexoId: n.anexo.id, parte: i, dados: n.base64.slice(i * PARTE, (i + 1) * PARTE) } });
  const envios: Promise<void>[] = [];
  let b = fsMod.writeBatch(fs);
  b.set(fsMod.doc(fs, COL_MANUT, id), dados);
  let n = 0;
  for (const p of partes) {
    if (n === PARTES_POR_LOTE) {
      envios.push(b.commit());
      b = fsMod.writeBatch(fs);
      n = 0;
    }
    b.set(fsMod.doc(fs, COL_MANUT, id, 'arquivos', p.doc), p.dados);
    n++;
  }
  envios.push(b.commit());
  await Promise.all(envios);
}

/** Junta as partes de um anexo num arquivo (Blob) para abrir ou baixar. */
export async function lerAnexo(api: FirebaseApi, manutId: string, a: Anexo): Promise<Blob> {
  const { fsMod, fs } = api;
  const docs = await Promise.all(Array.from({ length: a.partes }, (_, i) => fsMod.getDoc(fsMod.doc(fs, COL_MANUT, manutId, 'arquivos', `${a.id}_${i}`))));
  const b64 = docs.map((d, i) => {
    const s = d.data()?.dados;
    if (typeof s !== 'string') throw new Error(`Parte ${i + 1} de ${a.partes} do arquivo ainda não chegou à nuvem.`);
    return s;
  });
  const bin = atob(b64.join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: a.mime });
}

/** Administrador exclui (o registro fica guardado, com quem, quando e o motivo). */
export function excluirManutencao(api: FirebaseApi, id: string, por: string, motivo: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.updateDoc(fsMod.doc(fs, COL_MANUT, id), { excluidoEm: new Date().toISOString(), excluidoPor: por, excluidoMotivo: motivo });
}
