import { useState } from 'react';
import { useStore } from '../state/store';
import type { DayRef } from '../state/reducer';
import { absenceOf, getDay, sortByName } from '../domain/schedule';
import { matchesSearch } from '../domain/names';
import { ABSENCE_LABELS, ABSENCE_TYPES, AbsenceType } from '../domain/types';
import { Modal } from './Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  onClose: () => void;
}

export function AbsencePicker({ dayRef, dayLabel, onClose }: Props) {
  const { state, dispatch } = useStore();
  const [tipo, setTipo] = useState<AbsenceType>('folga');
  const [query, setQuery] = useState('');
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const list = sortByName(state.workers.filter((w) => w.ativo)).filter((w) => matchesSearch(w.nome, query));

  return (
    <Modal
      title="Registrar ausência"
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <>
          <span className="small muted">{day.absences.length} ausente(s) no dia</span>
          <button className="btn primary" onClick={onClose}>
            Concluído
          </button>
        </>
      }
    >
      <div className="segmented" role="radiogroup" aria-label="Tipo de ausência">
        {ABSENCE_TYPES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={tipo === t}
            className={'seg' + (tipo === t ? ' on' : '')}
            onClick={() => setTipo(t)}
          >
            {ABSENCE_LABELS[t]}
          </button>
        ))}
      </div>
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
        Toque para marcar como <b>{ABSENCE_LABELS[tipo]}</b>. Quem estiver alocado sai das atividades do dia.
      </p>
      <ul className="pick-list">
        {list.map((w) => {
          const cur = absenceOf(day, w.id);
          const acts = day.activities.filter((a) => a.workerIds.includes(w.id)).map((a) => a.nome);
          const here = cur === tipo;
          return (
            <li key={w.id}>
              <button
                className={'pick' + (here ? ' st-here' : cur ? ' st-absent-other' : acts.length ? ' st-elsewhere' : '')}
                aria-pressed={here}
                onClick={() => dispatch({ type: 'absence/set', ...dayRef, workerId: w.id, tipo: here ? null : tipo })}
              >
                <span className="pick-name">
                  {w.nome}
                  <span className="small muted"> · {w.funcao}</span>
                </span>
                <span className="pick-status">
                  {here ? '✓' : cur ? ABSENCE_LABELS[cur].toUpperCase() : acts.length ? `em ${acts.join(', ')}` : ''}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small pad">Ninguém encontrado.</li>}
      </ul>
    </Modal>
  );
}
