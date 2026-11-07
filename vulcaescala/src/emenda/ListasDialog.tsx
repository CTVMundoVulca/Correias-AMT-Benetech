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
];

/** Gerenciar as listas usadas nas seções 3 e 3.1 (compartilhadas por todos os aparelhos). */
export function ListasDialog({ onClose }: { onClose: () => void }) {
  const { api, listas } = useEmenda();
  const toast = useToast();
  const [aba, setAba] = useState<keyof Listas>('materiaisEmenda');
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
  const remove = (v: string) => {
    if (listas[aba].length <= 1) return toast('A lista precisa ter pelo menos um item.', 'warn');
    void salvar({ ...listas, [aba]: listas[aba].filter((x) => x !== v) }, 'Removido');
  };

  return (
    <Modal
      title="Materiais e fabricantes"
      subtitle="Listas usadas no relatório"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <div className="segmented" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} className={'seg' + (aba === a.id ? ' on' : '')} onClick={() => setAba(a.id)}>
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
        {listas[aba].map((v) => (
          <li key={v}>
            <span>{v}</span>
            <button className="btn small ghost-danger" onClick={() => remove(v)} aria-label={`Remover ${v}`}>
              Remover
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
