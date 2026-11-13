import { AbsenceType, AppState, Day, Worker, emptyDay } from './types';
import { addDays, locateDay, toIsoDate, weekDates } from './isoWeek';
import { feriadoEm } from './feriados';

/** Tipo de ausência usado automaticamente nos feriados. */
export const FOLGA_FERIADO = 'folga';

export function getDay(state: AppState, weekKey: string, dayIndex: number): Day {
  return state.weeks[weekKey]?.days[dayIndex] ?? emptyDay();
}

export function dayHasData(day: Day): boolean {
  return day.activities.length > 0 || day.absences.length > 0;
}

/** Ids alocados no dia (sem repetição). */
export function allocatedIds(day: Day): Set<string> {
  const s = new Set<string>();
  for (const a of day.activities) for (const id of a.workerIds) s.add(id);
  return s;
}

export function absenceOf(day: Day, workerId: string): AbsenceType | undefined {
  return day.absences.find((a) => a.workerId === workerId)?.tipo;
}

/**
 * PENDENTE num dia = (a) ativo, (b) o dia tem pelo menos uma atividade,
 * (c) não está em nenhuma atividade do dia e (d) não tem ausência no dia.
 * Dia sem atividade não gera pendência.
 */
export function pendingWorkers(day: Day, workers: Worker[], feriado: string | null = null): Worker[] {
  // feriado ou fim de semana: quem não está escalado está de folga automaticamente (não é pendência)
  if (day.activities.length === 0 || feriado) return [];
  const alloc = allocatedIds(day);
  const absent = new Set(day.absences.map((a) => a.workerId));
  // apoio de outro contrato: só entra no dia em que é alocado (não gera pendência)
  return sortByName(workers.filter((w) => w.ativo && !w.apoio && !alloc.has(w.id) && !absent.has(w.id)));
}

/** Nome do feriado (nacional ou municipal) no dia da semana, ou null. */
export function feriadoDoDia(state: AppState, weekKey: string, dayIndex: number): string | null {
  return feriadoEm(state.feriados, toIsoDate(weekDates(weekKey)[dayIndex]));
}

export function feriadoNaData(state: AppState, date: Date): string | null {
  return feriadoEm(state.feriados, toIsoDate(date));
}

export const FIM_DE_SEMANA = 'Fim de semana';

/**
 * Motivo da folga automática do dia: nome do feriado, "Fim de semana" (sábado e
 * domingo) ou null (dia normal). Nesses dias quem não está escalado fica de folga.
 */
export function folgaAutoNaData(state: AppState, date: Date): string | null {
  const fer = feriadoNaData(state, date);
  if (fer) return fer;
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6 ? FIM_DE_SEMANA : null;
}

export function folgaAutoDoDia(state: AppState, weekKey: string, dayIndex: number): string | null {
  return folgaAutoNaData(state, weekDates(weekKey)[dayIndex]);
}

/**
 * Folga automática (feriado ou fim de semana — veja folgaAutoNaData): ativos que não estão em nenhuma atividade e não têm
 * outra ausência registrada. Não é gravada: alocar a pessoa ou registrar outra
 * ausência (ex.: atestado) muda o status na hora.
 */
export function folgasDeFeriado(day: Day, workers: Worker[], feriado: string | null): Worker[] {
  if (!feriado) return [];
  const alloc = allocatedIds(day);
  const absent = new Set(day.absences.map((a) => a.workerId));
  return sortByName(workers.filter((w) => w.ativo && !w.apoio && !alloc.has(w.id) && !absent.has(w.id)));
}

export interface DayPending {
  dayIndex: number;
  count: number;
}

/** Pendências por dia da semana (só dias com atividade aparecem). */
export function weekPending(state: AppState, weekKey: string): { days: DayPending[]; total: number; hasActivities: boolean } {
  const days: DayPending[] = [];
  let hasActivities = false;
  for (let i = 0; i < 7; i++) {
    const day = getDay(state, weekKey, i);
    if (!day.activities.length) continue;
    hasActivities = true;
    days.push({ dayIndex: i, count: pendingWorkers(day, state.workers, folgaAutoDoDia(state, weekKey, i)).length });
  }
  return { days, total: days.reduce((s, d) => s + d.count, 0), hasActivities };
}

