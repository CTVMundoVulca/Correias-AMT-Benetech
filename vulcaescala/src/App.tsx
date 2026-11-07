import { useState } from 'react';
import { useStore } from './state/store';
import { WeekView } from './components/WeekView';
import { WorkersView } from './components/WorkersView';
import { ReportsView } from './components/ReportsView';
import { DataView } from './components/DataView';

const TABS = [
  { id: 'escala', label: 'Escala' },
  { id: 'efetivo', label: 'Efetivo' },
  { id: 'consultas', label: 'Consultas' },
  { id: 'dados', label: 'Dados' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const { loadStatus, loadError, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('escala');

  return (
    <>
      <header className="app-header">
        <div className="brand">
          Vulca<span>Escala</span>
        </div>
        <nav className="tabs" aria-label="Seções">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'tab' + (tab === t.id ? ' on' : '')}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {saveError && (
        <div className="banner danger" role="alert">
          Não foi possível salvar: {saveError}. Faça um backup em “Dados” antes de continuar.
        </div>
      )}
      <main className="container">
        {loadStatus === 'loading' && <p className="muted">Carregando…</p>}
        {loadStatus === 'error' && (
          <div className="banner danger" role="alert">
            Os dados salvos não puderam ser lidos ({loadError}). Nada foi alterado nem será gravado até você
            importar um backup abaixo.
          </div>
        )}
        {loadStatus === 'error' && <DataView />}
        {loadStatus === 'ready' && (
          <>
            {tab === 'escala' && <WeekView onGoToWorkers={() => setTab('efetivo')} />}
            {tab === 'efetivo' && <WorkersView />}
            {tab === 'consultas' && <ReportsView />}
            {tab === 'dados' && <DataView />}
          </>
        )}
      </main>
    </>
  );
}
