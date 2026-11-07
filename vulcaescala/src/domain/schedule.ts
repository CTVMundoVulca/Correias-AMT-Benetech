import { ABSENCE_LABELS, AbsenceType, AppState, Day, Worker, emptyDay } from './types';
import { addDays, locateDay, weekDates } from './isoWeek';

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
 * Pendentes = efetivo ATIVO que não está em nenhuma atividade nem tem ausência
 * registrada no dia. É a lista de "quem eu esqueci".
 */
export function pendingWorkers(day: Day, workers: Worker[]): Worker[] {
  const alloc = allocatedIds(day);
  const absent = new Set(day.absences.map((a) => a.workerId));
  return sortByName(workers.filter((w) => w.ativo && !alloc.has(w.id) && !absent.has(w.id)));
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
      return `em ${st.activities.join(', ')}`;
    case 'absent':
      return ABSENCE_LABELS[st.tipo].toUpperCase();
    case 'free':
      return '';
  }
}

/** Dia mais recente com dados antes de (weekKey, dayIndex), olhando até `maxBack` dias. */
export function previousDayWithData(
  state: AppState,
  weekKey: string,
  dayIndex: number,
  maxBack = 21,
): { weekKey: string; dayIndex: number; date: Date } | null {
  const start = weekDates(weekKey)[dayIndex];
  for (let i = 1; i <= maxBack; i++) {
    const date = addDays(start, -i);
    const loc = locateDay(date);
    if (dayHasData(getDay(state, loc.weekKey, loc.dayIndex))) return { ...loc, date };
  }
  return null;
}

// ---------- Consultas ----------

export interface WorkerDayRecord {
  date: Date;
  activities: string[];
  absence?: AbsenceType;
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

