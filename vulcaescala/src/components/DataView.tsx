import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { migrate } from '../storage/migrations';
import { emptyState } from '../domain/types';

export function DataView() {
  const { state, replaceAll, loadStatus } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const size = new Blob([JSON.stringify(state)]).size;
  const weeks = Object.keys(state.weeks).length;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulcaescala-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const data = migrate(JSON.parse(await file.text()));
      const ok = window.confirm(
        `Importar ${data.workers.length} colaborador(es) e ${Object.keys(data.weeks).length} semana(s)?\n\nIsso SUBSTITUI todos os dados atuais deste aparelho.`,
      );
      if (!ok) return;
      replaceAll(data);
      setMsg({ kind: 'ok', text: 'Backup importado.' });
    } catch (e) {
      setMsg({ kind: 'danger', text: `Arquivo inválido: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAll = () => {
    const typed = window.prompt('Isso apaga TODO o efetivo e todas as escalas deste aparelho. Digite APAGAR para confirmar.');
    if (typed?.trim().toUpperCase() === 'APAGAR') {
      replaceAll(emptyState());
      setMsg({ kind: 'ok', text: 'Dados apagados.' });
    }
  };

  return (
    <section className="card pad">
      <h1>Dados</h1>
      <p className="small muted">
        Os dados ficam salvos <b>somente neste navegador, neste aparelho</b>. Limpar os dados do navegador apaga a escala.
        Faça backup com frequência e use-o para levar a escala para outro aparelho.
      </p>
      {loadStatus === 'ready' && (
        <p className="small">
          {state.workers.length} colaborador(es) · {weeks} semana(s) com dados · {(size / 1024).toFixed(1)} KB
        </p>
      )}
      <div className="stack">
        <button className="btn primary" onClick={exportJson} disabled={loadStatus !== 'ready'}>
          Baixar backup (.json)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Importar backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
        />
        <button className="btn danger-ghost" onClick={clearAll} disabled={loadStatus !== 'ready'}>
          Apagar todos os dados
        </button>
      </div>
      {msg && (
        <div className={`banner ${msg.kind}`} role="status">
          {msg.text}
        </div>
      )}
    </section>
  );
}
