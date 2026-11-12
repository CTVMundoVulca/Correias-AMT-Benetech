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
  /**
   * Apoio de outro contrato (vem em dias de maior demanda). Não conta no efetivo/capacidade
   * do contrato AMT e não gera pendência quando não é alocado. Ausente = efetivo do contrato.
   */
  apoio?: boolean;
}

export const MATRICULA_MAX = 30;
export function cleanMatricula(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, MATRICULA_MAX);
}

/** Cores disponíveis para os tipos de ausência (definidas em styles/app.css). */
export const CORES_AUSENCIA = ['cinza', 'vermelho', 'azul', 'roxo', 'verde', 'laranja', 'amarelo'] as const;
export type CorAusencia = (typeof CORES_AUSENCIA)[number];

/** Tipo de ausência (editável em Efetivo → Ausências). */
export interface TipoAusencia {
  /** identificador estável: os registros guardam o id, então renomear vale para o histórico */
  id: string;
  nome: string;
  /** sigla da tabela do resumo (1 a 3 letras) */
  sigla: string;
  cor: CorAusencia;
  /** oculto = não aparece nas opções, mas o histórico continua com o nome */
  ativo: boolean;
}

/** Tipos iniciais. Os ids são os mesmos das versões anteriores (dados antigos continuam válidos). */
export const AUSENCIAS_PADRAO: TipoAusencia[] = [
  { id: 'folga', nome: 'Folga', sigla: 'F', cor: 'cinza', ativo: true },
  { id: 'atestado', nome: 'Atestado', sigla: 'A', cor: 'vermelho', ativo: true },
  { id: 'exame', nome: 'Exame', sigla: 'E', cor: 'azul', ativo: true },
  { id: 'ferias', nome: 'Férias', sigla: 'FÉ', cor: 'roxo', ativo: true },
  { id: 'falta', nome: 'Falta', sigla: 'FT', cor: 'vermelho', ativo: true },
];

export type AbsenceType = string;
export const AUSENCIA_NOME_MAX = 30;
export const SIGLA_MAX = 3;

export function cleanNomeAusencia(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, AUSENCIA_NOME_MAX);
  return t ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : '';
}
export function cleanSigla(s: string): string {
  return s.replace(/\s+/g, '').toLocaleUpperCase('pt-BR').slice(0, SIGLA_MAX);
}

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

export const CURRENT_VERSION = 4;

export interface AppState {
  version: number;
  workers: Worker[];
  /** funções disponíveis no cadastro (ordem de exibição) */
  funcoes: string[];
  /** tipos de ausência (ordem de exibição) */
  ausencias: TipoAusencia[];
  /** feriados municipais (Vitória) "AAAA-MM-DD" → nome; os nacionais são calculados */
  feriados: Record<string, string>;
  /** semanas indexadas pela chave ISO; só existem semanas que já receberam dados */
  weeks: Record<string, Week>;
}

export function emptyState(): AppState {
  return { version: CURRENT_VERSION, workers: [], funcoes: [...FUNCOES_PADRAO], ausencias: AUSENCIAS_PADRAO.map((a) => ({ ...a })), feriados: {}, weeks: {} };
}

export function emptyDay(): Day {
  return { activities: [], absences: [] };
}

export function emptyWeek(key: string): Week {
  return { key, days: Array.from({ length: 7 }, emptyDay) };
}

/** Tipo de ausência pelo id; um id desconhecido (tipo removido) ainda aparece de forma legível. */
export function tipoAusencia(state: { ausencias: TipoAusencia[] }, id: string): TipoAusencia {
  return state.ausencias.find((a) => a.id === id) ?? { id, nome: 'Tipo removido', sigla: '?', cor: 'cinza', ativo: false };
}
