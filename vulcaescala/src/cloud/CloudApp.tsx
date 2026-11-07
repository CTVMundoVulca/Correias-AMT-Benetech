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

type Phase = 'sdk' | 'sdk-fail' | 'signed-out' | 'ready';
const LAST_EMAIL = 'vulcaescala:ultimo-email';

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
  const [attempt, setAttempt] = useState(0);

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
          // sessão anônima (aberta pelo Registro de Emenda) não dá acesso à escala
          setPhase(u && !u.isAnonymous ? 'ready' : 'signed-out');
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
  }, [attempt]);

  // conecta a sincronização quando o usuário está pronto
  useEffect(() => {
    if (phase !== 'ready' || !api || !user?.email) return;
    sync.attach(api, user.email);
    return () => sync.detach();
  }, [phase, api, user, sync]);

  // primeira vez: nuvem vazia → envia os dados antigos deste aparelho ou o efetivo inicial
  const seeding = useRef(false);
  useEffect(() => {
    if (!info.loaded || !info.cloudEmpty || seeding.current || info.status === 'denied') return;
    seeding.current = true;
    (async () => {
      const legacy = await readLegacy();
      await sync.replaceAll(legacy ?? seedState(seedIdFromName));
      markLegacyDone();
      toast(legacy ? 'Dados deste aparelho enviados para a nuvem' : 'Efetivo inicial criado na nuvem');
    })()
      .catch((e) => toast(`Falha ao preparar a nuvem: ${e instanceof Error ? e.message : e}`, 'danger'))
      .finally(() => (seeding.current = false));
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

  // ---------- telas ----------
  if (phase === 'signed-out' && api) return <AuthScreen api={api} />;

  const hasData = sync.hasCache();
  if ((phase === 'sdk' || phase === 'sdk-fail') && !hasData)
    return phase === 'sdk' ? (
      <Splash text="Conectando…" />
    ) : (
      <Splash
        text="Sem conexão com a nuvem. Na primeira vez neste aparelho é preciso internet."
        action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}
      />
    );

  if (phase === 'ready' && info.status === 'denied' && !info.loaded && api)
    return (
      <Splash
        title="Acesso não liberado"
        text={`O e-mail ${email} ainda não está liberado para a escala do contrato AMT. Peça a um administrador para incluir o seu e-mail em “Dados → Acesso da liderança”.`}
        action={{ label: 'Tentar de novo', onClick: () => api && user?.email && sync.attach(api, user.email) }}
        secondary={{ label: 'Sair', onClick: () => void api.authMod.signOut(api.auth) }}
      />
    );

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
                text: 'Sem conexão com a nuvem. O que você lançar fica guardado neste aparelho e será enviado quando a internet voltar.',
                actions: [{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }],
              },
            ]
          : []
      }
    >
      <App />
    </CloudStoreProvider>
  );
}
