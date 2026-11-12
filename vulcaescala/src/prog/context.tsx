import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import { ouvirMeses, ouvirOms, ouvirParadas, type Pendencia } from './data';
import type { Area, Atividade, OmInfo, Parada } from './model';

export interface ProgCtx {
  api: FirebaseApi;
  /** e-mail de quem está logado ou "anônimo" */
  por: string;
  uid: string;
  isAdmin: boolean;
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

/** OMs do ano atual e do anterior (uma OM fica no ano da primeira programação). */
export function useOms(anosExtras: string[] = []): Map<string, OmInfo> | null {
  const { api } = useProg();
  const ano = new Date().getFullYear();
  const chave = [...new Set([String(ano - 1), String(ano), ...anosExtras])].sort().join(',');
  const [m, setM] = useState<Map<string, OmInfo> | null>(null);
  useEffect(() => ouvirOms(api, chave.split(','), (x) => setM(x)), [api, chave]);
  return m;
}

export const useAreasNomes = () => {
  const { areas } = useProg();
  return useMemo(() => areas.map((a) => a.nome), [areas]);
};

export const irPara = (hash: string) => {
  window.location.hash = hash;
};

/** Paradas do ano atual e do seguinte (para o calendário de dezembro/janeiro). */
export function useParadas(): Parada[] {
  const { api } = useProg();
  const ano = new Date().getFullYear();
  const [l, setL] = useState<Parada[]>([]);
  useEffect(() => ouvirParadas(api, [String(ano - 1), String(ano), String(ano + 1)], setL), [api, ano]);
  return l;
}
