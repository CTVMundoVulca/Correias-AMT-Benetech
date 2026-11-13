import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../ui/Header';
import { loadFirebase, type FirebaseApi } from '../cloud/firebase';
import { AuthScreen, Splash } from '../cloud/AuthScreens';
import { souAdmin } from '../emenda/data';
import { Ctx, type ProgCtx } from './context';
import { ouvirAbertas, ouvirAreas, ouvirFeriados, ouvirPapeis, ouvirPedidosParada, type Pendencia } from './data';
import { AREAS_PADRAO, PAPEIS_VAZIOS, permissoes, type Area, type Papeis } from './model';
import { Painel } from './Painel';
import { Solicitar } from './Solicitar';
import { Programar } from './Programar';
import { Oms } from './Oms';
import { Dashboard } from './Dashboard';
import { Central } from './Central';
import { ParadasGestao, ParadasPainel } from './Paradas';
import { Equipe } from './Equipe';

type Phase = 'sdk' | 'fail' | 'auth-off' | 'ready';
type Papel = 'programar' | 'retorno' | 'administrar';
interface TelaDef {
  id: string;
  label: string;
  ico: string;
  /** algum destes papéis vê a tela (só na Gestão) */
  papeis?: Papel[];
}

/** FRONT-END: Painel público (as áreas consultam, pedem serviço e informam paradas). */
const PAINEL: TelaDef[] = [
  { id: 'central', label: 'Central', ico: '🏠' },
  { id: 'painel', label: 'Dia a dia', ico: '📍' },
  { id: 'paradas', label: 'Paradas', ico: '⛔' },
  { id: 'solicitar', label: 'Solicitar', ico: '➕' },
  { id: 'dashboard', label: 'Relatórios', ico: '📊' },
];
/** Link exclusivo das áreas do cliente (ArcelorMittal): só o que interessa a quem pede serviço. */
const TELAS_AREAS = ['central', 'painel', 'paradas', 'solicitar', 'dashboard'];
/** BACK-END: Gestão (login + papel). */
const GESTAO: TelaDef[] = [
  { id: 'programar', label: 'Programação', ico: '🗓', papeis: ['programar'] },
  { id: 'paradas', label: 'Paradas', ico: '⛔', papeis: ['programar'] },
  { id: 'oms', label: 'OMs', ico: '🧾', papeis: ['programar', 'retorno'] },
  { id: 'equipe', label: 'Equipe e papéis', ico: '👥', papeis: ['administrar'] },
];

function lerRota(): { gestao: boolean; tela: string } {
  const g = /^#\/g(?:\/(\w+))?/.exec(window.location.hash);
  if (g) return { gestao: true, tela: g[1] ?? '' };
  const m = /^#\/(\w+)/.exec(window.location.hash);
  return { gestao: false, tela: m?.[1] ?? 'central' };
}

/**
 * Programação da Vulcanização — um link só:
 *  PAINEL (front-end): qualquer pessoa com o link vê a programação, o efetivo, as paradas
 *  confirmadas, a fila de solicitações e os relatórios; pede serviço e informa paradas.
 *  GESTÃO (back-end, botão "Gestão" + login): programador, supervisor e administrador,
 *  cada um com o que o seu papel permite (as regras do Firestore conferem de novo).
 */
