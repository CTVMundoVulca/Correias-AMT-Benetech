import { AbsenceType, AppState, Day, Funcao, emptyWeek } from '../domain/types';
import { cleanName } from '../domain/names';
import { getDay } from '../domain/schedule';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DayRef {
  weekKey: string;
  dayIndex: number;
}

export type Action =
  | { type: 'state/replace'; state: AppState }
  | { type: 'worker/add'; id: string; nome: string; funcao: Funcao }
  | { type: 'worker/update'; id: string; nome: string; funcao: Funcao }
  | { type: 'worker/setActive'; id: string; ativo: boolean }
  | { type: 'worker/remove'; id: string }
  | ({ type: 'activity/add'; id: string; nome: string } & DayRef)
  | ({ type: 'activity/rename'; activityId: string; nome: string } & DayRef)
  | ({ type: 'activity/remove'; activityId: string } & DayRef)
  | ({ type: 'activity/toggleWorker'; activityId: string; workerId: string } & DayRef)
  | ({ type: 'absence/set'; workerId: string; tipo: AbsenceType | null } & DayRef)
  | ({ type: 'day/copy'; from: DayRef; withAbsences: boolean } & DayRef)
  | ({ type: 'day/clear' } & DayRef);

/** Aplica `fn` a uma cópia do dia, criando a semana se necessário. */
function updateDay(state: AppState, ref: DayRef, fn: (d: Day) => Day): AppState {
  const week = state.weeks[ref.weekKey] ?? emptyWeek(ref.weekKey);
  const days = week.days.map((d, i) => (i === ref.dayIndex ? fn(d) : d));
  return { ...state, weeks: { ...state.weeks, [ref.weekKey]: { ...week, days } } };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'state/replace':
      return action.state;

    case 'worker/add': {
      const nome = cleanName(action.nome);
      if (!nome) return state;
      return { ...state, workers: [...state.workers, { id: action.id, nome, funcao: action.funcao, ativo: true }] };
    }
    case 'worker/update': {
      const nome = cleanName(action.nome);
      if (!nome) return state;
      return {
        ...state,
        workers: state.workers.map((w) => (w.id === action.id ? { ...w, nome, funcao: action.funcao } : w)),
      };
    }
    case 'worker/setActive':
      return { ...state, workers: state.workers.map((w) => (w.id === action.id ? { ...w, ativo: action.ativo } : w)) };
    case 'worker/remove': {
      // remove também de todas as escalas para não deixar ids órfãos
      const weeks: AppState['weeks'] = {};
      for (const [k, wk] of Object.entries(state.weeks)) {
        weeks[k] = {
          ...wk,
          days: wk.days.map((d) => ({
            activities: d.activities.map((a) => ({ ...a, workerIds: a.workerIds.filter((id) => id !== action.id) })),
            absences: d.absences.filter((a) => a.workerId !== action.id),
          })),
        };
      }
      return { ...state, workers: state.workers.filter((w) => w.id !== action.id), weeks };
    }

    case 'activity/add': {
      const nome = cleanName(action.nome);
      if (!nome) return state;
      return updateDay(state, action, (d) => ({
        ...d,
        activities: [...d.activities, { id: action.id, nome, workerIds: [] }],
      }));
    }
    case 'activity/rename': {
      const nome = cleanName(action.nome);
      if (!nome) return state;
      return updateDay(state, action, (d) => ({
        ...d,
        activities: d.activities.map((a) => (a.id === action.activityId ? { ...a, nome } : a)),
      }));
    }
    case 'activity/remove':
      return updateDay(state, action, (d) => ({
        ...d,
        activities: d.activities.filter((a) => a.id !== action.activityId),
      }));
    case 'activity/toggleWorker':
      return updateDay(state, action, (d) => {
        // ausente não pode ser alocado: a ausência precisa ser retirada antes
        if (d.absences.some((a) => a.workerId === action.workerId)) return d;
        return {
          ...d,
          activities: d.activities.map((a) => {
            if (a.id !== action.activityId) return a;
            const has = a.workerIds.includes(action.workerId);
            return {
              ...a,
              workerIds: has ? a.workerIds.filter((id) => id !== action.workerId) : [...a.workerIds, action.workerId],
            };
          }),
        };
      });

    case 'absence/set':
      return updateDay(state, action, (d) => {
        const absences = d.absences.filter((a) => a.workerId !== action.workerId);
        if (!action.tipo) return { ...d, absences };
        // registrar ausência tira o colaborador das atividades do dia
        return {
          activities: d.activities.map((a) => ({ ...a, workerIds: a.workerIds.filter((id) => id !== action.workerId) })),
          absences: [...absences, { workerId: action.workerId, tipo: action.tipo }],
        };
      });

    case 'day/copy': {
      const src = getDay(state, action.from.weekKey, action.from.dayIndex);
      return updateDay(state, action, (d) => {
        const absences = [...d.absences];
        if (action.withAbsences)
          for (const a of src.absences) if (!absences.some((x) => x.workerId === a.workerId)) absences.push(a);
        const absent = new Set(absences.map((a) => a.workerId));
        const copied = src.activities.map((a) => ({
          id: newId(),
          nome: a.nome,
          workerIds: a.workerIds.filter((id) => !absent.has(id)),
        }));
        return { activities: [...d.activities, ...copied], absences };
      });
    }
    case 'day/clear':
      return updateDay(state, action, () => ({ activities: [], absences: [] }));
  }
}
