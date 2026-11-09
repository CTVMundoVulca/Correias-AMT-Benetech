import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import { App } from '../App';
import { CloudStoreProvider } from '../state/store';
import { getLocalStorage } from '../storage/LocalStorageRepository';
import { seedIdFromName, seedState } from '../domain/seed';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { loadFirebase, type FirebaseApi } from './firebase';
import { CloudSync } from './sync';
import { markLegacyDone, readLegacy } from './legacy';
import { AuthScreen, Splash } from './AuthScreens';
import { estadoPublico, ouvirPublico, Publicador } from './publico';
import { ViewerStoreProvider, type Notice } from '../state/store';
import type { AppState } from '../domain/types';

/** Escala só para ver (cópia pública, sem motivos de ausência sensíveis). */
function Visualizacao({
  api,
  email,
  entrar,
  logout,
  aviso,
}: {
  api: FirebaseApi;
  email: string | null;
  entrar: () => void;
  logout: (() => void) | null;
  aviso?: Notice;
}) {
  const [st, setSt] = useState<{ state: AppState; loaded: boolean; offline: boolean }>(() => ({ state: estadoPublico(null, {}), loaded: false, offline: false }));
  useEffect(
    () =>
      ouvirPublico(
        api,
        (cfg, dias, meta) => setSt({ state: estadoPublico(cfg, dias), loaded: meta.loaded, offline: meta.offline }),
        () => setSt((s) => ({ ...s, loaded: true, offline: true })),
      ),
    [api],
  );
  return (
    <ViewerStoreProvider state={st.state} loaded={st.loaded} offline={st.offline} email={email} entrar={entrar} logout={logout} aviso={aviso}>
      <App />
    </ViewerStoreProvider>
  );
}

/** viewer = visualização da cópia pública (sem login, ou e-mail não liberado); login = tela de entrada */
type Phase = 'sdk' | 'sdk-fail' | 'login' | 'viewer' | 'ready';
const LAST_EMAIL = 'vulcaescala:ultimo-email';

/** Há texto sendo digitado ou uma janela aberta? (não recarregar nessa hora) */
function editando(): boolean {
  const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value) return true;
  return !!document.querySelector('[role="dialog"]');
}

function lastEmail(): string {
  try {
    return getLocalStorage()?.getItem(LAST_EMAIL) ?? '';
  } catch {
    return '';
  }
}

/**
 * Modo nuvem, no padrão dos apps CTV:
 * 1) mostra na hora a cópia salva no aparelho (se houver);
 * 2) carrega o Firebase em segundo plano;
 * 3) exige login (e-mail confirmado) e conecta a sincronização.
 */
