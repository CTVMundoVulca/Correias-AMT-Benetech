import { AbsenceType, AppState, Day, Funcao, emptyWeek } from '../domain/types';
import { cleanName, nameKey } from '../domain/names';

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
  | ({ type: 'absence/set'; workerId: string; tipo: AbsenceType | null } & DayRef);

/** Já existe colaborador com o mesmo nome (sem diferenciar maiúsculas nem acentos)? */
export function isDuplicateName(state: AppState, nome: string, ignoreId?: string): boolean {
  const k = nameKey(nome);
  return state.workers.some((w) => w.id !== ignoreId && nameKey(w.nome) === k);
}

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
      if (!nome || isDuplicateName(state, nome)) return state;
      return { ...state, workers: [...state.workers, { id: action.id, nome, funcao: action.funcao, ativo: true }] };
    }
    case 'worker/update': {
      const nome = cleanName(action.nome);
      if (!nome || isDuplicateName(state, nome, action.id)) return state;
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
  }
}
