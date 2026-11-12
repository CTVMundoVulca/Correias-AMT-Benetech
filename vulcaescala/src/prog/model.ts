/**
 * Programação da Vulcanização — modelo de dados (contrato AMT).
 *
 * Substitui a planilha "PROGRAMAÇÃO VULCANIZAÇÃO" (uma aba por semana). Cada linha da
 * planilha vira uma ATIVIDADE; a classificação (programada / não programada / emergência /
 * cancelada) passa a ser obrigatória e a baixa da OM é controlada por OM, com data e autor.
 */
import { fromIsoDate, toIsoDate, toUtcDay } from '../domain/isoWeek';
import { feriadoEm } from '../domain/feriados';

/** Data de hoje no relógio do aparelho, "AAAA-MM-DD". */
export const hojeIso = (agora: Date = new Date()) => toIsoDate(toUtcDay(agora));

// ------------------------------------------------------------------ classificação

export type Classe = 'programada' | 'nao_programada' | 'emergencia' | 'cancelada' | '';

export const CLASSES: { id: Exclude<Classe, ''>; nome: string; curto: string }[] = [
  { id: 'programada', nome: 'Programada', curto: 'Prog.' },
  { id: 'nao_programada', nome: 'Não programada', curto: 'Ñ prog.' },
  { id: 'emergencia', nome: 'Emergência', curto: 'Emerg.' },
  { id: 'cancelada', nome: 'Cancelada', curto: 'Canc.' },
];

export function nomeClasse(c: Classe): string {
  return CLASSES.find((x) => x.id === c)?.nome ?? 'Não classificada';
}

/** Antecedência mínima para a atividade contar como programada. */
export const ANTECEDENCIA_HORAS = 48;
/** Jornada em que os pedidos são recebidos (dias úteis). A atividade começa às 07:15. */
export const JORNADA_INICIO = { h: 7, m: 15 };
export const JORNADA_FIM = { h: 17, m: 15 };

export interface Classificacao {
  classe: Exclude<Classe, '' | 'cancelada'>;
  /** explicação curta para a tela */
  motivo: string;
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Dia útil = não é sábado, domingo nem feriado (nacional ou municipal). */
export function diaUtil(iso: string, municipais: Record<string, string> = {}): boolean {
  const d = fromIsoDate(iso);
  if (!d) return false;
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !feriadoEm(municipais, iso);
}

/**
 * Quando o pedido conta como recebido: dentro da jornada (07:15–17:15 de dia útil) vale a
 * própria hora; antes das 07:15 de um dia útil, às 07:15 do mesmo dia; depois das 17:15,
 * em fim de semana ou feriado, às 07:15 do próximo dia útil.
 */
export function recebidoEm(comunicadoEm: Date, municipais: Record<string, string> = {}): Date {
  const d = new Date(comunicadoEm.getTime());
  const abre = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), JORNADA_INICIO.h, JORNADA_INICIO.m);
  const fecha = new Date(d.getFullYear(), d.getMonth(), d.getDate(), JORNADA_FIM.h, JORNADA_FIM.m);
  if (diaUtil(isoLocal(d), municipais)) {
    if (d < abre(d)) return abre(d);
    if (d <= fecha) return d;
  }
  let x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  for (let i = 0; i < 30 && !diaUtil(isoLocal(x), municipais); i++) x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1);
  return abre(x);
}

/**
 * Regra da vulcanização AMT:
 *  - EMERGÊNCIA: toda atividade realizada em fim de semana ou feriado;
 *  - PROGRAMADA: comunicada com 48 h (corridas) ou mais de antecedência;
 *  - NÃO PROGRAMADA: comunicada com menos de 48 h.
 * As 48 h vão do recebimento do pedido (ver recebidoEm) até 07:15 do dia da atividade.
 * `municipais`: feriados municipais cadastrados na escala (os nacionais são calculados).
 */
