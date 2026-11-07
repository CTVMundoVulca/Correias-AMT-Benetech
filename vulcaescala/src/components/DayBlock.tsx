import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { newId } from '../state/reducer';
import { WEEKDAYS, formatDate } from '../domain/isoWeek';
import { allocatedIds, dayHasData, getDay, pendingWorkers, previousDayWithData } from '../domain/schedule';
import { ABSENCE_LABELS, ABSENCE_TYPES } from '../domain/types';
import { ActivityCard } from './ActivityCard';
import { AbsencePicker } from './AbsencePicker';
import { PendingPanel } from './PendingPanel';
import { dayAsText } from './dayText';

interface Props {
  weekKey: string;
  dayIndex: number;
  date: Date;
  isToday: boolean;
}

export function DayBlock({ weekKey, dayIndex, date, isToday }: Props) {
  const { state, dispatch } = useStore();
  const day = getDay(state, weekKey, dayIndex);
  const hasData = dayHasData(day);
  const isWeekend = dayIndex >= 5;
  const [open, setOpen] = useState(() => !(isWeekend && !hasData));
  const [newName, setNewName] = useState('');
  const [modal, setModal] = useState<null | 'absence' | 'pending'>(null);
  const [copied, setCopied] = useState(false);

  const ref = { weekKey, dayIndex };
  const workersById = new Map(state.workers.map((w) => [w.id, w]));
  const pending = pendingWorkers(day, state.workers);
  const allocated = allocatedIds(day).size;
  const activeCount = state.workers.filter((w) => w.ativo).length;
  const dayLabel = `${WEEKDAYS[dayIndex]}, ${formatDate(date)}`;

  const addActivity = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    dispatch({ type: 'activity/add', ...ref, id: newId(), nome: newName });
    setNewName('');
  };

  const prev = !hasData ? previousDayWithData(state, weekKey, dayIndex) : null;

  const copyText = async () => {
    const text = dayAsText(dayLabel, day, workersById, pending);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o texto abaixo:', text);
    }
  };

  let badge: JSX.Element | null = null;
  if (activeCount > 0) {
    if (isWeekend && !hasData) badge = <span className="badge neutral">Sem escala</span>;
    else if (pending.length)
      badge = (
        <button
          className="badge warn"
          onClick={(e) => {
            e.stopPropagation();
            setModal('pending');
          }}
          aria-label={`${pending.length} colaborador(es) sem alocação. Ver lista`}
        >
          ⚠ {pending.length} pendente{pending.length > 1 ? 's' : ''}
        </button>
      );
    else badge = <span className="badge ok">✓ Completo</span>;
  }

  return (
    <article className={'day card' + (isToday ? ' today' : '') + (isWeekend && !hasData ? ' dim' : '')}>
      <div
        className="day-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className="chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <div className="day-title">
          <strong>{WEEKDAYS[dayIndex]}</strong> <span className="muted">{formatDate(date)}</span>
          {isToday && <span className="badge today-badge">Hoje</span>}
          <div className="small muted">
            {day.activities.length} ativ. · {allocated} alocado{allocated === 1 ? '' : 's'} · {day.absences.length}{' '}
            ausente{day.absences.length === 1 ? '' : 's'}
          </div>
        </div>
        {badge}
      </div>

      {open && (
        <div className="day-body">
          <form className="row" onSubmit={addActivity}>
            <input
              className="input grow"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nova atividade (ex.: EMENDA TR-05)"
              aria-label={`Nova atividade em ${dayLabel}`}
              enterKeyHint="done"
            />
            <button className="btn primary" type="submit" disabled={!newName.trim()}>
              Criar
            </button>
          </form>

          {day.activities.map((a) => (
            <ActivityCard key={a.id} dayRef={ref} dayLabel={dayLabel} activity={a} />
          ))}

          <div className="absences">
            <div className="row between">
              <h3>Ausências</h3>
              <button className="btn small" onClick={() => setModal('absence')} disabled={activeCount === 0}>
                Registrar ausência
              </button>
            </div>
            {day.absences.length === 0 ? (
              <p className="muted small">Nenhuma ausência registrada.</p>
            ) : (
              ABSENCE_TYPES.map((tipo) => {
                const list = day.absences.filter((a) => a.tipo === tipo);
                if (!list.length) return null;
                return (
                  <div key={tipo} className="absence-group">
                    <span className={`tag abs-${tipo}`}>{ABSENCE_LABELS[tipo]}</span>
                    <div className="chips">
                      {list.map((a) => {
                        const w = workersById.get(a.workerId);
                        return (
                          <span key={a.workerId} className="chip">
                            {w?.nome ?? '?'}
                            <button
                              className="chip-x"
                              aria-label={`Retirar ausência de ${w?.nome}`}
                              onClick={() => dispatch({ type: 'absence/set', ...ref, workerId: a.workerId, tipo: null })}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="day-actions">
            {prev && (
              <button
                className="btn small"
                onClick={() => {
                  const withAbsences = window.confirm(
                    `Copiar a escala de ${WEEKDAYS[prev.dayIndex]}, ${formatDate(prev.date)}.\n\nCopiar também as ausências? (OK = sim, Cancelar = só atividades)`,
                  );
                  dispatch({ type: 'day/copy', ...ref, from: prev, withAbsences });
                }}
              >
                Repetir {WEEKDAYS[prev.dayIndex].toLowerCase()} {formatDate(prev.date).slice(0, 5)}
              </button>
            )}
            {hasData && (
              <>
                <button className="btn small" onClick={copyText}>
                  {copied ? 'Copiado ✓' : 'Copiar como texto'}
                </button>
                <button
                  className="btn small danger-ghost"
                  onClick={() => window.confirm(`Apagar toda a escala de ${dayLabel}?`) && dispatch({ type: 'day/clear', ...ref })}
                >
                  Limpar dia
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {modal === 'absence' && <AbsencePicker dayRef={ref} dayLabel={dayLabel} onClose={() => setModal(null)} />}
      {modal === 'pending' && <PendingPanel dayRef={ref} dayLabel={dayLabel} onClose={() => setModal(null)} />}
    </article>
  );
}
