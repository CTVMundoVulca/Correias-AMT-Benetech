/**
 * KPIs da programação da vulcanização (cálculos puros, testáveis).
 * Referências de mercado (SMRP / literatura de planejamento e programação de manutenção):
 * aderência à programação 80–90%+; trabalho programado ≥ 80% (80/20); backlog pronto 2–4 semanas.
 * As metas da tela são de referência e devem ser calibradas com o histórico do contrato.
 */
import type { Atraso } from '../cloud/atrasos';
import { duracaoMin } from '../cloud/atrasos';
import { AREA_INTERNA, diasEntre, diaUtil, type Atividade, type OmInfo, type Solicitacao } from './model';

const media = (l: number[]) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
const contar = (l: string[]) => {
  const m = new Map<string, number>();
  for (const k of l) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([chave, n]) => ({ chave, n })).sort((a, b) => b.n - a.n || a.chave.localeCompare(b.chave, 'pt-BR'));
};

// ------------------------------------------------------------------ 1. aderência à programação

export interface Aderencia {
  /** atividades programadas até hoje (sem as canceladas) */
  previstas: number;
  executadas: number;
  naoExecutadas: number;
  reprogramadas: number;
  semApontamento: number;
  /** executadas ÷ apontadas (null = nada apontado) */
  indice: number | null;
  /** apontadas ÷ previstas: quanto da programação foi conferida */
  cobertura: number | null;
  /** % de atividades que mudaram de data ao menos uma vez */
  instabilidade: number | null;
  motivosNaoExecucao: { chave: string; n: number }[];
}

export function aderencia(lista: Atividade[], hoje: string): Aderencia {
  const prev = lista.filter((a) => a.classe !== 'cancelada' && a.data <= hoje);
  const ex = prev.filter((a) => a.execucao === 'executada').length;
  const ne = prev.filter((a) => a.execucao === 'nao_executada').length;
  const re = prev.filter((a) => a.execucao === 'reprogramada').length;
  const ap = ex + ne + re;
  const todas = lista.filter((a) => a.classe !== 'cancelada');
  return {
    previstas: prev.length,
    executadas: ex,
    naoExecutadas: ne,
    reprogramadas: re,
    semApontamento: prev.length - ap,
    indice: ap ? ex / ap : null,
    cobertura: prev.length ? ap / prev.length : null,
    instabilidade: todas.length ? todas.filter((a) => a.reprogramacoes > 0 || a.execucao === 'reprogramada').length / todas.length : null,
    motivosNaoExecucao: contar(prev.filter((a) => a.execucao === 'nao_executada' || a.execucao === 'reprogramada').map((a) => a.execMotivo || 'Sem motivo')),
  };
}

export const motivosCancelamento = (lista: Atividade[]) => contar(lista.filter((a) => a.classe === 'cancelada').map((a) => a.motivo || 'Sem motivo'));

/** Antecedência média (horas) entre a comunicação e 07:15 do dia, por área. */
export function antecedenciaPorArea(lista: Atividade[]): { area: string; horas: number; n: number }[] {
  const m = new Map<string, number[]>();
  for (const a of lista) {
    if (!a.comunicadoEm || a.classe === 'cancelada') continue;
    const [y, mo, d] = a.data.split('-').map(Number);
    const h = (new Date(y, mo - 1, d, 7, 15).getTime() - new Date(a.comunicadoEm).getTime()) / 3_600_000;
    if (!Number.isFinite(h)) continue;
    const k = a.area || AREA_INTERNA;
    m.set(k, [...(m.get(k) ?? []), h]);
  }
  return [...m.entries()].map(([area, l]) => ({ area, horas: media(l)!, n: l.length })).sort((a, b) => a.horas - b.horas);
}

// ------------------------------------------------------------------ 2. demandas, OMs e backlog

export interface Demandas {
  total: number;
  respondidas: number;
  /** horas médias do pedido até programar ou recusar */
  respostaHoras: number | null;
  /** programadas até a data desejada ÷ programadas */
  noPrazo: number | null;
  recusadas: number;
  abertas: number;
}

