/**
 * Checklist diário da ponte rolante (oficina da vulcanização — contrato AMT).
 *
 * Operador = pessoa treinada, cadastrada pelo administrador (nome completo, matrícula,
 * validade do treinamento). Cada operador tem uma conta própria no Firebase (e-mail
 * interno + PIN de 6 dígitos como senha): a NUVEM confere quem assinou o checklist.
 */

export type Resposta = 'C' | 'NC' | 'NA';
/** legenda do formulário FOR GTO 071: S – atende, N – não atende, NA – não aplicável */
export const RESPOSTAS: { id: Resposta; nome: string; curto: string }[] = [
  { id: 'C', nome: 'S – Atende', curto: 'S' },
  { id: 'NC', nome: 'N – Não atende', curto: 'N' },
  { id: 'NA', nome: 'NA – Não aplicável', curto: 'NA' },
];

export interface ItemModelo {
  id: string;
  grupo: string;
  texto: string;
  /** "N – Não atende" neste item = ponte interditada */
  bloqueia: boolean;
  /** explicação mostrada junto do item */
  ajuda?: string;
}

export interface Modelo {
  versao: string;
  titulo: string;
  itens: ItemModelo[];
}

const G = 'Lista de verificação';
const it = (n: number, texto: string, bloqueia = false, ajuda?: string): ItemModelo => ({ id: `i${n}`, grupo: G, texto: `${n}. ${texto}`, bloqueia, ...(ajuda ? { ajuda } : {}) });

/**
 * FOR GTO 071 — Check list para operação de ponte rolante (Benetech, rev. 01), transcrito sem
 * alteração. Itens críticos (bloqueiam o uso com "N"): escolhidos com a liderança do contrato.
 */
export const MODELO: Modelo = {
  versao: 'FOR GTO 071 rev.01',
  titulo: 'Check list para operação de ponte rolante',
  itens: [
    it(1, 'A caixa da botoeira/controle remoto está limpa, enxuta e com sinais de comando bem visíveis.'),
    it(2, 'Os cabos da botoeira em boas condições.'),
    it(3, 'O botão de emergência está operante.', true),
    it(4, 'O alarme sonoro de movimento está operante.'),
    it(5, 'O percurso da ponte rolante está sem obstáculo.'),
    it(6, 'A ponte está transladando para frente e para trás.'),
    it(7, 'Os limites de translação da ponte estão operantes.', true),
    it(8, 'O freio da ponte está operante.', true),
    it(9, 'O trolley está transladando para ambos os lados.'),
    it(10, 'Os limites de translação do trolley estão operantes.', true),
    it(11, 'O freio do trolley está operante.', true),
    it(12, 'Os cabos de aço do içamento estão em condições de uso.', true),
    it(13, 'O içamento principal está operante (sobe e desce sem problemas).'),
    it(14, 'O limite de fim de curso para içamento principal está atuante.', true),
    it(15, 'O freio do içamento principal está operante.', true),
    it(16, 'O gancho do içamento principal está com abertura normal.', true),
    it(17, 'O gancho do içamento principal está com a trava de segurança operante.', true),
    it(18, 'O gancho do içamento principal está girando 360º sem problemas.'),
    it(19, 'Existe algum ruído durante a operação da ponte.', false, 'S – Atende = sem ruído anormal · N – Não atende = há ruído anormal'),
    it(20, 'A indicação da capacidade máxima da ponte está visível à distância.'),
    it(21, 'A ponte está limpa e o local onde opera está iluminado o suficiente para enxergar os movimentos da carga.'),
  ],
};

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
}

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
 * Quem decide é a pergunta final (como no formulário em papel): "Não" interdita; "Sim" libera,
 * mesmo com item crítico em "N" (o registro mostra esses itens para a auditoria).
 */
export function resultadoDe(_itens: ItemModelo[], _respostas: Record<string, RespostaItem>, apto: boolean | null = true): 'liberada' | 'bloqueada' {
  return apto === false ? 'bloqueada' : 'liberada';
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
  };
}

/** o checklist que vale para o dia: o mais recente */
export function doDia(lista: Checklist[], data: string): Checklist | null {
  const l = lista.filter((c) => c.data === data).sort((a, b) => b.feitoEm.localeCompare(a.feitoEm));
  return l[0] ?? null;
}

export const horaDe = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
