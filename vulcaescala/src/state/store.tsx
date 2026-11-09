import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, emptyState } from '../domain/types';
import { seedState } from '../domain/seed';
import { newId } from '../domain/ids';
import { CorruptDataError, type StorageRepository } from '../storage/StorageRepository';
import type { CloudSync, SyncInfo } from '../cloud/sync';
import { Action, reducer } from './reducer';

export interface Notice {
  kind: 'warn' | 'danger';
  text: string;
  actions?: { label: string; onClick: () => void }[];
}

/** Recursos que só existem com a nuvem (Firebase) ligada. */
export interface CloudInfo {
  info: SyncInfo;
  email: string;
  isAdmin: boolean;
  logout: () => void;
  retry: () => void;
}

export interface Store {
  state: AppState;
  dispatch: (a: Action) => void;
  ready: boolean;
  notices: Notice[];
  saveError: string | null;
  /** os dados sobrevivem ao fechar o app */
  persistent: boolean;
  /** Substitui todos os dados (importar backup / apagar tudo). */
  replaceAll: (s: AppState) => Promise<void>;
  /** `null` = modo local (só neste aparelho) */
  cloud: CloudInfo | null;
  /**
   * Visualização (sem login ou e-mail não liberado): só vê a cópia pública da escala,
   * sem editar. `entrar` abre a tela de login da liderança.
   */
  visualizacao?: { entrar: () => void; email: string | null; logout: (() => void) | null; status: { cls: string; short: string; long: string } };
}

const Ctx = createContext<Store | null>(null);

// ---------------------------------------------------------------- modo local

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
        const initial = s ?? seedState(() => newId());
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

  const replaceAll = useCallback(async (s: AppState) => dispatch({ type: 'state/replace', state: s }), []);

  return (
    <Ctx.Provider
      value={{ state, dispatch, ready, notices, saveError, persistent: repository.persistent, replaceAll, cloud: null }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- modo nuvem

interface CloudProps {
  sync: CloudSync;
  extraNotices?: Notice[];
  email: string;
  isAdmin: boolean;
  logout: () => void;
  children: ReactNode;
}

export function CloudStoreProvider({ sync, email, isAdmin, logout, extraNotices = [], children }: CloudProps) {
  const state = useSyncExternalStore(sync.subscribe, sync.getState);
  const info = useSyncExternalStore(sync.subscribe, sync.getInfo);

  const notices: Notice[] = [...extraNotices];
  if (info.status === 'denied')
    notices.push({ kind: 'danger', text: 'Sem permissão na nuvem. Peça a um administrador para liberar o seu e-mail.' });
  if (info.rulesOutdated)
    notices.push({
      kind: 'warn',
      text: 'As regras do Firebase estão desatualizadas: funções, tipos de ausência e feriados municipais não sincronizam entre os aparelhos (e o Registro de Emenda não funciona). Um administrador precisa publicar as regras novas: console do Firebase → Firestore → Regras → colar o arquivo firestore.rules → Publicar.',
    });
  if (info.blocked > 0)
    notices.push({
      kind: 'danger',
      text: `A nuvem recusou ${info.blocked} alteração(ões). Ela(s) continua(m) guardada(s) neste aparelho, mas não aparece(m) nos outros. Isso costuma ser regra do Firebase desatualizada.`,
      actions: [
        { label: 'Tentar de novo', onClick: sync.retryBlocked },
        { label: 'Descartar', onClick: sync.discardBlocked },
      ],
    });

  const store: Store = {
    state,
    dispatch: sync.dispatch,
    ready: true,
    notices,
    saveError: info.status === 'error' ? info.lastError : null,
    persistent: true,
    replaceAll: (s) => sync.replaceAll(s),
    cloud: {
      info,
      email,
      isAdmin,
      logout,
      retry: () => void sync.flush(),
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- visualização (só leitura)

interface ViewerProps {
  state: AppState;
  loaded: boolean;
  offline: boolean;
  email: string | null;
  entrar: () => void;
  logout: (() => void) | null;
  /** aviso no lugar do padrão "e-mail não liberado" (ex.: confirmar o e-mail) */
  aviso?: Notice;
  children: ReactNode;
}

/** Store só de leitura: a escala vem da cópia pública e nenhuma ação altera dados. */
export function ViewerStoreProvider({ state, loaded, offline, email, entrar, logout, aviso, children }: ViewerProps) {
  const notices: Notice[] = [];
  if (aviso) notices.push(aviso);
  else if (email)
    notices.push({
      kind: 'warn',
      text: `Modo visualização: o e-mail ${email} não é de administrador. Só os administradores cadastrados editam a escala.`,
    });
  const status = offline
    ? { cls: 'offline', short: 'Offline', long: 'Sem internet: mostrando a última cópia da escala salva neste aparelho.' }
    : { cls: 'ok', short: 'Visualização', long: 'Modo visualização: você vê a escala, mas só a liderança edita. Toque em “Entrar” para fazer login.' };
  const store: Store = {
    state,
    dispatch: () => {},
    ready: loaded,
    notices,
    saveError: null,
    persistent: true,
    replaceAll: () => Promise.reject(new Error('Somente leitura')),
    cloud: null,
    visualizacao: { entrar, email, logout, status },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** true quando a tela é só de visualização (nenhum botão de edição deve aparecer). */
export function useSomenteLeitura(): boolean {
  return !!useContext(Ctx)?.visualizacao;
}

/** Igual a useStore, mas devolve null fora do StoreProvider (app de emenda). */
export function useStoreOptional(): Store | null {
  return useContext(Ctx);
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}
