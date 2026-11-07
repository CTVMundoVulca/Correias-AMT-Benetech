import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { newId } from '../state/reducer';
import { FUNCOES, Funcao, Worker } from '../domain/types';
import { cleanName, matchesSearch, nameKey, similarNames } from '../domain/names';
import { sortByName, workerUsage } from '../domain/schedule';
import { BulkAdd } from './BulkAdd';

export function findSimilar(nome: string, workers: Worker[], ignoreId?: string): Worker[] {
  return workers.filter((w) => w.id !== ignoreId && similarNames(w.nome, nome));
}

export function WorkersView() {
  const { state, dispatch } = useStore();
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState<Funcao>('Vulcanizador');
  const [warning, setWarning] = useState<{ nome: string; similar: Worker[]; exact: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [filterFuncao, setFilterFuncao] = useState<'' | Funcao>('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const list = useMemo(
    () =>
      sortByName(state.workers).filter(
        (w) => (showInactive || w.ativo) && (!filterFuncao || w.funcao === filterFuncao) && matchesSearch(w.nome, query),
      ),
    [state.workers, showInactive, filterFuncao, query],
  );
  const activeCount = state.workers.filter((w) => w.ativo).length;

  const add = (force: boolean) => {
    const n = cleanName(nome);
    if (!n) return;
    const similar = findSimilar(n, state.workers);
    const exact = similar.some((w) => nameKey(w.nome) === nameKey(n));
    if (exact || (similar.length && !force)) {
      setWarning({ nome: n, similar, exact });
      return;
    }
    dispatch({ type: 'worker/add', id: newId(), nome: n, funcao });
    setNome('');
    setWarning(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    add(false);
  };

  return (
    <section>
      <div className="card pad">
        <div className="row between">
          <h1>Efetivo</h1>
          <span className="muted small">
            {activeCount} ativo(s) · {state.workers.length - activeCount} inativo(s)
          </span>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Nome do colaborador"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setWarning(null);
            }}
            aria-label="Nome do colaborador"
          />
          <select className="input" value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} aria-label="Função">
            {FUNCOES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <button className="btn primary" type="submit" disabled={!nome.trim()}>
            Cadastrar
          </button>
        </form>
        {warning && (
          <div className={'banner ' + (warning.exact ? 'danger' : 'warn')} role="alert">
            {warning.exact ? (
              <>
                <b>{warning.nome}</b> já está cadastrado. Para homônimos, inclua o sobrenome.
              </>
            ) : (
              <>
                Já existe nome parecido com <b>{warning.nome}</b>:{' '}
                {warning.similar.map((w) => `${w.nome}${w.ativo ? '' : ' (inativo)'}`).join(', ')}. É a mesma pessoa?
                <div className="row top-gap">
                  <button className="btn small" onClick={() => setWarning(null)}>
                    Não cadastrar
                  </button>
                  <button className="btn small primary" onClick={() => add(true)}>
                    É outra pessoa, cadastrar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <button className="link top-gap" onClick={() => setBulk(true)}>
          Cadastrar vários de uma vez (colar lista)
        </button>
      </div>

      <div className="card pad">
        <div className="filters">
          <input
            className="input"
            type="search"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar no efetivo"
          />
          <select
            className="input"
            value={filterFuncao}
            onChange={(e) => setFilterFuncao(e.target.value as '' | Funcao)}
            aria-label="Filtrar por função"
          >
            <option value="">Todas as funções</option>
            {FUNCOES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar
            inativos
          </label>
        </div>
        <ul className="worker-list">
          {list.map((w) =>
            editingId === w.id ? (
              <WorkerEdit key={w.id} worker={w} onDone={() => setEditingId(null)} />
            ) : (
              <li key={w.id} className={'worker' + (w.ativo ? '' : ' inactive')}>
                <div className="grow">
                  <strong>{w.nome}</strong>
                  <div className="small muted">
                    {w.funcao}
                    {!w.ativo && ' · inativo'}
                  </div>
                </div>
                <div className="worker-tools">
                  <button className="btn small" onClick={() => setEditingId(w.id)}>
                    Editar
                  </button>
                  <button
                    className="btn small"
                    onClick={() => dispatch({ type: 'worker/setActive', id: w.id, ativo: !w.ativo })}
                  >
                    {w.ativo ? 'Inativar' : 'Reativar'}
                  </button>
                  <DeleteWorker worker={w} />
                </div>
              </li>
            ),
          )}
          {list.length === 0 && <li className="muted small pad">Nenhum colaborador encontrado.</li>}
        </ul>
      </div>
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
    </section>
  );
}

function DeleteWorker({ worker }: { worker: Worker }) {
  const { state, dispatch } = useStore();
  const onClick = () => {
    const uses = workerUsage(state, worker.id);
    if (uses > 0) {
      window.alert(
        `${worker.nome} aparece em ${uses} registro(s) da escala. Para não perder o histórico, use “Inativar” em vez de excluir.`,
      );
      return;
    }
    if (window.confirm(`Excluir ${worker.nome} do cadastro?`)) dispatch({ type: 'worker/remove', id: worker.id });
  };
  return (
    <button className="btn small danger-ghost" onClick={onClick}>
      Excluir
    </button>
  );
}

function WorkerEdit({ worker, onDone }: { worker: Worker; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const [nome, setNome] = useState(worker.nome);
  const [funcao, setFuncao] = useState<Funcao>(worker.funcao);
  const [error, setError] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = cleanName(nome);
    if (!n) return;
    const dup = state.workers.find((w) => w.id !== worker.id && nameKey(w.nome) === nameKey(n));
    if (dup) {
      setError(`${dup.nome} já está cadastrado.`);
      return;
    }
    dispatch({ type: 'worker/update', id: worker.id, nome: n, funcao });
    onDone();
  };

  return (
    <li className="worker editing">
      <form className="form-grid" onSubmit={save}>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus aria-label="Nome" />
        <select className="input" value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} aria-label="Função">
          {FUNCOES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <div className="row">
          <button className="btn small primary" type="submit">
            Salvar
          </button>
          <button className="btn small" type="button" onClick={onDone}>
            Cancelar
          </button>
        </div>
      </form>
      {error && <p className="text-danger small">{error}</p>}
    </li>
  );
}
