import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'warn' | 'danger';
type ToastFn = (text: string, kind?: Kind) => void;

const Ctx = createContext<ToastFn>(() => {});

/** Mensagem curta após cada ação. Uma por vez: a nova substitui a anterior. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; kind: Kind; n: number } | null>(null);
  const timer = useRef<number>();

  const show = useCallback<ToastFn>((text, kind = 'ok') => {
    setToast((t) => ({ text, kind, n: (t?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer.current);
  }, [toast]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.n} className={`toast toast-${toast.kind}`} onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(Ctx);
}
