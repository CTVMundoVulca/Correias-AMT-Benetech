/**
 * Sincronização Escala ⇄ Programação (roda no aparelho de um administrador com a Escala aberta).
 *
 * Ligação: atividade da escala "prog-<id>" ↔ atividade da programação "<id>" (incluída a partir da
 * programação); atividade criada direto na escala "<x>" ↔ atividade da programação "esc-<x>".
 *
 * Direção: a programação guarda em `escalaNome` o nome da última sincronização. Se só a escala
 * mudou, a programação recebe; se só a programação mudou (ou não há registro), a escala recebe.
 * Mudança de data na programação move a atividade na escala com a equipe (só de hoje em diante).
 * Nada é apagado: cancelamento/exclusão vira aviso dos dois lados.
 */
import type { Action, DayRef } from '../state/reducer';
import type { Activity, Day } from '../domain/types';
import { cleanName } from '../domain/names';
import { atividadeVazia, classificar, maiusculas, mesDe, tipoPelaDescricao, DESCRICAO_MAX, type Atividade } from '../prog/model';

/** A sincronização vale para atividades a partir desta data (o histórico anterior não é mexido). */
export const SYNC_DESDE = '2026-11-16';

export const progIdDaEscala = (activityId: string) => (activityId.startsWith('prog-') ? activityId.slice(5) : 'esc-' + activityId);
export const escalaIdDaProg = (a: Pick<Atividade, 'id'>) => (a.id.startsWith('esc-') ? a.id.slice(4) : 'prog-' + a.id);

/** Nome da atividade na escala: descrição + área (ex.: "TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO"). */
export function nomeNaEscala(a: Pick<Atividade, 'descricao' | 'equipamento' | 'area'>): string {
  const base = a.descricao || a.equipamento || 'ATIVIDADE PROGRAMADA';
  return cleanName(a.area ? `${base} — ${a.area}` : base);
}

/** Descrição da programação a partir do nome editado na escala (tira o " — ÁREA" do fim). */
export function descricaoDoNome(nome: string, area: string): string {
  const fim = area ? ` — ${cleanName(area)}` : '';
  const n = cleanName(nome);
  return maiusculas(fim && n.endsWith(fim) ? n.slice(0, -fim.length) : n, DESCRICAO_MAX);
}

export interface DiaEscala extends DayRef {
  data: string;
  day: Day;
}

export interface AvisoEscala {
  data: string;
  activityId: string;
  texto: string;
}

export interface PlanoSync {
  /** ações para a escala (renomear, mudar de dia) */
  escala: Action[];
  /** atividades da programação a gravar (já completas) */
  prog: Atividade[];
  /** avisos para mostrar nas atividades da escala (nada é apagado) */
  avisos: AvisoEscala[];
}

interface Ocorrencia {
  dia: DiaEscala;
  act: Activity;
}