export function demandas(l: Solicitacao[]): Demandas {
  const resp = l.filter((s) => (s.status === 'programada' || s.status === 'recusada') && s.atualizadoEm && s.criadoEm);
  const prog = l.filter((s) => s.status === 'programada' && s.dataProgramada);
  return {
    total: l.length,
    respondidas: resp.length,
    respostaHoras: media(resp.map((s) => (new Date(s.atualizadoEm).getTime() - new Date(s.criadoEm).getTime()) / 3_600_000).filter((h) => h >= 0)),
    noPrazo: prog.length ? prog.filter((s) => s.dataProgramada <= s.dataDesejada).length / prog.length : null,
    recusadas: l.filter((s) => s.status === 'recusada').length,
    abertas: l.filter((s) => s.status === 'aberta').length,
  };
}

/**
 * Backlog em semanas: pessoas×dia ainda a executar (programado a partir de hoje + pedidos em
 * aberto com estimativa) ÷ capacidade semanal (efetivo ativo × 5 dias úteis).
 */
export function backlogSemanas(lista: Atividade[], abertas: Solicitacao[], efetivo: number, hoje: string) {
  const programado = lista.filter((a) => a.classe !== 'cancelada' && a.data >= hoje && a.execucao !== 'executada').reduce((s, a) => s + a.pessoas, 0);
  const pedidos = abertas.reduce((s, x) => s + x.estimativa, 0);
  const semEstimativa = abertas.filter((x) => !x.estimativa).length;
  const cap = efetivo * 5;
  return { programado, pedidos, semEstimativa, capacidade: cap, semanas: cap ? (programado + pedidos) / cap : null };
}

/** OMs pendentes por idade (dias desde a última programação) e tempos de ciclo. */
export function omsIdadeCiclo(oms: OmInfo[], hoje: string) {
  const pend = oms.filter((o) => !o.cancelada && (o.situacao === 'aberta' || o.situacao === 'retornada'));
  const faixa = { ate7: 0, ate30: 0, mais30: 0 };
  for (const o of pend) {
    const d = diasEntre(o.ultimaData, hoje);
    if (d <= 7) faixa.ate7++;
    else if (d <= 30) faixa.ate30++;
    else faixa.mais30++;
  }
  const dia = (iso: string) => iso.slice(0, 10);
  const retorno = oms.filter((o) => o.retornoEm && o.ultimaData).map((o) => diasEntre(o.ultimaData, dia(o.retornoEm)));
  const baixa = oms.filter((o) => o.baixaEm && o.retornoEm).map((o) => diasEntre(dia(o.retornoEm), dia(o.baixaEm)));
  return { pendentes: pend.length, faixa, diasAteRetorno: media(retorno.filter((x) => x >= 0)), diasAteBaixa: media(baixa.filter((x) => x >= 0)) };
}

export const percentSemOm = (lista: Atividade[]) => {
  const l = lista.filter((a) => a.classe !== 'cancelada' && a.area);
  return l.length ? l.filter((a) => !a.om).length / l.length : null;
};

// ------------------------------------------------------------------ 3. confiabilidade por TAG

/** "L-21", "L 21" e "l21" são a mesma correia */
const normTag = (t: string) => t.toUpperCase().replace(/[\s\-–—_.]+/g, '');
/** Intervenções corretivas na correia. Troca de correia é serviço planejado (vários dias), não conta como falha. */
const TIPOS_FALHA = new Set(['Emenda / intercalação', 'Reparo']);
/** Intervenções até 7 dias uma da outra (ou mesma OM) são o mesmo serviço. */
const MESMO_SERVICO_DIAS = 7;

/**
 * Reincidência: o mesmo equipamento voltou a ter emenda ou reparo dentro de `janela` dias.
 * Atividades do mesmo serviço (mesma OM, ou até 7 dias uma da outra) contam como um só evento.
 */
