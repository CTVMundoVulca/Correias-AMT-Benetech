import { hojeIso } from './isoWeek';
import { isoValido } from './feriados';

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
   * Apoio de outro contrato, de modo FIXO (enquanto estiver marcado). Vem em dias de maior
   * demanda; não conta no efetivo/capacidade do contrato AMT e não gera pendência quando não
   * é alocado. Ausente (e sem apoioPeriodos) = efetivo do contrato. Ignorado quando
   * apoioPeriodos tem algum período (os dois modos não se combinam).
   */
  apoio?: boolean;
  /**
   * Apoio de outro contrato POR PERÍODO (ex.: atendeu outro contrato de 02/11 até hoje).
   * Quando preenchido, tem prioridade sobre `apoio`: o efetivo só é tratado como apoio nas
   * datas dentro de algum período, então voltar ao contrato não vira pendência retroativa
   * nos dias já passados.
   */
  apoioPeriodos?: PeriodoApoio[];
}

/** Um período de apoio de outro contrato. `fim` vazio = ainda em aberto (sem data de volta). */
export interface PeriodoApoio {
  inicio: string; // "AAAA-MM-DD"
  fim: string; // "AAAA-MM-DD" ou "" (em aberto)
}

export const PERIODOS_APOIO_MAX = 20;

/** Sanitiza períodos de apoio vindos de fora (nuvem, localStorage): datas válidas, início ≤ fim. */
export function cleanPeriodosApoio(list: unknown): PeriodoApoio[] {
  if (!Array.isArray(list)) return [];
  const out: PeriodoApoio[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const inicio = (p as { inicio?: unknown }).inicio;
    const fim = (p as { fim?: unknown }).fim;
    if (typeof inicio !== 'string' || !isoValido(inicio)) continue;
    const fimOk = typeof fim === 'string' && isoValido(fim) ? fim : '';
    if (fimOk && fimOk < inicio) continue;
    out.push({ inicio, fim: fimOk });
    if (out.length >= PERIODOS_APOIO_MAX) break;
  }
  return out;
}

/** Funções fora da execução (início do nome, sem acento): liderança e funções de suporte. */
export const FUNCOES_FORA_DA_EXECUCAO = ['supervis', 'encarregad', 'motorist', 'eletricist'];

/**
 * Supervisor, encarregado, motorista e eletricista NÃO contam como efetivo de execução (não
 * geram pendência de alocação, não entram na capacidade nem nos executantes do plantão).
 * Podem ser alocados normalmente; no plantão, podem ser o líder ou conduzir veículo/caminhão.
 */
export function foraDaExecucao(funcao: string | undefined): boolean {
  const f = (funcao ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return FUNCOES_FORA_DA_EXECUCAO.some((p) => f.startsWith(p));
}
/** @deprecated nome antigo de foraDaExecucao */
export const ehLideranca = foraDaExecucao;

/** O período inclui a data (início obrigatório; fim vazio = em aberto)? */
function dentroDoPeriodo(p: PeriodoApoio, data: string): boolean {
  return data >= p.inicio && (!p.fim || data <= p.fim);
}

/** Colaborador está em apoio de outro contrato NESSA data? (ausente `data` = hoje) */
export function apoioNaData(w: { apoio?: boolean; apoioPeriodos?: PeriodoApoio[] }, data: string = hojeIso()): boolean {
  if (w.apoioPeriodos?.length) return w.apoioPeriodos.some((p) => dentroDoPeriodo(p, data));
  return !!w.apoio;
}

/** Período de apoio ativo na data (se houver). */
export function periodoApoioEm(w: { apoioPeriodos?: PeriodoApoio[] }, data: string = hojeIso()): PeriodoApoio | undefined {
  return w.apoioPeriodos?.find((p) => dentroDoPeriodo(p, data));
}

/** Próximo período de apoio agendado (início depois da data), o mais próximo primeiro. */
export function proximoPeriodoApoio(w: { apoioPeriodos?: PeriodoApoio[] }, data: string = hojeIso()): PeriodoApoio | undefined {
  return [...(w.apoioPeriodos ?? [])].filter((p) => p.inicio > data).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
}

/**
 * Efetivo de execução do contrato NESSA data: sem apoio de outro contrato (fixo ou por
 * período) e fora das funções de suporte/liderança. Sem `data`, considera hoje — é o uso
 * certo para uma contagem "agora" (ex.: cadastro); para pendência de um dia específico da
 * escala, informe a data daquele dia (um apoio por período não pode gerar pendência
 * retroativa nos dias em que a pessoa já tinha voltado ao contrato).
 */
export const ehExecucao = (w: { apoio?: boolean; apoioPeriodos?: PeriodoApoio[]; funcao?: string }, data?: string) =>
  !apoioNaData(w, data) && !foraDaExecucao(w.funcao);

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
  /** só no PLANTÃO: líder do plantão (fica com o telefone) — um dos alocados */
  liderId?: string;
  /** só no PLANTÃO: quem conduz o veículo de transporte — um dos alocados */
  veiculoId?: string;
  /** só no PLANTÃO: quem conduz o caminhão — um dos alocados */
  caminhaoId?: string;
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