export function ProgApp({ linkAreas = false }: { linkAreas?: boolean } = {}) {
  const [api, setApi] = useState<FirebaseApi | null>(null);
  const [phase, setPhase] = useState<Phase>('sdk');
  const [por, setPor] = useState('anônimo');
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState('');
  const [adminEscala, setAdminEscala] = useState(false);
  const [papeis, setPapeis] = useState<Papeis>(PAPEIS_VAZIOS);
  const [login, setLogin] = useState(false);
  const [areas, setAreas] = useState<Area[]>(AREAS_PADRAO);
  const [feriados, setFeriados] = useState<Record<string, string>>({});
  const [rota0, setRota] = useState(lerRota);
  // link das áreas: nunca entra na Gestão
  const rota = linkAreas ? { ...rota0, gestao: false } : rota0;
  const [pend, setPend] = useState<Pendencia>({ pendente: false, offline: false });
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onHash = () => {
      setRota(lerRota());
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

  // SDK + sessão (conta da equipe, se já entrou; senão anônima)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancel = false;
    loadFirebase()
      .then((fb) => {
        if (cancel) return;
        setApi(fb);
        unsub = fb.authMod.onAuthStateChanged(fb.auth, (u) => {
          if (!u) {
            setAdminEscala(false);
            setEmail(null);
            fb.authMod.signInAnonymously(fb.auth).catch((e: { code?: string }) =>
              setPhase(e?.code === 'auth/admin-restricted-operation' || e?.code === 'auth/operation-not-allowed' ? 'auth-off' : 'fail'),
            );
            return;
          }
          setPor(u.email ?? 'anônimo');
          setEmail(u.isAnonymous ? null : (u.email ?? null));
          setUid(u.uid);
          setPhase('ready');
          if (u.isAnonymous) setAdminEscala(false);
          else
            void souAdmin(fb).then((a) => {
              setAdminEscala(a);
              setLogin(false);
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
  useEffect(() => (phase === 'ready' && api ? ouvirFeriados(api, setFeriados) : undefined), [phase, api]);
  // papéis: só quem entrou com e-mail lê
  useEffect(() => {
    if (phase !== 'ready' || !api || !email) {
      setPapeis(PAPEIS_VAZIOS);
      return;
    }
    return ouvirPapeis(api, setPapeis);
  }, [phase, api, email]);
  const pode = useMemo(() => permissoes(email, papeis, adminEscala), [email, papeis, adminEscala]);

  // sino da gestão: solicitações e paradas aguardando a programação
  const [aguardando, setAguardando] = useState({ solic: 0, paradas: 0 });
  useEffect(() => {
    if (phase !== 'ready' || !api || !pode.programar) {
      setAguardando({ solic: 0, paradas: 0 });
      return;
    }
    const u1 = ouvirAbertas(api, (l) => setAguardando((a) => ({ ...a, solic: l.length })));
    const desde = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const u2 = ouvirPedidosParada(api, desde, (l) => setAguardando((a) => ({ ...a, paradas: l.filter((p) => p.status === 'pendente').length })));
    return () => {
      u1();
      u2();
    };
  }, [phase, api, pode.programar]);

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
    window.location.hash = '#/central';
  }, [api]);

  const ctx = useMemo<ProgCtx | null>(
    () => (api ? { api, por, uid, pode, gestao: rota.gestao, linkAreas, areas, feriados, entrar: () => setLogin(true), setPendencia } : null),
    [api, por, uid, pode, rota.gestao, linkAreas, areas, feriados, setPendencia],
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
  // Gestão sem login: pede o login da equipe
  if (api && (login || (rota.gestao && !email)))
    return (
      <AuthScreen
        api={api}
        titulo="Gestão da Programação"
        onVoltar={() => {
          setLogin(false);
          window.location.hash = '#/central';
        }}
        voltarLabel="‹ Voltar ao Painel"
      />
    );

  const status = !online
    ? { cls: 'offline', short: 'Offline', long: 'Sem internet: o que for lançado fica neste aparelho e é enviado quando a conexão voltar.' }
    : pend.pendente
      ? { cls: 'saving', short: 'Salvando…', long: 'Enviando alterações para a nuvem…' }
      : { cls: 'ok', short: 'Sincronizado', long: 'Sincronizado: todos veem a mesma programação.' };

  const telas = rota.gestao ? GESTAO.filter((t) => t.papeis?.some((p) => pode[p])) : linkAreas ? PAINEL.filter((t) => TELAS_AREAS.includes(t.id)) : PAINEL;
  const atual = telas.find((t) => t.id === rota.tela)?.id ?? telas[0]?.id ?? '';
  const ir = (id: string) => (window.location.hash = rota.gestao ? `#/g/${id}` : `#/${id}`);
  const temGestao = pode.programar || pode.retorno || pode.administrar;
  const totalSino = aguardando.solic + aguardando.paradas;

  return (
    <Ctx.Provider value={ctx}>
      <Header
        kicker={rota.gestao ? 'Gestão · Vulcanização AMT' : linkAreas ? 'Vulcanização · Contrato AMT' : 'Painel · Vulcanização AMT'}
        title={linkAreas ? 'Programação e solicitações' : 'Programação'}
        semPortal={linkAreas}
        status={status}
        acoes={
          <>
            {rota.gestao && pode.programar && (
              <a className="hdr-btn sino" href="#/g/programar" title={`${aguardando.solic} solicitação(ões) e ${aguardando.paradas} parada(s) aguardando`} aria-label={`${totalSino} itens aguardando`}>
                🔔{totalSino > 0 && <span className="sino-n num">{totalSino}</span>}
              </a>
            )}
            {linkAreas ? null : rota.gestao ? (
              <a className="hdr-btn modo" href="#/central" title="Voltar ao Painel (visão das áreas)">
                👁 Painel
              </a>
            ) : (
              <a className="hdr-btn modo" href="#/g" title="Gestão: programador, supervisor e administrador">
                ⚙ Gestão
              </a>
            )}
            {email && (
              <button className="hdr-btn" onClick={sair} title={`Sair (${email})`} aria-label="Sair da conta">
                ⏻
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
      {rota.gestao && <div className="faixa-gestao">⚙ GESTÃO — {email} · {papeisTexto(pode)}</div>}
      <div className={'prog-layout' + (atual === 'central' && !rota.gestao ? ' tela-central' : '') + (rota.gestao ? ' modo-gestao' : '')}>
        <aside className="prog-lateral" aria-label="Menu">
          {telas.map((t) => (
            <button key={t.id} className={'lat-item' + (atual === t.id ? ' on' : '')} aria-current={atual === t.id ? 'page' : undefined} onClick={() => ir(t.id)}>
              <span aria-hidden>{t.ico}</span> {t.label}
              {rota.gestao && t.id === 'programar' && aguardando.solic > 0 && <span className="badge pend num">{aguardando.solic}</span>}
              {rota.gestao && t.id === 'paradas' && aguardando.paradas > 0 && <span className="badge pend num">{aguardando.paradas}</span>}
            </button>
          ))}
          {!linkAreas && (
            <a className="lat-item lat-troca" href={rota.gestao ? '#/central' : '#/g'}>
              <span aria-hidden>{rota.gestao ? '👁' : '⚙'}</span> {rota.gestao ? 'Voltar ao Painel' : 'Gestão'}
            </a>
          )}
          {email && <div className="lat-user small">👤 {email}</div>}
        </aside>
        <main className={atual === 'central' && !rota.gestao ? 'prog-main larga' : 'prog-main container'}>
          {rota.gestao && !temGestao ? (
            <div className="card pad stack">
              <h2>Sem acesso à Gestão</h2>
              <p>
                O e-mail <b>{email}</b> ainda não tem papel na Gestão da Programação. Peça a um administrador para cadastrá-lo como programador ou
                supervisor em <b>Gestão → Equipe e papéis</b>.
              </p>
              <a className="btn" href="#/central">
                Voltar ao Painel
              </a>
            </div>
          ) : rota.gestao ? (
            <>
              {atual === 'programar' && <Programar />}
              {atual === 'paradas' && <ParadasGestao />}
              {atual === 'oms' && <Oms />}
              {atual === 'equipe' && <Equipe />}
            </>
          ) : (
            <>
              {atual === 'central' && <Central />}
              {atual === 'painel' && <Painel />}
              {atual === 'paradas' && <ParadasPainel />}
              {atual === 'solicitar' && <Solicitar />}
              {atual === 'dashboard' && <Dashboard />}
            </>
          )}
        </main>
      </div>
    </Ctx.Provider>
  );
}

function papeisTexto(p: { programar: boolean; retorno: boolean; administrar: boolean }): string {
  if (p.administrar) return 'administrador';
  const l = [p.programar && 'programador', p.retorno && 'supervisor'].filter(Boolean);
  return l.length ? l.join(' e ') : 'sem papel';
}
