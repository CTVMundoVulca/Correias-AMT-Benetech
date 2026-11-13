/** MODO TESTE da Programação (não é publicado no portal). Ver firebaseFalso.ts. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../ui/Toast';
import { ConfirmProvider } from '../../ui/ConfirmDialog';
import { ProgApp } from '../ProgApp';
import { lerPacote } from '../Importar';
import { anoDaOm, hojeIso, mesDe } from '../model';
import { locateDay, toUtcDay } from '../../domain/isoWeek';
import { TIPOS_COM_RELATORIO } from '../relEmenda';
import { semear } from './firebaseFalso';
import '../../styles/fonts.css';
import '../../styles/tokens.css';
import '../../styles/app.css';
import '../prog.css';

declare global {
  interface Window {
    __DEMO_DADOS__?: unknown;
    /** teste do link exclusivo das áreas do cliente */
    __DEMO_AREAS__?: boolean;
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
// paradas de exemplo
const dIso = (n: number) => iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + n));
const par = (id: string, tipo: string, area: string, ini: number, fim: number, descricao: string) => ({
  id, tipo, area, equipamento: '', descricao, inicio: dIso(ini), fim: dIso(fim), criadoEm: '', criadoPor: 'exemplo', atualizadoEm: '', atualizadoPor: 'exemplo',
});
semear(`prog_paradas/${agora.getFullYear()}`, {
  paradas: {
    px1: par('px1', 'geral', 'COQUERIA', 6, 8, 'EXEMPLO: parada geral da bateria'),
    px2: par('px2', 'parcial', 'SINTERIZAÇÃO', 13, 14, 'EXEMPLO: parada parcial da linha 2'),
    px3: par('px3', 'critica', 'PÁTIO DE MINÉRIO', 2, 2, 'EXEMPLO: intervenção na recuperadora'),
  },
});

// papéis de teste e uma parada enviada por uma área (a confirmar)
semear('prog_config/papeis', { admins: [], programadores: ['programador@teste.com'], supervisores: ['supervisor@teste.com'] });
semear('prog_paradas_pedidos/pedido-exemplo', {
  id: 'pedido-exemplo', tipo: 'parcial', area: 'ACIARIA', equipamento: 'T-13', descricao: 'EXEMPLO: troca de rolos da linha',
  inicio: dIso(9), fim: dIso(10), solicitante: 'Programador da Aciaria (exemplo)', contato: 'ramal 0000', criadoUid: 'outra-area',
  criadoEm: new Date(agora.getTime() - 5 * 3_600_000).toISOString(), status: 'pendente', resposta: '', atualizadoEm: '', atualizadoPor: 'anônimo',
});

