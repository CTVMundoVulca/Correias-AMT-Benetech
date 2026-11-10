import type { FirebaseApi } from './firebase';

/**
 * REGISTRO DE ATRASOS nas atividades da escala.
 *   escala_atrasos/{id}               um atraso (início, fim, motivo, descrição)
 *   escala_config/motivos_atraso      { lista: [...] } motivos (Bloqueio, Recurso, Limpeza + os criados)
 * Qualquer pessoa com o link registra (sessão anônima, como no Registro de Emenda).
 * Corrigir/excluir: quem registrou (mesma sessão/aparelho) ou um administrador.
 * Fica separado da escala: registrar atraso não dá acesso a atividades nem alocações.
 */
export const COL_ATRASOS = 'escala_atrasos';
export const DOC_MOTIVOS = 'escala_config/motivos_atraso';
export const MOTIVOS_PADRAO = ['Bloqueio', 'Recurso', 'Limpeza'];
export const MOTIVO_MAX = 40;
export const DESCRICAO_MAX = 500;

export interface Atraso {
  id: string;
  /** semana ISO "AAAA-Www" (para carregar só a semana aberta) */
  semana: string;
  /** dia "AAAA-Www_D" */
  diaId: string;
  atividadeId: string;
  /** nome da atividade quando o atraso foi registrado (continua no resumo se a atividade sair) */
  atividadeNome: string;
  /** "HH:MM" */
  inicio: string;
  /** "HH:MM" ou "" (em andamento) */
  fim: string;
  motivo: string;
  descricao: string;
  criadoUid: string;
  criadoEm: string;
  atualizadoEm: string;
  /** e-mail de quem registrou/alterou, ou "anônimo" */
  por: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const horaValida = (h: string) => HHMM.test(h);

/** Horário atual "HH:MM" (do aparelho). */
export function agoraHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Minutos entre início e fim; virando a meia-noite soma 24 h. null = em andamento/inválido. */
export function duracaoMin(inicio: string, fim: string): number | null {
  if (!horaValida(inicio) || !horaValida(fim)) return null;
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const d = m(fim) - m(inicio);
  return d >= 0 ? d : d + 24 * 60;
}

/** 90 → "1h30"; 45 → "45 min"; 120 → "2h" */
export function fmtDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r} min`;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

export const normMotivo = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, MOTIVO_MAX);
  return t ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : '';
};

/** Totais por motivo (só atrasos com fim), do maior para o menor. */
export function totaisPorMotivo(lista: Atraso[]): { motivo: string; min: number; qtd: number }[] {
  const m = new Map<string, { min: number; qtd: number }>();
  for (const a of lista) {
    const d = duracaoMin(a.inicio, a.fim);
    if (d === null) continue;
    const t = m.get(a.motivo) ?? { min: 0, qtd: 0 };
    m.set(a.motivo, { min: t.min + d, qtd: t.qtd + 1 });
  }
  return [...m.entries()].map(([motivo, t]) => ({ motivo, ...t })).sort((a, b) => b.min - a.min || a.motivo.localeCompare(b.motivo));
}

export const ordenarAtrasos = (l: Atraso[]) => [...l].sort((a, b) => a.diaId.localeCompare(b.diaId) || a.inicio.localeCompare(b.inicio));

type Unsub = () => void;

/** Atrasos de uma semana (todas as atividades). */
export function ouvirAtrasosSemana(api: FirebaseApi, semana: string, cb: (l: Atraso[]) => void, onErr: (e: unknown) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.query(fsMod.collection(fs, COL_ATRASOS), fsMod.where('semana', '==', semana)),
    (snap) => cb(ordenarAtrasos(snap.docs.map((d) => ({ ...(d.data() as Atraso), id: d.id })))),
    onErr,
  );
}

export function salvarAtraso(api: FirebaseApi, a: Atraso): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_ATRASOS, a.id), a);
}

export function excluirAtraso(api: FirebaseApi, id: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.deleteDoc(fsMod.doc(fs, COL_ATRASOS, id));
}

export function ouvirMotivos(api: FirebaseApi, cb: (l: string[]) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, DOC_MOTIVOS),
    (snap) => {
      const l = snap.data()?.lista;
      cb(Array.isArray(l) && l.length ? l.map(String) : MOTIVOS_PADRAO);
    },
    () => cb(MOTIVOS_PADRAO),
  );
}

export function salvarMotivos(api: FirebaseApi, lista: string[]): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, DOC_MOTIVOS), { lista });
}
