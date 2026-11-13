/**
 * Controle dos relatórios de emenda: cruza as atividades da programação que exigem
 * relatório (troca de correia, emenda/intercalação) com os relatórios lançados no app
 * Registro de Emenda. Só a Gestão vê.
 */
import { diasEntre, type Atividade } from './model';

export { diasEntre };

/** Tipos de serviço que exigem relatório de emenda. */
export const TIPOS_COM_RELATORIO = ['Troca de correia', 'Emenda / intercalação'];

/** O controle começa nesta data (antes disso o relatório pelo app não era obrigatório). */
export const INICIO_CONTROLE = '2026-11-01';

/** Tipos listados na tela para sinalizar "exige relatório" (qualquer atividade pode ser sinalizada no formulário). */
export const TIPOS_SINALIZAVEIS = ['Preparação de correia'];

/** Motivos para dispensar o relatório de uma atividade. */
export const MOTIVOS_DISPENSA = [
  'Emenda mecânica (grampo), sem vulcanização',
  'Não houve emenda (só posicionamento/apoio)',
  'Relatório feito por outra empresa',
  'Atividade duplicada na programação',
  'Outro',
];

/** Janela da busca por TAG: relatório de 1 dia antes a 3 dias depois da data programada. */
export const JANELA = { antes: 1, depois: 3 };

export interface RelResumo {
  id: string;
  tag: string;
  data: string;
  om: string;
  numero: string;
}

export type SitRel = 'feito' | 'pendente' | 'dispensado' | 'hoje';
export type Como = 'manual' | 'om' | 'tag';

export interface LinhaRel {
  a: Atividade;
  sit: SitRel;
  rels: RelResumo[];
  como: Como | null;
  /** dias desde a data da atividade (pendências) */
  dias: number;
}

export const normTag = (t: string) => t.toUpperCase().replace(/[\s\-–—_.]+/g, '');
/** OM só com dígitos e sem zeros à esquerda ("OM 0012345" = "12345"). */
export const normOm = (o: string) => o.replace(/\D/g, '').replace(/^0+/, '');

/** A atividade exige relatório? (tipo certo, não cancelada, não deixou de ser executada) */
export function exigeRelatorio(a: Atividade): boolean {
  return (TIPOS_COM_RELATORIO.includes(a.tipo) || a.relExige) && a.classe !== 'cancelada' && a.execucao !== 'nao_executada' && a.execucao !== 'reprogramada';
}

/** Relatórios que correspondem à atividade, e por qual critério (o primeiro que achar). */
export function relatoriosDa(a: Atividade, rels: RelResumo[]): { rels: RelResumo[]; como: Como | null } {
  const manuais = a.relEmendas.length ? rels.filter((r) => a.relEmendas.includes(r.id)) : [];
  if (manuais.length) return { rels: manuais, como: 'manual' };
  // OM e TAG somam: a mesma troca pode ter dois relatórios (um com a OM, outro sem)
  const om = normOm(a.om);
  const porOm = om ? rels.filter((r) => normOm(r.om) === om) : [];
  const tag = normTag(a.equipamento);
  const porTag = tag
    ? rels.filter((r) => {
        if (porOm.includes(r) || normTag(r.tag) !== tag) return false;
        const d = diasEntre(a.data, r.data);
        return d >= -JANELA.antes && d <= JANELA.depois;
      })
    : [];
  if (porOm.length || porTag.length) return { rels: [...porOm, ...porTag], como: porOm.length ? 'om' : 'tag' };
  return { rels: [], como: null };
}

export interface Cruzamento {
  linhas: LinhaRel[];
  /** relatórios que não batem com nenhuma atividade da programação no período */
  semAtividade: RelResumo[];
  total: number;
  feitos: number;
  pendentes: number;
  dispensados: number;
}

/**
 * Cruza atividades × relatórios. Atividades futuras ficam de fora; as de hoje aparecem
 * como "hoje" (ainda no prazo). `rels` deve cobrir o período com folga da janela.
 */
export function cruzar(ativs: Atividade[], rels: RelResumo[], hoje: string, inicio = INICIO_CONTROLE): Cruzamento {
  const linhas: LinhaRel[] = [];
  for (const a of ativs) {
    if (!exigeRelatorio(a) || a.data > hoje || a.data < inicio) continue;
    const m = relatoriosDa(a, rels);
    const sit: SitRel = m.rels.length ? 'feito' : a.relDispensa ? 'dispensado' : a.data === hoje ? 'hoje' : 'pendente';
    linhas.push({ a, sit, rels: m.rels, como: m.como, dias: diasEntre(a.data, hoje) });
  }
  // relatório "órfão": não bate com NENHUMA atividade (de qualquer tipo) do período
  const usados = new Set<string>();
  for (const a of ativs) for (const r of relatoriosDa(a, rels).rels) usados.add(r.id);
  const de0 = ativs.reduce((m, a) => (a.data < m ? a.data : m), '9999-99-99');
  const de = de0 > inicio ? de0 : inicio;
  const semAtividade = rels.filter((r) => !usados.has(r.id) && r.data >= de && r.data <= hoje).sort((x, y) => y.data.localeCompare(x.data));
  linhas.sort((x, y) => x.a.data.localeCompare(y.a.data));
  return {
    linhas,
    semAtividade,
    total: linhas.filter((l) => l.sit !== 'hoje').length,
    feitos: linhas.filter((l) => l.sit === 'feito').length,
    pendentes: linhas.filter((l) => l.sit === 'pendente').length,
    dispensados: linhas.filter((l) => l.sit === 'dispensado').length,
  };
}