export function classificar(dataAtividade: string, comunicadoEm: Date, municipais: Record<string, string> = {}): Classificacao | null {
  const d = fromIsoDate(dataAtividade);
  if (!d || Number.isNaN(comunicadoEm.getTime())) return null;
  const fer = feriadoEm(municipais, dataAtividade);
  if (fer) return { classe: 'emergencia', motivo: `feriado (${fer})` };
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return { classe: 'emergencia', motivo: dow === 6 ? 'sábado' : 'domingo' };
  const [y, m, dd] = dataAtividade.split('-').map(Number);
  const inicio = new Date(y, m - 1, dd, JORNADA_INICIO.h, JORNADA_INICIO.m, 0, 0);
  const rec = recebidoEm(comunicadoEm, municipais);
  const ajustado = rec.getTime() !== comunicadoEm.getTime();
  const horas = (inicio.getTime() - rec.getTime()) / 3_600_000;
  const quando = ajustado
    ? `pedido fora da jornada, recebido ${rec.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} 07:15`
    : 'pedido dentro da jornada';
  const txt = horas <= 0 ? `${quando}, no próprio dia ou depois` : `${quando}, ${fmtAntecedencia(horas)} antes das 07:15 do dia`;
  return horas >= ANTECEDENCIA_HORAS ? { classe: 'programada', motivo: txt } : { classe: 'nao_programada', motivo: `${txt} (menos de ${ANTECEDENCIA_HORAS} h)` };
}

