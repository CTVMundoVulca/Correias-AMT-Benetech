import { useEffect, useState } from 'react';
import { COL_ATRASOS, duracaoMin, ordenarAtrasos, type Atraso } from '../cloud/atrasos';
import { COL_PUB_DIAS } from '../cloud/publico';
import { addDays, fromIsoDate, locateDay, mondayOf, parseWeekKey, toIsoDate } from '../domain/isoWeek';
import { newId } from '../domain/ids';
import { nomeNaEscala } from '../integracao/progEscala';
import { useProg } from './context';
import { AREA_INTERNA, faixasMob, horasHomemMobilizadas, type Atividade } from './model';

/**
 * Atrasos registrados na Escala (escala_atrasos) vistos pela Programação.
 * A atividade que veio da programação tem, na escala, o id "prog-<id da atividade>":
 * é assim que o atraso chega na OM. Pessoas = quem estava alocado na atividade na escala
 * (se a escala não tiver a atividade, vale o número de pessoas da programação).
 */
export const idEscalaDaAtividade = (a: Pick<Atividade, 'id'>) => `prog-${a.id}`;
export const progIdDoAtraso = (at: Pick<Atraso, 'atividadeId'>) => (at.atividadeId.startsWith('prog-') ? at.atividadeId.slice(5) : '');
export const semanaDe = (iso: string) => locateDay(fromIsoDate(iso)!).weekKey;
export const diaIdDe = (iso: string) => {
  const l = locateDay(fromIsoDate(iso)!);
  return `${l.weekKey}_${l.dayIndex}`;
};

/** Atrasos das semanas entre de e ate ("AAAA-MM-DD") + pessoas alocadas por atividade na escala. */
export interface AtrasosPeriodo {
  atrasos: Atraso[];
  /** "diaId|atividadeId" → pessoas alocadas na escala */
  pessoasEscala: Map<string, number>;
}

export function useAtrasosPeriodo(de: string, ate: string): AtrasosPeriodo | null {
  const { api } = useProg();
  const [atrasos, setAtrasos] = useState<Atraso[] | null>(null);
  const [pessoas, setPessoas] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setAtrasos(null);
    const { fsMod, fs } = api;
    const s0 = semanaDe(de);
    const s1 = semanaDe(ate);
    const un = fsMod.onSnapshot(
      fsMod.query(fsMod.collection(fs, COL_ATRASOS), fsMod.where('semana', '>=', s0), fsMod.where('semana', '<=', s1)),
      (snap) => setAtrasos(ordenarAtrasos(snap.docs.map((d) => ({ ...(d.data() as Atraso), id: d.id })))),
      () => setAtrasos([]),
    );
    let vivo = true;
    fsMod
      .getDocs(fsMod.query(fsMod.collection(fs, COL_PUB_DIAS), fsMod.where(fsMod.documentId(), '>=', `${s0}_0`), fsMod.where(fsMod.documentId(), '<=', `${s1}_6`)))
      .then((snap) => {
        if (!vivo) return;
        const m = new Map<string, number>();
        for (const d of snap.docs) {
          const ats = (d.data()?.activities ?? []) as { id?: string; workerIds?: string[] }[];
          for (const a of Array.isArray(ats) ? ats : []) if (a?.id) m.set(`${d.id}|${a.id}`, Array.isArray(a.workerIds) ? a.workerIds.length : 0);
        }
        setPessoas(m);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      un();
    };
  }, [api, de, ate]);
  return atrasos ? { atrasos, pessoasEscala: pessoas } : null;
}

/** Uma perda de horas: atraso registrado na escala ou cancelamento com a equipe mobilizada. */
export interface Perda {
  id: string;
  origem: 'atraso' | 'cancelamento';
  data: string;
  area: string;
  equipamento: string;
  om: string;
  /** nome da atividade (atraso sem vínculo com a programação) */
  atividade: string;
  motivo: string;
  inicio: string;
  fim: string;
  /** horas paradas (duração) */
  horas: number;
  pessoas: number;
  /** horas × pessoas */
  hh: number;
  /** horários para mostrar ("09:00–10:00, 13:00–14:00"); vazio = início–fim */
  faixas?: string;
  /** a pessoa não está ligada a uma atividade da programação (só na escala) */
  semVinculo: boolean;
  atraso?: Atraso;
}

/** "2026-W47_2" → "2026-11-18" */
export function dataDoDiaId(diaId: string): string {
  const m = /^(\d{4}-W\d{2})_([0-6])$/.exec(diaId);
  if (!m) return '';
  return toIsoDate(addDays(mondayOf(parseWeekKey(m[1])), Number(m[2])));
}

/**
 * Junta atrasos (da escala) e cancelamentos com equipe mobilizada (da programação).
 * `lista` = atividades da programação do período (para achar área, equipamento, OM e pessoas).
 * `dataDe` converte o diaId da escala em data ("AAAA-MM-DD").
 */
