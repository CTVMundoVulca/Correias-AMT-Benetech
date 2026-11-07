import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState, emptyState } from '../domain/types';
import { seedState } from '../domain/seed';
import { newId } from '../domain/ids';
import { CorruptDataError, type StorageRepository } from '../storage/StorageRepository';
import { Action, reducer } from './reducer';

export interface Notice {
  kind: 'warn' | 'danger';
  text: string;
}

interface Store {
  state: AppState;
  dispatch: (a: Action) => void;
  ready: boolean;
  notices: Notice[];
  saveError: string | null;
  persistent: boolean;
  /** Substitui todos os dados (importar backup / apagar tudo). */
  replaceAll: (s: AppState) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ repository, children }: { repository: StorageRepository; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [ready, setReady] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  // estado exatamente como veio do armazenamento: não precisa ser regravado
  const loaded = useRef<AppState | null>(null);

  useEffect(() => {
    let cancel = false;
    const extra: Notice[] = [];
    if (!repository.persistent)
      extra.push({
        kind: 'warn',
        text: 'Este navegador não permite salvar dados. Tudo o que for feito será perdido ao fechar a página.',
      });
    repository
      .load()
      .catch((e: unknown) => {
        const backup = e instanceof CorruptDataError && e.backupKey ? ` Uma cópia foi guardada como “${e.backupKey}”.` : '';
        extra.push({
          kind: 'danger',
          text: `Os dados salvos não puderam ser lidos (${e instanceof Error ? e.message : String(e)}).${backup} O app abriu com o efetivo inicial; importe um backup em “Dados” se tiver.`,
        });
        return null;
      })
      .then((s) => {
        if (cancel) return;
        const initial = s ?? seedState(newId);
        loaded.current = s; // estado novo (semente) será gravado na primeira passada
        dispatch({ type: 'state/replace', state: initial });
        setNotices(extra);
        setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [repository]);

  useEffect(() => {
    if (!ready || state === loaded.current) return;
    repository
      .save(state)
      .then(() => setSaveError(null))
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  }, [state, ready, repository]);

  const replaceAll = useCallback((s: AppState) => dispatch({ type: 'state/replace', state: s }), []);

  return (
    <Ctx.Provider value={{ state, dispatch, ready, notices, saveError, persistent: repository.persistent, replaceAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}
