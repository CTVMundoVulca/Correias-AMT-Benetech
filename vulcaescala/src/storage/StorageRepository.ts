import type { AppState } from '../domain/types';

/**
 * Fronteira de persistência. A interface é assíncrona de propósito: a
 * implementação atual usa localStorage, mas uma futura (ex.: Supabase) pode
 * trocar esta sem alterar nenhum componente.
 */
export interface StorageRepository {
  /** Carrega o estado salvo já migrado para a versão atual (estado vazio se não houver). */
  load(): Promise<AppState>;
  /** Grava o estado inteiro. */
  save(state: AppState): Promise<void>;
  /** Apaga todos os dados. */
  clear(): Promise<void>;
}