export function perdasDoPeriodo(lista: Atividade[], dados: AtrasosPeriodo | null, dataDe: (diaId: string) => string = dataDoDiaId): Perda[] {
  const porId = new Map(lista.map((a) => [a.id, a]));
  const out: Perda[] = [];
  for (const at of dados?.atrasos ?? []) {
    const min = duracaoMin(at.inicio, at.fim);
    if (min === null) continue; // em andamento: entra quando tiver fim
    const a = porId.get(progIdDoAtraso(at));
    const esc = dados?.pessoasEscala.get(`${at.diaId}|${at.atividadeId}`);
    const pessoas = esc && esc > 0 ? esc : (a?.pessoas ?? 0);
    const horas = min / 60;
    out.push({
      id: 'at-' + at.id,
      origem: 'atraso',
      data: a?.data ?? dataDe(at.diaId),
      area: a ? a.area || AREA_INTERNA : '',
      equipamento: a?.equipamento ?? '',
      om: a?.om ?? '',
      atividade: at.atividadeNome,
      motivo: at.motivo + (at.descricao ? ` — ${at.descricao}` : ''),
      inicio: at.inicio,
      fim: at.fim,
      horas,
      pessoas,
      hh: horas * pessoas,
      semVinculo: !a,
      atraso: at,
    });
  }
  for (const a of lista) {
    if (a.classe !== 'cancelada' || !a.mobilizada) continue;
    out.push({
      id: 'mob-' + a.id,
      origem: 'cancelamento',
      data: a.data,
      area: a.area || AREA_INTERNA,
      equipamento: a.equipamento,
      om: a.om,
      atividade: a.descricao,
      motivo: `Cancelada: ${a.motivo || 'sem motivo'}`,
      inicio: a.mobInicio,
      fim: a.mobFim,
      faixas: faixasMob(a),
      horas: a.horasMobilizadas,
      pessoas: a.pessoas,
      hh: horasHomemMobilizadas(a),
      semVinculo: false,
    });
  }
  return out.sort((x, y) => y.data.localeCompare(x.data) || x.inicio.localeCompare(y.inicio));
}

export function somarPerdas(l: Perda[]) {
  const at = l.filter((p) => p.origem === 'atraso');
  const canc = l.filter((p) => p.origem === 'cancelamento');
  const soma = (x: Perda[], f: (p: Perda) => number) => x.reduce((s, p) => s + f(p), 0);
  return {
    hh: soma(l, (p) => p.hh),
    hhAtrasos: soma(at, (p) => p.hh),
    hhCancel: soma(canc, (p) => p.hh),
    /** horas de equipamento parado (duração dos atrasos + tempo à disposição nos cancelamentos) */
    horas: soma(l, (p) => p.horas),
    horasAtrasos: soma(at, (p) => p.horas),
    atrasos: at.length,
    cancelamentos: canc.length,
  };
}

/** Horas paradas por equipamento (ou atividade, sem equipamento), da maior para a menor. */
export function horasPorEquipamento(l: Perda[]): { chave: string; horas: number; hh: number; n: number }[] {
  const m = new Map<string, { chave: string; horas: number; hh: number; n: number }>();
  for (const p of l) {
    const chave = equipamentoDaPerda(p);
    const g = m.get(chave) ?? { chave, horas: 0, hh: 0, n: 0 };
    g.horas += p.horas;
    g.hh += p.hh;
    g.n++;
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.horas - a.horas || a.chave.localeCompare(b.chave, 'pt-BR'));
}

/** Atraso novo lançado pela gestão numa atividade da programação (vai para a escala também). */
export function novoAtrasoDaAtividade(a: Atividade, uid: string, por: string): Atraso {
  const diaId = diaIdDe(a.data);
  const agora = new Date().toISOString();
  return {
    id: newId(),
    semana: diaId.split('_')[0],
    diaId,
    atividadeId: idEscalaDaAtividade(a),
    atividadeNome: nomeNaEscala(a).slice(0, 80),
    inicio: '',
    fim: '',
    motivo: '',
    descricao: '',
    criadoUid: uid,
    criadoEm: agora,
    atualizadoEm: agora,
    por: (por || 'gestão').slice(0, 120),
  };
}

/** Chave do motivo para agrupar: o motivo do atraso ou "Cancelamento: motivo". */
export const motivoDaPerda = (p: Perda) => (p.origem === 'atraso' ? (p.atraso?.motivo ?? p.motivo) : `Cancelamento: ${p.motivo.replace(/^Cancelada: /, '')}`);

/** HH e horas por motivo, do maior HH para o menor. */
export function perdasPorMotivo(l: Perda[]): { chave: string; horas: number; hh: number; n: number; origem: Perda['origem'] }[] {
  const m = new Map<string, { chave: string; horas: number; hh: number; n: number; origem: Perda['origem'] }>();
  for (const p of l) {
    const chave = motivoDaPerda(p);
    const g = m.get(chave) ?? { chave, horas: 0, hh: 0, n: 0, origem: p.origem };
    g.horas += p.horas;
    g.hh += p.hh;
    g.n++;
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.hh - a.hh || a.chave.localeCompare(b.chave, 'pt-BR'));
}

/** chave do equipamento usada em horasPorEquipamento */
export const equipamentoDaPerda = (p: Perda) => (p.equipamento ? `${p.equipamento}${p.area ? ` · ${p.area}` : ''}` : p.atividade || '—');
