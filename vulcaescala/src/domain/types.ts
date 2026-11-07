/** Lista inicial de funções. A lista real fica no estado (editável em Efetivo → Funções). */
export const FUNCOES_PADRAO = ['Vulcanizador', 'Líder', 'Encarregado', 'Mecânico', 'Soldador', 'Auxiliar'];
export type Funcao = string;
export const FUNCAO_MAX = 40;

/** Padroniza o nome de uma função: sem espaços sobrando; primeira letra maiúscula. */
export function cleanFuncao(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, FUNCAO_MAX);
  return t ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : '';
}

export interface Worker {
  id: string;
  nome: string;
  funcao: Funcao;
  ativo: boolean;
  /** matrícula (opcional) — aparece no Registro de Emenda. Não guardar CPF. */
  matricula?: string;
}

export const MATRICULA_MAX = 30;
export function cleanMatricula(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, MATRICULA_MAX);
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

export const CURRENT_VERSION = 2;

export interface AppState {
  version: number;
  workers: Worker[];
  /** funções disponíveis no cadastro (ordem de exibição) */
  funcoes: string[];
  /** semanas indexadas pela chave ISO; só existem semanas que já receberam dados */
  weeks: Record<string, Week>;
}

export function emptyState(): AppState {
  return { version: CURRENT_VERSION, workers: [], funcoes: [...FUNCOES_PADRAO], weeks: {} };
}

export function emptyDay(): Day {
  return { activities: [], absences: [] };
}

export function emptyWeek(key: string): Week {
  return { key, days: Array.from({ length: 7 }, emptyDay) };
}
