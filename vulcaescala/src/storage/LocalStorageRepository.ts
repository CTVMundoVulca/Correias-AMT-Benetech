import type { AppState } from '../domain/types';
import { CorruptDataError, type StorageRepository } from './StorageRepository';
import { MemoryRepository } from './MemoryRepository';
import { migrate } from './migrations';

export const STORAGE_KEY = 'vulcaescala:state';

/** Acessa window.localStorage sem lançar exceção (modo privado, cookies bloqueados etc.). */
export function getLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__vulcaescala_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export class LocalStorageRepository implements StorageRepository {
  readonly persistent = true;

  constructor(
    private readonly storage: Storage,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<AppState | null> {
    let text: string | null;
    try {
      text = this.storage.getItem(this.key);
    } catch (e) {
      throw new CorruptDataError(`não foi possível ler o armazenamento (${errMsg(e)})`, null);
    }
    if (!text) return null;
    try {
      return migrate(JSON.parse(text));
    } catch (e) {
      // preserva o conteúdo original antes que qualquer gravação o substitua
      const backupKey = `${this.key}:corrompido:${new Date().toISOString()}`;
      let saved: string | null = null;
      try {
        this.storage.setItem(backupKey, text);
        saved = backupKey;
      } catch {
        /* sem espaço para a cópia */
      }
      throw new CorruptDataError(errMsg(e), saved);
    }
  }

  async save(state: AppState): Promise<void> {
    try {
      this.storage.setItem(this.key, JSON.stringify(state));
    } catch (e) {
      throw new Error(`falha ao gravar no navegador (${errMsg(e)})`);
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.removeItem(this.key);
    } catch {
      /* nada a fazer */
    }
  }
}

/** Usa localStorage quando disponível; senão, memória (o app abre do mesmo jeito). */
export function createDefaultRepository(): StorageRepository {
  const ls = getLocalStorage();
  return ls ? new LocalStorageRepository(ls) : new MemoryRepository();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
