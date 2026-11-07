import type { AppState } from '../domain/types';

/**
 * Fronteira de persistência. A interface é assíncrona de propósito: a
 * implementação atual usa localStorage, mas uma futura (ex.: Supabase) pode
 * substituí-la sem alterar nenhum componente.
 */
export interface StorageRepository {
  /** `true` se os dados sobrevivem ao fechar o app. */
  readonly persistent: boolean;
  /** Estado salvo, já validado e migrado; `null` se nunca houve dados. */
  load(): Promise<AppState | null>;
  /** Grava o estado inteiro. */
  save(state: AppState): Promise<void>;
  /** Apaga todos os dados. */
  clear(): Promise<void>;
}

/** Os dados salvos existem mas não puderam ser lidos. Uma cópia bruta foi preservada. */
export class CorruptDataError extends Error {
  constructor(message: string, readonly backupKey: string | null) {
    super(message);
  }
}