// escala de exemplo de hoje (22 colaboradores genéricos), alocados nas atividades programadas de hoje
if (window.__DEMO_DADOS__) {
  const p = lerPacote(JSON.stringify(window.__DEMO_DADOS__));
  // 17 do contrato + 5 de apoio de outros contratos (como no AMT)
  const efetivo = Array.from({ length: 22 }, (_, i) => ({ id: `c${i + 1}`, nome: `COLABORADOR ${String(i + 1).padStart(2, '0')}`, funcao: 'Vulcanizador', ativo: true, ...(i >= 17 ? { apoio: true } : {}) }));
  semear('escala_publica_config/geral', { efetivo, funcoes: ['Vulcanizador'], ausencias: [], feriados: {} });
  const hoje = hojeIso();
  let k = 0;
  const activities = p.atividades
    .filter((a) => a.data === hoje && a.classe !== 'cancelada')
    .map((a) => ({ id: `prog-${a.id}`, nome: a.descricao, workerIds: Array.from({ length: Math.min(a.pessoas || 2, 22 - k - 2) }, () => `c${++k}`) }));
  const d = new Date();
  const { weekKey, dayIndex } = locateDay(toUtcDay(d));
  semear(`escala_publica/${weekKey}_${dayIndex}`, { activities, absences: [{ workerId: 'c22', tipo: 'ausencia' }] });

  // EXEMPLO: duas atividades de hoje vieram de solicitações feitas pelo app (mostra "Pedido por")
  const deHoje = p.atividades.filter((a) => a.data === hoje && a.classe !== 'cancelada' && a.area).slice(0, 2);
  deHoje.forEach((a, i) => {
    const sid = `exemplo-prog-${i}`;
    semear(`prog_mes/${a.data.slice(0, 7)}`, { itens: { [a.id]: { ...a, solicitacaoId: sid } } });
    semear(`prog_solicitacoes/${sid}`, {
      ...base, id: sid, area: a.area, equipamento: a.equipamento, descricao: a.descricao, urgencia: 'normal', dataDesejada: a.data,
      solicitante: i === 0 ? 'Supervisor da área (exemplo)' : 'Programador da área (exemplo)', contato: i === 0 ? 'ramal 1234' : '(27) 99999-0000',
      criadoEm: new Date(agora.getTime() - 4 * 86_400_000).toISOString(), status: 'programada', atividadeId: a.id, dataProgramada: a.data,
      atualizadoEm: agora.toISOString(), atualizadoPor: 'exemplo',
    });
  });

  // EXEMPLOS para os indicadores: apontamento dos últimos 30 dias, escala, atrasos e emendas
  const motivos = ['Equipamento não liberado (bloqueio)', 'Falta de material', 'Chuva / condição climática'];
  const desde30 = iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 30));
  const porMes: Record<string, Record<string, unknown>> = {};
  p.atividades
    .filter((a) => a.data >= desde30 && a.data < hoje && a.classe !== 'cancelada')
    .forEach((a, i) => {
      const r = i % 10;
      const ex = r < 8 ? { execucao: 'executada', execMotivo: '' } : { execucao: r === 8 ? 'nao_executada' : 'reprogramada', execMotivo: motivos[i % 3] };
      (porMes[a.data.slice(0, 7)] ??= {})[a.id] = { ...a, ...ex, execEm: agora.toISOString(), execPor: 'exemplo' };
    });
  for (const [m, itens] of Object.entries(porMes)) semear(`prog_mes/${m}`, { itens });
  for (let k = 1; k <= 60; k++) {
    const dt = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - k);
    const { weekKey: wk, dayIndex: di } = locateDay(toUtcDay(dt));
    if (di >= 5) continue;
    semear(`escala_publica/${wk}_${di}`, { activities: [], absences: Array.from({ length: k % 3 }, (_, j) => ({ workerId: `c${20 - j}`, tipo: 'ausencia' })) });
    if (k % 4 === 0)
      semear(`escala_atrasos/ex${k}`, {
        id: `ex${k}`, semana: wk, diaId: `${wk}_${di}`, atividadeId: 'x', atividadeNome: k % 8 === 0 ? 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' : 'REPARO C-3 — COQUERIA',
        inicio: '07:30', fim: k % 8 === 0 ? '09:15' : '08:20', motivo: ['Bloqueio', 'Recurso', 'Limpeza'][k % 3], descricao: 'EXEMPLO', criadoUid: '', criadoEm: '', atualizadoEm: '', por: 'exemplo',
      });
  }
  const em = (id: string, tag: string, dias: number) => semear(`emendas/${id}`, { id, tag, data: dIso(-dias), numero: '1' });
  // relatórios de emenda das trocas/emendas executadas: uns pela OM, uns pela TAG, alguns pendentes
  let nRel = 100;
  p.atividades
    .filter((a) => a.data >= desde30 && a.data < hoje && TIPOS_COM_RELATORIO.includes(a.tipo) && a.classe !== 'cancelada')
    .forEach((a, i) => {
      const r = i % 4;
      if (r === 2) return; // pendente
      const id = `rel${i}`;
      const data = r === 1 ? iso(new Date(new Date(a.data + 'T12:00').getTime() + 86_400_000)) : a.data;
      semear(`emendas/${id}`, { id, tag: r === 1 ? a.equipamento.replace('-', ' ') : a.equipamento, data, om: r === 0 ? a.om : '', numero: String(nRel++) });
    });
  semear('emendas/orf1', { id: 'orf1', tag: 'BC-999', data: dIso(-3), om: '', numero: '98' });
  semear('emendas/orf2', { id: 'orf2', tag: 'TR-7', data: dIso(-12), om: '4455667', numero: '99' });
  em('em1', 'L-21', 200); em('em2', 'L-21', 120); em('em3', 'L 21', 40); em('em4', 'B-9R', 150); em('em5', 'B-9R', 10); em('em6', 'C-3', 90);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="modo-teste">
      🧪 MODO TESTE — nada vai para a nuvem; recarregar volta ao início. Apontamentos, escala, atrasos e emendas dos últimos dias são EXEMPLOS. Gestão: entre com programador@teste.com, supervisor@teste.com ou
      admin@teste.com (qualquer senha).
    </div>
    <ToastProvider>
      <ConfirmProvider>
        <ProgApp linkAreas={!!window.__DEMO_AREAS__} />
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
