import { useState } from 'react';
import { useStore } from '../../state/store';
import type { DayRef } from '../../state/reducer';
import { allocationStatus, folgaAutoDoDia, getDay, pendingWorkers, sortByName, statusLabel } from '../../domain/schedule';
import { matchesSearch } from '../../domain/names';
import { tipoAusencia } from '../../domain/types';
import { useToast } from '../../ui/Toast';
import { Modal } from '../../ui/Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  activityId: string;
  onClose: () => void;
}

/** Seleção múltipla: cada toque marca/desmarca e a janela continua aberta até "Concluído". */
export function AllocationPicker({ dayRef, dayLabel, activityId, onClose }: Props) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const activity = day.activities.find((a) => a.id === activityId);
  if (!activity) return null; // removida enquanto a janela estava aberta

  const feriado = folgaAutoDoDia(state, dayRef.weekKey, dayRef.dayIndex);
  const pendingCount = pendingWorkers(day, state.workers, feriado).length;
  const list = sortByName(state.workers.filter((w) => w.ativo && matchesSearch(w.nome, query)));

  return (
    <Modal
      title={`Alocar em ${activity.nome}`}
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <>
          <span className="small muted foot-info">
            <span className="num">{activity.workerIds.length}</span> nesta ativ. · <span className="num">{pendingCount}</span>{' '}
            sem alocação
          </span>
          <button className="btn primary" onClick={onClose}>
            Concluído
          </button>
        </>
      }
    >
      <input
        className="input"
        type="search"
        placeholder="Buscar colaborador…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-autofocus
        aria-label="Buscar colaborador"
      />
      <ul className="plain-list">
        {list.map((w) => {
          const st = allocationStatus(day, activityId, w.id);
          const title =
            st.kind === 'elsewhere'
              ? `Também em: ${st.activities.join(', ')}`
              : st.kind === 'absent'
                ? tipoAusencia(state, st.tipo).nome
                : undefined;
          return (
            <li key={w.id}>
              <button
                className={`pick st-${st.kind}` + (st.kind === 'absent' ? ` cor-${tipoAusencia(state, st.tipo).cor}` : '')}
                disabled={st.kind === 'absent'}
                aria-pressed={st.kind === 'here'}
                title={title}
                onClick={() => {
                  dispatch({ type: 'activity/setWorker', allocated: st.kind !== 'here', ...dayRef, activityId, workerId: w.id });
                  toast(st.kind === 'here' ? `${w.nome} retirado` : `${w.nome} alocado`);
                }}
              >
                <span className="pick-name">{w.nome}</span>
                {st.kind !== 'free' ? (
                  <span className="pick-status">{statusLabel(st)}</span>
                ) : (
                  feriado && <span className="pick-status muted">Folga automática</span>
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
