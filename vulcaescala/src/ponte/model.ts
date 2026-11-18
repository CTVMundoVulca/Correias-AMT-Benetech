/**
 * Checklist diário da ponte rolante (oficina da vulcanização — contrato AMT).
 *
 * Operador = pessoa treinada, cadastrada pelo administrador (nome completo, matrícula,
 * validade do treinamento). Cada operador tem uma conta própria no Firebase (e-mail
 * interno + PIN de 6 dígitos como senha): a NUVEM confere quem assinou o checklist.
 */

export type Resposta = 'C' | 'NC' | 'NA';
/** legenda do formulário FOR GTO 071 (S / N / NA) com a explicação: Conforme, Não conforme, Não aplicável */
export const RESPOSTAS: { id: Resposta; nome: string; curto: string }[] = [
  { id: 'C', nome: 'S – Conforme', curto: 'S' },
  { id: 'NC', nome: 'N – Não conforme', curto: 'N' },
  { id: 'NA', nome: 'NA – Não aplicável', curto: 'NA' },
];
/** opções do preenchimento: só Conforme / Não conforme (como no modelo da AM). NA fica só para exibir checklists antigos. */
export const RESPOSTAS_FORM = RESPOSTAS.filter((r) => r.id !== 'NA');

export interface ItemModelo {
  id: string;
  grupo: string;
  texto: string;
  /** item crítico: "Não conforme" pede atenção (a liberação é decidida na pergunta final) */
  bloqueia: boolean;
  /** explicação mostrada junto do item */
  ajuda?: string;
}

export interface Modelo {
  versao: string;
  titulo: string;
  itens: ItemModelo[];
}

// Modelo PE-SGS-0059 (ArcelorMittal, Formulário 6 — Check list de pré-uso para pontes rolantes)
// sem carro auxiliar e sem cabine (a ponte da oficina não tem), mais os itens complementares do
// FOR GTO 071 (Benetech) que o modelo da AM não cobre. Critério da AM: só é permitido usar a
// ponte com todos os itens conformes, exceto os marcados com * (não impeditivos).
const G_ELEV = 'Carro principal — Elevação do carro';
const G_TRANS_CARRO = 'Carro principal — Translação do carro';
const G_TRANS_PONTE = 'Translação da ponte';
const G_GERAIS = 'Itens gerais';
const G_COMPL = 'Complementares (FOR GTO 071)';
let seq = 0;
const it = (grupo: string, texto: string, bloqueia: boolean, ajuda?: string): ItemModelo => {
  seq += 1;
  return { id: `am${seq}`, grupo, texto: `${seq}. ${texto}`, bloqueia, ...(ajuda ? { ajuda } : {}) };
};

/**
 * Itens críticos (bloqueia = true): "N – Não conforme" interdita a ponte. Não impeditivos: sirene
 * (* no modelo da AM) e, nos complementares, limpeza da botoeira, ruído, placa de capacidade e
 * iluminação.
 */
export const MODELO: Modelo = {
  versao: 'PE-SGS-0059 · Formulário 6',
  titulo: 'Check list de pré-uso para pontes rolantes',
  itens: [
    it(G_ELEV, 'Limite de redução superior', true),
    it(G_ELEV, 'Limite de redução inferior', true),
    it(G_ELEV, 'Condição dos freios', true),
    it(G_ELEV, 'Limite de emergência', true),
    it(G_TRANS_CARRO, 'Limite de redução no avanço', true),
    it(G_TRANS_CARRO, 'Limite de parada no avanço', true),
    it(G_TRANS_CARRO, 'Limite de redução no recuo', true),
    it(G_TRANS_CARRO, 'Limite de parada no recuo', true),
    it(G_TRANS_CARRO, 'Condição dos freios', true),
    it(G_TRANS_PONTE, 'Limite de redução à esquerda', true),
    it(G_TRANS_PONTE, 'Limite de parada à esquerda', true),
    it(G_TRANS_PONTE, 'Limite de redução à direita', true),
    it(G_TRANS_PONTE, 'Limite de parada à direita', true),
    it(G_TRANS_PONTE, 'Condição dos freios', true),
    it(G_GERAIS, 'Emergência geral', true),
    it(G_GERAIS, 'Sirene', false, 'Item não impeditivo, exceto se algum padrão operacional mencionar.'),
    it(G_GERAIS, 'Limpeza geral da ponte', true),
    it(G_COMPL, 'A caixa da botoeira/controle remoto está limpa, enxuta e com sinais de comando bem visíveis.', false),
    it(G_COMPL, 'Os cabos da botoeira em boas condições.', true),
    it(G_COMPL, 'O percurso da ponte rolante está sem obstáculo.', true),
    it(G_COMPL, 'Os cabos de aço do içamento estão em condições de uso.', true),
    it(G_COMPL, 'O içamento principal está operante (sobe e desce sem problemas).', true),
    it(G_COMPL, 'O gancho do içamento principal está com abertura normal.', true),
    it(G_COMPL, 'O gancho do içamento principal está com a trava de segurança operante.', true),
    it(G_COMPL, 'O gancho do içamento principal está girando 360º sem problemas.', true),
    it(G_COMPL, 'Existe algum ruído durante a operação da ponte.', false, 'S – Conforme = sem ruído anormal · N – Não conforme = há ruído anormal'),
    it(G_COMPL, 'A indicação da capacidade máxima da ponte está visível à distância.', false),
    it(G_COMPL, 'O local onde a ponte opera está iluminado o suficiente para enxergar os movimentos da carga.', false),
  ],
};