export function sortByName<T extends { nome: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type AllocationStatus =
  | { kind: 'here' }
  | { kind: 'elsewhere'; activities: string[] }
  | { kind: 'absent'; tipo: AbsenceType }
  | { kind: 'free' };

/** Situação de um colaborador ao abrir a janela de alocação de uma atividade. */
export function allocationStatus(day: Day, activityId: string, workerId: string): AllocationStatus {
  const tipo = absenceOf(day, workerId);
  if (tipo) return { kind: 'absent', tipo };
  const act = day.activities.find((a) => a.id === activityId);
  if (act?.workerIds.includes(workerId)) return { kind: 'here' };
  const others = day.activities.filter((a) => a.id !== activityId && a.workerIds.includes(workerId)).map((a) => a.nome);
  if (others.length) return { kind: 'elsewhere', activities: others };
  return { kind: 'free' };
}

export function statusLabel(st: AllocationStatus): string {
  switch (st.kind) {
    case 'here':
      return '✓';
    case 'elsewhere':
      return 'Outra ativ.';
    case 'absent':
      return 'Ausente';
    case 'free':
      return '';
  }
}

// ---------- Consultas ----------

export interface WorkerDayRecord {
  date: Date;
  activities: string[];
  absence?: AbsenceType;
  /** folga automática de feriado (não registrada) */
  feriado?: string;
}

/** Percorre os dias de um período (inclusive) que existem no estado. */
export function* iterateDays(state: AppState, from: Date, to: Date): Generator<{ date: Date; day: Day }> {
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    const loc = locateDay(d);
    const week = state.weeks[loc.weekKey];
    if (week) yield { date: d, day: week.days[loc.dayIndex] };
  }
}

export function workerHistory(state: AppState, workerId: string, from: Date, to: Date): WorkerDayRecord[] {
  const out: WorkerDayRecord[] = [];
  for (const { date, day } of iterateDays(state, from, to)) {
    const activities = day.activities.filter((a) => a.workerIds.includes(workerId)).map((a) => a.nome);
    const absence = absenceOf(day, workerId);
    if (activities.length || absence) out.push({ date, activities, absence });
    else {
      const fer = folgaAutoNaData(state, date);
      if (fer && state.workers.some((w) => w.id === workerId && w.ativo)) out.push({ date, activities, absence: FOLGA_FERIADO, feriado: fer });
    }
  }
  return out;
}

export interface ActivityRecord {
  date: Date;
  nome: string;
  workerIds: string[];
}

export function activityHistory(state: AppState, query: string, from: Date, to: Date): ActivityRecord[] {
  const q = query.trim().toLocaleUpperCase('pt-BR');
  const out: ActivityRecord[] = [];
  for (const { date, day } of iterateDays(state, from, to)) {
    for (const a of day.activities) {
      if (!q || a.nome.includes(q)) out.push({ date, nome: a.nome, workerIds: a.workerIds });
    }
  }
  return out;
}

export function countBy<T>(items: T[], key: (t: T) => string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) for (const k of key(it)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/** Quantos registros (alocações ou ausências) cada colaborador tem em todo o histórico. */
export function workerUsage(state: AppState, workerId: string): number {
  let n = 0;
  for (const w of Object.values(state.weeks))
    for (const d of w.days) {
      if (d.absences.some((a) => a.workerId === workerId)) n++;
      for (const a of d.activities) if (a.workerIds.includes(workerId)) n++;
    }
  return n;
}


export type WeekStatus = 'vazia' | 'ok' | 'pendente';

/**
 * Situação da semana para o calendário: sem escala (nenhuma atividade — mesmo que
 * já tenha férias/folgas lançadas), completa ou com pendências.
 */
export function weekStatus(state: AppState, weekKey: string): WeekStatus {
  const p = weekPending(state, weekKey);
  if (!p.hasActivities) return 'vazia';
  return p.total > 0 ? 'pendente' : 'ok';
}
