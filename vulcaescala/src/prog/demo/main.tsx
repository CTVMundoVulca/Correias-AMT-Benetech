/** MODO TESTE da Programação (não é publicado no portal). Ver firebaseFalso.ts. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../ui/Toast';
import { ConfirmProvider } from '../../ui/ConfirmDialog';
import { ProgApp } from '../ProgApp';
import { lerPacote } from '../Importar';
import { anoDaOm, hojeIso, mesDe } from '../model';
import { semear } from './firebaseFalso';
import '../../styles/fonts.css';
import '../../styles/tokens.css';
import '../../styles/app.css';
import '../prog.css';

declare global {
  interface Window {
    __DEMO_DADOS__?: unknown;
  }
}

// histórico da planilha (injetado no HTML do teste; não fica no repositório)
if (window.__DEMO_DADOS__) {
  const p = lerPacote(JSON.stringify(window.__DEMO_DADOS__));
  const meses: Record<string, Record<string, unknown>> = {};
  for (const a of p.atividades) (meses[mesDe(a.data)] ??= {})[a.id] = a;
  for (const [m, itens] of Object.entries(meses)) semear(`prog_mes/${m}`, { itens });
  const anos: Record<string, Record<string, unknown>> = {};
  for (const o of p.oms) (anos[anoDaOm(o)] ??= {})[o.om] = o;
  for (const [y, oms] of Object.entries(anos)) semear(`prog_oms/${y}`, { oms });
}

// duas solicitações de exemplo, para ver a caixa de entrada do programador
const agora = new Date();
const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
const semana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 6);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const base = { om: '', contato: 'ramal 0000', criadoUid: 'outra-area', status: 'aberta', resposta: '', atividadeId: '', dataProgramada: '', atualizadoPor: 'anônimo' };
semear('prog_solicitacoes/exemplo-1', {
  ...base,
  id: 'exemplo-1',
  area: 'COQUERIA',
  equipamento: 'C-3',
  om: '900099999001',
  descricao: 'EXEMPLO: REPARO NA EMENDA DA CORREIA C-3',
  urgencia: 'urgente',
  dataDesejada: iso(amanha),
  solicitante: 'Programador da Coqueria (exemplo)',
  criadoEm: new Date(agora.getTime() - 3_600_000).toISOString(),
  atualizadoEm: agora.toISOString(),
});
semear('prog_solicitacoes/exemplo-2', {
  ...base,
  id: 'exemplo-2',
  area: 'SINTERIZAÇÃO',
  equipamento: 'M-104',
  descricao: 'EXEMPLO: TROCAR CORREIA M-104',
  urgencia: 'normal',
  dataDesejada: iso(semana),
  solicitante: 'Programador da Sinterização (exemplo)',
  criadoEm: new Date(agora.getTime() - 26 * 3_600_000).toISOString(),
  atualizadoEm: agora.toISOString(),
});
void hojeIso;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="modo-teste">
      🧪 MODO TESTE — nada é gravado na nuvem; recarregar a página volta ao início. Para programar: “Entrar” com qualquer e-mail e senha.
    </div>
    <ToastProvider>
      <ConfirmProvider>
        <ProgApp />
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
