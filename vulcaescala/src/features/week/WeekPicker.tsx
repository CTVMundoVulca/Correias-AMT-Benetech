import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import {
  MONTHS,
  MONTHS_SHORT,
  currentWeekKey,
  formatDate,
  monthOfWeek,
  monthWeeks,
  toUtcDay,
} from '../../domain/isoWeek';
import { weekStatus, type WeekStatus } from '../../domain/schedule';
import { Modal } from '../../ui/Modal';

interface Props {
  weekKey: string;
  onPick: (key: string) => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<WeekStatus, string> = {
  vazia: 'sem escala',
  ok: 'escala completa',
  pendente: 'com pendências',
};
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Calendário mensal: cada linha é uma semana; tocar abre aquela semana. */
export function WeekPicker({ weekKey, onPick, onClose }: Props) {
  const { state } = useStore();
  const start = monthOfWeek(weekKey);
  const [year, setYear] = useState(start.year);
  const [month, setMonth] = useState(start.month);
  const today = toUtcDay(new Date()).getTime();
  const current = currentWeekKey();

  const weeks = useMemo(
    () => monthWeeks(year, month).map((w) => ({ ...w, status: weekStatus(state, w.weekKey) })),
    [state, year, month],
  );

  // meses do ano com escala lançada (marca nos botões de mês)
  const monthMarks = useMemo(
    () =>
      MONTHS.map((_, m) => {
        const st = monthWeeks(year, m)
          .filter((w) => monthOfWeek(w.weekKey).month === m)
          .map((w) => weekStatus(state, w.weekKey));
        return st.includes('pendente') ? 'pendente' : st.includes('ok') ? 'ok' : 'vazia';
      }),
    [state, year],
  );

  const pick = (key: string) => {
    onPick(key);
    onClose();
  };

  return (
    <Modal
      title="Escolher semana"
      subtitle="Toque na semana para abrir"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => pick(current)} disabled={weekKey === current}>
            Semana atual
          </button>
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div className="cal-year">
        <button className="btn small" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
          ‹
        </button>
        <strong className="num">{year}</strong>
        <button className="btn small" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
          ›
        </button>
      </div>

      <div className="cal-months" role="group" aria-label="Mês">
        {MONTHS_SHORT.map((m, i) => (
          <button
            key={m}
            className={'cal-month' + (i === month ? ' on' : '')}
            aria-pressed={i === month}
            aria-label={`${MONTHS[i]}${monthMarks[i] !== 'vazia' ? ` (${STATUS_LABEL[monthMarks[i] as WeekStatus]})` : ''}`}
            onClick={() => setMonth(i)}
          >
            {m}
            {monthMarks[i] !== 'vazia' && <span className={`cal-dot ${monthMarks[i]}`} aria-hidden />}
          </button>
        ))}
      </div>

      <h3 className="cal-title">
        {MONTHS[month]} de <span className="num">{year}</span>
      </h3>

      <div className="cal-grid" role="list">
        <div className="cal-row cal-head" aria-hidden>
          <span className="cal-wk">Sem</span>
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {weeks.map((w) => {
          const selected = w.weekKey === weekKey;
          return (
            <button
              key={w.weekKey}
              role="listitem"
              className={'cal-row' + (selected ? ' selected' : '') + (w.weekKey === current ? ' current' : '')}
              onClick={() => pick(w.weekKey)}
              aria-current={selected ? 'true' : undefined}
              aria-label={`Semana ${w.week}, ${formatDate(w.days[0])} a ${formatDate(w.days[6])}, ${STATUS_LABEL[w.status]}${w.weekKey === current ? ', semana atual' : ''}`}
            >
              <span className="cal-wk">
                <span className="num">{w.week}</span>
                <span className={`cal-dot ${w.status}`} aria-hidden />
              </span>
              {w.days.map((d) => (
                <span
                  key={d.getTime()}
                  className={
                    'num' + (d.getUTCMonth() !== month ? ' out' : '') + (d.getTime() === today ? ' today' : '')
                  }
                >
                  {d.getUTCDate()}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      <div className="legend">
        <span>
          <span className="cal-dot ok" aria-hidden /> escala completa
        </span>
        <span>
          <span className="cal-dot pendente" aria-hidden /> com pendências
        </span>
        <span>
          <span className="cal-dot vazia" aria-hidden /> sem escala
        </span>
      </div>
    </Modal>
  );
}
