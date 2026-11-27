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
  /** técnico em elétrica habilitado (assina o teste da prensa na seção 7); ausente = não */
  eletricista?: boolean;
  /** supervisor/encarregado que libera a vistoria da prensa (FOR GTO 062); ausente = não */
  liberaPrensa?: boolean;
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
  /** prensa utilizada, escolhida do cadastro (patrimônio · fabricante · modelo · nº de série) */
  prensaEquip: string;
  prensaTestada: SimNao;
  paineis: string;
  bombas: string;
  dataTeste: string;
  /** texto livre antigo (relatórios anteriores à assinatura do técnico em elétrica) */
  assEletricista: string;
  /** técnico em elétrica que testou a prensa: nome, matrícula, data e assinatura
   * (é também o responsável pela inspeção na vistoria FOR GTO 062) */
  libEletricista: Liberacao;
  obsPrensa: string;
  // 7.1 vistoria de prensas e equipamentos (FOR GTO 062) — data = dataTeste; nº do painel/bomba = paineis/bombas
  /** resposta de cada item (chave de ITENS_VISTORIA): C, NC, NA ou "" (sem resposta) */
  vistoriaItens: Partial<Record<ItemVistoriaId, RespVistoria>>;
  /** aparelhos usados nos testes da prensa (mesmo cadastro dos aparelhos de medição) */
  vistoriaAparelhos: EquipItem[];
  vistoriaAnotacoes: string;
  /** "Liberado por" da vistoria: o supervisor OU o encarregado (basta um) */
  libPrensa: Liberacao;
  /**
   * Conjuntos de prensa usados (até 3): prensa, painéis, bombas, itens da vistoria e resistências
   * dos platôs de cada um. Vazio = relatório anterior: o conjunto 1 vem de prensaEquip/paineis/
   * bombas/vistoriaItens (que continuam sendo gravados com os dados do conjunto 1).
   */
  conjuntos: ConjuntoPrensa[];
  // 8 problemas
  problemaTipo: string;
  problemaTemp: string;
  problemaPressao: string;
  problemaTempo: string;
  retomada: string;
  // 9–10 liberações
  libTecnico: Liberacao;
  libSupervisor: Liberacao;
  // situação: concluído (somente leitura) ou em preenchimento ('' = em preenchimento)
  concluidoEm: string;
  /** nome de quem concluiu (e e-mail, se logado) */
  concluidoPor: string;
  /** sessão (aparelho) que concluiu: ela e a liderança podem reabrir */
  concluidoUid: string;
  reabertoEm: string;
  reabertoPor: string;
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
  equipamentos: ['TERMÔMETRO INFRAVERMELHO', 'TERMO-HIGRÔMETRO', 'DURÔMETRO'],
};

/** Patrimônio/identificação padronizado: sem espaços sobrando, maiúsculas (chave do cadastro). */
export const normCodigo = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

/** Validade sugerida: 1 ano após a calibração ("" se a data não for válida). */
export function validadeSugerida(dataCal: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dataCal) ? `${Number(dataCal.slice(0, 4)) + 1}${dataCal.slice(4)}` : '';
}

/**
 * Cadastro de aparelhos de medição (Gerenciar aparelhos): cada aparelho físico, identificado
 * pelo patrimônio, com marca, certificado e calibração. No relatório, escolher o patrimônio
 * preenche o resto. Registros vindos da nuvem são limpos (sem patrimônio = descartado;
 * patrimônio repetido = vale o primeiro).
 */
export function cleanAparelhos(raw: unknown): EquipItem[] {
  const out: EquipItem[] = [];
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  for (const a of Array.isArray(raw) ? raw : []) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const codigo = normCodigo(s(o.codigo));
    if (!codigo || out.some((x) => x.codigo === codigo)) continue;
    out.push({ equip: s(o.equip), marca: s(o.marca), codigo, certificado: s(o.certificado), dataCal: s(o.dataCal), validadeCal: s(o.validadeCal) });
  }
  return out.sort((x, y) => x.equip.localeCompare(y.equip, 'pt-BR') || x.codigo.localeCompare(y.codigo, 'pt-BR'));
}

export const aparelhoPorCodigo = (lista: EquipItem[], codigo: string) => lista.find((a) => a.codigo === normCodigo(codigo));

