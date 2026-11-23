import { useState, type FormEvent } from "react";
import { useSomenteLeitura, useStore } from "../../state/store";
import { newId } from "../../domain/ids";
import { WEEKDAYS, formatDate, toIsoDate } from "../../domain/isoWeek";
import {
  allocatedIds,
  dayHasData,
  feriadoDoDia,
  folgaAutoDoDia,
  folgasDeFeriado,
  getDay,
  pendingWorkers,
} from "../../domain/schedule";
import { Worker, tipoAusencia } from "../../domain/types";
import { PLANTAO_ID, PLANTAO_NOME, ehPlantao, executantesExigidos, situacaoPlantao } from "../../domain/plantao";
import { usePlantao } from "./usePlantao";
import { useToast } from "../../ui/Toast";
import { ActivityCard } from "./ActivityCard";
import { AbsencePicker } from "./AbsencePicker";
import { PendingWorkerDialog } from "./PendingWorkerDialog";
import { ProgDoDia } from "./ProgDoDia";
import { NovaAtividadeProg } from "./NovaAtividadeProg";
import { useAtrasosApi } from "../atrasos/AtrasosCtx";

interface Props {
  weekKey: string;
  dayIndex: number;
  date: Date;
  isToday: boolean;
  open: boolean;
  onToggle: () => void;
}