export function planejar(opts: {
  dias: DiaEscala[];
  progs: Atividade[];
  /** meses (AAAA-MM) da programação já carregados: fora deles nada é decidido */
  meses: Set<string>;
  hoje: string;
  agora: Date;
  feriados: Record<string, string>;
  por: string;
  /** dia da escala (semana + índice) de uma data, mesmo de semana ainda sem dados */
  refDe: (data: string) => DayRef;
  desde?: string;
}): PlanoSync {
  const { dias, progs, meses, hoje, agora, feriados, por, refDe } = opts;
  const desde = opts.desde ?? SYNC_DESDE;
  const plano: PlanoSync = { escala: [], prog: [], avisos: [] };
  const mudancas = new Map<string, Atividade>();
  const mudar = (a: Atividade, p: Partial<Atividade>) => {
    const atual = mudancas.get(a.id) ?? a;
    const novo = { ...atual, ...p };
    if (Object.keys(p).some((k) => (novo as unknown as Record<string, unknown>)[k] !== (a as unknown as Record<string, unknown>)[k])) mudancas.set(a.id, novo);
  };

  const progPorId = new Map(progs.map((a) => [a.id, a]));
  const diaPorData = new Map(dias.map((d) => [d.data, d]));
  const ocorr = new Map<string, Ocorrencia[]>();
  for (const dia of dias) {
    if (dia.data < desde) continue;
    for (const act of dia.day.activities) {
      const pid = progIdDaEscala(act.id);
      ocorr.set(pid, [...(ocorr.get(pid) ?? []), { dia, act }]);
    }
  }

  // 1) escala → programação: atividades criadas direto na escala entram para revisão
  for (const [pid, lista] of ocorr) {
    if (progPorId.has(pid)) continue;
    for (const { dia, act } of lista) {
      if (!meses.has(mesDe(dia.data))) continue;
      if (act.id.startsWith('prog-')) {
        plano.avisos.push({ data: dia.data, activityId: act.id, texto: 'Não encontrada na programação (foi excluída?)' });
        continue;
      }
      if (mudancas.has(pid)) continue;
      const base = atividadeVazia(pid, dia.data, por);
      const descricao = maiusculas(act.nome, DESCRICAO_MAX);
      mudancas.set(pid, {
        ...base,
        descricao,
        tipo: tipoPelaDescricao(descricao),
        pessoas: act.workerIds.length,
        origem: 'escala',
        revisarEscala: true,
        escalaNome: cleanName(act.nome),
        comunicadoEm: agora.toISOString(),
        classe: classificar(dia.data, agora, feriados)?.classe ?? '',
      });
    }
  }

  // 2) programação ⇄ escala para as atividades que já existem dos dois lados
  for (const a of progs) {
    if (a.data < desde) continue;
    const lista = ocorr.get(a.id) ?? [];
    const eid = escalaIdDaProg(a);
    if (a.classe === 'cancelada') {
      for (const o of lista) plano.avisos.push({ data: o.dia.data, activityId: o.act.id, texto: 'Cancelada na programação' });
      continue;
    }
    let atual = lista.find((o) => o.dia.data === a.data);
    if (!atual) {
      const futura = lista.find((o) => o.dia.data >= hoje && o.dia.data !== a.data);
      const existente = diaPorData.get(a.data);
      const destino: DiaEscala = existente ?? { ...refDe(a.data), data: a.data, day: { activities: [], absences: [] } };
      if (futura && a.data >= hoje) {
        // a programação mudou a data: leva a atividade (com a equipe) para o novo dia
        plano.escala.push({ type: 'activity/remove', weekKey: futura.dia.weekKey, dayIndex: futura.dia.dayIndex, activityId: futura.act.id });
        plano.escala.push({ type: 'activity/put', weekKey: destino.weekKey, dayIndex: destino.dayIndex, id: eid, nome: futura.act.nome, workerIds: futura.act.workerIds });
        atual = { dia: destino, act: { ...futura.act, id: eid } };
      } else if (lista.some((o) => o.dia.data >= hoje)) {
        for (const o of lista.filter((x) => x.dia.data >= hoje))
          plano.avisos.push({ data: o.dia.data, activityId: o.act.id, texto: `A programação mudou a data para ${a.data.split('-').reverse().join('/')}` });
        continue;
      } else {
        // estava na escala e saiu de lá: só avisa a programação
        if (a.escalaNome && existente && !a.foraDaEscala) mudar(a, { foraDaEscala: true });
        continue;
      }
    }
    const nomeEsc = cleanName(atual.act.nome);
    const nomeProg = nomeNaEscala(a);
    const base = a.escalaNome;
    const extra: Partial<Atividade> = { foraDaEscala: false };
    if (a.origem === 'escala') extra.pessoas = atual.act.workerIds.length;
    if (nomeEsc === nomeProg) {
      mudar(a, { ...extra, escalaNome: nomeEsc });
    } else if (base && base === nomeProg && base !== nomeEsc) {
      // só a escala mudou: a programação recebe a nova descrição
      const descricao = descricaoDoNome(nomeEsc, a.area);
      const final = nomeNaEscala({ ...a, descricao });
      mudar(a, { ...extra, descricao, escalaNome: final });
      if (final !== nomeEsc) plano.escala.push({ type: 'activity/rename', weekKey: atual.dia.weekKey, dayIndex: atual.dia.dayIndex, activityId: atual.act.id, nome: final });
    } else {
      // a programação mudou (ou não há registro anterior): a escala recebe
      plano.escala.push({ type: 'activity/rename', weekKey: atual.dia.weekKey, dayIndex: atual.dia.dayIndex, activityId: atual.act.id, nome: nomeProg });
      mudar(a, { ...extra, escalaNome: nomeProg });
    }
  }
  plano.prog = [...mudancas.values()];
  return plano;
}
