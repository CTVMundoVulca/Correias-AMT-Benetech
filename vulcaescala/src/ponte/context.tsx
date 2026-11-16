import { createContext, useContext } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import type { Checklist, Operador } from './model';

export interface PonteCtx {
  api: FirebaseApi;
  /** e-mail da sessão ('' = anônima) */
  email: string;
  uid: string;
  /** administrador (cadastra operadores) */
  admin: boolean;
  /** operador logado nesta sessão (fazendo o checklist) */
  operador: Operador | null;
  operadores: Operador[];
  /** checklists dos últimos dias (mais recentes primeiro) */
  checklists: Checklist[] | null;
  /** há checklist deste aparelho ainda não recebido pela nuvem */
  pendente: boolean;
  hoje: string;
}

export const Ctx = createContext<PonteCtx | null>(null);

export function usePonte(): PonteCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePonte fora do PonteApp');
  return c;
}

export const irPara = (hash: string) => {
  window.location.hash = hash;
};