export function reincidencias(lista: Atividade[], janela: number) {
  const porTag = new Map<string, Atividade[]>();
  const nomeTag = new Map<string, string>();
  for (const a of lista) {
    if (a.classe === 'cancelada' || !a.equipamento || !TIPOS_FALHA.has(a.tipo)) continue;
    const k = `${normTag(a.equipamento)}|${a.area}`;
    porTag.set(k, [...(porTag.get(k) ?? []), a]);
    if (!nomeTag.has(k)) nomeTag.set(k, a.equipamento.toUpperCase());
  }
  const out: { tag: string; area: string; eventos: number; reincidencias: number; menorIntervalo: number }[] = [];
  for (const [k, l] of porTag) {
    l.sort((a, b) => a.data.localeCompare(b.data));
    const eventos: Atividade[] = [];
    for (const a of l) {
      const ult = eventos[eventos.length - 1];
      if (ult && ((a.om && a.om === ult.om) || diasEntre(ult.data, a.data) <= MESMO_SERVICO_DIAS)) {
        eventos[eventos.length - 1] = a; // continua o mesmo serviço: guarda o último dia
        continue;
      }
      eventos.push(a);
    }
    let rein = 0;
    let menor = Infinity;
    for (let i = 1; i < eventos.length; i++) {
      const d = diasEntre(eventos[i - 1].data, eventos[i].data);
      menor = Math.min(menor, d);
      if (d <= janela) rein++;
    }
    if (rein) {
      const area = k.split('|')[1];
      out.push({ tag: nomeTag.get(k) ?? k, area, eventos: eventos.length, reincidencias: rein, menorIntervalo: menor });
    }
  }
  return out.sort((a, b) => b.reincidencias - a.reincidencias || a.menorIntervalo - b.menorIntervalo);
}

/** Vida da emenda por TAG (Registro de Emenda): dias entre emendas consecutivas da mesma correia. */
export function vidaEmendas(emendas: { tag: string; data: string }[]) {
  const porTag = new Map<string, string[]>();
  const nomes = new Map<string, string>();
  for (const e of emendas) {
    if (!e.tag || !/^\d{4}-\d{2}-\d{2}$/.test(e.data)) continue;
    const k = normTag(e.tag);
    porTag.set(k, [...(porTag.get(k) ?? []), e.data]);
    if (!nomes.has(k)) nomes.set(k, e.tag.toUpperCase());
  }
  const out: { tag: string; emendas: number; intervalos: number; mediaDias: number; menorDias: number }[] = [];
  for (const [tag, datas] of porTag) {
    const d = [...new Set(datas)].sort();
    const ints: number[] = [];
    for (let i = 1; i < d.length; i++) {
      const x = diasEntre(d[i - 1], d[i]);
      if (x > 3) ints.push(x); // emendas do mesmo serviço (dias seguidos) não contam como "vida"
    }
    if (ints.length) out.push({ tag: nomes.get(tag) ?? tag, emendas: datas.length, intervalos: ints.length, mediaDias: media(ints)!, menorDias: Math.min(...ints) });
  }
  return out.sort((a, b) => a.mediaDias - b.mediaDias);
}

// ------------------------------------------------------------------ 4. efetivo e esperas

export interface DiaEscala {
  data: string;
  /** pessoas DO CONTRATO ausentes registradas no dia */
  ausentes: number;
  /** pessoas de apoio (outros contratos) alocadas no dia */
  apoio?: number;
}

/**
 * Ocupação = pessoas×dia programadas ÷ pessoas×dia disponíveis (efetivo ativo × dias úteis −
 * ausências). Absenteísmo = ausências ÷ (efetivo × dias úteis).
 */
