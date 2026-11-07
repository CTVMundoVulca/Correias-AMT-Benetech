import { AbsenceType, AppState, Worker } from './types';
import { absenceOf, getDay, sortByName } from './schedule';

export interface WeekKpis {
  activities: number;
  allocations: number;
  absences: number;
  activeWorkers: number;
}

export type GridCell = { kind: 'on' } | { kind: 'abs'; tipo: AbsenceType } | { kind: 'none' };

export interface GridRow {
  worker: Worker;
  cells: GridCell[]; // 7, seg..dom
  daysAllocated: number;
}

export interface ActivityRow {
  dayIndex: number;
  nome: string;
  workerNames: string[];
}

export function weekKpis(state: AppState, weekKey: string): WeekKpis {
  let activities = 0;
  let allocations = 0;
  let absences = 0;
  for (let i = 0; i < 7; i++) {
    const d = getDay(state, weekKey, i);
    activities += d.activities.length;
    allocations += d.activities.reduce((s, a) => s + a.workerIds.length, 0);
    absences += d.absences.length;
  }
  return { activities, allocations, absences, activeWorkers: state.workers.filter((w) => w.ativo).length };
}

/**
 * Tabela colaborador × dia. Entram todos os ativos e os inativos que tenham
 * algum registro na semana (para não sumir histórico).
 */
export function workerGrid(state: AppState, weekKey: string): GridRow[] {
  const days = Array.from({ length: 7 }, (_, i) => getDay(state, weekKey, i));
  const rows: GridRow[] = [];
  for (const worker of sortByName(state.workers)) {
    const cells: GridCell[] = days.map((d) => {
      if (d.activities.some((a) => a.workerIds.includes(worker.id))) return { kind: 'on' };
      const tipo = absenceOf(d, worker.id);
      return tipo ? { kind: 'abs', tipo } : { kind: 'none' };
    });
    if (!worker.ativo && cells.every((c) => c.kind === 'none')) continue;
    rows.push({ worker, cells, daysAllocated: cells.filter((c) => c.kind === 'on').length });
  }
  return rows;
}

export function activityRows(state: AppState, weekKey: string): ActivityRow[] {
  const byId = new Map(state.workers.map((w) => [w.id, w.nome]));
  const rows: ActivityRow[] = [];
  for (let i = 0; i < 7; i++)
    for (const a of getDay(state, weekKey, i).activities)
      rows.push({
        dayIndex: i,
        nome: a.nome,
        workerNames: a.workerIds.map((id) => byId.get(id) ?? '?').sort((x, y) => x.localeCompare(y, 'pt-BR')),
      });
  return rows;
}
