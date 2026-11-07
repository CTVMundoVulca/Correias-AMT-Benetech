import type { AppState } from '../domain/types';
import type { StorageRepository } from './StorageRepository';
import { migrate } from './migrations';

export const STORAGE_KEY = 'vulcaescala:state';

export class LocalStorageRepository implements StorageRepository {
  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<AppState> {
    const text = this.storage.getItem(this.key);
    return migrate(text ? JSON.parse(text) : null);
  }

  async save(state: AppState): Promise<void> {
    // Pode lançar QuotaExceededError; quem chama mostra o erro ao usuário.
    this.storage.setItem(this.key, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}
