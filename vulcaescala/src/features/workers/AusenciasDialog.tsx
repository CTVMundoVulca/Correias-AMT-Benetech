import { useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { ausenciaUsage, hasAusenciaNome, hasSigla } from '../../state/reducer';
import { newId } from '../../domain/ids';
import {
  AUSENCIA_NOME_MAX,
  CORES_AUSENCIA,
  SIGLA_MAX,
  cleanNomeAusencia,
  cleanSigla,
  type CorAusencia,
  type TipoAusencia,
} from '../../domain/types';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';

const COR_NOME: Record<CorAusencia, string> = {
  cinza: 'Cinza',
  vermelho: 'Vermelho',
  azul: 'Azul',
  roxo: 'Roxo',
  verde: 'Verde',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
};

function Paleta({ value, onChange }: { value: CorAusencia; onChange: (c: CorAusencia) => void }) {
  return (
    <div className="paleta" role="radiogroup" aria-label="Cor">
      {CORES_AUSENCIA.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COR_NOME[c]}
          title={COR_NOME[c]}
          className={`paleta-cor cor-${c}` + (value === c ? ' on' : '')}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

/** Tipos de ausência: adicionar, editar (nome, sigla, cor), ocultar e remover. */
export function AusenciasDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [cor, setCor] = useState<CorAusencia>('verde');
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<TipoAusencia | null>(null);

  const siglaSugerida = (n: string) => cleanSigla(cleanNomeAusencia(n).charAt(0));
  const visiveis = state.ausencias.filter((a) => a.ativo).length;

  const validar = (n: string, s: string, ignoreId?: string, ativo = true): string | null => {
    if (!n) return 'Informe o nome.';
    if (!s) return 'Informe a sigla (1 a 3 letras).';
    if (hasAusenciaNome(state, n, ignoreId)) return `Já existe o tipo “${n}”.`;
    if (ativo && hasSigla(state, s, ignoreId)) return `A sigla “${s}” já é usada por outro tipo (a tabela do resumo precisa diferenciar).`;
    return null;
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = cleanNomeAusencia(nome);
    const s = cleanSigla(sigla) || siglaSugerida(n);
    const err = validar(n, s);
    if (err) return setErro(err);
    dispatch({ type: 'ausencia/add', id: newId(), nome: n, sigla: s, cor });
    setNome('');
    setSigla('');
    setErro(null);
    toast('Tipo de ausência adicionado');
  };

  const salvarEdicao = (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const n = cleanNomeAusencia(editando.nome);
    const s = cleanSigla(editando.sigla);
    const err = validar(n, s, editando.id, editando.ativo);
    if (err) return setErro(err);
    dispatch({ type: 'ausencia/update', id: editando.id, nome: n, sigla: s, cor: editando.cor });
    setEditando(null);
    setErro(null);
    toast('Tipo de ausência atualizado (vale também para o histórico)');
  };

  const alternar = (t: TipoAusencia) => {
    if (t.ativo && visiveis <= 1) return toast('Precisa haver pelo menos um tipo visível.', 'warn');
    if (!t.ativo && hasSigla(state, t.sigla, t.id)) return toast(`Antes de mostrar, troque a sigla “${t.sigla}” (já usada).`, 'warn');
    dispatch({ type: 'ausencia/update', id: t.id, ativo: !t.ativo });
    toast(t.ativo ? 'Tipo ocultado (o histórico continua com o nome)' : 'Tipo visível de novo');
  };

  const remover = async (t: TipoAusencia) => {
    const uso = ausenciaUsage(state, t.id);
    if (uso) return toast(`“${t.nome}” já foi usado em ${uso} registro(s). Use “Ocultar” para tirar das opções sem perder o histórico.`, 'warn');
    if (t.ativo && visiveis <= 1) return toast('Precisa haver pelo menos um tipo visível.', 'warn');
    const ok = await confirm({ title: `Remover “${t.nome}”?`, message: <p>O tipo nunca foi usado e sai da lista.</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    dispatch({ type: 'ausencia/remove', id: t.id });
    toast('Tipo de ausência removido');
  };

  return (
    <Modal
      title="Tipos de ausência"
      subtitle="Usados na escala, no resumo e nas consultas"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <form className="stack aus-form" onSubmit={add}>
        <div className="row nowrap">
          <input
            className="input grow"
            value={nome}
            maxLength={AUSENCIA_NOME_MAX}
            placeholder="Novo tipo (ex.: Treinamento)"
            aria-label="Nome do novo tipo"
            onChange={(e) => {
              setNome(e.target.value);
              setErro(null);
            }}
            data-autofocus
          />
          <input
            className="input sigla"
            value={sigla}
            maxLength={SIGLA_MAX}
            placeholder={siglaSugerida(nome) || 'Sigla'}
            aria-label="Sigla"
            onChange={(e) => {
              setSigla(e.target.value);
              setErro(null);
            }}
          />
        </div>
        <Paleta value={cor} onChange={setCor} />
        <button className="btn primary" type="submit" disabled={!nome.trim()}>
          Adicionar tipo
        </button>
      </form>
      {erro && (
        <p className="text-danger small" role="alert">
          {erro}
        </p>
      )}

      <ul className="plain-list aus-list">
        {state.ausencias.map((t) => {
          const uso = ausenciaUsage(state, t.id);
          if (editando?.id === t.id)
            return (
              <li key={t.id}>
                <form className="stack grow" onSubmit={salvarEdicao}>
                  <div className="row nowrap">
                    <input
                      className="input grow"
                      value={editando.nome}
                      maxLength={AUSENCIA_NOME_MAX}
                      aria-label="Nome"
                      autoFocus
                      onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                    />
                    <input
                      className="input sigla"
                      value={editando.sigla}
                      maxLength={SIGLA_MAX}
                      aria-label="Sigla"
                      onChange={(e) => setEditando({ ...editando, sigla: e.target.value })}
                    />
                  </div>
                  <Paleta value={editando.cor} onChange={(c) => setEditando({ ...editando, cor: c })} />
                  <div className="row">
                    <button className="btn small primary" type="submit">
                      Salvar
                    </button>
                    <button className="btn small" type="button" onClick={() => (setEditando(null), setErro(null))}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </li>
            );
          return (
            <li key={t.id} className={t.ativo ? '' : 'oculto'}>
              <span className={`tag cor-${t.cor} sigla-tag`}>{t.sigla}</span>
              <div className="grow">
                <strong>{t.nome}</strong>
                <div className="small muted tabnum">
                  {uso ? `${uso} registro(s)` : 'nunca usado'}
                  {!t.ativo && ' · oculto'}
                </div>
              </div>
              <div className="row aus-tools">
                <button className="btn small" onClick={() => (setEditando({ ...t }), setErro(null))} aria-label={`Editar ${t.nome}`}>
                  Editar
                </button>
                <button className="btn small" onClick={() => alternar(t)} aria-label={`${t.ativo ? 'Ocultar' : 'Mostrar'} ${t.nome}`}>
                  {t.ativo ? 'Ocultar' : 'Mostrar'}
                </button>
                {uso === 0 && (
                  <button className="btn small ghost-danger" onClick={() => remover(t)} aria-label={`Remover ${t.nome}`}>
                    Remover
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        Editar nome, sigla ou cor vale também para o histórico. Tipo já usado não pode ser removido: use “Ocultar” para
        tirá-lo das opções sem perder os registros.
      </p>
    </Modal>
  );
}
