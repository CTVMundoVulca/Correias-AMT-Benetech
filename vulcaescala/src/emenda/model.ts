/**
 * Registro de Emenda — contrato AMT.
 * Mesmo formulário do app do contrato Suzano, sem a seção "Liberação do cliente/fiscal".
 * Campos "planos" (um nível) para que duas pessoas editando a mesma emenda
 * só sobrescrevam o campo que cada uma alterou.
 */

export type SimNao = 'Sim' | 'Não' | 'N/A' | '';

export interface EfetivoItem {
  /** relatórios antigos: id do cadastro da escala; novos: vazio (a escolha é pelo nome) */
  workerId: string;
  nome: string;
  /** matrícula ou CPF (lista de colaboradores da emenda) */
  matricula: string;
}

/** Colaborador da lista própria do Registro de Emenda (separada do efetivo da escala). */
export interface Funcionario {
  nome: string;
  /** matrícula ou CPF */
  doc: string;
}

/**
 * CPF (11 dígitos) aparece mascarado na tela: ***.***.789-01.
 * Matrícula aparece inteira. O relatório/PDF usa o documento completo.
 */
export function mascararDoc(doc: string): string {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length !== 11) return doc;
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Nome em maiúsculas, sem espaços repetidos (como no app do Suzano). */
export const normNome = (n: string) => n.replace(/\s+/g, ' ').trim().toUpperCase();

export interface MaterialItem {
  material: string;
  fabricante: string;
  lote: string;
  qtd: string;
  validade: string;
}

export interface EquipItem {
  equip: string;
  marca: string;
  codigo: string;
  certificado: string;
  dataCal: string;
  validadeCal: string;
}

export interface Liberacao {
  workerId: string;
  nome: string;
  matricula: string;
  data: string;
  /** imagem da assinatura (data URL JPEG) */
  assinatura: string;
}

export interface Emenda {
  id: string;
  criadoEm: string;
  /** sessão (aparelho) que criou o relatório: pode excluí-lo, além da liderança */
  criadoUid?: string;
  atualizadoEm: string;
  atualizadoPor: string;
  // 1 identificação
  tag: string;
  data: string; // AAAA-MM-DD (usada para organizar por mês)
  numero: string;
  om: string;
  // 2–4
  /** efetivo que fez a TROCA da correia (execução da emenda) */
  efetivo: EfetivoItem[];
  /** efetivo que PREPAROU a correia antes (abertura das emendas) — pode ser outra equipe */
  efetivoPreparo: EfetivoItem[];
  materiaisEmenda: MaterialItem[];
  materiaisManta: MaterialItem[];
  equipamentos: EquipItem[];
  // 5 dados da emenda
  tipoCorreia: 'Lona' | 'Cabo Aço';
  tipoEmenda: 'Frio' | 'Quente';
  especificacao: string;
  largura: string;
  trecho: string;
  estagio1: string;
  estagio2: string;
  estagio3: string;
  chanfro: string;
  qtdLona: string;
  qtdPasses: string;
  comprPasse: string;
  fechamento: string;
  vies: string;
  comprTotal: string;
  mantaInf: string;
  mantaSup: string;
  ckLixada: SimNao;
  ckLimpa: SimNao;
  ckUmidadeOleo: SimNao;
  ckAlinhada: SimNao;
  // 6 checklist da vulcanização
  tempAmbiente: string;
  umidade: string;
  orvalho: string;
  tempSuperficie: string;
  clima: 'Seco' | 'Chuva' | '';
  demao1: string;
  demao2: string;
  demao3: string;
  /** contaminantes que caíram na emenda antes / depois da aplicação da cola */
  contamAntes: string;
  contamDepois: string;
  horaFechada: string;
  rodilhada: SimNao;
  tempVulc: string;
  tempoVulc: string;
  pressaoVulc: string;
  tempAbertura: string;
  horaAbertura: string;
  dureza: string;
  ckBolha: SimNao;
  ckAcabamento: SimNao;
  ckFaltouMaterial: SimNao;
  obsVulc: string;
  // 7 prensa
  seriePrensa: 'N/A' | 'Nilos' | 'Sampla' | '';
  prensaTestada: SimNao;
  paineis: string;
  bombas: string;
  dataTeste: string;
  assEletricista: string;
  obsPrensa: string;
  // 8 problemas
  problemaTipo: string;
  problemaTemp: string;
  problemaPressao: string;
  problemaTempo: string;
  retomada: string;
  // 9–10 liberações
  libTecnico: Liberacao;
  libSupervisor: Liberacao;
}

