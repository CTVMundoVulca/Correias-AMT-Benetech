import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { addWeeks, currentWeekKey, formatDate, parseWeekKey, weekDates, locateDay, toUtcDay } from '../domain/isoWeek';
import { getDay, pendingWorkers } from '../domain/schedule';
import { DayBlock } from './DayBlock';

export function WeekView({ onGoToWorkers }: { onGoToWorkers: () => void }) {
  const { state } = useStore();
  const [weekKey, setWeekKey] = useState(currentWeekKey);
  const { year, week } = parseWeekKey(weekKey);
  const dates = weekDates(weekKey);
  const today = locateDay(toUtcDay(new Date()));
  const isCurrent = weekKey === currentWeekKey();
  const activeCount = state.workers.filter((w) => w.ativo).length;

  const weekPending = useMemo(
    () =>
      dates.reduce((sum, _, i) => {
        const day = getDay(state, weekKey, i);
        // fim de semana sem nada lançado não conta como pendência
        if (i >= 5 && !day.activities.length && !day.absences.length) return sum;
        return sum + pendingWorkers(day, state.workers).length;
      }, 0),
    [state, weekKey, dates],
  );

  return (
    <section>
      <div className="week-nav card">
        <div className="week-title">
          <h1>
            Semana {week} — {year}
          </h1>
          <div className="muted">
            {formatDate(dates[0])} a {formatDate(dates[6])}
          </div>
          {activeCount > 0 && (
            <div className={'small ' + (weekPending ? 'text-warn' : 'text-ok')}>
              {weekPending ? `${weekPending} pendência(s) de alocação na semana` : 'Semana sem pendências'}
            </div>
          )}
        </div>
        <div className="week-buttons">
          <button className="btn" onClick={() => setWeekKey((k) => addWeeks(k, -1))}>
            ‹ Anterior
          </button>
          <button className="btn" disabled={isCurrent} onClick={() => setWeekKey(currentWeekKey())}>
            Semana atual
          </button>
          <button className="btn" onClick={() => setWeekKey((k) => addWeeks(k, 1))}>
            Próxima ›
          </button>
        </div>
      </div>

      {activeCount === 0 && (
        <div className="banner info">
          Nenhum colaborador ativo cadastrado.{' '}
          <button className="link" onClick={onGoToWorkers}>
            Cadastre o efetivo
          </button>{' '}
          para começar a alocar.
        </div>
      )}

      {/* key por semana: o estado recolhido/expandido reinicia ao trocar de semana */}
      <div key={weekKey}>
        {dates.map((date, i) => (
          <DayBlock
            key={i}
            weekKey={weekKey}
            dayIndex={i}
            date={date}
            isToday={today.weekKey === weekKey && today.dayIndex === i}
          />
        ))}
      </div>
    </section>
  );
}
