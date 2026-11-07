import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { isDuplicateName } from '../../state/reducer';
import { newId } from '../../domain/ids';
import { Funcao, MATRICULA_MAX, Worker } from '../../domain/types';
import { FuncoesDialog } from './FuncoesDialog';
import { cleanName, matchesSearch, similarNames } from '../../domain/names';
import { sortByName, workerUsage } from '../../domain/schedule';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';

type Situacao = 'todos' | 'ativos' | 'inativos';

export function WorkersView() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState<Funcao>(state.funcoes[0] ?? '');
  const [funcoesOpen, setFuncoesOpen] = useState(false);
  const [matricula, setMatricula] = useState('');
  // função escolhida pode ter sido renomeada/removida em outro aparelho
  const funcaoValida = state.funcoes.includes(funcao) ? funcao : (state.funcoes[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      sortByName(state.workers).filter(
        (w) =>
          (situacao === 'todos' || (situacao === 'ativos') === w.ativo) && matchesSearch(w.nome, query),
      ),
    [state.workers, situacao, query],
  );
  const active = state.workers.filter((w) => w.ativo).length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = cleanName(nome);
    if (!n) return;
    if (isDuplicateName(state, n)) {
      setError(`${n} já está cadastrado. Para homônimos, inclua o sobrenome.`);
      return;
    }
    const similar = state.workers.filter((w) => similarNames(w.nome, n));
    if (
      similar.length &&
      !(await confirm({
        title: 'Nome parecido',
        message: (
          <>
            <p>
              Já existe: <b>{similar.map((w) => w.nome).join(', ')}</b>.
            </p>
            <p>
              <b>{n}</b> é outra pessoa?
            </p>
          </>
        ),
        confirmLabel: 'É outra pessoa, cadastrar',
        cancelLabel: 'Não cadastrar',
      }))
    )
      return;
    dispatch({ type: 'worker/add', id: newId(), nome: n, funcao: funcaoValida, matricula });
    setNome('');
    setMatricula('');
    toast('Colaborador adicionado');
  };

  const remove = async (w: Worker) => {
    const uses = workerUsage(state, w.id);
    const ok = await confirm({
      title: `Excluir ${w.nome}?`,
      message: uses ? (
        <>
          <p>
            Ele aparece em <b className="num">{uses}</b> registro(s) da escala (alocações e ausências). Todos serão
            apagados de todas as semanas.
          </p>
          <p className="muted small">Para manter o histórico, use “Desativar”.</p>
        </>
      ) : (
        <p>O colaborador não tem registros na escala.</p>
      ),
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'worker/remove', id: w.id });
    toast('Colaborador excluído');
  };

  return (
    <section>
      <div className="card pad stack">
        <div className="row between">
          <h1>Efetivo</h1>
          <button className="btn small" onClick={() => setFuncoesOpen(true)}>
            Funções ({state.funcoes.length})
          </button>
        </div>
        <div className="row between">
          <span className="muted small tabnum">
            {active} ativo(s) · {state.workers.length - active} inativo(s)
          </span>
        </div>
        <form className="form-row" onSubmit={add}>
          <input
            className="input"
            placeholder="Nome do colaborador"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setError(null);
            }}
            aria-label="Nome do colaborador"
            aria-invalid={!!error}
          />
          <input
            className="input"
            placeholder="Matrícula (opcional)"
            value={matricula}
            maxLength={MATRICULA_MAX}
            onChange={(e) => setMatricula(e.target.value)}
            aria-label="Matrícula (opcional)"
          />
          <select className="input" value={funcaoValida} onChange={(e) => setFuncao(e.target.value)} aria-label="Função">
            {state.funcoes.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <button className="btn primary" type="submit" disabled={!nome.trim()}>
            Adicionar
          </button>
        </form>
        {error && (
          <p className="text-danger small" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="card pad stack">
        <div className="filters">
          <input
            className="input"
            type="search"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar no efetivo"
          />
          <select className="input" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} aria-label="Situação">
            <option value="todos">Todas as situações</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
        </div>
        <div className="worker-grid">
          {list.map((w) =>
            editingId === w.id ? (
              <WorkerEdit key={w.id} worker={w} onDone={() => setEditingId(null)} />
            ) : (
              <div key={w.id} className={'worker-card' + (w.ativo ? '' : ' inactive')}>
                <div>
                  <div className="worker-name">{w.nome}</div>
                  <div className="worker-meta">
                    <span>{w.funcao}</span>
                    {w.matricula && <span className="tabnum">Mat. {w.matricula}</span>}
                    <span className={'status-dot' + (w.ativo ? '' : ' off')}>{w.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
                <div className="worker-tools">
                  <button className="btn small" onClick={() => setEditingId(w.id)}>
                    Editar
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      dispatch({ type: 'worker/setActive', id: w.id, ativo: !w.ativo });
                      toast(w.ativo ? 'Colaborador desativado' : 'Colaborador ativado');
                    }}
                  >
                    {w.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button className="btn small ghost-danger" onClick={() => remove(w)}>
                    Excluir
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
        {list.length === 0 && <p className="muted small">Nenhum colaborador encontrado.</p>}
      </div>
      {funcoesOpen && <FuncoesDialog onClose={() => setFuncoesOpen(false)} />}
    </section>
  );
}

function WorkerEdit({ worker, onDone }: { worker: Worker; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [nome, setNome] = useState(worker.nome);
  const [funcao, setFuncao] = useState<Funcao>(worker.funcao);
  const [matricula, setMatricula] = useState(worker.matricula ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = cleanName(nome);
    if (!n) return;
    if (isDuplicateName(state, n, worker.id)) {
      setError(`${n} já está cadastrado.`);
      return;
    }
    dispatch({ type: 'worker/update', id: worker.id, nome: n, funcao, matricula });
    toast('Colaborador atualizado');
    onDone();
  };

  return (
    <form className="worker-card stack" onSubmit={save}>
      <input
        className="input"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          setError(null);
        }}
        autoFocus
        aria-label="Nome"
        aria-invalid={!!error}
      />
      <input
        className="input"
        placeholder="Matrícula (opcional)"
        value={matricula}
        maxLength={MATRICULA_MAX}
        onChange={(e) => setMatricula(e.target.value)}
        aria-label="Matrícula"
      />
      <select className="input" value={funcao} onChange={(e) => setFuncao(e.target.value)} aria-label="Função">
        {(state.funcoes.includes(funcao) ? state.funcoes : [funcao, ...state.funcoes]).map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      {error && (
        <p className="text-danger small" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn small primary" type="submit">
          Salvar
        </button>
        <button className="btn small" type="button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
