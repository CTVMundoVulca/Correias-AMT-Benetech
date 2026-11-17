import { useEffect, useMemo, useState } from 'react';
import { Header } from '../ui/Header';
import { loadFirebase, type FirebaseApi } from '../cloud/firebase';
import { AuthScreen, Splash } from '../cloud/AuthScreens';
import { souAdmin } from '../emenda/data';
import { ouvirPapeis } from '../prog/data';
import { PAPEIS_VAZIOS, permissoes, type Papeis } from '../prog/model';
import { Ctx, irPara, type PonteCtx } from './context';
import { ouvirChecklists, ouvirOperadores } from './data';
import { hojeIso, somaDias, type Checklist, type Operador } from './model';
import { Painel } from './Painel';
import { Inspecao } from './Inspecao';
import { Detalhe } from './Detalhe';
import { Gestao } from './Gestao';

type Phase = 'sdk' | 'fail' | 'auth-off' | 'ready';
type Rota = { tela: 'painel' } | { tela: 'inspecao' } | { tela: 'gestao' } | { tela: 'detalhe'; id: string };
/** histórico carregado no painel */
export const HISTORICO_DIAS = 60;

function lerRota(): Rota {
  const h = window.location.hash;
  const m = /^#\/c\/([\w-]+)$/.exec(h);
  if (m) return { tela: 'detalhe', id: m[1] };
  if (h.startsWith('#/inspecao')) return { tela: 'inspecao' };
  if (h.startsWith('#/gestao')) return { tela: 'gestao' };
  return { tela: 'painel' };
}

/**
 * Checklist da ponte rolante — o QR Code na ponte abre o painel (sem login): checklist do dia,
 * quem fez, histórico e operadores habilitados. "Fazer inspeção": o operador treinado escolhe o
 * nome e digita o PIN. "Gestão": administradores cadastram operadores e validade do treinamento.
 */
export function PonteApp() {
  const [api, setApi] = useState<FirebaseApi | null>(null);
  const [phase, setPhase] = useState<Phase>('sdk');
  const [email, setEmail] = useState('');
  const [uid, setUid] = useState('');
  const [adminEscala, setAdminEscala] = useState(false);
  const [papeis, setPapeis] = useState<Papeis>(PAPEIS_VAZIOS);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadoresFonte, setOperadoresFonte] = useState<PonteCtx['operadoresFonte']>('carregando');
  const [operadoresErro, setOperadoresErro] = useState('');
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  const [pendente, setPendente] = useState(false);
  const [rota, setRota] = useState<Rota>(lerRota);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [hoje, setHoje] = useState(hojeIso);

  useEffect(() => {
    const onHash = () => {
      setRota(lerRota());
      window.scrollTo({ top: 0 });
    };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    // o painel fica aberto na oficina: vira o dia sozinho
    const t = setInterval(() => setHoje(hojeIso()), 60_000);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      clearInterval(t);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancel = false;
    loadFirebase()
      .then((fb) => {
        if (cancel) return;
        setApi(fb);
        unsub = fb.authMod.onAuthStateChanged(fb.auth, (u) => {
          if (!u) {
            fb.authMod.signInAnonymously(fb.auth).catch((e: { code?: string }) =>
              setPhase(e?.code === 'auth/admin-restricted-operation' || e?.code === 'auth/operation-not-allowed' ? 'auth-off' : 'fail'),
            );
            return;
          }
          setEmail((u.email ?? '').toLowerCase());
          setUid(u.uid);
          setPhase('ready');
          if (u.email) void souAdmin(fb).then(setAdminEscala);
          else setAdminEscala(false);
        });
      })
      .catch(() => !cancel && setPhase('fail'));
    return () => {
      cancel = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'fail') return;
    const tentar = () => navigator.onLine !== false && window.location.reload();
    window.addEventListener('online', tentar);
    const t = setInterval(tentar, 30_000);
    return () => {
      window.removeEventListener('online', tentar);
      clearInterval(t);
    };
  }, [phase]);

  const desde = useMemo(() => somaDias(hoje, -HISTORICO_DIAS), [hoje]);
  useEffect(() => {
    if (phase !== 'ready' || !api) return;
    const u1 = ouvirOperadores(
      api,
      (l, soCache) => {
        setOperadores(l);
        setOperadoresFonte(soCache ? 'cache' : 'nuvem');
        setOperadoresErro('');
      },
      (e) => {
        setOperadoresFonte('erro');
        setOperadoresErro(String((e as { code?: string })?.code ?? (e as Error)?.message ?? e));
      },
    );
    const u2 = ouvirChecklists(api, desde, (l, p) => {
      setChecklists(l);
      setPendente(p);
    }, () => setChecklists([]));
    const u3 = email ? ouvirPapeis(api, setPapeis) : () => setPapeis(PAPEIS_VAZIOS);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [phase, api, desde, email]);

  const admin = useMemo(() => permissoes(email || null, papeis, adminEscala).administrar, [email, papeis, adminEscala]);
  const operador = useMemo(() => (email ? (operadores.find((o) => o.authEmail === email) ?? null) : null), [email, operadores]);

  const ctx = useMemo<PonteCtx | null>(
    () => (api ? { api, email, uid, admin, operador, operadores, operadoresFonte, operadoresErro, checklists, pendente, hoje } : null),
    [api, email, uid, admin, operador, operadores, operadoresFonte, operadoresErro, checklists, pendente, hoje],
  );

  const menu = { label: 'Voltar ao menu de apps', onClick: () => window.location.assign('../') };
  const titulo = 'Ponte rolante';
  if (phase === 'auth-off')
    return <Splash title={titulo} text="O acesso sem login está desativado no Firebase (Authentication → Sign-in method → Anônimo)." action={{ label: 'Tentar de novo', onClick: () => window.location.reload() }} secondary={menu} />;
  if (phase === 'fail')
    return <Splash title={titulo} text="Sem conexão com a nuvem. Na primeira vez neste aparelho é preciso internet." action={{ label: 'Tentar de novo', onClick: () => window.location.reload() }} secondary={menu} />;
  if (phase !== 'ready' || !ctx || !api) return <Splash title={titulo} text="Conectando…" />;

  // Gestão sem conta de administrador: tela de login (e-mail e senha)
  if (rota.tela === 'gestao' && (!email || operador))
    return <AuthScreen api={api} titulo="Ponte rolante — Gestão" voltarLabel="‹ Voltar ao painel" onVoltar={() => irPara('#/')} />;

  const status = !online
    ? { cls: 'offline', short: 'Offline', long: 'Sem internet: o checklist fica neste aparelho e é enviado quando a conexão voltar.' }
    : pendente
      ? { cls: 'saving', short: 'Enviando…', long: 'Enviando o checklist para a nuvem…' }
      : { cls: 'ok', short: 'Sincronizado', long: 'Sincronizado.' };

  return (
    <Ctx.Provider value={ctx}>
      {rota.tela !== 'detalhe' && <Header kicker="Oficina · AMT" title="Ponte rolante" status={status} />}
      <main className={rota.tela === 'detalhe' ? 'ponte' : 'container ponte'}>
        {rota.tela === 'painel' && <Painel />}
        {rota.tela === 'inspecao' && <Inspecao />}
        {rota.tela === 'gestao' && <Gestao />}
        {rota.tela === 'detalhe' && <Detalhe id={rota.id} />}
      </main>
    </Ctx.Provider>
  );
}
