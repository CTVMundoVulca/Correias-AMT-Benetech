import { useEffect, useRef, useState } from 'react';

/** Assinatura no dedo. Grava uma imagem pequena (400×100, JPEG) para caber no relatório. */
export function SignaturePad({ value, onChange, label }: { value: string; onChange: (dataUrl: string) => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(!value);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    if (!desenhando) return;
    const c = canvas.current!;
    c.width = 800;
    c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#001a33';
    let ativo = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
    };
    const down = (e: PointerEvent) => {
      ativo = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!ativo) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setVazio(false);
      e.preventDefault();
    };
    const up = () => (ativo = false);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, [desenhando]);

  const confirmar = () => {
    const tmp = document.createElement('canvas');
    tmp.width = 400;
    tmp.height = 100;
    tmp.getContext('2d')!.drawImage(canvas.current!, 0, 0, 400, 100);
    onChange(tmp.toDataURL('image/jpeg', 0.7));
    setDesenhando(false);
  };

  if (!desenhando)
    return (
      <div className="sig-done">
        <img src={value} alt={`Assinatura — ${label}`} />
        <button className="btn small" onClick={() => setDesenhando(true)}>
          Refazer assinatura
        </button>
      </div>
    );

  return (
    <div className="stack">
      <div className="sig-box">
        <canvas ref={canvas} aria-label={`Área de assinatura — ${label}`} />
        {vazio && <span className="sig-ph">Assine aqui</span>}
      </div>
      <div className="row">
        <button className="btn small" onClick={() => setDesenhando(false)} hidden={!value}>
          Cancelar
        </button>
        <button
          className="btn small"
          onClick={() => {
            setDesenhando(false);
            setTimeout(() => setDesenhando(true));
            setVazio(true);
          }}
        >
          Limpar
        </button>
        <button className="btn small primary" onClick={confirmar} disabled={vazio}>
          Confirmar assinatura
        </button>
      </div>
    </div>
  );
}
