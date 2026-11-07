import { addWeeks, currentWeekKey, formatDate, parseWeekKey, weekDates } from '../../domain/isoWeek';

interface Props {
  weekKey: string;
  onChange: (key: string) => void;
}

/** Cabeçalho "Semana N — AAAA", intervalo de datas e navegação. */
export function WeekNav({ weekKey, onChange }: Props) {
  const { year, week } = parseWeekKey(weekKey);
  const dates = weekDates(weekKey);
  return (
    <div className="card week-nav">
      <div className="week-title">
        <h1>
          Semana <span className="num">{week}</span> — <span className="num">{year}</span>
        </h1>
        <div className="muted num small">
          {formatDate(dates[0])} a {formatDate(dates[6])}
        </div>
      </div>
      <div className="week-buttons">
        <button className="btn" onClick={() => onChange(addWeeks(weekKey, -1))}>
          ‹ Anterior
        </button>
        <button className="btn" disabled={weekKey === currentWeekKey()} onClick={() => onChange(currentWeekKey())}>
          Semana atual
        </button>
        <button className="btn" onClick={() => onChange(addWeeks(weekKey, 1))}>
          Próxima ›
        </button>
      </div>
    </div>
  );
}
