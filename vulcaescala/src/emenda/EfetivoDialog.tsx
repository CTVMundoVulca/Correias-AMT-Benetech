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
  const [eletricista, setEletricista] = useState(false);
  const [libera, setLibera] = useState(false);
  const [busca, setBusca] = useState('');
  // filtro da lista: todos, só técnicos em elétrica ou só supervisores/encarregados
  const [filtro, setFiltro] = useState<'' | 'eletricista' | 'liberaPrensa'>('');
  const comFlag = (f: { nome: string; doc: string }, el: boolean, lib: boolean) => ({ ...f, ...(el ? { eletricista: true } : {}), ...(lib ? { liberaPrensa: true } : {}) });

  const add = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = normNome(nome);
    const d = doc.trim();
    if (!n) return toast('Informe o nome', 'warn');
    if (!d) return toast('Informe a matrícula/CPF', 'warn');
    if (efetivo.some((f) => f.nome === n)) return toast('Colaborador já existe', 'warn');
    try {
      await gravarFuncionarios(api, [...efetivo, comFlag({ nome: n, doc: d }, eletricista, libera)].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setNome('');
      setDoc('');
      setEletricista(false);
      setLibera(false);
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
  const [eEletricista, setEEletricista] = useState(false);
  const [eLibera, setELibera] = useState(false);
  const abrirEdicao = (f: { nome: string; doc: string; eletricista?: boolean; liberaPrensa?: boolean }) => {
    setEditando(f.nome);
    setENome(f.nome);
    setEDoc(f.doc);
    setEEletricista(!!f.eletricista);
    setELibera(!!f.liberaPrensa);
  };
  const salvarEdicao = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = normNome(eNome);
    const d = eDoc.trim();
    if (!n) return toast('Informe o nome', 'warn');
    if (!d) return toast('Informe a matrícula/CPF', 'warn');
    if (n !== editando && efetivo.some((f) => f.nome === n)) return toast('Já existe um colaborador com esse nome', 'warn');
    try {
      const lista = efetivo.map((f) => (f.nome === editando ? comFlag({ nome: n, doc: d }, eEletricista, eLibera) : f)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      await gravarFuncionarios(api, lista);
      setEditando(null);
      toast('Colaborador atualizado');
    } catch {
      toast('Não foi possível salvar a lista.', 'danger');
    }
  };

  const q = normNome(busca);
  const vis = efetivo.filter((f) => (!q || f.nome.includes(q)) && (!filtro || f[filtro]));
  const nEletricistas = efetivo.filter((f) => f.eletricista).length;
  const nLibera = efetivo.filter((f) => f.liberaPrensa).length;

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
        <label className="check small">
          <input type="checkbox" checked={eletricista} onChange={(e) => setEletricista(e.target.checked)} /> Técnico em elétrica (assina o teste da prensa)
        </label>
        <label className="check small">
          <input type="checkbox" checked={libera} onChange={(e) => setLibera(e.target.checked)} /> Supervisor/encarregado (libera a vistoria da prensa)
        </label>
      </form>
      {nEletricistas > 0 && (
        <label className="check small">
          <input type="checkbox" checked={filtro === 'eletricista'} onChange={(e) => setFiltro(e.target.checked ? 'eletricista' : '')} /> Mostrar só técnicos em elétrica ({nEletricistas})
        </label>
      )}
      {nLibera > 0 && (
        <label className="check small">
          <input type="checkbox" checked={filtro === 'liberaPrensa'} onChange={(e) => setFiltro(e.target.checked ? 'liberaPrensa' : '')} /> Mostrar só supervisores/encarregados ({nLibera})
        </label>
      )}
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
                <label className="check small">
                  <input type="checkbox" checked={eEletricista} onChange={(e) => setEEletricista(e.target.checked)} /> Técnico em elétrica
                </label>
                <label className="check small">
                  <input type="checkbox" checked={eLibera} onChange={(e) => setELibera(e.target.checked)} /> Supervisor/encarregado (libera a prensa)
                </label>
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
                {f.eletricista && <span className="tag-eletricista"> ⚡ Técnico em elétrica</span>}
                {f.liberaPrensa && <span className="tag-libera"> ✔ Supervisor/encarregado</span>}
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
