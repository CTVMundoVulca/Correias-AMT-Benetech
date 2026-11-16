import { createContext, useContext } from 'react';
import type { FirebaseApi } from '../cloud/firebase';
import type { Funcionario, Listas } from './model';

export interface EmendaCtx {
  api: FirebaseApi;
  /** quem está gravando: e-mail da liderança ou "anônimo" */
  por: string;
  isAdmin: boolean;
  /** liderança logada (membro ou administrador): pode excluir qualquer relatório */
  lideranca: boolean;
  /** sessão deste aparelho (exclui os relatórios que criou) */
  uid: string;
  /** lista de colaboradores da emenda (separada do efetivo da escala) */
  efetivo: Funcionario[];
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

/** Este aparelho pode excluir o relatório? (a regra do Firestore confere de novo) */
export const podeExcluir = (c: Pick<EmendaCtx, 'lideranca' | 'uid'>, e: { criadoUid?: string; concluidoEm?: string }) =>
  c.lideranca || (!e.concluidoEm && !!e.criadoUid && e.criadoUid === c.uid);

/** Este aparelho pode reabrir o relatório concluído? (quem concluiu ou a liderança) */
export const podeReabrir = (c: Pick<EmendaCtx, 'lideranca' | 'uid'>, e: { concluidoUid?: string }) =>
  c.lideranca || (!!e.concluidoUid && e.concluidoUid === c.uid);

export const irPara = (hash: string) => {
  window.location.hash = hash;
};
