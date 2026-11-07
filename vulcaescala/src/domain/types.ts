export const FUNCOES = ['Vulcanizador', 'Líder', 'Encarregado', 'Mecânico', 'Soldador', 'Auxiliar'] as const;
export type Funcao = (typeof FUNCOES)[number];

export interface Worker {
  id: string;
  nome: string;
  funcao: Funcao;
  ativo: boolean;
}

export const ABSENCE_TYPES = ['folga', 'atestado', 'exame', 'ferias', 'falta'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  folga: 'Folga',
  atestado: 'Atestado',
  exame: 'Exame',
  ferias: 'Férias',
  falta: 'Falta',
};

/** Abreviação usada na tabela do resumo. */
export const ABSENCE_ABBR: Record<AbsenceType, string> = {
  folga: 'F',
  atestado: 'A',
  exame: 'E',
  ferias: 'FÉ',
  falta: 'FT',
};

export interface Activity {
  id: string;
  /** sempre em MAIÚSCULAS */
  nome: string;
  workerIds: string[];
}

export interface Absence {
  workerId: string;
  tipo: AbsenceType;
}

export interface Day {
  activities: Activity[];
  absences: Absence[];
}

export interface Week {
  /** semana ISO 8601, formato "AAAA-Www" (ex.: "2026-W45") */
  key: string;
  /** 7 dias, índice 0 = segunda … 6 = domingo */
  days: Day[];
}

export const CURRENT_VERSION = 1;

export interface AppState {
  version: number;
  workers: Worker[];
  /** semanas indexadas pela chave ISO; só existem semanas que já receberam dados */
  weeks: Record<string, Week>;
}

export function emptyState(): AppState {
  return { version: CURRENT_VERSION, workers: [], weeks: {} };
}

export function emptyDay(): Day {
  return { activities: [], absences: [] };
}

export function emptyWeek(key: string): Week {
  return { key, days: Array.from({ length: 7 }, emptyDay) };
}
