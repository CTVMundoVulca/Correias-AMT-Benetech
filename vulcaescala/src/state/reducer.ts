import { AbsenceType, AppState, Day, Funcao, Worker, cleanFuncao, cleanMatricula, emptyWeek } from '../domain/types';
import { cleanName, nameKey } from '../domain/names';

export interface DayRef {
  weekKey: string;
  dayIndex: number;
}

export type Action =
  | { type: 'state/replace'; state: AppState }
  | { type: 'worker/add'; id: string; nome: string; funcao: Funcao; matricula?: string }
  | { type: 'worker/update'; id: string; nome: string; funcao: Funcao; matricula?: string }
  | { type: 'worker/setActive'; id: string; ativo: boolean }
  | { type: 'worker/remove'; id: string }
  | { type: 'funcao/add'; nome: string }
  | { type: 'funcao/rename'; de: string; para: string }
  | { type: 'funcao/remove'; nome: string }
  | ({ type: 'activity/add'; id: string; nome: string } & DayRef)
  | ({ type: 'activity/rename'; activityId: string; nome: string } & DayRef)
  | ({ type: 'activity/remove'; activityId: string } & DayRef)
  | ({ type: 'activity/setWorker'; activityId: string; workerId: string; allocated: boolean } & DayRef)
  | ({ type: 'absence/set'; workerId: string; tipo: AbsenceType | null } & DayRef);

/** Já existe colaborador com o mesmo nome (sem diferenciar maiúsculas nem acentos)? */
/** Grava a matrícula só quando preenchida (campo opcional). */
export function withMatricula(w: Worker, matricula: string | undefined): Worker {
  const { matricula: _old, ...rest } = w;
  void _old;
  const m = cleanMatricula(matricula);
  return m ? { ...rest, matricula: m } : rest;
}

/** Função já existe na lista (sem diferenciar maiúsculas nem acentos)? */
export function hasFuncao(state: AppState, nome: string, ignore?: string): boolean {
  const k = nameKey(nome);
  return state.funcoes.some((f) => f !== ignore && nameKey(f) === k);
}

export function workersWithFuncao(state: AppState, nome: string): number {
  return state.workers.filter((w) => w.funcao === nome).length;
}

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
      if (!nome || isDuplicateName(state, nome) || state.workers.some((w) => w.id === action.id)) return state;
      return { ...state, workers: [...state.workers, withMatricula({ id: action.id, nome, funcao: action.funcao, ativo: true }, action.matricula)] };
    }
    case 'worker/update': {
      const nome = cleanName(action.nome);
      if (!nome || isDuplicateName(state, nome, action.id)) return state;
      return {
        ...state,
        workers: state.workers.map((w) =>
          w.id === action.id ? withMatricula({ ...w, nome, funcao: action.funcao }, action.matricula ?? w.matricula) : w,
        ),
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

    case 'funcao/add': {
      const nome = cleanFuncao(action.nome);
      if (!nome || hasFuncao(state, nome)) return state;
      return { ...state, funcoes: [...state.funcoes, nome] };
    }
    case 'funcao/rename': {
      const para = cleanFuncao(action.para);
      if (!para || !state.funcoes.includes(action.de) || hasFuncao(state, para, action.de)) return state;
      // renomear atualiza todos os colaboradores que têm a função
      return {
        ...state,
        funcoes: state.funcoes.map((f) => (f === action.de ? para : f)),
        workers: state.workers.map((w) => (w.funcao === action.de ? { ...w, funcao: para } : w)),
      };
    }
    case 'funcao/remove':
      // só remove se ninguém usa e se não for a última
      if (workersWithFuncao(state, action.nome) > 0 || state.funcoes.length <= 1) return state;
      return { ...state, funcoes: state.funcoes.filter((f) => f !== action.nome) };

    case 'activity/add': {
      const nome = cleanName(action.nome);
      if (!nome) return state;
      return updateDay(state, action, (d) =>
        d.activities.some((a) => a.id === action.id)
          ? d
          : { ...d, activities: [...d.activities, { id: action.id, nome, workerIds: [] }] },
      );
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
    case 'activity/setWorker':
      return updateDay(state, action, (d) => {
        // ausente não pode ser alocado: a ausência precisa ser retirada antes
        if (action.allocated && d.absences.some((a) => a.workerId === action.workerId)) return d;
        return {
          ...d,
          activities: d.activities.map((a) => {
            if (a.id !== action.activityId) return a;
            const has = a.workerIds.includes(action.workerId);
            if (has === action.allocated) return a;
            return {
              ...a,
              workerIds: action.allocated ? [...a.workerIds, action.workerId] : a.workerIds.filter((id) => id !== action.workerId),
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
