import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../ui/Header';
import { loadFirebase, type FirebaseApi } from '../cloud/firebase';
import { AuthScreen, Splash } from '../cloud/AuthScreens';
import { souAdmin } from '../emenda/data';
import { Ctx, type ProgCtx } from './context';
import { ouvirAreas, ouvirFeriados, type Pendencia } from './data';
import { AREAS_PADRAO, type Area } from './model';
import { Painel } from './Painel';
import { Solicitar } from './Solicitar';
import { Programar } from './Programar';
import { Oms } from './Oms';
import { Dashboard } from './Dashboard';
import { Central } from './Central';
import { Paradas } from './Paradas';
import { ouvirAbertas } from './data';

type Phase = 'sdk' | 'fail' | 'auth-off' | 'ready';
type Tela = 'central' | 'painel' | 'solicitar' | 'programar' | 'paradas' | 'oms' | 'dashboard';

const TELAS: { id: Tela; label: string; ico: string; admin?: boolean }[] = [
  { id: 'central', label: 'Central', ico: '🏠' },
  { id: 'painel', label: 'Dia a dia', ico: '📍' },
  { id: 'solicitar', label: 'Solicitar', ico: '➕' },
  { id: 'programar', label: 'Programar', ico: '🗓', admin: true },
  { id: 'paradas', label: 'Paradas', ico: '⛔' },
  { id: 'oms', label: 'OMs', ico: '🧾' },
  { id: 'dashboard', label: 'Relatórios', ico: '📊' },
];

function lerTela(): Tela {
  const m = /^#\/(\w+)/.exec(window.location.hash);
  return (TELAS.find((t) => t.id === m?.[1])?.id ?? 'central') as Tela;
}

/**
 * Programação da Vulcanização — qualquer pessoa com o link vê onde está o efetivo,
 * pede serviço e acompanha o dashboard (sessão anônima automática). Programar,
 * classificar e dar baixa nas OMs: só administradores (os mesmos da escala).
 */
