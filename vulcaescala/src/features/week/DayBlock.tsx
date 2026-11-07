import { useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { newId } from '../../domain/ids';
import { WEEKDAYS, formatDate } from '../../domain/isoWeek';
import { allocatedIds, dayHasData, getDay, pendingWorkers } from '../../domain/schedule';
import { Worker, tipoAusencia } from '../../domain/types';
import { useToast } from '../../ui/Toast';
import { ActivityCard } from './ActivityCard';
import { AbsencePicker } from './AbsencePicker';
import { PendingWorkerDialog } from './PendingWorkerDialog';

interface Props {
  weekKey: string;
  dayIndex: number;
  date: Date;
  isToday: boolean;
  open: boolean;
  onToggle: () => void;
}

export function DayBlock({ weekKey, dayIndex, date, isToday, open, onToggle }: Props) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const day = getDay(state, weekKey, dayIndex);
  const [newName, setNewName] = useState('');
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [pendingWorker, setPendingWorker] = useState<Worker | null>(null);

  const ref = { weekKey, dayIndex };
  const byId = new Map(state.workers.map((w) => [w.id, w]));
  const pending = pendingWorkers(day, state.workers);
  const allocated = allocatedIds(day).size;
  const hasActivities = day.activities.length > 0;
  const dim = dayIndex >= 5 && !dayHasData(day);
  const dayLabel = `${WEEKDAYS[dayIndex]}, ${formatDate(date)}`;
  const bodyId = `dia-${dayIndex}-corpo`;

  const addActivity = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    dispatch({ type: 'activity/add', ...ref, id: newId(), nome: newName });
    setNewName('');
    toast('Atividade adicionada');
  };

  return (
    <article id={`dia-${dayIndex}`} className={'card day' + (isToday ? ' today' : '') + (dim ? ' dim' : '')}>
      <div
        className="day-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
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
            <strong>{WEEKDAYS[dayIndex]}</strong> <span className="num muted">{formatDate(date)}</span>
            {isToday && (
              <>
                {' '}
                <span className="badge today">Hoje</span>
              </>
            )}
          </div>
          <div className="day-counts">
            <span className="num">{day.activities.length}</span> ativ. · <span className="num">{allocated}</span>{' '}
            alocado{allocated === 1 ? '' : 's'} · <span className="num">{day.absences.length}</span> ausente
            {day.absences.length === 1 ? '' : 's'}
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
          {hasActivities &&
            (pending.length ? (
              <div className="pend-strip warn">
                <strong>Sem alocação ({pending.length}):</strong> toque no nome para alocar ou registrar ausência.
                <div className="chips">
                  {pending.map((w) => (
                    <button key={w.id} className="pend-name" onClick={() => setPendingWorker(w)}>
                      {w.nome}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pend-strip ok">✓ Todo o efetivo ativo está alocado ou com ausência registrada.</div>
            ))}

          <form className="row nowrap" onSubmit={addActivity}>
            <input
              className="input grow"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nova atividade"
              aria-label={`Nova atividade em ${dayLabel}`}
              enterKeyHint="done"
            />
            <button className="btn primary" type="submit" disabled={!newName.trim()}>
              Adicionar
            </button>
          </form>

          {day.activities.map((a) => (
            <ActivityCard key={a.id} dayRef={ref} dayLabel={dayLabel} activity={a} />
          ))}

          <div className="absences">
            <div className="row between">
              <h3>Ausências</h3>
              <button className="btn small" onClick={() => setAbsenceOpen(true)}>
                Registrar ausência
              </button>
            </div>
            {day.absences.length === 0 ? (
              <p className="muted small">Nenhuma ausência registrada.</p>
            ) : (
              <div className="chips">
                {[...new Set([...state.ausencias.map((t) => t.id), ...day.absences.map((a) => a.tipo)])].flatMap((tipo) =>
                  day.absences
                    .filter((a) => a.tipo === tipo)
                    .map((a) => {
                      const w = byId.get(a.workerId);
                      return (
                        <span key={a.workerId} className={`chip cor-${tipoAusencia(state, tipo).cor}`}>
                          <span className="chip-label">
                            {w?.nome ?? '?'} · {tipoAusencia(state, tipo).nome}
                          </span>
                          <button
                            className="chip-x"
                            aria-label={`Remover ausência de ${w?.nome ?? ''}`}
                            onClick={() => {
                              dispatch({ type: 'absence/set', ...ref, workerId: a.workerId, tipo: null });
                              toast('Ausência removida');
                            }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    }),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {absenceOpen && <AbsencePicker dayRef={ref} dayLabel={dayLabel} onClose={() => setAbsenceOpen(false)} />}
      {pendingWorker && (
        <PendingWorkerDialog dayRef={ref} dayLabel={dayLabel} worker={pendingWorker} onClose={() => setPendingWorker(null)} />
      )}
    </article>
  );
}
