import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Exige digitar este texto para habilitar a confirmação (ações irreversíveis). */
  requireText?: string;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

/** Substitui window.confirm(): `if (await confirm({...})) …` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setReq({ ...o, resolve });
      }),
    [],
  );

  const close = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  const blocked = !!req?.requireText && typed.trim().toUpperCase() !== req.requireText.toUpperCase();

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <Modal
          title={req.title}
          onClose={() => close(false)}
          size="small"
          footer={
            <>
              <button className="btn" onClick={() => close(false)} data-autofocus={req.requireText ? undefined : true}>
                {req.cancelLabel ?? 'Cancelar'}
              </button>
              <button className={'btn ' + (req.danger ? 'danger' : 'primary')} disabled={blocked} onClick={() => close(true)}>
                {req.confirmLabel ?? 'Confirmar'}
              </button>
            </>
          }
        >
          <div>{req.message}</div>
          {req.requireText && (
            <label className="field">
              Digite {req.requireText} para confirmar
              <input
                className="input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                data-autofocus
                autoComplete="off"
                onKeyDown={(e) => e.key === 'Enter' && !blocked && close(true)}
              />
            </label>
          )}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(Ctx);
}