export interface Foto {
  id: string;
  ordem: number;
  legenda: string;
  /** imagem comprimida (data URL JPEG) */
  data: string;
  criadoEm: string;
}

export interface Listas {
  materiaisEmenda: string[];
  materiaisManta: string[];
  fabricantes: string[];
  /** aparelhos de medição (seção 4): já vêm preenchidos no relatório novo */
  equipamentos: string[];
}

/** Listas iniciais (mesmas do app do Suzano); editáveis em "Gerenciar". */
export const LISTAS_PADRAO: Listas = {
  materiaisEmenda: [
    'CIMENTO VIPAL',
    'CATALISADOR VIPAL',
    'LIGAÇÃO 0060 BLT1.2MT',
    'LIGAÇÃO 0083 BLSC 1.5ST',
    'LIGAÇÃO 0205 BLSC 5.0ST',
    'SOLVENTE 0131 SOL-1 3.6',
    'CIMENTO 0069 CIMSC-ST 3.6',
    'CIMENTO 0065 CIMT-ST 3.6',
    'CIMENTO 0066 CIMT-MT 3.6',
  ],
  materiaisManta: ['COBERTURA 0087 CBSC8.0ST', 'COBERTURA 0084 CBSC4.0ST', 'COBERTURA 0086 CBSC6.0ST'],
  fabricantes: ['VIPAFIX', 'BENETECH'],
  equipamentos: ['TERMÔMETRO INFRAVERMELHO', 'TERMO-HIGRÔMETRO'],
};