/** regra do modelo da AM, mostrada no formulário */
export const REGRA_AM = 'Somente é permitida a execução da atividade com a utilização da Ponte Rolante se todos os itens estiverem conformes (exceto os não impeditivos).';

/** pergunta final do formulário: "Não" = interditar e relatar à supervisão */
export const PERGUNTA_FINAL =
  'Diante dos pontos observados nesta inspeção, a ponte rolante está em condições de operar normalmente? Em caso negativo emitir um relatório para a supervisão do setor e interditar o equipamento.';
export const AREA = 'Oficina da vulcanização';

/** primeiro dia de uso do checklist no app: antes disso não há "dia sem checklist" */
export const INICIO_PONTE = '2026-11-17';

export const PIN_TAM = 6;
export const NOME_MAX = 120;
export const MATRICULA_MAX = 30;
export const OBS_MAX = 1000;
/** começa a avisar quantos dias antes do vencimento do treinamento */
export const AVISO_DIAS = 30;

export interface Operador {
  id: string;
  nome: string;
  matricula: string;
  /** validade do treinamento "AAAA-MM-DD" (vale até o fim do dia) */
  validade: string;
  /** fim do dia da validade (ms, horário de Brasília) — a regra da nuvem confere */
  validadeAte: number;
  /** conta interna do operador (o PIN é a senha); muda quando o PIN é redefinido */
  authEmail: string;
  ativo: boolean;
  atualizadoEm: string;
}

export interface RespostaItem {
  r: Resposta;
  obs: string;
}

export interface Checklist {
  id: string;
  /** dia do checklist "AAAA-MM-DD" (aparelho) */
  data: string;
  /** quando foi feito, pelo relógio do aparelho (ISO) */
  feitoEm: string;
  /** quando a nuvem recebeu (horário do servidor, prova para auditoria); null enquanto pendente */
  recebidoEm: Date | null;
  operadorId: string;
  nome: string;
  matricula: string;
  modeloVersao: string;
  /** itens no momento do checklist (o modelo pode mudar depois) */
  itens: ItemModelo[];
  respostas: Record<string, RespostaItem>;
  resultado: 'liberada' | 'bloqueada';
  /** resposta do operador à pergunta final (null = checklist antigo, sem a pergunta) */
  apto: boolean | null;
  observacao: string;
  criadoUid: string;
  /** fotos anexadas (subcoleção) */
  fotos: number;
  /** exclusão pelo administrador (o registro continua guardado, fora do painel): '' = válido */
  excluidoEm: string;
  excluidoPor: string;
  excluidoMotivo: string;
}

export const MOTIVO_EXCLUSAO_MIN = 10;

// ------------------------------------------------------------------ datas

export function hojeIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86_400_000);
}

export function somaDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** fim do dia (23:59:59.999) em Brasília (UTC−3, sem horário de verão desde 2019) */
export const fimDoDiaBrasilia = (iso: string) => Date.parse(`${iso}T23:59:59.999-03:00`);

// ------------------------------------------------------------------ operadores

export type SituacaoTreinamento = 'ok' | 'vence' | 'vencido';

export function situacaoTreinamento(op: Pick<Operador, 'validade'>, hoje: string): { s: SituacaoTreinamento; dias: number } {
  if (!op.validade) return { s: 'vencido', dias: -1 };
  const dias = diasEntre(hoje, op.validade);
  return { s: dias < 0 ? 'vencido' : dias <= AVISO_DIAS ? 'vence' : 'ok', dias };
}

export function textoTreinamento(op: Pick<Operador, 'validade' | 'nome'>, hoje: string): string {
  const { s, dias } = situacaoTreinamento(op, hoje);
  if (s === 'vencido') return `Treinamento vencido${op.validade ? ` em ${dataBr(op.validade)}` : ''} — não pode operar a ponte rolante`;
  if (s === 'vence') return dias === 0 ? 'Treinamento vence hoje' : `Treinamento vence em ${dias} dia(s) (${dataBr(op.validade)})`;
  return `Treinamento válido até ${dataBr(op.validade)}`;
}

