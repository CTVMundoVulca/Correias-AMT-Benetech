import { createContext, useContext } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import type { Checklist, Operador } from './model';
import type { Manutencao } from './manutencao';

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
  /** situação da leitura dos operadores: diagnóstico quando a lista não aparece */
  operadoresFonte: 'carregando' | 'nuvem' | 'cache' | 'erro';
  operadoresErro: string;
  /** checklists dos últimos dias (mais recentes primeiro) */
  checklists: Checklist[] | null;
  /** checklists excluídos pelo administrador (histórico de exclusão) */
  excluidos: Checklist[];
  /** há checklist deste aparelho ainda não recebido pela nuvem */
  pendente: boolean;
  hoje: string;
  /** manutenções (mais recentes primeiro), sem as excluídas; null = carregando */
  manutencoes: Manutencao[] | null;
  /** excluídas pelo administrador (histórico de exclusão) */
  manutExcluidas: Manutencao[];
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
