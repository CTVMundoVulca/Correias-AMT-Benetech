import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { newId } from '../state/reducer';
import { FUNCOES, Funcao } from '../domain/types';
import { cleanName, nameKey, similarNames } from '../domain/names';
import { Modal } from './Modal';

interface Line {
  nome: string;
  status: 'novo' | 'duplicado' | 'parecido';
  detail: string;
}

/**
 * Cadastro em lote: cole um nome por linha (ex.: copiado da planilha).
 * Nomes iguais aos já cadastrados são ignorados; parecidos vêm desmarcados
 * para você decidir se é a mesma pessoa escrita de outro jeito.
 */
export function BulkAdd({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const [funcao, setFuncao] = useState<Funcao>('Vulcanizador');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [checkedSimilar, setCheckedSimilar] = useState<Set<string>>(new Set());

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    const seen = new Map<string, string>();
    for (const raw of text.split(/\r?\n/)) {
      const nome = cleanName(raw);
      if (!nome) continue;
      const k = nameKey(nome);
      if (seen.has(k)) continue;
      const exact = state.workers.find((w) => nameKey(w.nome) === k);
      if (exact) {
        out.push({ nome, status: 'duplicado', detail: 'já cadastrado' });
      } else {
        const sim = [
          ...state.workers.filter((w) => similarNames(w.nome, nome)).map((w) => w.nome),
          ...[...seen.values()].filter((n) => similarNames(n, nome)),
        ];
        out.push(sim.length ? { nome, status: 'parecido', detail: `parecido com ${sim.join(', ')}` } : { nome, status: 'novo', detail: '' });
      }
      seen.set(k, nome);
    }
    return out;
  }, [text, state.workers]);

  const isChecked = (l: Line) =>
    l.status === 'novo' ? !unchecked.has(l.nome) : l.status === 'parecido' ? checkedSimilar.has(l.nome) : false;
  const toggle = (l: Line) => {
    const [set, setter] = l.status === 'novo' ? [unchecked, setUnchecked] : [checkedSimilar, setCheckedSimilar];
    const next = new Set(set);
    next.has(l.nome) ? next.delete(l.nome) : next.add(l.nome);
    setter(next);
  };
  const selected = lines.filter(isChecked);

  const confirm = () => {
    for (const l of selected) dispatch({ type: 'worker/add', id: newId(), nome: l.nome, funcao });
    onClose();
  };

  return (
    <Modal
      title="Cadastrar vários"
      subtitle="Um nome por linha"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={confirm} disabled={!selected.length}>
            Cadastrar {selected.length}
          </button>
        </>
      }
    >
      <textarea
        className="input"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'JOÃO SILVA\nMARIA SOUZA\n…'}
        data-autofocus
        aria-label="Lista de nomes"
      />
      <label className="field">
        Função para todos
        <select className="input" value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)}>
          {FUNCOES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      {lines.length > 0 && (
        <ul className="bulk-list">
          {lines.map((l) => (
            <li key={l.nome} className={`bulk-${l.status}`}>
              <label className="check">
                <input type="checkbox" checked={isChecked(l)} disabled={l.status === 'duplicado'} onChange={() => toggle(l)} />
                <span>
                  <b>{l.nome}</b> {l.detail && <span className="small">— {l.detail}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