function fmtAntecedencia(h: number): string {
  if (h >= 72) {
    const dias = Math.floor(h / 24);
    const resto = Math.floor(h - dias * 24);
    return resto ? `${dias} dias e ${resto} h` : `${dias} dias`;
  }
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

// ------------------------------------------------------------------ tipos de serviço

export const TIPOS = [
  'Troca de correia',
  'Emenda / intercalação',
  'Reparo',
  'Preparação de correia',
  'Logística (buscar, posicionar, descartar)',
  'Fabricação de peças',
  'Treinamento / exame',
  'Outros',
] as const;
export type Tipo = (typeof TIPOS)[number];

/** Tipo de serviço a partir da descrição (mesmos verbos usados na planilha). */
export function tipoPelaDescricao(desc: string): Tipo {
  const d = semAcento(desc).toUpperCase();
  if (/PREPARA/.test(d)) return 'Preparação de correia';
  if (/REPARO|RESINA|COLAR|REVESTI|REMENDO/.test(d)) return 'Reparo';
  if (/EMENDA|INTERCALA|GRAMPO|BY ?PASS/.test(d)) return 'Emenda / intercalação';
  if (/TROCA|PASSAGEM DA CORREIA/.test(d)) return 'Troca de correia';
  if (/TREINAMENTO|EXAME|PINE|INTEGRACAO|CURSO/.test(d)) return 'Treinamento / exame';
  if (/FABRIC|PECAS|PCS|CORTAR/.test(d)) return 'Fabricação de peças';
  if (/BUSCAR|POSICIONAR|ENROLAR|RECOLHER|DESCART|DECARTE|TIRAR|SUBIR|TRANSPORT|RETIRAR/.test(d)) return 'Logística (buscar, posicionar, descartar)';
  return 'Outros';
}

// ------------------------------------------------------------------ áreas

export interface Area {
  nome: string;
  /** com quem falar para pedir liberação do efetivo (nome, ramal, telefone) */
  contato: string;
}

/** Áreas encontradas na planilha de 2026 (grafias unificadas). Editáveis no app. */
export const AREAS_PADRAO: Area[] = [
  'PÁTIO DE MINÉRIO',
  'PÁTIO DE CARVÃO',
  'SINTERIZAÇÃO',
  'COQUERIA',
  'ACIARIA',
  'ALTO FORNO 1',
  'ALTO FORNO 2',
  'ALTO FORNO 3',
  'URCP',
  'INBA',
  'CDQ',
  'LINGOTAMENTO',
  'UTILIDADES',
  'VIRADOR DE VAGÕES',
  'INTEGRIDADE',
  'LHOIST',
].map((nome) => ({ nome, contato: '' }));

/** Atividades internas da vulcanização (logística, treinamento, oficina) sem área solicitante. */
export const AREA_INTERNA = 'INTERNO (VULCANIZAÇÃO)';

export const AREA_MAX = 60;
export const CONTATO_MAX = 80;

// ------------------------------------------------------------------ atividade

export type Equipe = 'dia' | 'turno';

export interface Atividade {
  id: string;
  /** "AAAA-MM-DD" */
  data: string;
  area: string;
  equipamento: string;
  /** número da ordem de manutenção ('' = sem OM) */
  om: string;
  descricao: string;
  tipo: string;
  /** quantidade de pessoas da vulcanização na atividade */
  pessoas: number;
  /** equipe do horário administrativo (dia) ou de turno */
  equipe: Equipe;
  recursos: string;
  /** horário/janela combinada com a área, ex.: "13h - 15h" */
  horario: string;
  classe: Classe;
  retrabalho: boolean;
  /** motivo do cancelamento (quando cancelada) */
  motivo: string;
  /** quando a área comunicou a demanda (ISO); base da regra das 48 h. '' = desconhecido (planilha) */
  comunicadoEm: string;
  /** a classificação foi trocada à mão (diferente da regra automática) */
  classeManual: boolean;
  /** solicitação de origem ('' = lançada direto pelo programador) */
  solicitacaoId: string;
  origem: 'app' | 'planilha';
  /** posição no dia */
  ordem: number;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export const DESCRICAO_MAX = 200;
export const EQUIP_MAX = 60;
export const RECURSOS_MAX = 200;
export const HORARIO_MAX = 40;
export const MOTIVO_MAX = 200;
export const PESSOAS_MAX = 40;

export function atividadeVazia(id: string, data: string, por: string): Atividade {
  const agora = new Date().toISOString();
  return {
    id,
    data,
    area: '',
    equipamento: '',
    om: '',
    descricao: '',
    tipo: 'Outros',
    pessoas: 0,
    equipe: 'dia',
    recursos: '',
    horario: '',
    classe: '',
    retrabalho: false,
    motivo: '',
    comunicadoEm: agora,
    classeManual: false,
    solicitacaoId: '',
    origem: 'app',
    ordem: Date.now(),
    criadoEm: agora,
    criadoPor: por,
    atualizadoEm: agora,
    atualizadoPor: por,
  };
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Valida o que veio da nuvem (campos faltando ganham valores padrão). */
export function completarAtividade(id: string, v: unknown): Atividade | null {
  const a = (v ?? {}) as Partial<Atividade>;
  const data = str(a.data, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const classe = (['programada', 'nao_programada', 'emergencia', 'cancelada'] as const).find((c) => c === a.classe) ?? '';
  return {
    id,
    data,
    area: str(a.area, AREA_MAX),
    equipamento: str(a.equipamento, EQUIP_MAX),
    om: str(a.om, 20),
    descricao: str(a.descricao, DESCRICAO_MAX),
    tipo: str(a.tipo, 60) || 'Outros',
    pessoas: Number.isFinite(a.pessoas) ? Math.max(0, Math.min(PESSOAS_MAX, Math.round(Number(a.pessoas)))) : 0,
    equipe: a.equipe === 'turno' ? 'turno' : 'dia',
    recursos: str(a.recursos, RECURSOS_MAX),
    horario: str(a.horario, HORARIO_MAX),
    classe,
    retrabalho: a.retrabalho === true,
    motivo: str(a.motivo, MOTIVO_MAX),
    comunicadoEm: str(a.comunicadoEm, 40),
    classeManual: a.classeManual === true,
    solicitacaoId: str(a.solicitacaoId, 60),
    origem: a.origem === 'planilha' ? 'planilha' : 'app',
    ordem: typeof a.ordem === 'number' ? a.ordem : 0,
    criadoEm: str(a.criadoEm, 40),
    criadoPor: str(a.criadoPor, 120),
    atualizadoEm: str(a.atualizadoEm, 40),
    atualizadoPor: str(a.atualizadoPor, 120),
  };
}

export const ordenarAtividades = (l: Atividade[]) =>
  [...l].sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem || a.criadoEm.localeCompare(b.criadoEm));

/** Mês do documento ("AAAA-MM") onde a atividade fica guardada. */
export const mesDe = (data: string) => data.slice(0, 7);

/** Meses (AAAA-MM) entre duas datas, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [y, m] = de.slice(0, 7).split('-').map(Number);
  const [y2, m2] = ate.slice(0, 7).split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}

// ------------------------------------------------------------------ OM

/** Só dígitos; a OM do SAP do AMT tem 12 dígitos (ex.: 900033269317). */
export function limparOm(s: string): string {
  return s.replace(/\D+/g, '').slice(0, 14);
}
export const omValida = (om: string) => om === '' || /^\d{6,14}$/.test(om);
export const omPadrao = (om: string) => /^9\d{11}$/.test(om);

/**
 * Situação da OM:
 *  aberta       ainda sem retorno da supervisão (aguardando execução ou devolução)
 *  retornada    a supervisão devolveu a OM como executada; falta a baixa da programação
 *  baixada      a programação deu baixa (encerrou) a OM
 *  sem_registro veio da planilha antes da semana 10, quando não havia o controle de retorno
 */
export type SituacaoOm = 'aberta' | 'retornada' | 'baixada' | 'sem_registro';

export const SITUACOES: { id: SituacaoOm; nome: string }[] = [
  { id: 'aberta', nome: 'Aguardando retorno da supervisão' },
  { id: 'retornada', nome: 'Aguardando baixa da programação' },
  { id: 'baixada', nome: 'Baixada' },
  { id: 'sem_registro', nome: 'Sem registro (planilha)' },
];

export interface OmInfo {
  om: string;
  area: string;
  equipamento: string;
  descricao: string;
  /** primeira e última data em que a OM foi programada */
  primeiraData: string;
  ultimaData: string;
  situacao: SituacaoOm;
  retornoEm: string;
  retornoPor: string;
  baixaEm: string;
  baixaPor: string;
  /** todas as atividades da OM foram canceladas */
  cancelada: boolean;
}

export function completarOm(om: string, v: unknown): OmInfo {
  const o = (v ?? {}) as Partial<OmInfo>;
  const sit = (['aberta', 'retornada', 'baixada', 'sem_registro'] as const).find((s) => s === o.situacao) ?? 'aberta';
  return {
    om,
    area: str(o.area, AREA_MAX),
    equipamento: str(o.equipamento, EQUIP_MAX),
    descricao: str(o.descricao, DESCRICAO_MAX),
    primeiraData: str(o.primeiraData, 10),
    ultimaData: str(o.ultimaData, 10),
    situacao: sit,
    retornoEm: str(o.retornoEm, 40),
    retornoPor: str(o.retornoPor, 120),
    baixaEm: str(o.baixaEm, 40),
    baixaPor: str(o.baixaPor, 120),
    cancelada: o.cancelada === true,
  };
}

/** Documento (ano) onde a OM fica: o ano da primeira programação. */
export const anoDaOm = (o: Pick<OmInfo, 'primeiraData'>) => o.primeiraData.slice(0, 4);

/** Dias corridos entre duas datas "AAAA-MM-DD" (b - a). */
export function diasEntre(a: string, b: string): number {
  const da = fromIsoDate(a);
  const db = fromIsoDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

// ------------------------------------------------------------------ solicitação

export type Urgencia = 'normal' | 'urgente' | 'emergencia';
export type StatusSolicitacao = 'aberta' | 'programada' | 'recusada' | 'cancelada';

export const URGENCIAS: { id: Urgencia; nome: string; dica: string }[] = [
  { id: 'normal', nome: 'Normal', dica: 'Entra na programação da semana' },
  { id: 'urgente', nome: 'Urgente', dica: 'Precisa ser feito nesta semana' },
  { id: 'emergencia', nome: 'Equipamento parado', dica: 'Equipamento parado ou risco à operação' },
];

export interface Solicitacao {
  id: string;
  area: string;
  equipamento: string;
  om: string;
  descricao: string;
  urgencia: Urgencia;
  /** data desejada "AAAA-MM-DD" */
  dataDesejada: string;
  solicitante: string;
  contato: string;
  /** sessão (aparelho) que pediu — pode cancelar enquanto estiver aberta */
  criadoUid: string;
  criadoEm: string;
  status: StatusSolicitacao;
  /** resposta da programação (motivo da recusa, observação) */
  resposta: string;
  atividadeId: string;
  dataProgramada: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export const SOLICITANTE_MAX = 80;
export const RESPOSTA_MAX = 300;
export const DESCRICAO_SOLIC_MAX = 500;

export function completarSolicitacao(id: string, v: unknown): Solicitacao {
  const s = (v ?? {}) as Partial<Solicitacao>;
  return {
    id,
    area: str(s.area, AREA_MAX),
    equipamento: str(s.equipamento, EQUIP_MAX),
    om: str(s.om, 20),
    descricao: str(s.descricao, DESCRICAO_SOLIC_MAX),
    urgencia: s.urgencia === 'urgente' || s.urgencia === 'emergencia' ? s.urgencia : 'normal',
    dataDesejada: str(s.dataDesejada, 10),
    solicitante: str(s.solicitante, SOLICITANTE_MAX),
    contato: str(s.contato, CONTATO_MAX),
    criadoUid: str(s.criadoUid, 128),
    criadoEm: str(s.criadoEm, 40),
    status: (['aberta', 'programada', 'recusada', 'cancelada'] as const).find((x) => x === s.status) ?? 'aberta',
    resposta: str(s.resposta, RESPOSTA_MAX),
    atividadeId: str(s.atividadeId, 60),
    dataProgramada: str(s.dataProgramada, 10),
    atualizadoEm: str(s.atualizadoEm, 40),
    atualizadoPor: str(s.atualizadoPor, 120),
  };
}

// ------------------------------------------------------------------ painel do dia

export interface AreaDoDia {
  area: string;
  pessoas: number;
  atividades: Atividade[];
}

/** Onde está o efetivo num dia: áreas com atividades (sem as canceladas), mais pessoas primeiro. */
export function alocacaoDoDia(lista: Atividade[], data: string): { areas: AreaDoDia[]; pessoas: number; canceladas: Atividade[] } {
  const doDia = ordenarAtividades(lista.filter((a) => a.data === data));
  const m = new Map<string, AreaDoDia>();
  for (const a of doDia) {
    if (a.classe === 'cancelada') continue;
    const k = a.area || AREA_INTERNA;
    const g = m.get(k) ?? { area: k, pessoas: 0, atividades: [] };
    g.pessoas += a.pessoas;
    g.atividades.push(a);
    m.set(k, g);
  }
  const areas = [...m.values()].sort((a, b) => b.pessoas - a.pessoas || a.area.localeCompare(b.area, 'pt-BR'));
  return { areas, pessoas: areas.reduce((s, g) => s + g.pessoas, 0), canceladas: doDia.filter((a) => a.classe === 'cancelada') };
}

// ------------------------------------------------------------------ dashboard

export type ContagemClasse = Record<Exclude<Classe, ''> | 'sem', number>;
const zero = (): ContagemClasse => ({ programada: 0, nao_programada: 0, emergencia: 0, cancelada: 0, sem: 0 });
const chaveClasse = (c: Classe): keyof ContagemClasse => c || 'sem';

export interface Resumo {
  total: number;
  classes: ContagemClasse;
  /** soma de pessoas das atividades não canceladas (pessoas × dia) */
  pessoasDia: number;
  retrabalho: number;
  /** programadas ÷ (programadas + não programadas + emergências) — só as classificadas */
  indiceProgramacao: number | null;
  /** canceladas ÷ classificadas */
  indiceCancelamento: number | null;
  /** atividades com OM */
  comOm: number;
}

export function resumir(lista: Atividade[]): Resumo {
  const classes = zero();
  let pessoasDia = 0;
  let retrabalho = 0;
  let comOm = 0;
  for (const a of lista) {
    classes[chaveClasse(a.classe)]++;
    if (a.classe !== 'cancelada') pessoasDia += a.pessoas;
    if (a.retrabalho) retrabalho++;
    if (a.om) comOm++;
  }
  const exec = classes.programada + classes.nao_programada + classes.emergencia;
  const classificadas = exec + classes.cancelada;
  return {
    total: lista.length,
    classes,
    pessoasDia,
    retrabalho,
    indiceProgramacao: exec ? classes.programada / exec : null,
    indiceCancelamento: classificadas ? classes.cancelada / classificadas : null,
    comOm,
  };
}

export interface Grupo {
  chave: string;
  total: number;
  classes: ContagemClasse;
  pessoasDia: number;
}

function agrupar(lista: Atividade[], chave: (a: Atividade) => string): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const a of lista) {
    const k = chave(a);
    if (!k) continue;
    const g = m.get(k) ?? { chave: k, total: 0, classes: zero(), pessoasDia: 0 };
    g.total++;
    g.classes[chaveClasse(a.classe)]++;
    if (a.classe !== 'cancelada') g.pessoasDia += a.pessoas;
    m.set(k, g);
  }
  return [...m.values()];
}

const porTotal = (a: Grupo, b: Grupo) => b.total - a.total || a.chave.localeCompare(b.chave, 'pt-BR');

export const porArea = (l: Atividade[]) => agrupar(l, (a) => a.area || AREA_INTERNA).sort(porTotal);
export const porTipo = (l: Atividade[]) => agrupar(l, (a) => a.tipo || 'Outros').sort(porTotal);
export const porMes = (l: Atividade[]) => agrupar(l, (a) => mesDe(a.data)).sort((a, b) => a.chave.localeCompare(b.chave));
/** Equipamentos com mais atividades (Pareto). Ignora linhas sem equipamento. */
export const porEquipamento = (l: Atividade[], n = 10) =>
  agrupar(
    l.filter((a) => a.area),
    (a) => (a.equipamento ? `${a.equipamento} · ${a.area}` : ''),
  )
    .sort(porTotal)
    .slice(0, n);

export function contarOms(oms: OmInfo[]): Record<SituacaoOm, number> {
  const c: Record<SituacaoOm, number> = { aberta: 0, retornada: 0, baixada: 0, sem_registro: 0 };
  for (const o of oms) if (!o.cancelada) c[o.situacao]++;
  return c;
}

// ------------------------------------------------------------------ util

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function limparTexto(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

export const maiusculas = (s: string, max: number) => limparTexto(s, max).toLocaleUpperCase('pt-BR');

export const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

// ------------------------------------------------------------------ paradas

export type TipoParada = 'geral' | 'parcial' | 'critica';

export const TIPOS_PARADA: { id: TipoParada; nome: string; icone: string }[] = [
  { id: 'geral', nome: 'Parada geral', icone: '⛔' },
  { id: 'parcial', nome: 'Parada parcial', icone: '🔧' },
  { id: 'critica', nome: 'Intervenção crítica', icone: '⚠' },
];

/** Parada de área/equipamento (de um dia ou de vários). */
export interface Parada {
  id: string;
  tipo: TipoParada;
  area: string;
  equipamento: string;
  descricao: string;
  /** "AAAA-MM-DD" (inclusive) */
  inicio: string;
  fim: string;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export function completarParada(id: string, v: unknown): Parada | null {
  const p = (v ?? {}) as Partial<Parada>;
  const inicio = str(p.inicio, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;
  const fim0 = str(p.fim, 10);
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(fim0) && fim0 >= inicio ? fim0 : inicio;
  return {
    id,
    tipo: p.tipo === 'parcial' || p.tipo === 'critica' ? p.tipo : 'geral',
    area: str(p.area, AREA_MAX),
    equipamento: str(p.equipamento, EQUIP_MAX),
    descricao: str(p.descricao, DESCRICAO_MAX),
    inicio,
    fim,
    criadoEm: str(p.criadoEm, 40),
    criadoPor: str(p.criadoPor, 120),
    atualizadoEm: str(p.atualizadoEm, 40),
    atualizadoPor: str(p.atualizadoPor, 120),
  };
}

/** Paradas que pegam o dia; a mais grave primeiro (geral > crítica > parcial). */
export function paradasNoDia(lista: Parada[], data: string): Parada[] {
  const peso: Record<TipoParada, number> = { geral: 0, critica: 1, parcial: 2 };
  return lista.filter((p) => p.inicio <= data && data <= p.fim).sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.area.localeCompare(b.area));
}
