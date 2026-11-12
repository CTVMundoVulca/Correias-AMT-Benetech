import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import { ouvirMeses, ouvirOms, ouvirParadas, ouvirRetornos, type Pendencia } from './data';
import { situacaoEfetiva, type Area, type Atividade, type OmInfo, type Parada, type Permissoes, type Retorno } from './model';

export interface ProgCtx {
  api: FirebaseApi;
  /** e-mail de quem está logado ou "anônimo" */
  por: string;
  uid: string;
  /** o que este usuário pode fazer na Gestão (papel cadastrado pelo administrador) */
  pode: Permissoes;
  /** está na área de Gestão (back-end) e não no Painel público */
  gestao: boolean;
  areas: Area[];
  /** feriados municipais (Vitória) da escala; os nacionais são calculados */
  feriados: Record<string, string>;
  /** abre a tela de login (administradores) */
  entrar: () => void;
  /** informa ao cabeçalho se há gravações pendentes */
  setPendencia: (p: Pendencia) => void;
}

export const Ctx = createContext<ProgCtx | null>(null);

export function useProg(): ProgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProg fora do ProgApp');
  return c;
}

/** Atividades dos meses pedidos (atualiza ao vivo). `null` = carregando. */
export function useAtividades(meses: string[]): Atividade[] | null {
  const { api, setPendencia } = useProg();
  const chave = meses.join(',');
  const [l, setL] = useState<Atividade[] | null>(null);
  useEffect(() => {
    setL(null);
    const ms = chave ? chave.split(',') : [];
    return ouvirMeses(api, ms, (lista, p, n) => {
      if (n >= ms.length) setL(lista);
      setPendencia(p);
    });
  }, [api, chave, setPendencia]);
  return l;
}

/**
 * OMs do ano atual e do anterior, com o retorno do supervisor aplicado (situação que vale).
 * Só a Gestão lê as OMs; no Painel público devolve null.
 */
export function useOms(anosExtras: string[] = []): Map<string, OmInfo> | null {
  const { api, pode } = useProg();
  const pode0 = pode.programar || pode.retorno;
  const ano = new Date().getFullYear();
  const chave = [...new Set([String(ano - 1), String(ano), ...anosExtras])].sort().join(',');
  const [oms, setOms] = useState<Map<string, OmInfo> | null>(null);
  const [ret, setRet] = useState<Map<string, Retorno>>(new Map());
  useEffect(() => {
    if (!pode0) {
      setOms(null);
      return;
    }
    const u1 = ouvirOms(api, chave.split(','), (x) => setOms(x));
    const u2 = ouvirRetornos(api, chave.split(','), setRet);
    return () => {
      u1();
      u2();
    };
  }, [api, chave, pode0]);
  return useMemo(() => (oms ? new Map([...oms].map(([k, o]) => [k, situacaoEfetiva(o, ret.get(k))])) : null), [oms, ret]);
}

export const useAreasNomes = () => {
  const { areas } = useProg();
  return useMemo(() => areas.map((a) => a.nome), [areas]);
};

export const irPara = (hash: string) => {
  window.location.hash = hash;
};

/** Paradas confirmadas do ano anterior, atual e seguinte (todos veem). */
export function useParadas(): Parada[] {
  const { api } = useProg();
  const ano = new Date().getFullYear();
  const [l, setL] = useState<Parada[]>([]);
  useEffect(() => ouvirParadas(api, [String(ano - 1), String(ano), String(ano + 1)], setL), [api, ano]);
  return l;
}
