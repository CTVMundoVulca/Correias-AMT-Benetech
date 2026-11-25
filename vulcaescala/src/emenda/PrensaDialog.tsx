import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useEmenda } from './context';
import { gravarPrensa } from './data';
import type { EquipPrensa } from './model';

const ABAS: { id: keyof EquipPrensa; label: string }[] = [
  { id: 'paineis', label: 'Painéis' },
  { id: 'bombas', label: 'Bombas' },
];

/** Cadastro dos equipamentos da prensa (seção 7): painéis e bombas. Relatórios já feitos não mudam. */
export function PrensaDialog({ onClose, inicial = 'paineis' }: { onClose: () => void; inicial?: keyof EquipPrensa }) {
  const { api, prensa } = useEmenda();
  const toast = useToast();
  const [aba, setAba] = useState<keyof EquipPrensa>(inicial);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const norm = (v: string) => v.replace(/\s+/g, ' ').replace(/,/g, ' ').trim().toUpperCase();

  const salvar = (p: EquipPrensa, msg: string) =>
    gravarPrensa(api, p)
      .then(() => toast(msg))
      .catch(() => toast('Não foi possível salvar o cadastro.', 'danger'));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = norm(novo);
    if (!v) return;
    if (prensa[aba].includes(v)) return toast('Já está cadastrado.', 'warn');
    void salvar({ ...prensa, [aba]: [...prensa[aba], v] }, 'Cadastrado');
    setNovo('');
  };
  const renomear = (e: FormEvent) => {
    e.preventDefault();
    const v = norm(texto);
    if (!v || !editando) return;
    if (v !== editando && prensa[aba].includes(v)) return toast('Já está cadastrado.', 'warn');
    void salvar({ ...prensa, [aba]: prensa[aba].map((x) => (x === editando ? v : x)) }, 'Atualizado');
    setEditando(null);
  };

  return (
    <Modal
      title="Equipamentos da prensa"
      subtitle="Painéis e bombas que aparecem para escolher na seção 7"
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
        <input className="input grow" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={aba === 'paineis' ? 'Ex.: PAINEL SAMPLA 01' : 'Ex.: BOMBA SAMPLA 02'} aria-label="Novo equipamento" />
        <button className="btn primary" type="submit" disabled={!novo.trim()}>
          Adicionar
        </button>
      </form>
      <ul className="plain-list funcao-list">
        {prensa[aba].map((v) =>
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
              <button className="btn small" onClick={() => (setEditando(v), setTexto(v))} aria-label={`Editar ${v}`}>
                Editar
              </button>
              <button className="btn small ghost-danger" onClick={() => void salvar({ ...prensa, [aba]: prensa[aba].filter((x) => x !== v) }, 'Removido')} aria-label={`Remover ${v}`}>
                Remover
              </button>
            </li>
          ),
        )}
      </ul>
      {prensa[aba].length === 0 && <p className="small muted">Nada cadastrado ainda.</p>}
    </Modal>
  );
}
