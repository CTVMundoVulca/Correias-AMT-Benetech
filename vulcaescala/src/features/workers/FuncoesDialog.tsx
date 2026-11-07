import { useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { hasFuncao, workersWithFuncao } from '../../state/reducer';
import { FUNCAO_MAX, cleanFuncao } from '../../domain/types';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';

/** Atualizar a lista de funções: adicionar, renomear e remover. */
export function FuncoesDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = cleanFuncao(nova);
    if (!n) return;
    if (hasFuncao(state, n)) return setErro(`A função “${n}” já existe.`);
    dispatch({ type: 'funcao/add', nome: n });
    setNova('');
    setErro(null);
    toast('Função adicionada');
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const n = cleanFuncao(rascunho);
    if (!n || n === editando) return setEditando(null);
    if (hasFuncao(state, n, editando)) return setErro(`A função “${n}” já existe.`);
    const uso = workersWithFuncao(state, editando);
    dispatch({ type: 'funcao/rename', de: editando, para: n });
    setEditando(null);
    setErro(null);
    toast(uso ? `Função renomeada em ${uso} colaborador(es)` : 'Função renomeada');
  };

  const remove = async (f: string) => {
    const uso = workersWithFuncao(state, f);
    if (uso) {
      toast(`“${f}” está em uso por ${uso} colaborador(es). Troque a função deles antes de remover.`, 'warn');
      return;
    }
    if (state.funcoes.length <= 1) return toast('A lista precisa ter pelo menos uma função.', 'warn');
    const ok = await confirm({ title: `Remover “${f}”?`, message: <p>A função sai da lista do cadastro.</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    dispatch({ type: 'funcao/remove', nome: f });
    toast('Função removida');
  };

  return (
    <Modal
      title="Funções"
      subtitle="Lista usada no cadastro do efetivo"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <form className="row nowrap" onSubmit={add}>
        <input
          className="input grow"
          value={nova}
          maxLength={FUNCAO_MAX}
          onChange={(e) => {
            setNova(e.target.value);
            setErro(null);
          }}
          placeholder="Nova função (ex.: Montador)"
          aria-label="Nova função"
          data-autofocus
        />
        <button className="btn primary" type="submit" disabled={!nova.trim()}>
          Adicionar
        </button>
      </form>
      {erro && (
        <p className="text-danger small" role="alert">
          {erro}
        </p>
      )}
      <ul className="plain-list funcao-list">
        {state.funcoes.map((f) => {
          const uso = workersWithFuncao(state, f);
          return editando === f ? (
            <li key={f}>
              <form className="row nowrap grow" onSubmit={rename}>
                <input
                  className="input grow"
                  value={rascunho}
                  maxLength={FUNCAO_MAX}
                  autoFocus
                  onChange={(e) => {
                    setRascunho(e.target.value);
                    setErro(null);
                  }}
                  onKeyDown={(e) => e.key === 'Escape' && setEditando(null)}
                  aria-label={`Novo nome para ${f}`}
                />
                <button className="btn small primary" type="submit">
                  Salvar
                </button>
                <button className="btn small" type="button" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </form>
            </li>
          ) : (
            <li key={f}>
              <div className="grow">
                <strong>{f}</strong>
                <div className="small muted tabnum">{uso ? `${uso} colaborador(es)` : 'sem colaboradores'}</div>
              </div>
              <div className="row">
                <button
                  className="btn small"
                  onClick={() => {
                    setEditando(f);
                    setRascunho(f);
                    setErro(null);
                  }}
                  aria-label={`Renomear ${f}`}
                >
                  Renomear
                </button>
                <button
                  className="btn small ghost-danger"
                  onClick={() => remove(f)}
                  aria-label={`Remover ${f}`}
                  title={uso ? `Em uso por ${uso} colaborador(es)` : undefined}
                >
                  Remover
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        Renomear atualiza todos os colaboradores que têm a função. Só é possível remover uma função que ninguém usa.
      </p>
    </Modal>
  );
}
