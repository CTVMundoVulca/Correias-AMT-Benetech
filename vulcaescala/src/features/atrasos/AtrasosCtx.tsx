import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FirebaseApi } from '../../cloud/firebase';
import { MOTIVOS_PADRAO, ouvirAtrasosSemana, ouvirMotivos, type Atraso } from '../../cloud/atrasos';

/** Acesso ao registro de atrasos (só existe com a nuvem ligada). */
export interface AtrasosApi {
  api: FirebaseApi;
  /** sessão deste aparelho (corrige/exclui os atrasos que registrou) */
  uid: string;
  isAdmin: boolean;
  /** e-mail de quem está logado ou "anônimo" */
  por: string;
}

const Ctx = createContext<AtrasosApi | null>(null);

export function AtrasosProvider({ value, children }: { value: AtrasosApi | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAtrasosApi = () => useContext(Ctx);

/** Pode corrigir/excluir? quem registrou (mesma sessão) ou administrador (a regra confere de novo). */
export const podeAlterar = (c: AtrasosApi, a: Atraso) => c.isAdmin || (!!a.criadoUid && a.criadoUid === c.uid);

/** Atrasos da semana; null = carregando. */
export function useAtrasosSemana(semana: string): Atraso[] | null {
  const c = useAtrasosApi();
  const [l, setL] = useState<Atraso[] | null>(null);
  useEffect(() => {
    if (!c) return;
    setL(null);
    return ouvirAtrasosSemana(c.api, semana, setL, () => setL([]));
  }, [c, semana]);
  return c ? l : [];
}

export function useMotivos(): string[] {
  const c = useAtrasosApi();
  const [l, setL] = useState<string[]>(MOTIVOS_PADRAO);
  useEffect(() => (c ? ouvirMotivos(c.api, setL) : undefined), [c]);
  return l;
}

/** Uma leitura por semana, compartilhada por todas as atividades da tela. */
const SemanaCtx = createContext<Atraso[] | null>(null);

export function AtrasosDaSemana({ semana, children }: { semana: string; children: ReactNode }) {
  const l = useAtrasosSemana(semana);
  return <SemanaCtx.Provider value={l}>{children}</SemanaCtx.Provider>;
}

export function useAtrasosDaAtividade(diaId: string, atividadeId: string): Atraso[] {
  const l = useContext(SemanaCtx) ?? [];
  return l.filter((a) => a.diaId === diaId && a.atividadeId === atividadeId);
}