export function ocupacaoEfetivo(lista: Atividade[], efetivo: number, dias: string[], escala: DiaEscala[], feriados: Record<string, string>) {
  const uteis = dias.filter((d) => diaUtil(d, feriados));
  const aus = escala.filter((d) => uteis.includes(d.data)).reduce((s, d) => s + d.ausentes, 0);
  const bruto = efetivo * uteis.length;
  const disponivel = bruto - aus;
  const programado = lista.filter((a) => a.classe !== 'cancelada' && uteis.includes(a.data)).reduce((s, a) => s + a.pessoas, 0);
  const comApoio = escala.filter((d) => (d.apoio ?? 0) > 0);
  return {
    apoioPessoasDia: comApoio.reduce((s, d) => s + (d.apoio ?? 0), 0),
    diasComApoio: comApoio.length,
    diasUteis: uteis.length,
    disponivel,
    programado,
    ocupacao: disponivel > 0 ? programado / disponivel : null,
    absenteismo: bruto > 0 ? aus / bruto : null,
    diasComEscala: escala.filter((d) => uteis.includes(d.data)).length,
  };
}

/** Horas perdidas com atrasos (registrados na escala), por motivo e por atividade. */
export function esperas(atrasos: Atraso[]) {
  const fechados = atrasos.map((a) => ({ a, min: duracaoMin(a.inicio, a.fim) })).filter((x): x is { a: Atraso; min: number } => x.min !== null);
  const soma = (f: (a: Atraso) => string) => {
    const m = new Map<string, number>();
    for (const { a, min } of fechados) m.set(f(a), (m.get(f(a)) ?? 0) + min);
    return [...m.entries()].map(([chave, min]) => ({ chave, horas: min / 60 })).sort((a, b) => b.horas - a.horas);
  };
  return {
    registros: atrasos.length,
    horas: fechados.reduce((s, x) => s + x.min, 0) / 60,
    porMotivo: soma((a) => a.motivo),
    porAtividade: soma((a) => a.atividadeNome || '—').slice(0, 8),
  };
}

// ------------------------------------------------------------------ carga × capacidade (próximos dias)

export interface CargaDia {
  data: string;
  /** pessoas já programadas (sem canceladas) */
  programado: number;
  /** efetivo ativo DO CONTRATO − ausências do contrato lançadas na escala */
  capacidade: number;
  /** pessoas de apoio de outros contratos já escaladas no dia (somam à capacidade do dia) */
  apoio: number;
  livres: number;
  /** programado ÷ capacidade (null sem capacidade) */
  ocupacao: number | null;
  nivel: 'folga' | 'limite' | 'lotado';
  /** a escala do dia ainda não tem ausências lançadas (capacidade = efetivo inteiro) */
  semEscala: boolean;
}

/** Próximos `n` dias úteis a partir de `hoje` (inclui hoje se for útil). */
export function proximosDiasUteis(hoje: string, n: number, feriados: Record<string, string>): string[] {
  const out: string[] = [];
  let [y, m, d] = hoje.split('-').map(Number);
  for (let i = 0; out.length < n && i < 60; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const iso = dt.toISOString().slice(0, 10);
    if (diaUtil(iso, feriados)) out.push(iso);
  }
  return out;
}

/** Limite (85%) a partir do qual o dia é tratado como "perto do limite". */
export const LIMITE_OCUPACAO = 0.85;

export function cargaCapacidade(
  dias: string[],
  lista: Atividade[],
  efetivo: number,
  ausPorDia: Map<string, number>,
  apoioPorDia: Map<string, number> = new Map(),
): CargaDia[] {
  return dias.map((data) => {
    const programado = lista.filter((a) => a.data === data && a.classe !== 'cancelada').reduce((s, a) => s + a.pessoas, 0);
    const aus = ausPorDia.get(data);
    const apoio = apoioPorDia.get(data) ?? 0;
    const capacidade = Math.max(0, efetivo - (aus ?? 0));
    const total = capacidade + apoio;
    const ocupacao = total ? programado / total : null;
    return {
      data,
      programado,
      capacidade,
      apoio,
      livres: Math.max(0, total - programado),
      ocupacao,
      nivel: ocupacao === null || ocupacao > 1 ? 'lotado' : ocupacao >= LIMITE_OCUPACAO ? 'limite' : 'folga',
      semEscala: aus === undefined,
    };
  });
}
