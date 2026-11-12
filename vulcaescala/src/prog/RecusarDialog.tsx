import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';

/**
 * Recusar um pedido (solicitação de serviço ou parada informada pela área), com o motivo.
 * O motivo aparece para quem pediu. Janela própria do app (o "prompt" do navegador é
 * bloqueado em alguns aparelhos e visualizadores).
 */
export function RecusarDialog({
  titulo,
  resumo,
  onRecusar,
  onClose,
}: {
  titulo: string;
  resumo: React.ReactNode;
  onRecusar: (motivo: string) => void;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;
    onRecusar(motivo.trim().slice(0, 300));
    onClose();
  };
  return (
    <Modal
      title={titulo}
      onClose={onClose}
      size="small"
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="btn ghost-danger" type="submit" form="form-recusa" disabled={!motivo.trim()}>
            Recusar
          </button>
        </>
      }
    >
      <form id="form-recusa" className="stack" onSubmit={enviar}>
        <div className="small">{resumo}</div>
        <label className="field">
          Motivo (aparece para quem pediu)
          <textarea
            className="input"
            rows={3}
            maxLength={300}
            autoFocus
            value={motivo}
            placeholder="Ex.: serviço não é da vulcanização / sem material / pedido duplicado"
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
      </form>
    </Modal>
  );
}