/** Nome do tipo comparável: ignora espaços, maiúsculas e a forma do acento (texto digitado em aparelhos diferentes). */
export const chaveTipo = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toUpperCase();
export const mesmoTipo = (a: string, b: string) => chaveTipo(a) === chaveTipo(b);
/** Aparelhos cadastrados de um tipo (todos, se o tipo estiver vazio). */
export const aparelhosDoTipo = (lista: EquipItem[], tipo: string) => (tipo ? lista.filter((a) => mesmoTipo(a.equip, tipo)) : lista);

/**
 * Tipos de aparelho (um cadastro só): os da lista padrão/antiga mais os que aparecem no
 * cadastro de aparelhos — cadastrar um aparelho de um tipo novo já cria o tipo.
 */
export function tiposDeAparelho(cad: EquipItem[], antigos: string[]): string[] {
  const out = [...antigos];
  for (const a of cad) if (a.equip && !out.some((t) => mesmoTipo(t, a.equip))) out.push(a.equip);
  return out;
}

/**
 * Aparelho pronto para o relatório: tem patrimônio, data e validade da calibração. Só esses
 * aparecem na lista do campo Equipamento (seção 4); os incompletos ficam no cadastro, marcados.
 */
export const aparelhoCompleto = (a: EquipItem) => !!a.codigo.trim() && !!a.dataCal && !!a.validadeCal;

/** Aparelhos completos agrupados pelo tipo (na ordem do cadastro), para a lista do relatório. */
export function aparelhosPorTipo(cad: EquipItem[]): [string, EquipItem[]][] {
  const out: [string, EquipItem[]][] = [];
  for (const a of cad.filter(aparelhoCompleto)) {
    const g = out.find(([t]) => mesmoTipo(t, a.equip));
    if (g) g[1].push(a);
    else out.push([a.equip, [a]]);
  }
  return out;
}

/**
 * Linhas da seção 4 do relatório novo: uma por tipo de aparelho completo do cadastro; com um
 * único aparelho do tipo, já preenchida; com mais de um, só o tipo (escolhe-se o aparelho).
 */
