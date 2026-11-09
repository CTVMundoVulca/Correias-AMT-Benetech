import { useMemo, useRef } from 'react';
import { useStore } from '../../state/store';
import { WEEKDAYS_SHORT, formatDate, parseWeekKey, weekDates } from '../../domain/isoWeek';
import { activityRows, weekKpis, workerGrid } from '../../domain/summary';
import { tipoAusencia } from '../../domain/types';
import { WeekNav } from '../week/WeekNav';
import { PdfBotao } from '../../ui/PdfBotao';

interface Props {
  weekKey: string;
  onWeekChange: (key: string) => void;
}

export function SummaryView({ weekKey, onWeekChange }: Props) {
  const { state } = useStore();
  const ref = useRef<HTMLElement>(null);
  const { week, year } = parseWeekKey(weekKey);
  const dates = weekDates(weekKey);
  const kpis = useMemo(() => weekKpis(state, weekKey), [state, weekKey]);
  const grid = useMemo(() => workerGrid(state, weekKey), [state, weekKey]);
  const acts = useMemo(() => activityRows(state, weekKey), [state, weekKey]);
  // legenda: tipos visíveis + os ocultos/removidos que aparecem nesta semana
  const legenda = useMemo(() => {
    const usados = new Set(grid.flatMap((r) => r.cells.flatMap((c) => (c.kind === 'abs' ? [c.tipo] : []))));
    const ids = [...state.ausencias.filter((a) => a.ativo || usados.has(a.id)).map((a) => a.id), ...[...usados].filter((id) => !state.ausencias.some((a) => a.id === id))];
    return ids.map((id) => tipoAusencia(state, id));
  }, [state, grid]);

  return (
    <section ref={ref}>
      <div className="print-only print-head">
        <img src="logo-benetech.png" alt="Benetech" />
        <div>
          <div className="print-kicker">Contrato AMT</div>
          <h1>
            Escala de Vulcanização — Semana {parseWeekKey(weekKey).week}/{parseWeekKey(weekKey).year}
          </h1>
          <div className="small">
            {formatDate(dates[0])} a {formatDate(dates[6])} · gerado em {new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      <div className="no-print">
        <WeekNav weekKey={weekKey} onChange={onWeekChange} />
      </div>

      <div className="card pad row between no-print">
        <span className="small muted">Resumo da semana em PDF (salvar, imprimir ou enviar).</span>
        <PdfBotao alvo={() => ref.current} titulo={`Escala AMT - Semana ${String(week).padStart(2, '0')}-${year}`} paisagem />
      </div>

      <div className="kpis">
        <Kpi value={kpis.activities} label="atividades" />
        <Kpi value={kpis.allocations} label="alocações" />
        <Kpi value={kpis.absences} label="ausências" />
        <Kpi value={kpis.activeWorkers} label="efetivo ativo" />
      </div>

      <div className="card pad summary-card">
        <h2>Colaborador × dia</h2>
        <div className="table-wrap section-gap">
          <table className="grid-table">
            <thead>
              <tr>
                <th className="name-col" scope="col">
                  Colaborador
                </th>
                {WEEKDAYS_SHORT.map((d, i) => (
                  <th key={d} scope="col" title={formatDate(dates[i])}>
                    {d}
                  </th>
                ))}
                <th scope="col" title="Dias alocados">
                  Tot.
                </th>
              </tr>
            </thead>
            <tbody>
              {grid.map(({ worker, cells, daysAllocated }) => (
                <tr key={worker.id} className={worker.ativo ? '' : 'inactive'}>
                  <th className="name-col" scope="row" title={worker.nome}>
                    {worker.nome}
                  </th>
                  {cells.map((c, i) =>
                    c.kind === 'on' ? (
                      <td key={i} className="cell on" aria-label="alocado">
                        ✓
                      </td>
                    ) : c.kind === 'abs' ? (
                      <td
                        key={i}
                        className={'cell' + (c.feriado ? ' auto' : '')}
                        aria-label={tipoAusencia(state, c.tipo).nome + (c.feriado ? ' (automática)' : '')}
                        title={c.feriado ? 'Folga automática (feriado ou fim de semana)' : undefined}
                      >
                        <span className={`tag cor-${tipoAusencia(state, c.tipo).cor}`}>{tipoAusencia(state, c.tipo).sigla}</span>
                      </td>
                    ) : (
                      <td key={i} className="cell none" aria-label="sem registro">
                        —
                      </td>
                    ),
                  )}
                  <td className="total">{daysAllocated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          <span>✓ alocado</span>
          {legenda.map((t) => (
            <span key={t.id}>
              <span className={`tag cor-${t.cor}`}>{t.sigla}</span> {t.nome}
            </span>
          ))}
          <span>— sem registro</span>
          <span>
            <i>itálico</i> = folga automática (feriado ou fim de semana)
          </span>
        </div>
      </div>

      <div className="card pad">
        <h2>Atividades da semana</h2>
        {acts.length === 0 ? (
          <p className="muted small">Nenhuma atividade nesta semana.</p>
        ) : (
          <ul className="plain-list act-table section-gap">
            {acts.map((a, i) => (
              <li key={i}>
                <span className="when">
                  {WEEKDAYS_SHORT[a.dayIndex]} {formatDate(dates[a.dayIndex]).slice(0, 5)}
                </span>
                <span>
                  <b className="activity-name">{a.nome}</b>
                  <br />
                  <span className="names small">{a.workerNames.join(', ') || <span className="muted">ninguém alocado</span>}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="kpi">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
