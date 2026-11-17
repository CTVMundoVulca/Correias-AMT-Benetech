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
