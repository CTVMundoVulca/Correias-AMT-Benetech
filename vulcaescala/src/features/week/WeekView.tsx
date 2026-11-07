import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { WEEKDAYS_SHORT, locateDay, toUtcDay, weekDates } from '../../domain/isoWeek';
import { dayHasData, getDay, weekPending } from '../../domain/schedule';
import { DayBlock } from './DayBlock';
import { WeekNav } from './WeekNav';

/**
 * Dias recolhidos/abertos. A escolha da pessoa (tocar no cabeçalho do dia) fica
 * guardada no aparelho por dia da semana e vale para todas as semanas: trocar de
 * semana, de aba ou tocar nas pendências não reabre o que foi recolhido.
 * Sem escolha: sábado e domingo sem dados começam recolhidos.
 */
const PREF_KEY = 'vulcaescala:dias-recolhidos';
type Prefs = Partial<Record<number, boolean>>; // true = recolhido

function lerPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
    return p && typeof p === 'object' ? (p as Prefs) : {};
  } catch {
    return {};
  }
}
function gravarPrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

function isOpen(prefs: Prefs, state: ReturnType<typeof useStore>['state'], weekKey: string, i: number): boolean {
  const p = prefs[i];
  if (p !== undefined) return !p;
  return !(i >= 5 && !dayHasData(getDay(state, weekKey, i)));
}

interface Props {
  weekKey: string;
  onWeekChange: (key: string) => void;
  onGoToWorkers: () => void;
}

export function WeekView({ weekKey, onWeekChange, onGoToWorkers }: Props) {
  const { state } = useStore();
  const [prefs, setPrefs] = useState<Prefs>(lerPrefs);
  const setRecolhido = (i: number, recolhido: boolean) =>
    setPrefs((p) => {
      const n = { ...p, [i]: recolhido };
      gravarPrefs(n);
      return n;
    });
  const [scrollTo, setScrollTo] = useState<number | null>(null);

  const dates = weekDates(weekKey);
  const today = locateDay(toUtcDay(new Date()));
  const pending = weekPending(state, weekKey);
  const pendingDays = pending.days.filter((d) => d.count > 0);
  const activeCount = state.workers.filter((w) => w.ativo).length;

  const goTo = (key: string) => onWeekChange(key);

  // botão de pendência ("Seg: 3"): abre SÓ aquele dia e rola até ele
  const showDay = (i: number) => {
    if (!isOpen(prefs, state, weekKey, i)) setRecolhido(i, false);
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
          open={isOpen(prefs, state, weekKey, i)}
          onToggle={() => setRecolhido(i, isOpen(prefs, state, weekKey, i))}
        />
      ))}
    </section>
  );
}