export function DayBlock({
  weekKey,
  dayIndex,
  date,
  isToday,
  open,
  onToggle,
}: Props) {
  const { state, dispatch } = useStore();
  const ro = useSomenteLeitura();
  const toast = useToast();
  const day = getDay(state, weekKey, dayIndex);
  const [newName, setNewName] = useState("");
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [pendingWorker, setPendingWorker] = useState<Worker | null>(null);
  // com a nuvem ligada, a atividade nova é lançada pelo formulário completo da programação
  const cloudApi = useAtrasosApi();
  const [novaProg, setNovaProg] = useState(false);

  const ref = { weekKey, dayIndex };
  const byId = new Map(state.workers.map((w) => [w.id, w]));
  const feriado = feriadoDoDia(state, weekKey, dayIndex);
  // feriado ou fim de semana: quem não está escalado fica de folga automaticamente
  const folgaAuto = folgaAutoDoDia(state, weekKey, dayIndex);
  const dataDoDia = toIsoDate(date);
  const pending = pendingWorkers(day, state.workers, dataDoDia, folgaAuto);
  const folgas = folgasDeFeriado(day, state.workers, folgaAuto, dataDoDia);
  const ausentes = day.absences.length + folgas.length;
  const [folgaWorker, setFolgaWorker] = useState<Worker | null>(null);
  const allocated = allocatedIds(day).size;
  const hasActivities = day.activities.length > 0;
  const dim = dayIndex >= 5 && !dayHasData(day);
  const dayLabel = `${WEEKDAYS[dayIndex]}, ${formatDate(date)}`;
  const bodyId = `dia-${dayIndex}-corpo`;

  // plantão: fins de semana e feriados (1 líder + 6; feriado: 1 líder + 8)
  const plantao = day.activities.find(ehPlantao);
  const per = usePlantao(ref);
  // exigência pelo PERÍODO (fim de semana emendado com feriado/enforcado conta como feriado)
  const sitPlantao = plantao ? situacaoPlantao(plantao, per.feriado, (id) => byId.get(id)?.funcao) : null;
  const criarPlantao = () => {
    per.despachar({ type: "activity/add", ...ref, id: PLANTAO_ID, nome: PLANTAO_NOME });
    toast(per.primeiro && per.periodo && per.periodo.dias.length > 1 ? `Plantão criado de ${per.descricao}` : "Plantão criado: aloque a equipe e defina o líder");
  };
  // o plantão aparece primeiro no dia
  const atividades = [...day.activities].sort((a, b) => Number(ehPlantao(b)) - Number(ehPlantao(a)));

  const addActivity = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    dispatch({ type: "activity/add", ...ref, id: newId(), nome: newName });
    setNewName("");
    toast("Atividade adicionada");
  };

  return (
    <article
      id={`dia-${dayIndex}`}
      className={"card day" + (isToday ? " today" : "") + (dim ? " dim" : "")}
    >
      <div
        className="day-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="chevron" aria-hidden>
          ›
        </span>
        <div className="day-title">
          <div>
            <strong>{WEEKDAYS[dayIndex]}</strong>{" "}
            <span className="num muted">{formatDate(date)}</span>
            {isToday && (
              <>
                {" "}
                <span className="badge today">Hoje</span>
              </>
            )}
            {feriado && (
              <>
                {" "}
                <span className="badge feriado" title={feriado}>
                  🎌 {feriado}
                </span>
              </>
            )}
            {sitPlantao && (
              <>
                {" "}
                <span
                  className={"badge " + (sitPlantao.completo ? "ok" : "pend")}
                  title={`Plantão: ${sitPlantao.liderId ? "líder definido" : "sem líder"} · ${sitPlantao.executantes}/${sitPlantao.exigidos} executantes`}
                >
                  📞 Plantão {sitPlantao.completo ? "✓" : `${sitPlantao.executantes}/${sitPlantao.exigidos}${sitPlantao.liderId ? "" : " · sem líder"}`}
                </span>
              </>
            )}
          </div>
          <div className="day-counts">
            <span className="num">{day.activities.length}</span> ativ. ·{" "}
            <span className="num">{allocated}</span> alocado
            {allocated === 1 ? "" : "s"} ·{" "}
            <span className="num">{ausentes}</span> ausente
            {ausentes === 1 ? "" : "s"}
          </div>
        </div>
        {hasActivities &&
          (pending.length ? (
            <span className="badge pend">
              ⚠ <span className="num">{pending.length}</span> sem alocação
            </span>
          ) : (
            <span className="badge ok">✓ Todos alocados</span>
          ))}
      </div>

      {open && (
        <div className="day-body" id={bodyId}>
          {folgaAuto && (
            <div className="pend-strip feriado">
              <strong>
                {feriado ? `Feriado — ${feriado}.` : "Fim de semana."}
              </strong>{" "}
              Quem não estiver em nenhuma atividade fica de{" "}
              <b>folga automaticamente</b>
              {folgas.length ? ` (${folgas.length})` : ""}.
              {ro
                ? ""
                : " Toque no nome para alocar ou registrar outra ausência."}
            </div>
          )}
          {hasActivities &&
            (pending.length ? (
              <div className="pend-strip warn">
                <strong>Sem alocação ({pending.length}):</strong>
                {ro ? "" : " toque no nome para alocar ou registrar ausência."}
                <div className="chips">
                  {pending.map((w) =>
                    ro ? (
                      <span key={w.id} className="pend-name">
                        {w.nome}
                      </span>
                    ) : (
                      <button
                        key={w.id}
                        className="pend-name"
                        onClick={() => setPendingWorker(w)}
                      >
                        {w.nome}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <div className="pend-strip ok">
                ✓ Todo o efetivo ativo está alocado ou com ausência registrada.
              </div>
            ))}

          {!ro && (
            <ProgDoDia
              data={toIsoDate(date)}
              day={day}
              weekKey={weekKey}
              dayIndex={dayIndex}
            />
          )}

          {!ro &&
            (cloudApi ? (
              <button
                className="btn add-ativ"
                type="button"
                onClick={() => setNovaProg(true)}
                aria-label={`Nova atividade em ${dayLabel}`}
              >
                + Atividade
              </button>
            ) : (
              <form className="row nowrap" onSubmit={addActivity}>
                <input
                  className="input grow"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nova atividade"
                  aria-label={`Nova atividade em ${dayLabel}`}
                  enterKeyHint="done"
                />
                <button
                  className="btn primary"
                  type="submit"
                  disabled={!newName.trim()}
                >
                  Adicionar
                </button>
              </form>
            ))}
          {novaProg && (
            <NovaAtividadeProg
              data={toIsoDate(date)}
              dia={ref}
              onClose={() => setNovaProg(false)}
            />
          )}

          {folgaAuto && !plantao && !ro && (
            <div className="pend-strip plantao-criar">
              <span>
                <b>📞 Plantão</b> {per.descricao} — {per.feriado ? "com feriado" : "fim de semana"}: 1 líder + {executantesExigidos(per.feriado)} executantes.
                {per.primeiro && per.periodo && per.periodo.dias.length > 1 && " O que preencher aqui vale para os demais dias."}
              </span>
              <button className="btn small primary" onClick={criarPlantao}>
                + Criar plantão
              </button>
            </div>
          )}

          {atividades.map((a) => (
            <ActivityCard
              key={a.id}
              dayRef={ref}
              dayLabel={dayLabel}
              activity={a}
            />
          ))}

          <div className="absences">
            <div className="row between">
              <h3>Ausências</h3>
              {!ro && (
                <button
                  className="btn small"
                  onClick={() => setAbsenceOpen(true)}
                >
                  Registrar ausência
                </button>
              )}
            </div>
            {folgas.length > 0 && (
              <div className="chips">
                {folgas.map((w) => (
                  <button
                    key={w.id}
                    className={`chip chip-btn cor-${tipoAusencia(state, "folga").cor}`}
                    onClick={() => !ro && setFolgaWorker(w)}
                    disabled={ro}
                    title={
                      ro
                        ? "Folga automática"
                        : "Folga automática — toque para alterar"
                    }
                  >
                    <span className="chip-label">
                      {w.nome} · {tipoAusencia(state, "folga").nome}{" "}
                      (automática)
                    </span>
                  </button>
                ))}
              </div>
            )}
            {day.absences.length === 0 ? (
              folgas.length ? null : (
                <p className="muted small">Nenhuma ausência registrada.</p>
              )
            ) : (
              <div className="chips">
                {[
                  ...new Set([
                    ...state.ausencias.map((t) => t.id),
                    ...day.absences.map((a) => a.tipo),
                  ]),
                ].flatMap((tipo) =>
                  day.absences
                    .filter((a) => a.tipo === tipo)
                    .map((a) => {
                      const w = byId.get(a.workerId);
                      return (
                        <span
                          key={a.workerId}
                          className={`chip cor-${tipoAusencia(state, tipo).cor}`}
                        >
                          <span className="chip-label">
                            {w?.nome ?? "?"} · {tipoAusencia(state, tipo).nome}
                          </span>
                          {!ro && (
                            <button
                              className="chip-x"
                              aria-label={`Remover ausência de ${w?.nome ?? ""}`}
                              onClick={() => {
                                dispatch({
                                  type: "absence/set",
                                  ...ref,
                                  workerId: a.workerId,
                                  tipo: null,
                                });
                                toast("Ausência removida");
                              }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    }),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {absenceOpen && (
        <AbsencePicker
          dayRef={ref}
          dayLabel={dayLabel}
          onClose={() => setAbsenceOpen(false)}
        />
      )}
      {folgaWorker && (
        <PendingWorkerDialog
          dayRef={ref}
          dayLabel={`${dayLabel} · folga automática (${feriado ? "feriado" : "fim de semana"})`}
          worker={folgaWorker}
          onClose={() => setFolgaWorker(null)}
        />
      )}
      {pendingWorker && (
        <PendingWorkerDialog
          dayRef={ref}
          dayLabel={dayLabel}
          worker={pendingWorker}
          onClose={() => setPendingWorker(null)}
        />
      )}
    </article>
  );
}
