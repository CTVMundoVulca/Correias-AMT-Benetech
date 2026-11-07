import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useToast } from './Toast';
import type { SyncInfo } from '../cloud/sync';

const THEME_KEY = 'vulcaescala:tema';

function effectiveDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function syncLabel(info: SyncInfo | null): { cls: string; short: string; long: string } {
  if (!info)
    return {
      cls: 'local',
      short: 'Modo local',
      long: 'Modo local: os dados ficam só neste aparelho. Configure o Firebase do AMT para compartilhar entre aparelhos.',
    };
  const p = info.pending;
  if (info.blocked > 0 && info.status === 'ok')
    return { cls: 'error', short: 'Recusado', long: `A nuvem recusou ${info.blocked} alteração(ões). Veja o aviso na tela.` };
  switch (info.status) {
    case 'ok':
      return { cls: 'ok', short: 'Sincronizado', long: 'Sincronizado: todos os aparelhos veem os mesmos dados.' };
    case 'saving':
      return { cls: 'saving', short: 'Salvando…', long: `Enviando ${p} alteração(ões) para a nuvem…` };
    case 'connecting':
      return { cls: 'connecting', short: 'Conectando…', long: 'Conectando à nuvem. Mostrando a cópia salva neste aparelho.' };
    case 'offline':
      return {
        cls: 'offline',
        short: p ? `Offline · ${p}` : 'Offline',
        long: p
          ? `Offline: ${p} alteração(ões) guardada(s) neste aparelho; serão enviadas quando a internet voltar.`
          : 'Offline: mostrando a cópia salva neste aparelho.',
      };
    case 'denied':
      return { cls: 'denied', short: 'Sem permissão', long: 'Sem permissão na nuvem: o seu e-mail não está liberado.' };
    case 'error':
      return { cls: 'error', short: 'Erro', long: `Falha na nuvem${info.lastError ? ` (${info.lastError})` : ''}.` };
  }
}

export function Header({ children }: { children?: React.ReactNode }) {
  const { cloud } = useStore();
  const toast = useToast();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(effectiveDark()), []);

  const toggleTheme = () => {
    const next = !effectiveDark();
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try {
      localStorage.setItem(THEME_KEY, next ? 'escuro' : 'claro');
    } catch {
      /* ignore */
    }
    setDark(next);
  };

  const sync = syncLabel(cloud?.info ?? null);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="header-row">
          <div className="logo-area">
            <img src="logo-benetech.png" alt="Benetech" className="logo-img" />
            <div className="logo-name">
              Escala · AMT<b>Vulcanização</b>
            </div>
          </div>
          <div className="header-actions">
            <button className="sync-pill" onClick={() => toast(sync.long)} aria-label={sync.long} title={sync.long}>
              <span className={`sync-dot ${sync.cls}`} aria-hidden />
              <span className="sync-text">{sync.short}</span>
            </button>
            <button className="hdr-btn" onClick={toggleTheme} title="Tema claro/escuro" aria-label="Alternar tema claro/escuro">
              {dark ? '☀️' : '🌙'}
            </button>
            {cloud && (
              <button className="hdr-btn" onClick={cloud.logout} title="Sair" aria-label="Sair da conta">
                ⏻
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
