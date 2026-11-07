import type { AppState } from '../domain/types';
import type { StorageRepository } from './StorageRepository';

/** Guarda em memória: usado quando o navegador não permite armazenamento, e nos testes. */
export class MemoryRepository implements StorageRepository {
  readonly persistent = false;
  private data: string | null = null;

  async load(): Promise<AppState | null> {
    return this.data ? (JSON.parse(this.data) as AppState) : null;
  }
  async save(state: AppState): Promise<void> {
    this.data = JSON.stringify(state);
  }
  async clear(): Promise<void> {
    this.data = null;
  }
}
