import type { AppState } from '../domain/types';
import { getLocalStorage, LocalStorageRepository } from '../storage/LocalStorageRepository';

/**
 * Dados do modo local (antes da nuvem) guardados neste aparelho.
 * Regra dos apps CTV: dados locais nunca se perdem — são enviados à nuvem
 * (automaticamente se a nuvem estiver vazia; senão, por decisão de um administrador).
 */
const MIGRATED_KEY = 'vulcaescala:enviado-nuvem';

export async function readLegacy(): Promise<AppState | null> {
  const ls = getLocalStorage();
  if (!ls) return null;
  try {
    if (ls.getItem(MIGRATED_KEY) === '1') return null;
    const s = await new LocalStorageRepository(ls).load();
    return s && (s.workers.length || Object.keys(s.weeks).length) ? s : null;
  } catch {
    return null;
  }
}

/** Marca como resolvido (enviado ou descartado). O conteúdo antigo continua guardado como cópia. */
export function markLegacyDone(): void {
  try {
    getLocalStorage()?.setItem(MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
}
