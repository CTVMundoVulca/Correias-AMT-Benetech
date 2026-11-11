import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useEmenda } from './context';
import { gravarListas } from './data';
import type { Listas } from './model';

const ABAS: { id: keyof Listas; label: string }[] = [
  { id: 'materiaisEmenda', label: 'Materiais da emenda' },
  { id: 'materiaisManta', label: 'Materiais da manta' },
  { id: 'fabricantes', label: 'Fabricantes' },
  { id: 'equipamentos', label: 'Aparelhos de medição' },
];

/** Gerenciar as listas do relatório: materiais (3 e 3.1), fabricantes e aparelhos de medição (4). */
export function ListasDialog({ onClose, inicial = 'materiaisEmenda' }: { onClose: () => void; inicial?: keyof Listas }) {
  const { api, listas } = useEmenda();
  const toast = useToast();
  const [aba, setAba] = useState<keyof Listas>(inicial);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [novo, setNovo] = useState('');

  const salvar = (l: Listas, msg: string) =>
    gravarListas(api, l)
      .then(() => toast(msg))
      .catch(() => toast('Não foi possível salvar a lista.', 'danger'));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = novo.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!v) return;
    if (listas[aba].includes(v)) return toast('Já está na lista.', 'warn');
    void salvar({ ...listas, [aba]: [...listas[aba], v] }, 'Adicionado');
    setNovo('');
  };
  const renomear = (e: FormEvent) => {
    e.preventDefault();
    const v = texto.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!v || !editando) return;
    if (v !== editando && listas[aba].includes(v)) return toast('Já está na lista.', 'warn');
    void salvar({ ...listas, [aba]: listas[aba].map((x) => (x === editando ? v : x)) }, 'Atualizado');
    setEditando(null);
  };
  const remove = (v: string) => {
    if (listas[aba].length <= 1) return toast('A lista precisa ter pelo menos um item.', 'warn');
    void salvar({ ...listas, [aba]: listas[aba].filter((x) => x !== v) }, 'Removido');
  };

  return (
    <Modal
      title="Listas do relatório"
      subtitle="Materiais, fabricantes e aparelhos de medição"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <div className="segmented" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} className={'seg' + (aba === a.id ? ' on' : '')} onClick={() => (setAba(a.id), setEditando(null))}>
            {a.label}
          </button>
        ))}
      </div>
      <form className="row nowrap" onSubmit={add}>
        <input className="input grow" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item" aria-label="Novo item" />
        <button className="btn primary" type="submit" disabled={!novo.trim()}>
          Adicionar
        </button>
      </form>
      <ul className="plain-list funcao-list">
        {listas[aba].map((v) =>
          editando === v ? (
            <li key={v}>
              <form className="row nowrap grow" onSubmit={renomear}>
                <input className="input grow" value={texto} autoFocus onChange={(e) => setTexto(e.target.value)} aria-label={`Editar ${v}`} />
                <button className="btn small" type="button" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button className="btn small primary" type="submit" disabled={!texto.trim()}>
                  Salvar
                </button>
              </form>
            </li>
          ) : (
            <li key={v}>
              <span className="grow">{v}</span>
              <button
                className="btn small"
                onClick={() => {
                  setEditando(v);
                  setTexto(v);
                }}
                aria-label={`Editar ${v}`}
              >
                Editar
              </button>
              <button className="btn small ghost-danger" onClick={() => remove(v)} aria-label={`Remover ${v}`}>
                Remover
              </button>
            </li>
          ),
        )}
      </ul>
    </Modal>
  );
}
