import { useStore } from '../state/store';
import type { DayRef } from '../state/reducer';
import { getDay, pendingWorkers } from '../domain/schedule';
import { ABSENCE_LABELS, ABSENCE_TYPES, AbsenceType } from '../domain/types';
import { Modal } from './Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  onClose: () => void;
}

/** Lista quem está sem alocação e sem ausência no dia, com ação rápida para cada um. */
export function PendingPanel({ dayRef, dayLabel, onClose }: Props) {
  const { state, dispatch } = useStore();
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const pending = pendingWorkers(day, state.workers);

  return (
    <Modal
      title={pending.length ? `${pending.length} sem alocação` : 'Todos alocados'}
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose} data-autofocus>
          Concluído
        </button>
      }
    >
      {pending.length === 0 ? (
        <p className="text-ok">✓ Todo o efetivo ativo está alocado ou com ausência registrada neste dia.</p>
      ) : (
        <>
          {day.activities.length === 0 && (
            <p className="banner info small">Crie uma atividade no dia para poder alocar por aqui.</p>
          )}
          <ul className="pending-list">
            {pending.map((w) => (
              <li key={w.id}>
                <div className="pending-name">
                  <strong>{w.nome}</strong> <span className="small muted">{w.funcao}</span>
                </div>
                <div className="row">
                  <select
                    className="input grow"
                    value=""
                    disabled={day.activities.length === 0}
                    aria-label={`Alocar ${w.nome} em`}
                    onChange={(e) =>
                      e.target.value &&
                      dispatch({ type: 'activity/toggleWorker', ...dayRef, activityId: e.target.value, workerId: w.id })
                    }
                  >
                    <option value="">Alocar em…</option>
                    {day.activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input grow"
                    value=""
                    aria-label={`Registrar ausência de ${w.nome}`}
                    onChange={(e) =>
                      e.target.value &&
                      dispatch({ type: 'absence/set', ...dayRef, workerId: w.id, tipo: e.target.value as AbsenceType })
                    }
                  >
                    <option value="">Ausência…</option>
                    {ABSENCE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ABSENCE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
