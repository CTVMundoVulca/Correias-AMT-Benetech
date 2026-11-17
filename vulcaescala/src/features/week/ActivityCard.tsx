import { useState } from "react";
import { useSomenteLeitura, useStore } from "../../state/store";
import type { DayRef } from "../../state/reducer";
import type { Activity, Worker } from "../../domain/types";
import { feriadoDoDia, sortByName } from "../../domain/schedule";
import { PAPEIS_PLANTAO, ehPlantao, situacaoPlantao } from "../../domain/plantao";
import { useToast } from "../../ui/Toast";
import { useConfirm } from "../../ui/ConfirmDialog";
import { AllocationPicker } from "./AllocationPicker";
import { AtrasosAtividade } from "../atrasos/AtrasosAtividade";
import { useAvisoProg } from "./ProgDoDia";

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
  const aviso = useAvisoProg(dayRef, activity.id);
  // quem também está em outra atividade do mesmo dia (ex.: a atividade mudou de dia com a equipe)
  const outras = state.weeks[dayRef.weekKey]?.days[dayRef.dayIndex]?.activities.filter((a) => a.id !== activity.id) ?? [];
  const tambemEm = (wid: string) => outras.find((a) => a.workerIds.includes(wid))?.nome;
  const plantao = ehPlantao(activity);
  const sit = plantao ? situacaoPlantao(activity, !!feriadoDoDia(state, dayRef.weekKey, dayRef.dayIndex), (id) => byId.get(id)?.funcao) : null;
  const definirPapel = (campo: "liderId" | "veiculoId" | "caminhaoId", wid: string) =>
    dispatch({ type: "activity/papel", ...dayRef, activityId: activity.id, papel: campo, workerId: wid });
  /** papéis da pessoa no plantão (☎ líder, 🚐 veículo, 🚚 caminhão) */
  const papeisDe = (wid: string) => (sit ? PAPEIS_PLANTAO.filter((p) => sit[p.campo] === wid) : []);
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
    <div className={"activity" + (plantao ? " plantao" : "")}>
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
            {plantao && "📞 "}
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
              {!plantao && (
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
              )}
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
      {aviso && (
        <div className="aviso-prog">
          <span>⚠ {aviso}</span>
          {!ro && (
            <button className="btn small ghost-danger" onClick={remove}>
              Remover da escala
            </button>
          )}
        </div>
      )}
      {sit && (
        <div className={"plantao-sit " + (sit.completo ? "ok" : "pend")}>
          <span>
            {sit.liderId ? (
              <>
                ☎ Líder: <b>{byId.get(sit.liderId)?.nome}</b>
              </>
            ) : (
              <b>⚠ Defina o líder do plantão</b>
            )}
          </span>
          <span>
            Executantes: <b className="num">{sit.executantes}</b>/{sit.exigidos}
            {sit.faltamExecutantes > 0 && <b> · faltam {sit.faltamExecutantes}</b>}
            {sit.sobram > 0 && <span className="muted"> · {sit.sobram} a mais</span>}
          </span>
        </div>
      )}
      {sit && (
        <div className="plantao-papeis">
          {PAPEIS_PLANTAO.map((p) =>
            ro ? (
              <div key={p.id} className="small">
                {p.icone} {p.nome}: <b>{sit[p.campo] ? byId.get(sit[p.campo]!)?.nome : "—"}</b>
              </div>
            ) : (
              <label key={p.id} className="field">
                <span className="small">
                  {p.icone} {p.nome}
                </span>
                <select
                  className="input"
                  value={sit[p.campo] ?? ""}
                  disabled={!allocated.length}
                  onChange={(e) => definirPapel(p.campo, e.target.value)}
                  aria-label={`${p.nome} no plantão`}
                >
                  <option value="">{allocated.length ? "— escolha entre os alocados —" : "aloque a equipe primeiro"}</option>
                  {allocated.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome}
                    </option>
                  ))}
                </select>
              </label>
            ),
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
              className={"chip" + (w.ativo ? "" : " inactive") + (tambemEm(w.id) ? " conflito" : "")}
              title={tambemEm(w.id) ? `Também em: ${tambemEm(w.id)}` : w.ativo ? w.funcao : `${w.funcao} · inativo`}
            >
              <span className="chip-label">
                {tambemEm(w.id) && <span aria-label="também em outra atividade">⚠ </span>}
                {papeisDe(w.id).map((p) => p.icone).join("")}
                {papeisDe(w.id).length > 0 && " "}
                {w.nome}
                {sit?.liderId === w.id && <b> · líder</b>}
              </span>
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
      <AtrasosAtividade weekKey={dayRef.weekKey} dayIndex={dayRef.dayIndex} atividadeId={activity.id} atividadeNome={activity.nome} />
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
