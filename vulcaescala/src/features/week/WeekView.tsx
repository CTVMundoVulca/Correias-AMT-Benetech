import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { WEEKDAYS_SHORT, locateDay, toUtcDay, weekDates } from '../../domain/isoWeek';
import { dayHasData, getDay, weekPending } from '../../domain/schedule';
import { DayBlock } from './DayBlock';
import { WeekNav } from './WeekNav';

/** Estado inicial recolhido/expandido: sábado e domingo sem dados começam recolhidos. */
function initialOpen(state: ReturnType<typeof useStore>['state'], weekKey: string): boolean[] {
  return Array.from({ length: 7 }, (_, i) => !(i >= 5 && !dayHasData(getDay(state, weekKey, i))));
}

interface Props {
  weekKey: string;
  onWeekChange: (key: string) => void;
  onGoToWorkers: () => void;
}

export function WeekView({ weekKey, onWeekChange, onGoToWorkers }: Props) {
  const { state } = useStore();
  const [open, setOpen] = useState<boolean[]>(() => initialOpen(state, weekKey));
  const [scrollTo, setScrollTo] = useState<number | null>(null);

  const dates = weekDates(weekKey);
  const today = locateDay(toUtcDay(new Date()));
  const pending = weekPending(state, weekKey);
  const pendingDays = pending.days.filter((d) => d.count > 0);
  const activeCount = state.workers.filter((w) => w.ativo).length;

  const goTo = (key: string) => {
    setOpen(initialOpen(state, key));
    onWeekChange(key);
  };

  const showDay = (i: number) => {
    setOpen((o) => o.map((v, j) => (j === i ? true : v)));
    setScrollTo(i);
  };

  useEffect(() => {
    if (scrollTo === null) return;
    const el = document.getElementById(`dia-${scrollTo}`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el?.querySelector<HTMLElement>('.day-head')?.focus({ preventScroll: true });
    setScrollTo(null);
  }, [scrollTo]);

  return (
    <section>
      <WeekNav weekKey={weekKey} onChange={goTo} />

      {activeCount === 0 && (
        <div className="banner info">
          Nenhum colaborador ativo.{' '}
          <button className="link" onClick={onGoToWorkers}>
            Cadastrar efetivo
          </button>
        </div>
      )}

      {pending.hasActivities &&
        (pending.total > 0 ? (
          <div className="pend-board warn" role="status">
            <strong>
              ⚠ <span className="num">{pending.total}</span> pendência{pending.total > 1 ? 's' : ''} de alocação em{' '}
              <span className="num">{pendingDays.length}</span> dia{pendingDays.length > 1 ? 's' : ''}
            </strong>
            <div className="pend-days">
              {pendingDays.map((d) => (
                <button key={d.dayIndex} className="pend-day" onClick={() => showDay(d.dayIndex)}>
                  {WEEKDAYS_SHORT[d.dayIndex]}: <span className="num">{d.count}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="pend-board ok" role="status">
            <strong>✓ Nenhuma pendência de alocação nesta semana</strong>
          </div>
        ))}

      {dates.map((date, i) => (
        <DayBlock
          key={`${weekKey}-${i}`}
          weekKey={weekKey}
          dayIndex={i}
          date={date}
          isToday={today.weekKey === weekKey && today.dayIndex === i}
          open={open[i]}
          onToggle={() => setOpen((o) => o.map((v, j) => (j === i ? !v : v)))}
        />
      ))}
    </section>
  );
}
