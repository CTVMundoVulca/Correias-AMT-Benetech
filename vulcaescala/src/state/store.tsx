import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState, emptyState } from '../domain/types';
import type { StorageRepository } from '../storage/StorageRepository';
import { Action, reducer } from './reducer';

type LoadStatus = 'loading' | 'ready' | 'error';

interface Store {
  state: AppState;
  dispatch: (a: Action) => void;
  repository: StorageRepository;
  loadStatus: LoadStatus;
  loadError: string | null;
  saveError: string | null;
  /** Substitui todos os dados (importação de backup / limpeza) e libera a gravação. */
  replaceAll: (s: AppState) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ repository, children }: { repository: StorageRepository; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef<AppState | null>(null);

  useEffect(() => {
    let cancel = false;
    repository
      .load()
      .then((s) => {
        if (cancel) return;
        loaded.current = s;
        dispatch({ type: 'state/replace', state: s });
        setLoadStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoadStatus('error');
      });
    return () => {
      cancel = true;
    };
  }, [repository]);

  useEffect(() => {
    // Só salva depois de carregar e quando algo mudou — evita sobrescrever
    // dados existentes com o estado vazio inicial, inclusive se a leitura falhar.
    if (loadStatus !== 'ready' || state === loaded.current) return;
    repository
      .save(state)
      .then(() => setSaveError(null))
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  }, [state, loadStatus, repository]);

  const replaceAll = (s: AppState) => {
    dispatch({ type: 'state/replace', state: s });
    setLoadError(null);
    setLoadStatus('ready');
  };

  return (
    <Ctx.Provider value={{ state, dispatch, repository, loadStatus, loadError, saveError, replaceAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}