export const limpar = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
export const nomeMaiusculo = (s: string) => limpar(s, NOME_MAX).toLocaleUpperCase('pt-BR');
export const pinValido = (p: string) => new RegExp(`^\\d{${PIN_TAM}}$`).test(p);

/** e-mail interno da conta do operador (aleatório: ninguém cria a conta antes do administrador) */
export function emailOperador(): string {
  const r = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('');
  return `op-${r}@operadores.vulcaescala.example.com`;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function completarOperador(id: string, v: unknown): Operador | null {
  const o = (v ?? {}) as Partial<Operador>;
  const nome = str(o.nome, NOME_MAX);
  if (!nome) return null;
  const validade = /^\d{4}-\d{2}-\d{2}$/.test(str(o.validade, 10)) ? str(o.validade, 10) : '';
  return {
    id,
    nome,
    matricula: str(o.matricula, MATRICULA_MAX),
    validade,
    validadeAte: typeof o.validadeAte === 'number' ? o.validadeAte : validade ? fimDoDiaBrasilia(validade) : 0,
    authEmail: str(o.authEmail, 200).toLowerCase(),
    ativo: o.ativo !== false,
    atualizadoEm: str(o.atualizadoEm, 40),
  };
}

export const ordenarOperadores = (l: Operador[]) => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// ------------------------------------------------------------------ checklist

/**
 * Interditada se o operador responder "Não" na pergunta final OU se algum item crítico estiver
 * "N – Não conforme" (com item crítico não conforme a ponte não pode ser liberada).
 */
export function resultadoDe(itens: ItemModelo[], respostas: Record<string, RespostaItem>, apto: boolean | null = true): 'liberada' | 'bloqueada' {
  // item crítico "N – Não conforme" interdita: a ponte não pode ser liberada
  return apto === false || itens.some((i) => i.bloqueia && respostas[i.id]?.r === 'NC') ? 'bloqueada' : 'liberada';
}

/** itens críticos marcados "N" */
export const criticosNC = (itens: ItemModelo[], respostas: Record<string, RespostaItem>) => itens.filter((i) => i.bloqueia && respostas[i.id]?.r === 'NC');

export const faltando = (itens: ItemModelo[], respostas: Record<string, RespostaItem>) => itens.filter((i) => !respostas[i.id]?.r);

export function completarChecklist(id: string, v: unknown): Checklist | null {
  const c = (v ?? {}) as Record<string, unknown>;
  const data = str(c.data, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const itens = Array.isArray(c.itens)
    ? (c.itens as Partial<ItemModelo>[])
        .filter((i) => i && typeof i.id === 'string')
        .map((i) => ({ id: String(i.id), grupo: str(i.grupo, 120), texto: str(i.texto, 400), bloqueia: i.bloqueia === true, ...(i.ajuda ? { ajuda: str(i.ajuda, 200) } : {}) }))
    : [];
  const respostas: Record<string, RespostaItem> = {};
  for (const [k, r] of Object.entries((c.respostas ?? {}) as Record<string, Partial<RespostaItem>>))
    if (r && (r.r === 'C' || r.r === 'NC' || r.r === 'NA')) respostas[k] = { r: r.r, obs: str(r.obs, OBS_MAX) };
  const rec = c.recebidoEm as { toDate?: () => Date } | null | undefined;
  return {
    id,
    data,
    feitoEm: str(c.feitoEm, 40),
    recebidoEm: rec && typeof rec.toDate === 'function' ? rec.toDate() : null,
    operadorId: str(c.operadorId, 60),
    nome: str(c.nome, NOME_MAX),
    matricula: str(c.matricula, MATRICULA_MAX),
    modeloVersao: str(c.modeloVersao, 40),
    itens,
    respostas,
    resultado: c.resultado === 'bloqueada' ? 'bloqueada' : 'liberada',
    apto: typeof c.apto === 'boolean' ? c.apto : null,
    observacao: str(c.observacao, OBS_MAX),
    criadoUid: str(c.criadoUid, 128),
    fotos: typeof c.fotos === 'number' ? c.fotos : 0,
    excluidoEm: str(c.excluidoEm, 40),
    excluidoPor: str(c.excluidoPor, 200),
    excluidoMotivo: str(c.excluidoMotivo, 500),
  };
}

/** o checklist que vale para o dia: o mais recente */
export function doDia(lista: Checklist[], data: string): Checklist | null {
  const l = lista.filter((c) => c.data === data).sort((a, b) => b.feitoEm.localeCompare(a.feitoEm));
  return l[0] ?? null;
}

export const horaDe = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
