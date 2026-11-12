import { useEffect, useState } from 'react';
import type { Atraso } from '../cloud/atrasos';
import { COL_ATRASOS } from '../cloud/atrasos';
import { COL_PUB_DIAS, DOC_PUB_CONFIG } from '../cloud/publico';
import { COL_EMENDAS } from '../emenda/data';
import { addDays, fromIsoDate, locateDay, toIsoDate } from '../domain/isoWeek';
import { useProg } from './context';
import { COL_SOLIC } from './data';
import { completarSolicitacao, type Solicitacao } from './model';
import type { DiaEscala } from './kpis';

/** Dados que os KPIs cruzam com outras partes do sistema (leitura única por período). */
export interface DadosKpi {
  solicitacoes: Solicitacao[];
  /** Registro de Emenda: só TAG e data */
  emendas: { tag: string; data: string }[];
  /** efetivo ativo DO CONTRATO na escala (cópia pública) */
  efetivo: number;
  escala: DiaEscala[];
  /** a escala foi lida só para os últimos 92 dias do período (para não pesar) */
  escalaDesde: string;
  atrasos: Atraso[];
}

export function diasEntreDatas(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = fromIsoDate(de)!; toIsoDate(d) <= ate && out.length < 400; d = addDays(d, 1)) out.push(toIsoDate(d));
  return out;
}

/** de/ate "AAAA-MM-DD". */
export function useDadosKpi(de: string, ate: string): DadosKpi | null {
  const { api } = useProg();
  const [d, setD] = useState<DadosKpi | null>(null);
  useEffect(() => {
    let vivo = true;
    setD(null);
    const { fsMod, fs } = api;
    const semana = (iso: string) => locateDay(fromIsoDate(iso)!).weekKey;
    const escalaDesde = [de, toIsoDate(addDays(fromIsoDate(ate)!, -91))].sort().reverse()[0];
    const ler = async <T,>(p: Promise<T>, padrao: T): Promise<T> => p.catch(() => padrao);
    void (async () => {
      const [sol, em, cfg, dias, atr] = await Promise.all([
        ler(
          fsMod.getDocs(fsMod.query(fsMod.collection(fs, COL_SOLIC), fsMod.where('criadoEm', '>=', `${de}T00:00:00`), fsMod.where('criadoEm', '<=', `${ate}T23:59:59.999Z`))),
          null,
        ),
        ler(fsMod.getDocs(fsMod.query(fsMod.collection(fs, COL_EMENDAS), fsMod.where('data', '>=', de), fsMod.where('data', '<=', ate))), null),
        ler(fsMod.getDoc(fsMod.doc(fs, DOC_PUB_CONFIG)), null),
        ler(
          fsMod.getDocs(
            fsMod.query(
              fsMod.collection(fs, COL_PUB_DIAS),
              fsMod.where(fsMod.documentId(), '>=', `${semana(escalaDesde)}_0`),
              fsMod.where(fsMod.documentId(), '<=', `${semana(ate)}_6`),
            ),
          ),
          null,
        ),
        ler(fsMod.getDocs(fsMod.query(fsMod.collection(fs, COL_ATRASOS), fsMod.where('semana', '>=', semana(de)), fsMod.where('semana', '<=', semana(ate)))), null),
      ]);
      if (!vivo) return;
      const efetivoLista = (cfg?.data()?.efetivo ?? []) as { id?: string; ativo?: boolean; apoio?: boolean }[];
      const contrato = new Set(efetivoLista.filter((w) => !w?.apoio).map((w) => String(w?.id)));
      const apoioIds = new Set(efetivoLista.filter((w) => w?.apoio).map((w) => String(w?.id)));
      const escala: DiaEscala[] = [];
      for (const doc of dias?.docs ?? []) {
        const m = /^(\d{4}-W\d{2})_([0-6])$/.exec(doc.id);
        if (!m) continue;
        // data do dia a partir da semana ISO
        const segunda = diasEntreDatas(escalaDesde, ate).find((x) => semana(x) === m[1] && locateDay(fromIsoDate(x)!).dayIndex === 0);
        const data = segunda ? toIsoDate(addDays(fromIsoDate(segunda)!, Number(m[2]))) : '';
        const aus = (doc.data()?.absences ?? []) as { workerId?: string }[];
        const ats = (doc.data()?.activities ?? []) as { workerIds?: string[] }[];
        const apoio = new Set<string>();
        for (const a of Array.isArray(ats) ? ats : []) for (const w of a.workerIds ?? []) if (apoioIds.has(w)) apoio.add(w);
        if (data)
          escala.push({
            data,
            ausentes: Array.isArray(aus) ? aus.filter((a) => contrato.has(String(a.workerId))).length : 0,
            apoio: apoio.size,
          });
      }
      setD({
        solicitacoes: (sol?.docs ?? []).map((x) => completarSolicitacao(x.id, x.data())),
        emendas: (em?.docs ?? []).map((x) => ({ tag: String(x.data()?.tag ?? ''), data: String(x.data()?.data ?? '') })),
        // efetivo DO CONTRATO (apoio de outros contratos não entra na capacidade)
        efetivo: Array.isArray(efetivoLista) ? efetivoLista.filter((w) => w?.ativo !== false && !w?.apoio).length : 0,
        escala,
        escalaDesde,
        atrasos: (atr?.docs ?? []).map((x) => ({ ...(x.data() as Atraso), id: x.id })),
      });
    })();
    return () => {
      vivo = false;
    };
  }, [api, de, ate]);
  return d;
}
