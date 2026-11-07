import { createContext, useContext } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import type { Worker } from '../domain/types';
import type { Listas } from './model';

export interface EmendaCtx {
  api: FirebaseApi;
  /** quem está gravando: e-mail da liderança ou "anônimo" */
  por: string;
  isAdmin: boolean;
  efetivo: Worker[];
  listas: Listas;
  /** informa ao cabeçalho se há gravações pendentes / sem conexão */
  setPendencia: (pendente: boolean, offline: boolean) => void;
}

export const Ctx = createContext<EmendaCtx | null>(null);

export function useEmenda(): EmendaCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEmenda fora do EmendaApp');
  return c;
}

export const irPara = (hash: string) => {
  window.location.hash = hash;
};
