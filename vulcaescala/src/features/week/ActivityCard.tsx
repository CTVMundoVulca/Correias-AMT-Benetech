import { useState } from "react";
import { useSomenteLeitura, useStore } from "../../state/store";
import type { DayRef } from "../../state/reducer";
import type { Activity, Worker } from "../../domain/types";
import { sortByName } from "../../domain/schedule";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import { AllocationPicker } from "./AllocationPicker";

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  activity: Activity;
}

export function ActivityCard({ dayRef, dayLabel, activity }: Props) {
  const { state, dispatch } = useStore();
  const ro = useSomenteLeitura();
  const toast = useToast();
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.nome);
  const byId = new Map(state.workers.map((w) => [w.id, w]));
  const allocated = sortByName(
    activity.workerIds
      .map((id) => byId.get(id))
      .filter((w): w is Worker => !!w),
  );

  const saveName = () => {
    if (draft.trim() && draft.trim().toUpperCase() !== activity.nome) {
      dispatch({
        type: "activity/rename",
        ...dayRef,
        activityId: activity.id,
        nome: draft,
      });
      toast("Nome da atividade atualizado");
    }
    setEditing(false);
  };

  const remove = async () => {
    const n = activity.workerIds.length;
    if (
      n > 0 &&
      !(await confirm({
        title: `Remover ${activity.nome}?`,
        message: (
          <p>
            A atividade tem <b className="num">{n}</b> colaborador(es)
            alocado(s). Eles voltarão a aparecer como sem alocação.
          </p>
        ),
        confirmLabel: "Remover",
        danger: true,
      }))
    )
      return;
    dispatch({ type: "activity/remove", ...dayRef, activityId: activity.id });
    toast("Atividade removida");
  };

  return (
    <div className="activity">
      {editing ? (
        <form
          className="row nowrap"
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
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            aria-label="Nome da atividade"
          />
          <button className="btn small primary" type="submit">
            Salvar
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        </form>
      ) : (
        <div className="activity-head">
          <h3 className="activity-name">
            {activity.nome}
            <span className="num">{allocated.length}</span>
          </h3>
          {!ro && (
            <div className="activity-tools">
              <button
                className="btn small primary"
                onClick={() => setPicking(true)}
              >
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
                className="btn small ghost-danger"
                onClick={remove}
                aria-label={`Remover ${activity.nome}`}
              >
                Remover
              </button>
            </div>
          )}
        </div>
      )}
      {allocated.length === 0 ? (
        <p className="muted small">Ninguém alocado.</p>
      ) : (
        <div className="chips">
          {allocated.map((w) => (
            <span
              key={w.id}
              className={"chip" + (w.ativo ? "" : " inactive")}
              title={w.ativo ? w.funcao : `${w.funcao} · inativo`}
            >
              <span className="chip-label">{w.nome}</span>
              {!ro && (
                <button
                  className="chip-x"
                  aria-label={`Retirar ${w.nome} de ${activity.nome}`}
                  onClick={() => {
                    dispatch({
                      type: "activity/setWorker",
                      allocated: false,
                      ...dayRef,
                      activityId: activity.id,
                      workerId: w.id,
                    });
                    toast("Colaborador retirado");
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {picking && (
        <AllocationPicker
          dayRef={dayRef}
          dayLabel={dayLabel}
          activityId={activity.id}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
