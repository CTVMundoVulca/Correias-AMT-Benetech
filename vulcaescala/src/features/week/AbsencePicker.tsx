import { useState } from 'react';
import { useStore } from '../../state/store';
import type { DayRef } from '../../state/reducer';
import { absenceOf, getDay, sortByName } from '../../domain/schedule';
import { matchesSearch } from '../../domain/names';
import { tipoAusencia } from '../../domain/types';
import { AusenciasDialog } from '../workers/AusenciasDialog';
import { useToast } from '../../ui/Toast';
import { Modal } from '../../ui/Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  onClose: () => void;
}

/** Escolhe o tipo e toca nos colaboradores. Fica aberta para registrar várias. */
export function AbsencePicker({ dayRef, dayLabel, onClose }: Props) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const tipos = state.ausencias.filter((a) => a.ativo);
  const [escolhido, setTipo] = useState<string>(tipos[0]?.id ?? '');
  // se o tipo escolhido foi ocultado/removido (em outro aparelho), volta para o primeiro
  const tipo = tipos.some((t) => t.id === escolhido) ? escolhido : (tipos[0]?.id ?? '');
  const [gerenciar, setGerenciar] = useState(false);
  const [query, setQuery] = useState('');
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const list = sortByName(state.workers.filter((w) => w.ativo && matchesSearch(w.nome, query)));

  return (
    <Modal
      title="Registrar ausência"
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <>
          <span className="small muted foot-info">
            <span className="num">{day.absences.length}</span> ausente(s)
          </span>
          <button className="btn primary" onClick={onClose}>
            Concluído
          </button>
        </>
      }
    >
      <div className="segmented" role="radiogroup" aria-label="Tipo de ausência">
        {tipos.map((t) => (
          <button key={t.id} role="radio" aria-checked={tipo === t.id} className={'seg' + (tipo === t.id ? ' on' : '')} onClick={() => setTipo(t.id)}>
            {t.nome}
          </button>
        ))}
      </div>
      <button className="link small" onClick={() => setGerenciar(true)}>
        Editar tipos de ausência…
      </button>
      {gerenciar && <AusenciasDialog onClose={() => setGerenciar(false)} />}
      <input
        className="input"
        type="search"
        placeholder="Buscar colaborador…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-autofocus
        aria-label="Buscar colaborador"
      />
      <p className="small muted">
        Toque para marcar <b>{tipoAusencia(state, tipo).nome}</b>. Quem estiver alocado sai das atividades do dia.
      </p>
      <ul className="plain-list">
        {list.map((w) => {
          const cur = absenceOf(day, w.id);
          const inActivity = day.activities.some((a) => a.workerIds.includes(w.id));
          const here = cur === tipo;
          return (
            <li key={w.id}>
              <button
                className={'pick' + (here ? ' st-here' : cur || inActivity ? ' st-elsewhere' : '')}
                aria-pressed={here}
                onClick={() => {
                  dispatch({ type: 'absence/set', ...dayRef, workerId: w.id, tipo: here ? null : tipo });
                  toast(here ? 'Ausência removida' : 'Ausência registrada');
                }}
              >
                <span className="pick-name">{w.nome}</span>
                {(here || cur || inActivity) && (
                  <span className={'pick-status' + (cur && !here ? ` tinted cor-${tipoAusencia(state, cur).cor}` : '')}>
                    {here ? '✓' : cur ? tipoAusencia(state, cur).nome : 'Alocado'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small">Ninguém encontrado.</li>}
      </ul>
    </Modal>
  );
}