export function ProgApp() {
  const [api, setApi] = useState<FirebaseApi | null>(null);
  const [phase, setPhase] = useState<Phase>('sdk');
  const [por, setPor] = useState('anônimo');
  const [uid, setUid] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [logado, setLogado] = useState(false);
  const [login, setLogin] = useState(false);
  const [areas, setAreas] = useState<Area[]>(AREAS_PADRAO);
  const [feriados, setFeriados] = useState<Record<string, string>>({});
  const [tela, setTela] = useState<Tela>(lerTela);
  const [pend, setPend] = useState<Pendencia>({ pendente: false, offline: false });
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onHash = () => {
      setTela(lerTela());
      window.scrollTo({ top: 0 });
    };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // SDK + sessão (conta do administrador, se já entrou na escala/aqui; senão anônima)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancel = false;
    loadFirebase()
      .then((fb) => {
        if (cancel) return;
        setApi(fb);
        unsub = fb.authMod.onAuthStateChanged(fb.auth, (u) => {
          if (!u) {
            setIsAdmin(false);
            setLogado(false);
            fb.authMod.signInAnonymously(fb.auth).catch((e: { code?: string }) =>
              setPhase(e?.code === 'auth/admin-restricted-operation' || e?.code === 'auth/operation-not-allowed' ? 'auth-off' : 'fail'),
            );
            return;
          }
          setPor(u.email ?? 'anônimo');
          setUid(u.uid);
          setLogado(!u.isAnonymous);
          setPhase('ready');
          if (u.isAnonymous) setIsAdmin(false);
          else
            void souAdmin(fb).then((a) => {
              setIsAdmin(a);
              if (a) setLogin(false);
            });
        });
      })
      .catch(() => !cancel && setPhase('fail'));
    return () => {
      cancel = true;
      unsub?.();
    };
  }, []);

  // sem internet ao abrir: recarrega sozinho quando a conexão volta (o SDK não carregou)
  useEffect(() => {
    if (phase !== 'fail') return;
    const tentar = () => {
      if (navigator.onLine !== false) window.location.reload();
    };
    window.addEventListener('online', tentar);
    const t = setInterval(tentar, 30_000);
    return () => {
      window.removeEventListener('online', tentar);
      clearInterval(t);
    };
  }, [phase]);

  useEffect(() => (phase === 'ready' && api ? ouvirAreas(api, setAreas) : undefined), [phase, api]);
  // sino: solicitações aguardando programação (só administradores)
  const [aguardando, setAguardando] = useState(0);
  useEffect(() => (phase === 'ready' && api && isAdmin ? ouvirAbertas(api, (l) => setAguardando(l.length)) : setAguardando(0)), [phase, api, isAdmin]);
  useEffect(() => (phase === 'ready' && api ? ouvirFeriados(api, setFeriados) : undefined), [phase, api]);

  // "Salvando…" só aparece se a gravação demorar
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const setPendencia = useCallback((p: Pendencia) => {
    clearTimeout(timer.current);
    if (p.pendente) timer.current = setTimeout(() => setPend(p), 1500);
    else setPend((a) => (a.pendente || a.offline !== p.offline ? p : a));
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const sair = useCallback(() => {
    if (api) void api.authMod.signOut(api.auth);
  }, [api]);

  const ctx = useMemo<ProgCtx | null>(
    () => (api ? { api, por, uid, isAdmin, areas, feriados, entrar: () => setLogin(true), setPendencia } : null),
    [api, por, uid, isAdmin, areas, feriados, setPendencia],
  );

  const menu = { label: 'Voltar ao menu de apps', onClick: () => window.location.assign('../') };
  if (phase === 'auth-off')
    return (
      <Splash
        title="Programação"
        text="O acesso sem login está desativado no Firebase. Um administrador precisa ativar em Authentication → Sign-in method → Anônimo."
        action={{ label: 'Tentar de novo', onClick: () => window.location.reload() }}
        secondary={menu}
      />
    );
  if (phase === 'fail')
    return (
      <Splash
        title="Programação"
        text="Sem conexão com a nuvem. Na primeira vez neste aparelho é preciso internet."
        action={{ label: 'Tentar de novo', onClick: () => window.location.reload() }}
        secondary={menu}
      />
    );
  if (phase !== 'ready' || !ctx) return <Splash title="Programação" text="Conectando…" />;
  if (login && api)
    return <AuthScreen api={api} titulo="Programação da Vulcanização" onVoltar={() => setLogin(false)} voltarLabel="‹ Voltar sem entrar" />;

  const status = !online
    ? { cls: 'offline', short: 'Offline', long: 'Sem internet: o que for lançado fica neste aparelho e é enviado quando a conexão voltar.' }
    : pend.pendente
      ? { cls: 'saving', short: 'Salvando…', long: 'Enviando alterações para a nuvem…' }
      : { cls: 'ok', short: 'Sincronizado', long: 'Sincronizado: todos veem a mesma programação.' };

  const telas = TELAS.filter((t) => !t.admin || isAdmin);
  const atual = telas.some((t) => t.id === tela) ? tela : 'central';
  const ir = (t: Tela) => (window.location.hash = `#/${t}`);

  return (
    <Ctx.Provider value={ctx}>
      <Header
        kicker="Efetivo · Vulcanização AMT"
        title="Programação"
        status={status}
        acoes={
          <>
            {isAdmin && (
              <a className="hdr-btn sino" href="#/programar" title={`${aguardando} solicitação(ões) aguardando programação`} aria-label={`${aguardando} solicitações aguardando`}>
                🔔{aguardando > 0 && <span className="sino-n num">{aguardando}</span>}
              </a>
            )}
            {logado ? (
              <button className="hdr-btn" onClick={sair} title={`Sair (${por})`} aria-label="Sair da conta">
                ⏻
              </button>
            ) : (
              <button className="hdr-btn entrar" onClick={() => setLogin(true)} title="Entrar (administradores)" aria-label="Entrar (administradores)">
                Entrar
              </button>
            )}
          </>
        }
      >
        <nav className="tabs prog-tabs" aria-label="Seções">
          {telas.map((t) => (
            <button key={t.id} className={'tab' + (atual === t.id ? ' on' : '')} aria-current={atual === t.id ? 'page' : undefined} onClick={() => ir(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </Header>
      <div className={'prog-layout' + (atual === 'central' ? ' tela-central' : '')}>
        <aside className="prog-lateral" aria-label="Menu">
          {telas.map((t) => (
            <button key={t.id} className={'lat-item' + (atual === t.id ? ' on' : '')} aria-current={atual === t.id ? 'page' : undefined} onClick={() => ir(t.id)}>
              <span aria-hidden>{t.ico}</span> {t.label}
              {t.id === 'programar' && aguardando > 0 && <span className="badge pend num">{aguardando}</span>}
            </button>
          ))}
          {logado && <div className="lat-user small">👤 {por}</div>}
        </aside>
        <main className={atual === 'central' ? 'prog-main larga' : 'prog-main container'}>
          {logado && !isAdmin && (
            <div className="banner warn">{por} não é administrador da programação: você pode ver e solicitar, mas não programar.</div>
          )}
          {atual === 'central' && <Central />}
          {atual === 'painel' && <Painel />}
          {atual === 'solicitar' && <Solicitar />}
          {atual === 'programar' && <Programar />}
          {atual === 'paradas' && <Paradas />}
          {atual === 'oms' && <Oms />}
          {atual === 'dashboard' && <Dashboard />}
        </main>
      </div>
    </Ctx.Provider>
  );
}
