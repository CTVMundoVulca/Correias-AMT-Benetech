import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useEmenda } from './context';
import { gravarFuncionarios } from './data';
import { mascararDoc, normNome } from './model';

/**
 * "Gerenciar efetivo" do Registro de Emenda — mesma lista do app do Suzano
 * (nome completo + matrícula/CPF), mas SEPARADA do efetivo da escala e do Suzano.
 * Compartilhada por todos os aparelhos.
 */
export function EfetivoDialog({ onClose }: { onClose: () => void }) {
  const { api, efetivo } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');
  const [busca, setBusca] = useState('');

  const add = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = normNome(nome);
    const d = doc.trim();
    if (!n) return toast('Informe o nome', 'warn');
    if (!d) return toast('Informe a matrícula/CPF', 'warn');
    if (efetivo.some((f) => f.nome === n)) return toast('Colaborador já existe', 'warn');
    try {
      await gravarFuncionarios(api, [...efetivo, { nome: n, doc: d }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setNome('');
      setDoc('');
      toast('Colaborador adicionado');
    } catch {
      toast('Não foi possível salvar a lista.', 'danger');
    }
  };

  const remove = async (n: string) => {
    const ok = await confirm({ title: 'Remover colaborador?', message: <p>{n} sai da lista. Relatórios já feitos não mudam.</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    gravarFuncionarios(api, efetivo.filter((f) => f.nome !== n))
      .then(() => toast('Removido'))
      .catch(() => toast('Não foi possível salvar a lista.', 'danger'));
  };

  // edição de um colaborador (nome e/ou matrícula/CPF)
  const [editando, setEditando] = useState<string | null>(null);
  const [eNome, setENome] = useState('');
  const [eDoc, setEDoc] = useState('');
  const abrirEdicao = (f: { nome: string; doc: string }) => {
    setEditando(f.nome);
    setENome(f.nome);
    setEDoc(f.doc);
  };
  const salvarEdicao = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = normNome(eNome);
    const d = eDoc.trim();
    if (!n) return toast('Informe o nome', 'warn');
    if (!d) return toast('Informe a matrícula/CPF', 'warn');
    if (n !== editando && efetivo.some((f) => f.nome === n)) return toast('Já existe um colaborador com esse nome', 'warn');
    try {
      const lista = efetivo.map((f) => (f.nome === editando ? { nome: n, doc: d } : f)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      await gravarFuncionarios(api, lista);
      setEditando(null);
      toast('Colaborador atualizado');
    } catch {
      toast('Não foi possível salvar a lista.', 'danger');
    }
  };

  const q = normNome(busca);
  const vis = q ? efetivo.filter((f) => f.nome.includes(q)) : efetivo;

  return (
    <Modal
      title="Gerenciar efetivo"
      subtitle={`Colaboradores do Registro de Emenda · ${efetivo.length}`}
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <form className="stack" onSubmit={add}>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" aria-label="Nome completo" style={{ textTransform: 'uppercase' }} />
        <div className="row nowrap">
          <input className="input grow" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Matrícula/CPF" aria-label="Matrícula/CPF" inputMode="numeric" />
          <button className="btn primary" type="submit" disabled={!nome.trim() || !doc.trim()}>
            Adicionar
          </button>
        </div>
      </form>
      {efetivo.length > 8 && (
        <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome" aria-label="Buscar nome" />
      )}
      <ul className="plain-list funcao-list">
        {vis.map((f) =>
          editando === f.nome ? (
            <li key={f.nome} className="efetivo-edit">
              <form className="stack grow" onSubmit={(ev) => void salvarEdicao(ev)}>
                <input
                  className="input"
                  value={eNome}
                  onChange={(e) => setENome(e.target.value)}
                  aria-label="Nome completo"
                  style={{ textTransform: 'uppercase' }}
                  autoFocus
                />
                <input className="input" value={eDoc} onChange={(e) => setEDoc(e.target.value)} aria-label="Matrícula/CPF" inputMode="numeric" />
                <div className="row nowrap">
                  <button className="btn small" type="button" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                  <button className="btn small primary" type="submit" disabled={!eNome.trim() || !eDoc.trim()}>
                    Salvar
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={f.nome}>
              <span className="grow">
                {f.nome}
                <br />
                <span className="small muted tabnum">{mascararDoc(f.doc)}</span>
              </span>
              <button className="btn small" onClick={() => abrirEdicao(f)} aria-label={`Editar ${f.nome}`}>
                Editar
              </button>
              <button className="btn small ghost-danger" onClick={() => remove(f.nome)} aria-label={`Remover ${f.nome}`}>
                Remover
              </button>
            </li>
          ),
        )}
      </ul>
      {efetivo.length === 0 && <p className="small muted">Nenhum colaborador cadastrado.</p>}
      {efetivo.length > 0 && <p className="small muted">Ao editar, os relatórios já feitos continuam com os dados antigos; os próximos usam os novos.</p>}
    </Modal>
  );
}
