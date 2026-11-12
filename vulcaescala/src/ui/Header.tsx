import { useEffect, useState } from 'react';
import { useStoreOptional } from '../state/store';
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

interface HeaderProps {
  children?: React.ReactNode;
  /** linha de cima do título, ex.: "Escala · AMT" */
  kicker?: string;
  /** título em destaque, ex.: "Vulcanização" */
  title?: string;
  /** situação da sincronização (quando o app não usa o store da escala) */
  status?: { cls: string; short: string; long: string };
  /** botões extras no cabeçalho (ex.: Entrar/Sair da Programação) */
  acoes?: React.ReactNode;
  /** esconde o botão 🏠 do portal (link exclusivo das áreas do cliente) */
  semPortal?: boolean;
}

export function Header({ children, kicker = 'Escala · AMT', title = 'Vulcanização', status, acoes, semPortal }: HeaderProps) {
  const store = useStoreOptional();
  const cloud = store?.cloud ?? null;
  const vis = store?.visualizacao ?? null;
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

  const sync = status ?? vis?.status ?? syncLabel(cloud?.info ?? null);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="header-row">
          <div className="logo-area">
            <img src="logo-benetech.png" alt="Benetech" className="logo-img" />
            <div className="logo-name">
              {kicker}
              <b>{title}</b>
            </div>
          </div>
          <div className="header-actions">
            {!semPortal && (
            <a className="hdr-btn" href="../" title="Voltar ao menu de apps AMT" aria-label="Menu de apps AMT">
                🏠
              </a>
            )}
            <button className="sync-pill" onClick={() => toast(sync.long)} aria-label={sync.long} title={sync.long}>
              <span className={`sync-dot ${sync.cls}`} aria-hidden />
              <span className="sync-text">{sync.short}</span>
            </button>
            <button className="hdr-btn" onClick={toggleTheme} title="Tema claro/escuro" aria-label="Alternar tema claro/escuro">
              {dark ? '☀️' : '🌙'}
            </button>
            {acoes}
            {cloud && (
              <button className="hdr-btn" onClick={cloud.logout} title="Sair" aria-label="Sair da conta">
                ⏻
              </button>
            )}
            {vis &&
              (vis.logout ? (
                <button className="hdr-btn" onClick={vis.logout} title="Sair" aria-label="Sair da conta">
                  ⏻
                </button>
              ) : (
                <button className="hdr-btn entrar" onClick={vis.entrar} title="Entrar (liderança)" aria-label="Entrar (liderança)">
                  Entrar
                </button>
              ))}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