/** Linhas da seção 4 já com o nome de cada aparelho (o restante a pessoa preenche). */
export const equipamentosIniciais = (nomes: string[] = LISTAS_PADRAO.equipamentos): EquipItem[] =>
  nomes.map((equip) => ({ equip, marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' }));

/**
 * Campos de foto guiados (mesma sequência do app do Suzano): cada campo mostra embaixo
 * qual foto vai nele. "+ Adicionar mais fotos" cria campos extras ("Emenda").
 */
export const FOTO_CAMPOS = ['Material de emenda', 'Material de emenda', 'Termômetro a laser', 'Termo higrômetro', 'Emenda'];

/** Descrição padrão do campo de foto na posição `ordem` (0 = primeiro). */
export function legendaSugerida(ordem: number): string {
  return FOTO_CAMPOS[ordem] ?? 'Emenda';
}

export const liberacaoVazia = (): Liberacao => ({ workerId: '', nome: '', matricula: '', data: '', assinatura: '' });

export function novaEmenda(id: string, hoje: string, por: string, aparelhos: string[] = LISTAS_PADRAO.equipamentos): Emenda {
  const now = new Date().toISOString();
  const e: Emenda = {
    id,
    criadoEm: now,
    atualizadoEm: now,
    atualizadoPor: por,
    tag: '',
    data: hoje,
    numero: '',
    om: '',
    efetivo: [],
    efetivoPreparo: [],
    materiaisEmenda: [],
    materiaisManta: [],
    equipamentos: equipamentosIniciais(aparelhos),
    tipoCorreia: 'Lona',
    tipoEmenda: 'Frio',
    especificacao: '',
    largura: '',
    trecho: '',
    estagio1: 'N/A',
    estagio2: 'N/A',
    estagio3: 'N/A',
    chanfro: 'N/A',
    qtdLona: '',
    qtdPasses: '',
    comprPasse: '',
    fechamento: '',
    vies: '',
    comprTotal: '',
    mantaInf: '',
    mantaSup: '',
    ckLixada: '',
    ckLimpa: '',
    ckUmidadeOleo: '',
    ckAlinhada: '',
    tempAmbiente: '',
    umidade: '',
    orvalho: '',
    tempSuperficie: '',
    clima: '',
    demao1: '',
    demao2: '',
    demao3: '',
    contamAntes: '',
    contamDepois: '',
    horaFechada: '',
    rodilhada: '',
    tempVulc: 'N/A',
    tempoVulc: 'N/A',
    pressaoVulc: 'N/A',
    tempAbertura: 'N/A',
    horaAbertura: 'N/A',
    dureza: '',
    ckBolha: '',
    ckAcabamento: '',
    ckFaltouMaterial: '',
    obsVulc: '',
    seriePrensa: '',
    prensaTestada: '',
    paineis: 'N/A',
    bombas: 'N/A',
    dataTeste: 'N/A',
    assEletricista: 'N/A',
    obsPrensa: '',
    problemaTipo: 'N/A',
    problemaTemp: 'N/A',
    problemaPressao: 'N/A',
    problemaTempo: 'N/A',
    retomada: 'N/A',
    libTecnico: liberacaoVazia(),
    libSupervisor: liberacaoVazia(),
  };
  return { ...e, ...recalcular(e, ['tipoCorreia']) };
}

/** Relatório sem nenhuma informação preenchida (só data e dados de controle)? */
export function emendaVazia(e: Emenda): boolean {
  const META = new Set(['id', 'criadoEm', 'criadoUid', 'atualizadoEm', 'atualizadoPor', 'data']);
  const base = novaEmenda(e.id, e.data, '') as unknown as Record<string, unknown>;
  const r = e as unknown as Record<string, unknown>;
  // aparelhos só com o nome (vieram preenchidos no relatório novo) não contam como dado
  const soNomes = (l: unknown) => Array.isArray(l) && (l as EquipItem[]).every((q) => !q.marca && !q.codigo && !q.certificado && !q.dataCal && !q.validadeCal);
  return Object.keys(base).every(
    (k) => META.has(k) || (k === 'equipamentos' ? soNomes(r[k] ?? []) : JSON.stringify(r[k] ?? base[k]) === JSON.stringify(base[k])),
  );
}

/** Preenche um registro antigo/incompleto com os valores padrão (nunca perde campos). */
export function completarEmenda(raw: Partial<Emenda> & { id: string }): Emenda {
  // registro antigo sem o campo de aparelhos não ganha linhas automáticas
  const base = novaEmenda(raw.id, raw.data ?? '', raw.atualizadoPor ?? '', []);
  return { ...base, ...raw, libTecnico: { ...base.libTecnico, ...raw.libTecnico }, libSupervisor: { ...base.libSupervisor, ...raw.libSupervisor } };
}

// ---------------------------------------------------------------- cálculos

const num = (s: string) => {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Ponto de orvalho (°C) pela fórmula de Magnus com os coeficientes de Sonntag (1990),
 * recomendada pela OMM: b = 17,62 e c = 243,12 °C, válida de −45 a 60 °C (erro < 0,1 °C).
 *   γ = ln(UR/100) + b·T/(c + T)      Td = c·γ / (b − γ)
 * Devolve "" se temperatura/umidade não forem números válidos (UR entre 1 e 100 %).
 */
export function pontoOrvalho(temp: string, umidade: string): string {
  const t = parseFloat(String(temp).replace(',', '.'));
  const ur = parseFloat(String(umidade).replace(',', '.'));
  if (!Number.isFinite(t) || !Number.isFinite(ur) || ur <= 0 || ur > 100 || t < -45 || t > 60) return '';
  const b = 17.62;
  const c = 243.12;
  const g = Math.log(ur / 100) + (b * t) / (c + t);
  const td = (c * g) / (b - g);
  return td.toFixed(1).replace('.', ',');
}

/** Margem mínima entre a temperatura da superfície e o ponto de orvalho (°C), referência ISO 8502-4. */
export const MARGEM_ORVALHO = 3;

/**
 * Superfície × ponto de orvalho: diferença (°C) e se atende à margem mínima de 3 °C
 * (abaixo disso há risco de condensação na emenda). null = falta algum dos dois valores.
 */
export function margemOrvalho(tempSuperficie: string, orvalho: string): { diff: number; ok: boolean; texto: string } | null {
  const ts = parseFloat(String(tempSuperficie).replace(',', '.'));
  const td = parseFloat(String(orvalho).replace(',', '.'));
  if (!Number.isFinite(ts) || !Number.isFinite(td)) return null;
  const diff = Math.round((ts - td) * 10) / 10;
  const ok = diff >= MARGEM_ORVALHO;
  const v = diff.toFixed(1).replace('.', ',');
  return { diff, ok, texto: ok ? `${v} °C acima do orvalho ✓` : `${v} °C — abaixo do mínimo de ${MARGEM_ORVALHO} °C ⚠` };
}

/** "HH:MM" + minutos → "HH:MM" (mesma lógica do app do Suzano, sem passar de 24h). */
export function somaHora(hhmm: string, minutos: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return '';
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutos) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Campos que disparam o recálculo automático. */
export const CAMPOS_GATILHO: (keyof Emenda)[] = ['tipoCorreia', 'tipoEmenda', 'largura', 'qtdLona', 'comprTotal', 'demao1', 'data'];

/**
 * Valores automáticos (regras do app do Suzano). Recebe a emenda já com a
 * alteração aplicada e devolve só os campos calculados — a pessoa ainda pode
 * editar qualquer um deles depois.
 */
export function recalcular(e: Emenda, alterados: (keyof Emenda)[]): Partial<Emenda> {
  // ponto de orvalho: gatilho próprio (temperatura ou umidade) — não mexe nos outros campos
  const orv: Partial<Emenda> = alterados.some((c) => c === 'tempAmbiente' || c === 'umidade') ? { orvalho: pontoOrvalho(e.tempAmbiente, e.umidade) } : {};
  if (!alterados.some((c) => CAMPOS_GATILHO.includes(c))) return orv;
  const out: Partial<Emenda> = { ...orv };
  const tc = e.tipoCorreia;
  const te = e.tipoEmenda;
  const larg = num(e.largura);
  const lonas = num(e.qtdLona);
  const total = num(e.comprTotal);

  // Viés: Frio = largura/2 | Quente = largura × 0,364
  if (larg > 0) out.vies = String(Math.round(te === 'Quente' ? larg * 0.364 : larg / 2));

  // Lona: passes = lonas − 1; compr. passe = total / passes
  if (tc === 'Lona' && lonas > 0) {
    const passes = lonas - 1;
    out.qtdPasses = String(passes);
    if (total > 0 && passes > 0) out.comprPasse = String(Math.round(total / passes));
  }

  // Cabo Aço + Quente: 1º estágio = total − 180; 2º = 1º/2 + 20
  if (tc === 'Cabo Aço' && te === 'Quente' && total > 0) {
    const est1 = total - 180;
    out.estagio1 = String(est1);
    out.estagio2 = String(Math.round(est1 / 2 + 20));
  } else if (tc === 'Cabo Aço') {
    out.estagio1 = 'N/A';
    out.estagio2 = 'N/A';
  }
  out.chanfro = tc === 'Cabo Aço' ? '60' : 'N/A';

  // 2ª demão = 1ª + 1h
  const demao2 = e.demao1 ? somaHora(e.demao1, 60) : e.demao2;
  if (e.demao1) out.demao2 = demao2;
  // Fechada: Cabo Aço = 2ª + 3h | Quente = +30min | Frio = +10min
  const fechada = demao2 ? somaHora(demao2, tc === 'Cabo Aço' ? 180 : te === 'Quente' ? 30 : 10) : e.horaFechada;
  if (demao2) out.horaFechada = fechada;

  out.rodilhada = te === 'Frio' ? 'Sim' : 'N/A';
  out.tempVulc = te === 'Quente' ? '150°' : 'N/A';
  out.tempoVulc = te === 'Quente' ? '45' : 'N/A';
  out.pressaoVulc = tc === 'Cabo Aço' ? '10' : te === 'Quente' ? '8' : 'N/A';
  out.tempAbertura = te === 'Quente' ? '60°' : 'N/A';
  if (te === 'Quente' && fechada) out.horaAbertura = somaHora(fechada, 240);
  else if (te !== 'Quente') out.horaAbertura = 'N/A';
  out.dataTeste = te === 'Quente' ? e.data || 'N/A' : 'N/A';
  return out;
}

// ---------------------------------------------------------------- meses

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "AAAA-MM" do dia de hoje (horário do aparelho). */
export function mesAtual(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function hojeIso(now = new Date()): string {
  return `${mesAtual(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

export function somaMes(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function nomeMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** Intervalo de datas (texto AAAA-MM-DD) do mês, para a consulta no Firestore. */
export function intervaloMes(ym: string): [string, string] {
  return [`${ym}-01`, `${ym}-31`];
}

export const fmtData = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '—');

/** Ordem da lista: data mais recente primeiro; no mesmo dia, número maior primeiro. */
export function ordenar(lista: Emenda[]): Emenda[] {
  return [...lista].sort(
    (a, b) => b.data.localeCompare(a.data) || num(b.numero) - num(a.numero) || b.criadoEm.localeCompare(a.criadoEm),
  );
}