export function linhasIniciais(cad: EquipItem[], data = ''): EquipItem[] {
  return aparelhosPorTipo(cad.filter((a) => !calibracaoVencida(a, data))).map(([t, d]) => (d.length === 1 ? { ...d[0] } : { equip: t, marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' }));
}

/** Aviso de calibração: vence em até 30 dias (ou já venceu). */
export const AVISO_CALIBRACAO_DIAS = 30;
/** Dias até a validade da calibração (negativo = vencida); null sem datas válidas. */
export function diasParaVencer(validadeCal: string, hoje: string): number | null {
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!ok(validadeCal) || !ok(hoje)) return null;
  return Math.round((Date.parse(validadeCal + 'T00:00:00Z') - Date.parse(hoje + 'T00:00:00Z')) / 86_400_000);
}
/** Aparelhos do cadastro vencidos ou vencendo em até 30 dias, do mais urgente ao menos. */
export function alertasCalibracao(cad: EquipItem[], hoje: string): { a: EquipItem; dias: number }[] {
  return cad
    .map((a) => ({ a, dias: diasParaVencer(a.validadeCal, hoje) }))
    .filter((x): x is { a: EquipItem; dias: number } => x.dias !== null && x.dias <= AVISO_CALIBRACAO_DIAS)
    .sort((x, y) => x.dias - y.dias);
}

/** Calibração vencida na data de referência ("AAAA-MM-DD")? Sem validade = não dá para dizer. */
export const calibracaoVencida = (a: Pick<EquipItem, 'validadeCal'>, data: string) => !!a.validadeCal && !!data && a.validadeCal < data;

/** Linhas da seção 4 já com o nome de cada aparelho (o restante a pessoa preenche). */
export const equipamentosIniciais = (nomes: string[] = LISTAS_PADRAO.equipamentos): EquipItem[] =>
  nomes.map((equip) => ({ equip, marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' }));

/**
 * Campos de foto guiados (mesma sequência do app do Suzano): cada campo mostra embaixo
 * qual foto vai nele. "+ Adicionar mais fotos" cria campos extras ("Emenda").
 */
/**
 * Fotos da vistoria da prensa (FOR GTO 062): ficam na mesma coleção das fotos do relatório,
 * nas posições negativas (−1, −2, …), fora dos campos numerados do registro fotográfico.
 * A posição −1 era a antiga "foto do check list da prensa": continua aparecendo como a 1ª foto.
 */
export const LEGENDA_FOTO_VISTORIA = 'Inspeção da prensa';
export const fotoDaVistoria = (f: Pick<Foto, 'ordem'>) => f.ordem < 0;

// ---------------------------------------------------------------- vistoria da prensa (FOR GTO 062)

/** Formulário padrão da empresa — atualizar código/revisão aqui quando o formulário mudar. */
export const FORM_VISTORIA = { codigo: 'FOR GTO 062', revisao: '07', dataRevisao: '', titulo: 'Vistoria de prensas e equipamentos' };
export type RespVistoria = 'C' | 'NC' | 'NA' | '';
export const RESPOSTAS_VISTORIA = ['C', 'NC', 'NA'] as const;
export const GRUPOS_VISTORIA = [
  {
    titulo: '1 - Parte elétrica dos platores',
    itens: [
      ['resistencias', 'Resistências'],
      ['tomadas', 'Tomadas'],
      ['cabos', 'Cabos de alimentação'],
      ['funcPaineis', 'Funcionamento dos painéis elétricos'],
    ],
  },
  {
    titulo: '2 - Sistema de pressão',
    itens: [
      ['bombas', 'Bombas'],
      ['manometro', 'Manômetro'],
      ['conexoes', 'Conexões'],
      ['cilindros', 'Cilindros hidráulicos'],
      ['mangueiras', 'Fixação e amarração das mangueiras'],
    ],
  },
  {
    titulo: '3 - Itens gerais',
    itens: [
      ['termometro', 'Termômetro manual'],
      ['parafusos', 'Parafusos de fixação das longarinas'],
      ['bracadeira', 'Utilização de braçadeira de nylon para amarração das mangueiras de resfriamento'],
    ],
  },
] as const;
export type ItemVistoriaId = (typeof GRUPOS_VISTORIA)[number]['itens'][number][0];
export const ITENS_VISTORIA: readonly (readonly [ItemVistoriaId, string])[] = GRUPOS_VISTORIA.flatMap((g) => [...g.itens] as (readonly [ItemVistoriaId, string])[]);

const isoData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const libPreenchida = (l: Liberacao) => !!(l.nome || l.assinatura);

// ---------- conjuntos de prensa (prensa + painéis + bombas) e resistência dos platôs

export const MAX_CONJUNTOS = 3;
/** Resistência entre fases de cada platô (ohms), como no FOR GTO 062 Rev. 07 */
export const PLATOS = [1, 2] as const;
export const FASES = [
  ['rs', 'R-S'],
  ['st', 'S-T'],
  ['tr', 'T-R'],
] as const;
export type ChaveResist = `p${(typeof PLATOS)[number]}${(typeof FASES)[number][0]}`;
export const CHAVES_RESIST: ChaveResist[] = PLATOS.flatMap((p) => FASES.map(([f]) => `p${p}${f}` as ChaveResist));
export interface ConjuntoPrensa {
  /** descrição da prensa escolhida no cadastro ("PR-01 · SAMPLA"), "N/A" ou "" */
  prensa: string;
  paineis: string;
  bombas: string;
  itens: Partial<Record<ItemVistoriaId, RespVistoria>>;
  resist: Partial<Record<ChaveResist, string>>;
}
export const conjuntoVazio = (): ConjuntoPrensa => ({ prensa: '', paineis: 'N/A', bombas: 'N/A', itens: {}, resist: {} });
/** valor de resistência válido: número (vírgula ou ponto) */
export const resistOk = (v: string | undefined) => !!v && /^\d+([.,]\d+)?$/.test(v.trim());

/** Conjuntos do relatório; relatório anterior (sem `conjuntos`) vira um conjunto com os campos antigos. */
export function conjuntosDe(e: Pick<Emenda, 'conjuntos' | 'prensaEquip' | 'paineis' | 'bombas' | 'vistoriaItens'>): ConjuntoPrensa[] {
  if (Array.isArray(e.conjuntos) && e.conjuntos.length)
    return e.conjuntos.slice(0, MAX_CONJUNTOS).map((c) => ({ ...conjuntoVazio(), ...c, itens: { ...c?.itens }, resist: { ...c?.resist } }));
  return [{ prensa: e.prensaEquip ?? '', paineis: e.paineis ?? 'N/A', bombas: e.bombas ?? 'N/A', itens: { ...e.vistoriaItens }, resist: {} }];
}

/** Campos a gravar: a lista de conjuntos e, nos campos antigos, o conjunto 1 (compatibilidade). */
export function camposConjuntos(lista: ConjuntoPrensa[]): Partial<Emenda> {
  const c0 = lista[0] ?? conjuntoVazio();
  return { conjuntos: lista, prensaEquip: c0.prensa, paineis: c0.paineis, bombas: c0.bombas, vistoriaItens: c0.itens };
}

/** Itens não conformes de um conjunto. */
export const itensNC = (c: Pick<ConjuntoPrensa, 'itens'>) => ITENS_VISTORIA.filter(([k]) => c.itens?.[k] === 'NC');

/** Vistoria obrigatória para concluir: só na emenda a quente. */
export const vistoriaObrigatoria = (e: Pick<Emenda, 'tipoEmenda'>) => e.tipoEmenda === 'Quente';

/**
 * A vistoria foi começada? (algum item, aparelho, anotação, liberação/visto ou a data).
 * Relatórios anteriores à vistoria (só com técnico em elétrica/foto) não contam.
 */
export function vistoriaIniciada(e: Emenda): boolean {
  return (
    conjuntosDe(e).some((c) => Object.values(c.itens).some(Boolean) || Object.values(c.resist).some((v) => !!v?.trim())) ||
    (e.vistoriaAparelhos ?? []).length > 0 ||
    !!e.vistoriaAnotacoes?.trim() ||
    libPreenchida(e.libPrensa)
  );
}

/**
 * O que falta na vistoria. NC sempre impede a conclusão; o resto só é exigido na emenda a quente.
 * Assinaturas: responsável pela inspeção (técnico em elétrica) e a liberação (supervisor ou encarregado).
 */
export function pendenciasVistoria(e: Emenda): string[] {
  const f: string[] = [];
  const P = 'Vistoria da prensa';
  const cs = conjuntosDe(e);
  const PC = (i: number) => (cs.length > 1 ? `${P} (conjunto ${i + 1})` : P);
  if (vistoriaObrigatoria(e)) {
    cs.forEach((c, i) => {
      const sem = ITENS_VISTORIA.filter(([k]) => !c.itens[k]).length;
      if (sem) f.push(`${PC(i)}: ${sem} ${sem === 1 ? 'item' : 'itens'} sem resposta (C/NC/NA)`);
      if (!separarItens(c.paineis).length) f.push(`${PC(i)}: nº do painel elétrico`);
      if (!separarItens(c.bombas).length) f.push(`${PC(i)}: nº do conjunto de bomba`);
      const faltam = CHAVES_RESIST.filter((k) => !resistOk(c.resist[k])).length;
      if (faltam) f.push(`${PC(i)}: resistência dos platôs (faltam ${faltam} de ${CHAVES_RESIST.length} valores)`);
    });
    if (!isoData(e.dataTeste)) f.push(`${P}: data`);
    if (!e.vistoriaAparelhos.some((a) => a.codigo.trim())) f.push(`${P}: aparelhos utilizados nos testes`);
    for (const [l, nome] of [
      [e.libEletricista, 'responsável pela inspeção (técnico em elétrica)'],
      [e.libPrensa, 'liberado por (supervisor ou encarregado)'],
    ] as const) {
      if (vazioTxt(l.nome)) f.push(`${P}: ${nome} — nome`);
      if (vazioTxt(l.assinatura)) f.push(`${P}: ${nome} — assinatura`);
    }
  }
  cs.forEach((c, i) => {
    for (const [, nome] of itensNC(c)) f.push(`${PC(i)}: “${nome}” não conforme (NC) — corrigir antes de concluir`);
  });
  return f;
}

/**
 * Cadastro único dos equipamentos da prensa (seção 7): prensas, painéis e bombas, cada um com
 * fabricante e patrimônio/identificação. No relatório, escolhe-se pelo patrimônio e fica gravada
 * a descrição (o relatório não muda se o cadastro mudar). `modelo` e `serie` saíram da tela,
 * mas o que já foi gravado neles continua guardado no cadastro (não se perde).
 */
export const TIPOS_PRENSA = ['Prensa', 'Painel', 'Bomba'] as const;
export type TipoItemPrensa = (typeof TIPOS_PRENSA)[number];
export interface ItemPrensa {
  tipo: TipoItemPrensa;
  fabricante: string;
  modelo: string;
  codigo: string;
  serie: string;
}
export const FABRICANTES_PRENSA = ['NILOS', 'SAMPLA'];

/** texto do item sem vírgulas (a vírgula separa os itens no relatório) */
const semVirgula = (v: unknown) => (typeof v === 'string' ? v.replace(/,/g, ' ').replace(/\s+/g, ' ').trim() : '');

/**
 * Limpa o cadastro vindo da nuvem. Painéis e bombas cadastrados antes (só o nome, em
 * `paineis`/`bombas`) entram como itens com o nome no patrimônio — nada se perde.
 */
export function cleanItensPrensa(raw: { itens?: unknown; paineis?: unknown; bombas?: unknown }): ItemPrensa[] {
  const out: ItemPrensa[] = [];
  const add = (it: ItemPrensa) => {
    if (it.codigo && !out.some((x) => x.codigo === it.codigo)) out.push(it);
  };
  for (const a of Array.isArray(raw.itens) ? raw.itens : []) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const tipo = (TIPOS_PRENSA as readonly string[]).includes(o.tipo as string) ? (o.tipo as TipoItemPrensa) : 'Painel';
    add({ tipo, fabricante: semVirgula(o.fabricante).toUpperCase(), modelo: semVirgula(o.modelo), codigo: normCodigo(semVirgula(o.codigo)), serie: semVirgula(o.serie) });
  }
  const antigos = (l: unknown, tipo: TipoItemPrensa) => {
    for (const n of Array.isArray(l) ? l : []) if (typeof n === 'string') add({ tipo, fabricante: '', modelo: '', codigo: normCodigo(semVirgula(n)), serie: '' });
  };
  antigos(raw.paineis, 'Painel');
  antigos(raw.bombas, 'Bomba');
  return out.sort((x, y) => TIPOS_PRENSA.indexOf(x.tipo) - TIPOS_PRENSA.indexOf(y.tipo) || x.codigo.localeCompare(y.codigo, 'pt-BR'));
}

/** Descrição gravada no relatório: "P-01 · SAMPLA" */
export const descricaoItemPrensa = (it: Pick<ItemPrensa, 'codigo' | 'fabricante'>) => [it.codigo, it.fabricante].filter(Boolean).join(' · ');

/** Patrimônio de uma entrada gravada no relatório (o que vem antes do primeiro " · "). */
export const codigoDaEntrada = (entrada: string) => normCodigo(entrada.split(' · ')[0] ?? '');

/** Série da prensa (Nilos/Sampla) a partir do fabricante cadastrado; outro fabricante = não muda. */
export function seriePeloFabricante(fab: string): 'Nilos' | 'Sampla' | null {
  const f = fab.trim().toUpperCase();
  return f === 'NILOS' ? 'Nilos' : f === 'SAMPLA' ? 'Sampla' : null;
}

/** "PAINEL 1, PAINEL 2" ⇄ lista (campos de texto da seção 7 continuam texto, para não mudar o formato salvo) */
export const separarItens = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x && x.toUpperCase() !== 'N/A' && x.toUpperCase() !== 'NA');
export const juntarItens = (l: string[]) => (l.length ? l.join(', ') : 'N/A');

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
    prensaEquip: '',
    prensaTestada: '',
    paineis: 'N/A',
    bombas: 'N/A',
    dataTeste: '',
    assEletricista: 'N/A',
    obsPrensa: '',
    vistoriaItens: {},
    vistoriaAparelhos: [],
    vistoriaAnotacoes: '',
    libPrensa: liberacaoVazia(),
    conjuntos: [],
    problemaTipo: 'N/A',
    problemaTemp: 'N/A',
    problemaPressao: 'N/A',
    problemaTempo: 'N/A',
    retomada: 'N/A',
    libTecnico: liberacaoVazia(),
    libSupervisor: liberacaoVazia(),
    libEletricista: liberacaoVazia(),
    concluidoEm: '',
    concluidoPor: '',
    concluidoUid: '',
    reabertoEm: '',
    reabertoPor: '',
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
  return {
    ...base,
    ...raw,
    libTecnico: { ...base.libTecnico, ...raw.libTecnico },
    libSupervisor: { ...base.libSupervisor, ...raw.libSupervisor },
    libEletricista: { ...base.libEletricista, ...raw.libEletricista },
    libPrensa: { ...base.libPrensa, ...raw.libPrensa },
    conjuntos: Array.isArray(raw.conjuntos) ? raw.conjuntos : [],
    vistoriaItens: { ...raw.vistoriaItens },
    vistoriaAparelhos: Array.isArray(raw.vistoriaAparelhos) ? raw.vistoriaAparelhos : [],
  };
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
  // cabo de aço só tem emenda A QUENTE: ao escolher cabo de aço, marca "Quente" (relatório antigo
  // com cabo de aço + frio só muda se a pessoa escolher o tipo de correia de novo)
  const te = tc === 'Cabo Aço' && alterados.includes('tipoCorreia') ? 'Quente' : e.tipoEmenda;
  if (te !== e.tipoEmenda) out.tipoEmenda = te;
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
  // data da vistoria da prensa: na quente, sugere a data da emenda só se ainda não houver data escolhida
  if (te === 'Quente' && e.data && !isoData(e.dataTeste)) out.dataTeste = e.data;
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

// ---------------------------------------------------------------- nova emenda com base em outra

/**
 * Campos que se repetem entre emendas da mesma correia: copiados em "Nova com base nesta".
 * Tudo o que é da EXECUÇÃO (data, horários, temperaturas, clima, demãos, contaminantes,
 * checklists, dureza, observações, problemas, fotos e assinaturas) começa em branco.
 */
export const CAMPOS_COPIADOS = [
  'tag',
  'om',
  'efetivo',
  'efetivoPreparo',
  'materiaisEmenda',
  'materiaisManta',
  'equipamentos',
  'tipoCorreia',
  'tipoEmenda',
  'especificacao',
  'largura',
  'trecho',
  'estagio1',
  'estagio2',
  'estagio3',
  'chanfro',
  'qtdLona',
  'qtdPasses',
  'comprPasse',
  'fechamento',
  'vies',
  'comprTotal',
  'mantaInf',
  'mantaSup',
  'tempVulc',
  'tempoVulc',
  'pressaoVulc',
  'seriePrensa',
  'prensaEquip',
  'paineis',
  'bombas',
] as const satisfies readonly (keyof Emenda)[];

/** Próximo número da emenda ("1" → "2"); se não for número, fica em branco para preencher. */
export function proximoNumero(n: string): string {
  const t = n.trim();
  return /^\d{1,6}$/.test(t) ? String(Number(t) + 1) : '';
}

/** Nova emenda (id e data novos) com os dados que se repetem copiados da original. */
export function emendaComBase(orig: Emenda, id: string, data: string, por: string): Emenda {
  const nova = novaEmenda(id, data, por, []);
  const copia = Object.fromEntries(CAMPOS_COPIADOS.map((k) => [k, JSON.parse(JSON.stringify(orig[k] ?? nova[k]))])) as Partial<Emenda>;
  // conjuntos de prensa: copia prensa, painéis e bombas; a vistoria (itens e resistências) é a cada uso
  const conjuntos = Array.isArray(orig.conjuntos) && orig.conjuntos.length ? conjuntosDe(orig).map((c) => ({ ...c, itens: {}, resist: {} })) : [];
  return { ...nova, ...copia, conjuntos, numero: proximoNumero(orig.numero) };
}

// ---------------------------------------------------------------- conclusão do relatório

export const concluido = (e: Pick<Emenda, 'concluidoEm'>) => !!e.concluidoEm;

/** O controle de conclusão vale para relatórios a partir desta data (antes: histórico, fora do controle). */
export const INICIO_CONCLUSAO = '2026-11-02';
export const foraDoControle = (e: Pick<Emenda, 'data' | 'concluidoEm'>) => !!e.data && e.data < INICIO_CONCLUSAO && !e.concluidoEm;

const vazioTxt = (v: unknown) => typeof v !== 'string' || !v.trim();
/** opções Sim/Não/N/A: N/A é uma resposta; só "" falta */
const semResposta = (v: unknown) => v === '' || v === undefined;

/**
 * O que falta para concluir o relatório: identificação, efetivo da troca, dados da emenda,
 * check lists respondidos, vulcanização, inspeção e as duas liberações assinadas.
 */
/** Dureza Shore A obrigatória só na emenda de CABO DE AÇO A QUENTE (lona a quente e emendas a frio: opcional). */
export const durezaObrigatoria = (e: Pick<Emenda, 'tipoCorreia' | 'tipoEmenda'>) => e.tipoCorreia === 'Cabo Aço' && e.tipoEmenda === 'Quente';

export function pendenciasConclusao(e: Emenda): string[] {
  const f: string[] = [];
  const txt = (v: string, nome: string) => vazioTxt(v) && f.push(nome);
  const opc = (v: string, nome: string) => semResposta(v) && f.push(nome);
  // 1 identificação
  txt(e.tag, 'TAG');
  txt(e.data, 'Data');
  txt(e.numero, 'Número da emenda');
  txt(e.om, 'OM');
  // 2 efetivo
  if (!e.efetivo.some((x) => !vazioTxt(x.nome))) f.push('Efetivo da troca');
  // 5 dados da emenda
  txt(e.especificacao, 'Especificação da correia');
  txt(e.largura, 'Largura da correia');
  if (e.tipoCorreia === 'Cabo Aço') {
    txt(e.estagio1, '1º estágio');
    txt(e.estagio2, '2º estágio');
    txt(e.estagio3, '3º estágio');
    txt(e.chanfro, 'Chanfro');
  } else {
    txt(e.qtdLona, 'Quant. lonas');
    txt(e.qtdPasses, 'Quant. passes');
    txt(e.comprPasse, 'Compr. passe');
    txt(e.fechamento, 'Fechamento');
  }
  txt(e.comprTotal, 'Compr. total da emenda');
  opc(e.ckLixada, 'Emenda lixada?');
  opc(e.ckLimpa, 'Emenda limpa?');
  opc(e.ckUmidadeOleo, 'Umidade / óleo?');
  opc(e.ckAlinhada, 'Alinhada?');
  // 6 check list da vulcanização
  txt(e.tempAmbiente, 'Temp. ambiente');
  txt(e.umidade, 'Umidade relativa');
  txt(e.tempSuperficie, 'Temp. superfície');
  opc(e.clima, 'Clima');
  opc(e.rodilhada, 'Rodilhada?');
  // parâmetros da vulcanização: obrigatórios só na emenda A QUENTE (na fria ficam N/A);
  // na quente, "N/A" não vale como valor
  if (e.tipoEmenda === 'Quente') {
    const valor = (v: string, nome: string) => (vazioTxt(v) || v.trim().toUpperCase() === 'N/A') && f.push(nome);
    valor(e.tempVulc, 'Temperatura de vulcanização');
    valor(e.tempoVulc, 'Tempo de vulcanização');
    valor(e.pressaoVulc, 'Pressão');
    valor(e.tempAbertura, 'Temp. abertura da prensa');
    valor(e.horaAbertura, 'Hora abertura da prensa');
  }
  // inspeção pós-vulcanização: dureza obrigatória só no cabo de aço a quente; observações nunca são obrigatórias
  if (durezaObrigatoria(e)) txt(e.dureza, 'Dureza Shore A');
  opc(e.ckBolha, 'Presença de bolha?');
  opc(e.ckAcabamento, 'Feito acabamento?');
  opc(e.ckFaltouMaterial, 'Faltou material?');
  // 7 vistoria da prensa (FOR GTO 062)
  f.push(...pendenciasVistoria(e));
  // 9–10 liberações
  for (const [l, nome] of [
    [e.libTecnico, 'técnico de área'],
    [e.libSupervisor, 'supervisor de área'],
  ] as const) {
    if (vazioTxt(l.nome)) f.push(`Liberação do ${nome}: nome`);
    if (vazioTxt(l.data)) f.push(`Liberação do ${nome}: data`);
    if (vazioTxt(l.assinatura)) f.push(`Liberação do ${nome}: assinatura`);
  }
  return f;
}
