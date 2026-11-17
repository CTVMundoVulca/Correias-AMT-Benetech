/**
 * Plantão da equipe (fins de semana e feriados).
 * É uma atividade especial do dia ("PLANTÃO", id fixo) com a equipe alocada e um LÍDER DO
 * PLANTÃO designado entre os alocados — qualquer pessoa (ex.: um vulcanizador), não a função
 * do cadastro: é quem fica com o telefone.
 * Efetivo exigido: fim de semana = 1 líder + 6 executantes; feriado = 1 líder + 8 executantes.
 * Também se indica quem conduz o veículo de transporte e o caminhão (entre os alocados;
 * NÃO contam como executantes, assim como supervisor, encarregado, motorista e eletricista).
 */
import type { Activity } from './types';
import { foraDaExecucao } from './types';
import type { AppState } from './types';
import { feriadoNaData, folgaAutoNaData } from './schedule';
import { addDays, toIsoDate } from './isoWeek';


export const PLANTAO_ID = 'plantao';
export const PLANTAO_NOME = 'PLANTÃO';
export const EXECUTANTES_FIM_DE_SEMANA = 6;
export const EXECUTANTES_FERIADO = 8;

export type PapelPlantao = 'lider' | 'veiculo' | 'caminhao';
export const PAPEIS_PLANTAO: { id: PapelPlantao; campo: 'liderId' | 'veiculoId' | 'caminhaoId'; nome: string; icone: string }[] = [
  { id: 'lider', campo: 'liderId', nome: 'Líder do plantão (telefone)', icone: '☎' },
  { id: 'veiculo', campo: 'veiculoId', nome: 'Veículo de transporte', icone: '🚐' },
  { id: 'caminhao', campo: 'caminhaoId', nome: 'Caminhão', icone: '🚚' },
];

export const ehPlantao = (a: Pick<Activity, 'id'>) => a.id === PLANTAO_ID;

/** executantes exigidos no plantão do dia (feriado tem mais gente) */
export const executantesExigidos = (feriado: boolean) => (feriado ? EXECUTANTES_FERIADO : EXECUTANTES_FIM_DE_SEMANA);

export interface SituacaoPlantao {
  /** líder designado (só vale se estiver alocado no plantão) */
  liderId: string | null;
  veiculoId: string | null;
  caminhaoId: string | null;
  executantes: number;
  exigidos: number;
  faltamExecutantes: number;
  /** executantes acima do exigido */
  sobram: number;
  completo: boolean;
}

/**
 * `funcaoDe`: função de cada pessoa (cadastro). Supervisor/encarregado não contam como
 * executantes (podem ser o líder do plantão).
 */
export function situacaoPlantao(
  a: Pick<Activity, 'workerIds' | 'liderId' | 'veiculoId' | 'caminhaoId'>,
  feriado: boolean,
  funcaoDe: (id: string) => string | undefined = () => undefined,
): SituacaoPlantao {
  const valido = (id: string | undefined) => (id && a.workerIds.includes(id) ? id : null);
  const liderId = valido(a.liderId);
  const veiculoId = valido(a.veiculoId);
  const caminhaoId = valido(a.caminhaoId);
  // executantes: sem o líder, sem quem conduz o veículo/caminhão no dia e sem funções fora da
  // execução (supervisor, encarregado, motorista, eletricista)
  const naoConta = new Set([liderId, veiculoId, caminhaoId].filter(Boolean));
  const executantes = a.workerIds.filter((id) => !naoConta.has(id) && !foraDaExecucao(funcaoDe(id))).length;
  const exigidos = executantesExigidos(feriado);
  const faltamExecutantes = Math.max(0, exigidos - executantes);
  return { liderId, veiculoId, caminhaoId, executantes, exigidos, faltamExecutantes, sobram: Math.max(0, executantes - exigidos), completo: !!liderId && faltamExecutantes === 0 };
}

// ------------------------------------------------------------------ período e ordem


export interface PeriodoPlantao {
  /** dias consecutivos sem expediente: sábado, domingo, feriados e dias enforcados emendados */
  dias: Date[];
  /** há feriado (ou dia enforcado cadastrado como feriado) no período: 1 líder + 8 */
  temFeriado: boolean;
}

/** Período de plantão que contém a data (null em dia útil). Máx. 10 dias para cada lado. */
export function periodoPlantao(state: Pick<AppState, 'feriados'>, data: Date): PeriodoPlantao | null {
  const folga = (d: Date) => !!folgaAutoNaData(state as AppState, d);
  if (!folga(data)) return null;
  let ini = data;
  for (let i = 0; i < 10 && folga(addDays(ini, -1)); i++) ini = addDays(ini, -1);
  let fim = data;
  for (let i = 0; i < 10 && folga(addDays(fim, 1)); i++) fim = addDays(fim, 1);
  const dias: Date[] = [];
  for (let d = ini; d.getTime() <= fim.getTime(); d = addDays(d, 1)) dias.push(d);
  return { dias, temFeriado: dias.some((d) => !!feriadoNaData(state as AppState, d)) };
}

export const primeiroDoPeriodo = (p: PeriodoPlantao, data: Date) => toIsoDate(p.dias[0]) === toIsoDate(data);

/**
 * Ordem dos nomes no plantão: líder; executantes em ordem alfabética (e, depois deles, quem é
 * de função fora da execução); motorista do caminhão; motorista do veículo de transporte.
 */
export function ordemPlantao<T extends { id: string; nome: string; funcao?: string }>(pessoas: T[], sit: Pick<SituacaoPlantao, 'liderId' | 'veiculoId' | 'caminhaoId'>): T[] {
  const grupo = (p: T) =>
    p.id === sit.liderId ? 0 : p.id === sit.caminhaoId ? 3 : p.id === sit.veiculoId ? 4 : foraDaExecucao(p.funcao) ? 2 : 1;
  return [...pessoas].sort((a, b) => grupo(a) - grupo(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
