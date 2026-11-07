import { useStore } from '../../state/store';
import type { DayRef } from '../../state/reducer';
import { getDay } from '../../domain/schedule';
import { Worker } from '../../domain/types';
import { useToast } from '../../ui/Toast';
import { Modal } from '../../ui/Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  worker: Worker;
  onClose: () => void;
}

/** Resolve um pendente com um toque: alocar numa atividade do dia ou registrar ausência. */
export function PendingWorkerDialog({ dayRef, dayLabel, worker, onClose }: Props) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);

  return (
    <Modal title={worker.nome} subtitle={dayLabel} onClose={onClose}>
      <h3>Alocar em</h3>
      <div className="act-options">
        {day.activities.map((a, i) => (
          <button
            key={a.id}
            className="act-option"
            data-autofocus={i === 0 ? true : undefined}
            onClick={() => {
              dispatch({ type: 'activity/setWorker', allocated: true, ...dayRef, activityId: a.id, workerId: worker.id });
              toast(`${worker.nome} alocado em ${a.nome}`);
              onClose();
            }}
          >
            <span className="pick-name">{a.nome}</span>
            <span className="small muted">
              <span className="num">{a.workerIds.length}</span> alocado{a.workerIds.length === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
      <h3>Ou registrar ausência</h3>
      <div className="abs-buttons">
        {state.ausencias.filter((t) => t.ativo).map((t) => (
          <button
            key={t.id}
            className={`abs-btn cor-${t.cor}`}
            onClick={() => {
              dispatch({ type: 'absence/set', ...dayRef, workerId: worker.id, tipo: t.id });
              toast('Ausência registrada');
              onClose();
            }}
          >
            {t.nome}
          </button>
        ))}
      </div>
    </Modal>
  );
}
