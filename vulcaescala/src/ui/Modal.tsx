import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `small`: caixa compacta centralizada (confirmações), mesmo no celular. */
  size?: 'normal' | 'small';
}

/** Janela modal: tela cheia no celular, centralizada em telas maiores. Esc fecha. */
export function Modal({ title, subtitle, onClose, children, footer, size = 'normal' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      // com um diálogo aberto sobre outro, o Esc fecha só o de cima
      if (e.key === 'Escape' && [...document.querySelectorAll('.modal')].pop() === ref.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div className={'overlay' + (size === 'small' ? ' overlay-small' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (size === 'small' ? ' modal-small' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <div className="modal-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
