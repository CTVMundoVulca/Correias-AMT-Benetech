import { useState } from 'react';
import { useStore } from '../state/store';
import type { DayRef } from '../state/reducer';
import { allocationStatus, getDay, pendingWorkers, sortByName, statusLabel } from '../domain/schedule';
import { matchesSearch } from '../domain/names';
import { Modal } from './Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  activityId: string;
  onClose: () => void;
}

/** Seleção múltipla: cada toque marca/desmarca e a janela continua aberta. */
export function AllocationPicker({ dayRef, dayLabel, activityId, onClose }: Props) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const activity = day.activities.find((a) => a.id === activityId);
  const pendingIds = new Set(pendingWorkers(day, state.workers).map((w) => w.id));

  if (!activity) return null; // atividade removida enquanto a janela estava aberta

  const list = sortByName(state.workers.filter((w) => w.ativo)).filter(
    (w) => matchesSearch(w.nome, query) && (!onlyPending || pendingIds.has(w.id) || activity.workerIds.includes(w.id)),
  );

  return (
    <Modal
      title={`Alocar em ${activity.nome}`}
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <>
          <span className="small muted">
            {activity.workerIds.length} nesta atividade · {pendingIds.size} sem alocação no dia
          </span>
          <button className="btn primary" onClick={onClose}>
            Concluído
          </button>
        </>
      }
    >
      <div className="picker-tools">
        <input
          className="input"
          type="search"
          placeholder="Buscar colaborador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-autofocus
          aria-label="Buscar colaborador"
        />
        <label className="check">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Só quem
          está sem alocação
        </label>
      </div>
      <ul className="pick-list">
        {list.map((w) => {
          const st = allocationStatus(day, activityId, w.id);
          return (
            <li key={w.id}>
              <button
                className={`pick st-${st.kind}`}
                disabled={st.kind === 'absent'}
                aria-pressed={st.kind === 'here'}
                onClick={() => dispatch({ type: 'activity/toggleWorker', ...dayRef, activityId, workerId: w.id })}
              >
                <span className="pick-name">
                  {w.nome}
                  <span className="small muted"> · {w.funcao}</span>
                </span>
                <span className="pick-status">{statusLabel(st)}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small pad">Ninguém encontrado.</li>}
      </ul>
    </Modal>
  );
}
