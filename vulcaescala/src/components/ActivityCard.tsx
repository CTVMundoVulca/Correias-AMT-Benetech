import { useState } from 'react';
import { useStore } from '../state/store';
import type { DayRef } from '../state/reducer';
import type { Activity } from '../domain/types';
import { AllocationPicker } from './AllocationPicker';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  activity: Activity;
}

export function ActivityCard({ dayRef, dayLabel, activity }: Props) {
  const { state, dispatch } = useStore();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.nome);
  const byId = new Map(state.workers.map((w) => [w.id, w]));
  const allocated = activity.workerIds
    .map((id) => byId.get(id))
    .filter((w) => w !== undefined)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const saveName = () => {
    if (draft.trim()) dispatch({ type: 'activity/rename', ...dayRef, activityId: activity.id, nome: draft });
    setEditing(false);
  };

  return (
    <div className="activity">
      <div className="activity-head">
        {editing ? (
          <form
            className="row grow"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              className="input grow"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              aria-label="Nome da atividade"
            />
            <button className="btn small primary" type="submit">
              Salvar
            </button>
            <button className="btn small" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </form>
        ) : (
          <>
            <h3 className="activity-name">
              {activity.nome} <span className="count">{allocated.length}</span>
            </h3>
            <div className="activity-tools">
              <button className="btn small primary" onClick={() => setPicking(true)}>
                + Colaborador
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setDraft(activity.nome);
                  setEditing(true);
                }}
                aria-label={`Editar nome de ${activity.nome}`}
              >
                Editar
              </button>
              <button
                className="btn small danger-ghost"
                onClick={() =>
                  window.confirm(`Remover a atividade ${activity.nome}?`) &&
                  dispatch({ type: 'activity/remove', ...dayRef, activityId: activity.id })
                }
                aria-label={`Remover ${activity.nome}`}
              >
                Remover
              </button>
            </div>
          </>
        )}
      </div>
      {allocated.length === 0 ? (
        <p className="muted small">Ninguém alocado.</p>
      ) : (
        <div className="chips">
          {allocated.map((w) => (
            <span key={w.id} className={'chip' + (w.ativo ? '' : ' inactive')} title={w.funcao}>
              {w.nome}
              <button
                className="chip-x"
                aria-label={`Retirar ${w.nome} de ${activity.nome}`}
                onClick={() => dispatch({ type: 'activity/toggleWorker', ...dayRef, activityId: activity.id, workerId: w.id })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {picking && (
        <AllocationPicker dayRef={dayRef} dayLabel={dayLabel} activityId={activity.id} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
