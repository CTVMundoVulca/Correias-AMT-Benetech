import { useState } from 'react';
import { useStore } from './state/store';
import { currentWeekKey } from './domain/isoWeek';
import { WeekView } from './features/week/WeekView';
import { SummaryView } from './features/summary/SummaryView';
import { WorkersView } from './features/workers/WorkersView';
import { ReportsView } from './features/reports/ReportsView';
import { DataView } from './features/data/DataView';
import { Header } from './ui/Header';

const TABS = [
  { id: 'escala', label: 'Escala' },
  { id: 'resumo', label: 'Resumo' },
  { id: 'efetivo', label: 'Efetivo' },
  { id: 'consultas', label: 'Consultas' },
  { id: 'dados', label: 'Dados' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const { ready, notices, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('escala');
  // semana compartilhada entre Escala e Resumo
  const [weekKey, setWeekKey] = useState(currentWeekKey);

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <Header>
        <nav className="tabs" aria-label="Seções">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'tab' + (tab === t.id ? ' on' : '')}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </Header>
      <main className="container">
        {notices.map((n, i) => (
          <div key={i} className={`banner ${n.kind}`} role="alert">
            {n.text}
            {n.actions?.map((a) => (
              <span key={a.label}>
                {' '}
                <button className="link" onClick={a.onClick}>
                  {a.label}
                </button>
              </span>
            ))}
          </div>
        ))}
        {saveError && (
          <div className="banner danger" role="alert">
            Não foi possível salvar: {saveError}. Baixe um backup em “Dados”.
          </div>
        )}
        {!ready ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            {tab === 'escala' && <WeekView weekKey={weekKey} onWeekChange={setWeekKey} onGoToWorkers={() => go('efetivo')} />}
            {tab === 'resumo' && <SummaryView weekKey={weekKey} onWeekChange={setWeekKey} />}
            {tab === 'efetivo' && <WorkersView />}
            {tab === 'consultas' && <ReportsView />}
            {tab === 'dados' && <DataView />}
          </>
        )}
      </main>
    </>
  );
}
