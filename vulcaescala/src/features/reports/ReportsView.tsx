import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import {
  WEEKDAYS_SHORT,
  addDays,
  currentWeekKey,
  formatDate,
  fromIsoDate,
  toIsoDate,
  weekDates,
} from '../../domain/isoWeek';
import { activityHistory, countBy, iterateDays, pendingWorkers, sortByName, workerHistory, dayHasData } from '../../domain/schedule';
import { ABSENCE_LABELS } from '../../domain/types';

type Mode = 'colaborador' | 'atividade' | 'resumo';

const weekdayOf = (d: Date) => WEEKDAYS_SHORT[(d.getUTCDay() + 6) % 7];

export function ReportsView() {
  const { state } = useStore();
  const [mode, setMode] = useState<Mode>('colaborador');
  const thisWeek = weekDates(currentWeekKey());
  const [from, setFrom] = useState(toIsoDate(addDays(thisWeek[0], -21)));
  const [to, setTo] = useState(toIsoDate(thisWeek[6]));
  const fromD = fromIsoDate(from);
  const toD = fromIsoDate(to);
  const validRange = !!fromD && !!toD && fromD.getTime() <= toD.getTime();

  return (
    <section>
      <div className="card pad">
        <h1>Consultas</h1>
        <div className="segmented section-gap" role="tablist">
          {(
            [
              ['colaborador', 'Por colaborador'],
              ['atividade', 'Por atividade'],
              ['resumo', 'Resumo'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} className={'seg' + (mode === id ? ' on' : '')} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="two-cols section-gap">
          <label className="field">
            De
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            Até
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {!validRange && <p className="text-danger small">Período inválido.</p>}
      </div>
      {validRange && mode === 'colaborador' && <ByWorker from={fromD!} to={toD!} />}
      {validRange && mode === 'atividade' && <ByActivity from={fromD!} to={toD!} />}
      {validRange && mode === 'resumo' && <Summary from={fromD!} to={toD!} />}
      {Object.keys(state.weeks).length === 0 && <p className="muted">Ainda não há escalas lançadas.</p>}
    </section>
  );
}

function ByWorker({ from, to }: { from: Date; to: Date }) {
  const { state } = useStore();
  const workers = sortByName(state.workers);
  const [id, setId] = useState(workers[0]?.id ?? '');
  const rows = useMemo(() => (id ? workerHistory(state, id, from, to) : []), [state, id, from, to]);
  const worked = rows.filter((r) => r.activities.length).length;
  const byActivity = countBy(rows, (r) => r.activities);
  const byAbsence = countBy(rows, (r) => (r.absence ? [ABSENCE_LABELS[r.absence]] : []));

  return (
    <div className="card pad">
      <select className="input" value={id} onChange={(e) => setId(e.target.value)} aria-label="Colaborador">
        {workers.map((w) => (
          <option key={w.id} value={w.id}>
            {w.nome}
            {w.ativo ? '' : ' (inativo)'}
          </option>
        ))}
      </select>
      {id && (
        <>
          <div className="kpis section-gap">
            <div className="kpi">
              <b>{worked}</b>
              <span>dias trabalhados</span>
            </div>
            <div className="kpi">
              <b>{rows.length - worked}</b>
              <span>dias ausente</span>
            </div>
          </div>
          {byActivity.length > 0 && (
            <p className="small">
              <b>Atividades:</b> {byActivity.map(([n, c]) => `${n} (${c})`).join(' · ')}
            </p>
          )}
          {byAbsence.length > 0 && (
            <p className="small">
              <b>Ausências:</b> {byAbsence.map(([n, c]) => `${n} (${c})`).join(' · ')}
            </p>
          )}
          <ul className="plain-list history">
            {rows.map((r) => (
              <li key={r.date.getTime()}>
                <span className="hist-date">
                  {weekdayOf(r.date)} {formatDate(r.date)}
                </span>
                <span>
                  {r.absence ? <span className={`tag abs-${r.absence}`}>{ABSENCE_LABELS[r.absence]}</span> : r.activities.join(', ')}
                </span>
              </li>
            ))}
            {rows.length === 0 && <li className="muted small">Nenhum registro no período.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function ByActivity({ from, to }: { from: Date; to: Date }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const byId = new Map(state.workers.map((w) => [w.id, w.nome]));
  const rows = useMemo(() => activityHistory(state, q, from, to), [state, q, from, to]);
  const people = countBy(rows, (r) => r.workerIds.map((id) => byId.get(id) ?? '?'));

  return (
    <div className="card pad">
      <input
        className="input"
        type="search"
        placeholder="Nome da atividade (ex.: EMENDA, TR-05)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Atividade"
      />
      <p className="small muted">{rows.length} ocorrência(s) no período.</p>
      {q && people.length > 0 && (
        <p className="small">
          <b>Quem mais trabalhou:</b> {people.slice(0, 15).map(([n, c]) => `${n} (${c})`).join(' · ')}
        </p>
      )}
      <ul className="plain-list history">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="hist-date">
              {weekdayOf(r.date)} {formatDate(r.date)}
            </span>
            <span>
              <b>{r.nome}</b>
              <br />
              <span className="small">{r.workerIds.map((id) => byId.get(id) ?? '?').join(', ') || '(ninguém)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Summary({ from, to }: { from: Date; to: Date }) {
  const { state } = useStore();
  const data = useMemo(() => {
    const m = new Map<string, { worked: number; absent: number; pending: number }>();
    for (const w of state.workers) m.set(w.id, { worked: 0, absent: 0, pending: 0 });
    let days = 0;
    for (const { day } of iterateDays(state, from, to)) {
      if (!dayHasData(day)) continue;
      days++;
      for (const a of day.absences) m.get(a.workerId)!.absent++;
      const alloc = new Set(day.activities.flatMap((a) => a.workerIds));
      for (const id of alloc) m.get(id)!.worked++;
      for (const w of pendingWorkers(day, state.workers)) m.get(w.id)!.pending++;
    }
    return { days, rows: sortByName(state.workers).map((w) => ({ w, ...m.get(w.id)! })) };
  }, [state, from, to]);

  return (
    <div className="card pad">
      <p className="small muted">
        {data.days} dia(s) com escala no período. “Pend.” = dias com escala em que o colaborador ativo ficou sem
        alocação e sem ausência.
      </p>
      <div className="summary" role="table">
        <div className="summary-row head" role="row">
          <span role="columnheader">Colaborador</span>
          <span role="columnheader">Trab.</span>
          <span role="columnheader">Aus.</span>
          <span role="columnheader">Pend.</span>
        </div>
        {data.rows
          .filter((r) => r.w.ativo || r.worked || r.absent)
          .map((r) => (
            <div key={r.w.id} className="summary-row" role="row">
              <span role="cell" className="ellipsis">
                {r.w.nome}
                {!r.w.ativo && <span className="muted small"> (inativo)</span>}
              </span>
              <span role="cell">{r.worked}</span>
              <span role="cell">{r.absent}</span>
              <span role="cell" className={r.pending ? 'text-warn' : ''}>
                {r.pending}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