export function CloudApp() {
  const syncRef = useRef<CloudSync | null>(null);
  if (!syncRef.current) syncRef.current = new CloudSync(getLocalStorage());
  const sync = syncRef.current;
  const info = useSyncExternalStore(sync.subscribe, sync.getInfo);
  const confirm = useConfirm();
  const toast = useToast();

  const [api, setApi] = useState<FirebaseApi | null>(null);
  const [phase, setPhase] = useState<Phase>('sdk');
  const [user, setUser] = useState<User | null>(null);

  // carrega o SDK e acompanha o login
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancel = false;
    setPhase('sdk');
    loadFirebase()
      .then((fb) => {
        if (cancel) return;
        setApi(fb);
        unsub = fb.authMod.onAuthStateChanged(fb.auth, (u) => {
          setUser(u);
          if (!u) {
            // sem login: sessão anônima automática para VISUALIZAR a escala (cópia pública)
            fb.authMod.signInAnonymously(fb.auth).catch(() => setPhase('login'));
            return;
          }
          // anônimo só visualiza; quem fez login vai para a escala (se não for liberado, visualiza)
          // anônimo só visualiza; quem fez login vai para a escala (se não for administrador, visualiza)
          setPhase((p) => (u.isAnonymous ? (p === 'login' ? 'login' : 'viewer') : 'ready'));
          if (u?.email)
            try {
              getLocalStorage()?.setItem(LAST_EMAIL, u.email);
            } catch {
              /* ignore */
            }
        });
      })
      .catch(() => !cancel && setPhase('sdk-fail'));
    return () => {
      cancel = true;
      unsub?.();
    };
  }, []);

  // Firebase não carregou (sem internet ao abrir). O navegador guarda a falha do
  // carregamento de módulos enquanto a página estiver aberta, então tentar de novo
  // exige recarregar. Recarrega sozinho quando a conexão volta (e a cada 30 s), mas
  // nunca com um campo em edição ou janela aberta. A fila de alterações está salva
  // no aparelho e é enviada logo depois.
  useEffect(() => {
    if (phase !== 'sdk-fail') return;
    const tentar = () => {
      if (navigator.onLine !== false && !editando()) window.location.reload();
    };
    window.addEventListener('online', tentar);
    const t = setInterval(tentar, 30_000);
    return () => {
      window.removeEventListener('online', tentar);
      clearInterval(t);
    };
  }, [phase]);

  // conecta a sincronização quando o usuário está pronto
  useEffect(() => {
    if (phase !== 'ready' || !api || !user?.email) return;
    sync.attach(api, user.email);
    return () => sync.detach();
  }, [phase, api, user, sync]);

  // primeira vez: nuvem vazia → envia os dados antigos deste aparelho ou o efetivo inicial.
  // Roda UMA vez por sessão: repetir apagaria o que foi lançado logo depois.
  const seeding = useRef<'idle' | 'running' | 'done'>('idle');
  useEffect(() => {
    if (!info.loaded || !info.cloudEmpty || seeding.current !== 'idle' || info.status === 'denied') return;
    seeding.current = 'running';
    (async () => {
      const legacy = await readLegacy();
      await sync.replaceAll(legacy ?? seedState(seedIdFromName));
      markLegacyDone();
      seeding.current = 'done';
      toast(legacy ? 'Dados deste aparelho enviados para a nuvem' : 'Efetivo inicial criado na nuvem');
    })().catch((e) => {
      seeding.current = 'done'; // falhou: não insiste em loop; tenta de novo ao reabrir o app
      toast(`Falha ao preparar a nuvem: ${e instanceof Error ? e.message : e}`, 'danger');
    });
  }, [info.loaded, info.cloudEmpty, info.status, sync, toast]);

  const logout = useCallback(async () => {
    if (!api) return;
    const pend = sync.getInfo().pending;
    const ok = await confirm({
      title: 'Sair da conta?',
      message: pend ? (
        <p>
          Há <b className="num">{pend}</b> alteração(ões) ainda não enviada(s) à nuvem. Se sair agora, elas serão
          perdidas. Conecte-se à internet e aguarde “Sincronizado” antes de sair.
        </p>
      ) : (
        <p>A cópia da escala guardada neste aparelho será apagada. Para voltar, basta entrar de novo.</p>
      ),
      confirmLabel: 'Sair',
      danger: pend > 0,
    });
    if (!ok) return;
    sync.detach();
    sync.clearLocal();
    await api.authMod.signOut(api.auth);
  }, [api, sync, confirm]);

  const email = user?.email ?? lastEmail();

  // cópia pública: os aparelhos da liderança a mantêm igual à escala confirmada na nuvem
  useEffect(() => {
    if (phase !== 'ready' || !api || !info.loaded || info.status === 'denied') return;
    const pub = new Publicador(api, () => {
      const i = sync.getInfo();
      return i.loaded && (i.status === 'ok' || i.status === 'saving') ? sync.getConfirmed() : null;
    });
    const off = sync.subscribe(() => pub.agendar());
    pub.agendar();
    return () => {
      off();
      pub.stop();
    };
  }, [phase, api, info.loaded, info.status === 'denied', sync]);

  // ---------- telas ----------
  if (phase === 'login' && api) return <AuthScreen api={api} onVoltar={() => setPhase(user?.isAnonymous ? 'viewer' : 'login')} />;
  if (phase === 'viewer' && api) return <Visualizacao api={api} email={null} entrar={() => setPhase('login')} logout={null} />;

  const hasData = sync.hasCache();
  if ((phase === 'sdk' || phase === 'sdk-fail') && !hasData)
    return phase === 'sdk' ? (
      <Splash text="Conectando…" />
    ) : (
      <Splash
        text="Sem conexão com a nuvem. Na primeira vez neste aparelho é preciso internet."
        action={{ label: 'Tentar de novo', onClick: () => window.location.reload() }}
        secondary={{ label: 'Voltar ao menu de apps', onClick: () => window.location.assign('../') }}
      />
    );

  // logado mas e-mail não liberado: visualiza a escala (cópia pública), sem editar
  if (phase === 'ready' && info.status === 'denied' && !info.loaded && api)
    return <Visualizacao api={api} email={email} entrar={() => {}} logout={() => void api.authMod.signOut(api.auth)} />;

  return (
    <CloudStoreProvider
      sync={sync}
      email={email}
      isAdmin={info.isAdmin}
      logout={logout}
      extraNotices={
        phase === 'sdk-fail'
          ? [
              {
                kind: 'warn',
                text: 'Sem conexão com a nuvem. O que você lançar fica guardado neste aparelho e será enviado sozinho quando a internet voltar.',
                actions: [{ label: 'Tentar de novo', onClick: () => window.location.reload() }],
              },
            ]
          : []
      }
    >
      <App />
    </CloudStoreProvider>
  );
}
