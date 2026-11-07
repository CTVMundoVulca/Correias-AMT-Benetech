import { useState } from 'react';
import { addWeeks, currentWeekKey, formatDate, parseWeekKey, weekDates } from '../../domain/isoWeek';
import { WeekPicker } from './WeekPicker';

interface Props {
  weekKey: string;
  onChange: (key: string) => void;
}

/** Cabeçalho "Semana N — AAAA", intervalo de datas e navegação. */
export function WeekNav({ weekKey, onChange }: Props) {
  const { year, week } = parseWeekKey(weekKey);
  const dates = weekDates(weekKey);
  const [picking, setPicking] = useState(false);
  return (
    <div className="card week-nav">
      <button className="week-title week-title-btn" onClick={() => setPicking(true)} aria-label="Abrir calendário de semanas">
        <span className="week-title-text">
          <span className="week-h1">
            Semana <span className="num">{week}</span> — <span className="num">{year}</span>
          </span>
          <span className="muted num small">
            {formatDate(dates[0])} a {formatDate(dates[6])}
          </span>
        </span>
        <span className="cal-icon" aria-hidden>
          📅
        </span>
      </button>
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
      {picking && <WeekPicker weekKey={weekKey} onPick={onChange} onClose={() => setPicking(false)} />}
    </div>
  );
}
