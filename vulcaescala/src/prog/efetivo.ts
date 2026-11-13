/**
 * Efetivo do dia lido da ESCALA (cópia pública: nome e função, sem matrícula e sem motivo
 * de ausência). A Programação diz quantas pessoas cada atividade pede; a Escala diz quem
 * está alocado, ausente ou livre. Aqui as duas se encontram.
 */
import type { FirebaseApi } from '../cloud/firebase';
import { COL_PUB_DIAS, DOC_PUB_CONFIG, type PubConfig } from '../cloud/publico';
import { fromIsoDate, locateDay } from '../domain/isoWeek';
import type { Day } from '../domain/types';
import { AREA_INTERNA, type Atividade } from './model';

export interface EfetivoDia {
  /** efetivo ativo DO CONTRATO (sem o apoio de outros contratos) */
  total: number;
  /** alocados do contrato */
  alocados: number;
  /** pessoas de apoio (outros contratos) alocadas no dia */
  apoio: number;
  /** ausências registradas (folga, férias, atestado… aparecem só como "ausência") */
  ausentes: number;
  /** fim de semana/feriado: quem não foi escalado está de folga automática */
  folgaAuto: number;
  /** ativos sem atividade e sem ausência num dia útil */
  disponiveis: number;
  /** alocados ÷ presentes (total − ausentes − folga automática) */
  ocupacao: number | null;
  /** pessoas alocadas por área (atividades incluídas da Programação) */
  porArea: { area: string; pessoas: number }[];
  /** a escala do dia ainda não foi lançada */
  semEscala: boolean;
}

export function efetivoDoDia(
  efetivo: PubConfig['efetivo'],
  dia: Day | null,
  folga: boolean,
  progPorId: Map<string, Atividade>,
): EfetivoDia {
  const ativos = efetivo.filter((w) => w.ativo && !w.apoio);
  const ids = new Set(ativos.map((w) => w.id));
  const idsApoio = new Set(efetivo.filter((w) => w.apoio).map((w) => w.id));
  const apoio = new Set<string>();
  const d = dia ?? { activities: [], absences: [] };
  const aloc = new Set<string>();
  const porArea = new Map<string, Set<string>>();
  for (const a of d.activities) {
    const prog = a.id.startsWith('prog-') ? progPorId.get(a.id.slice(5)) : undefined;
    const area = prog ? prog.area || AREA_INTERNA : 'OUTRAS ATIVIDADES DA ESCALA';
    for (const w of a.workerIds) {
      if (idsApoio.has(w)) apoio.add(w);
      if (!ids.has(w) && !idsApoio.has(w)) continue;
      (porArea.get(area) ?? porArea.set(area, new Set()).get(area)!).add(w);
      if (!ids.has(w)) continue;
      aloc.add(w);
    }
  }
  const aus = new Set(d.absences.map((x) => x.workerId).filter((w) => ids.has(w) && !aloc.has(w)));
  const livres = ativos.filter((w) => !aloc.has(w.id) && !aus.has(w.id)).length;
  const folgaAuto = folga ? livres : 0;
  const disponiveis = folga ? 0 : livres;
  const presentes = ativos.length - aus.size - folgaAuto;
  return {
    total: ativos.length,
    alocados: aloc.size,
    apoio: apoio.size,
    ausentes: aus.size,
    folgaAuto,
    disponiveis,
    ocupacao: presentes > 0 ? aloc.size / presentes : null,
    porArea: [...porArea.entries()].map(([area, s]) => ({ area, pessoas: s.size })).sort((a, b) => b.pessoas - a.pessoas),
    semEscala: !dia || (!d.activities.length && !d.absences.length),
  };
}

/** Escuta a configuração pública (efetivo) e o dia pedido da cópia pública da escala. */
export function ouvirEscalaDoDia(api: FirebaseApi, data: string, cb: (efetivo: PubConfig['efetivo'], dia: Day | null) => void): () => void {
  const { fsMod, fs } = api;
  const d = fromIsoDate(data);
  if (!d) return () => {};
  const { weekKey, dayIndex } = locateDay(d);
  let efetivo: PubConfig['efetivo'] = [];
  let dia: Day | null = null;
  const u1 = fsMod.onSnapshot(
    fsMod.doc(fs, DOC_PUB_CONFIG),
    (s) => {
      const e = s.data()?.efetivo;
      efetivo = Array.isArray(e) ? e : [];
      cb(efetivo, dia);
    },
    () => cb(efetivo, dia),
  );
  const u2 = fsMod.onSnapshot(
    fsMod.doc(fs, COL_PUB_DIAS, `${weekKey}_${dayIndex}`),
    (s) => {
      const x = s.data() as Partial<Day> | undefined;
      dia = x ? { activities: Array.isArray(x.activities) ? x.activities : [], absences: Array.isArray(x.absences) ? x.absences : [] } : null;
      cb(efetivo, dia);
    },
    () => cb(efetivo, dia),
  );
  return () => {
    u1();
    u2();
  };
}
