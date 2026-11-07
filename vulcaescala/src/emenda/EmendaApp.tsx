import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../ui/Header';
import { loadFirebase, type FirebaseApi } from '../cloud/firebase';
import { Splash } from '../cloud/AuthScreens';
import type { Worker } from '../domain/types';
import { Ctx, type EmendaCtx } from './context';
import { ouvirEfetivo, ouvirListas, souAdmin } from './data';
import { LISTAS_PADRAO, type Listas } from './model';
import { EmendaLista } from './EmendaLista';
import { EmendaEditor } from './EmendaEditor';
import { Relatorio } from './Relatorio';

type Phase = 'sdk' | 'fail' | 'ready';
type Rota = { tela: 'lista' } | { tela: 'editor'; id: string } | { tela: 'relatorio'; id: string };

function lerRota(): Rota {
  const m = /^#\/(e|r)\/([\w-]+)$/.exec(window.location.hash);
  if (!m) return { tela: 'lista' };
  return m[1] === 'e' ? { tela: 'editor', id: m[2] } : { tela: 'relatorio', id: m[2] };
}

/**
 * Registro de Emenda — qualquer pessoa com o link usa (sem tela de login).
 * Por trás, o Firebase abre uma sessão anônima automática: as regras só aceitam
 * gravações vindas do app. Quem já entrou na escala (liderança) continua com a
 * própria conta — e, se for administrador, pode excluir relatórios.
 */
export function EmendaApp() {
  const [api, setApi] = useState<FirebaseApi | null>(null);
  const [phase, setPhase] = useState<Phase>('sdk');
  const [por, setPor] = useState('anônimo');
  const [isAdmin, setIsAdmin] = useState(false);
  const [efetivo, setEfetivo] = useState<Worker[]>([]);
  const [listas, setListas] = useState<Listas>(LISTAS_PADRAO);
  const [rota, setRota] = useState<Rota>(lerRota);
  const [pend, setPend] = useState({ pendente: false, offline: false });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [tentativa, setTentativa] = useState(0);

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

  // SDK + sessão (conta da liderança, se já entrou; senão anônima)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancel = false;
    setPhase('sdk');
    loadFirebase()
      .then((fb) => {
        if (cancel) return;
        setApi(fb);
        unsub = fb.authMod.onAuthStateChanged(fb.auth, (u) => {
          if (!u) {
            fb.authMod.signInAnonymously(fb.auth).catch(() => setPhase('fail'));
            return;
          }
          setPor(u.email ?? 'anônimo');
          setPhase('ready');
          void souAdmin(fb).then(setIsAdmin);
        });
      })
      .catch(() => !cancel && setPhase('fail'));
    return () => {
      cancel = true;
      unsub?.();
    };
  }, [tentativa]);

  // dados compartilhados: efetivo (cadastro da escala) e listas de materiais
  useEffect(() => {
    if (phase !== 'ready' || !api) return;
    const u1 = ouvirEfetivo(api, setEfetivo, () => setEfetivo([]));
    const u2 = ouvirListas(api, setListas);
    return () => {
      u1();
      u2();
    };
  }, [phase, api]);

  const setPendencia = useCallback((pendente: boolean, offline: boolean) => setPend({ pendente, offline }), []);

  const ctx = useMemo<EmendaCtx | null>(
    () => (api ? { api, por, isAdmin, efetivo, listas, setPendencia } : null),
    [api, por, isAdmin, efetivo, listas, setPendencia],
  );

  if (phase === 'fail')
    return (
      <Splash
        title="Registro de Emenda"
        text="Sem conexão com a nuvem. Na primeira vez neste aparelho é preciso internet."
        action={{ label: 'Tentar de novo', onClick: () => setTentativa((n) => n + 1) }}
      />
    );
  if (phase !== 'ready' || !ctx) return <Splash title="Registro de Emenda" text="Conectando…" />;

  const status = !online
    ? { cls: 'offline', short: 'Offline', long: 'Sem internet: o que for lançado fica neste aparelho e é enviado quando a conexão voltar.' }
    : pend.pendente
      ? { cls: 'saving', short: 'Salvando…', long: 'Enviando alterações para a nuvem…' }
      : { cls: 'ok', short: 'Sincronizado', long: 'Sincronizado: todos os aparelhos veem os mesmos relatórios.' };

  return (
    <Ctx.Provider value={ctx}>
      {rota.tela !== 'relatorio' && <Header kicker="Registro · AMT" title="Emenda" status={status} />}
      <main className={rota.tela === 'relatorio' ? 'relatorio-wrap' : 'container'}>
        {rota.tela === 'lista' && <EmendaLista />}
        {rota.tela === 'editor' && <EmendaEditor id={rota.id} />}
        {rota.tela === 'relatorio' && <Relatorio id={rota.id} />}
      </main>
    </Ctx.Provider>
  );
}
