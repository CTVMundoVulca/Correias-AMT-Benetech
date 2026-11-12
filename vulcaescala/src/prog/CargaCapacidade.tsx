import { useEffect, useMemo, useState } from 'react';
import { COL_PUB_DIAS } from '../cloud/publico';
import { WEEKDAYS_SHORT, fromIsoDate, locateDay } from '../domain/isoWeek';
import { useProg } from './context';
import { cargaCapacidade, LIMITE_OCUPACAO } from './kpis';
import type { Atividade } from './model';

/** Ausências lançadas na escala (cópia pública) para os dias pedidos. */
function useAusencias(dias: string[]): Map<string, number> | null {
  const { api } = useProg();
  const chave = dias.join(',');
  const [m, setM] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    const ds = chave ? chave.split(',') : [];
    if (!ds.length) return;
    const { fsMod, fs } = api;
    const id = (d: string) => {
      const { weekKey, dayIndex } = locateDay(fromIsoDate(d)!);
      return `${weekKey}_${dayIndex}`;
    };
    const porId = new Map(ds.map((d) => [id(d), d]));
    const q = fsMod.query(fsMod.collection(fs, COL_PUB_DIAS), fsMod.where(fsMod.documentId(), '>=', id(ds[0])), fsMod.where(fsMod.documentId(), '<=', id(ds[ds.length - 1])));
    return fsMod.onSnapshot(
      q,
      (snap) => {
        const r = new Map<string, number>();
        for (const doc of snap.docs) {
          const d = porId.get(doc.id);
          const aus = doc.data()?.absences;
          if (d) r.set(d, Array.isArray(aus) ? aus.length : 0);
        }
        setM(r);
      },
      () => setM(new Map()),
    );
  }, [api, chave]);
  return m;
}

/**
 * Carga × capacidade dos próximos dias úteis: pessoas já programadas contra o efetivo
 * disponível na escala. Mostra às áreas em que dias ainda há folga para pedir serviço.
 */
export function CargaCapacidade({
  dias,
  lista,
  efetivo,
  onDia,
}: {
  dias: string[];
  lista: Atividade[] | null;
  efetivo: number | null;
  onDia: (d: string) => void;
}) {
  const aus = useAusencias(dias);
  const carga = useMemo(() => (lista && efetivo !== null && aus ? cargaCapacidade(dias, lista, efetivo, aus) : null), [dias, lista, efetivo, aus]);
  const max = carga ? Math.max(1, ...carga.map((c) => Math.max(c.capacidade, c.programado))) : 1;

  return (
    <div className="carga">
      <div className="bloco-topo">
        <h3>📊 Carga × capacidade — próximos 10 dias úteis</h3>
        <span className="small muted">pessoas livres por dia</span>
      </div>
      {carga === null ? (
        <p className="muted small">Carregando…</p>
      ) : efetivo === 0 ? (
        <p className="muted small">O efetivo da escala ainda não foi cadastrado: sem base para a capacidade.</p>
      ) : (
        <>
          <ul className="carga-faixa">
            {carga.map((c) => {
              const d = fromIsoDate(c.data)!;
              const alt = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
              return (
                <li key={c.data}>
                  <button
                    className={'carga-col ' + c.nivel}
                    onClick={() => onDia(c.data)}
                    title={`${c.programado} pessoas programadas de ${c.capacidade} disponíveis`}
                    aria-label={`${WEEKDAYS_SHORT[locateDay(d).dayIndex]} ${c.data.slice(8)}/${c.data.slice(5, 7)}: ${c.programado} programadas de ${c.capacidade}, ${c.livres} livres`}
                  >
                    <span className="carga-num num">
                      {c.programado > c.capacidade ? <b>+{c.programado - c.capacidade}</b> : <b>{c.livres}</b>}
                    </span>
                    <span className="carga-rot">{c.programado > c.capacidade ? 'acima' : c.livres === 1 ? 'livre' : 'livres'}</span>
                    <span className="carga-coluna" aria-hidden>
                      <span className="carga-cap" style={{ height: alt(c.capacidade) }} />
                      <span className="carga-prog" style={{ height: alt(c.programado) }} />
                    </span>
                    <span className="carga-data">
                      <b>{WEEKDAYS_SHORT[locateDay(d).dayIndex]}</b>
                      <span className="num">{c.data.slice(8)}/{c.data.slice(5, 7)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ul className="legenda-areas carga-leg">
            <li>
              <span className="sw-carga folga" /> folga
            </li>
            <li>
              <span className="sw-carga limite" /> perto do limite (≥ {Math.round(LIMITE_OCUPACAO * 100)}%)
            </li>
            <li>
              <span className="sw-carga lotado" /> lotado
            </li>
            <li>┆ capacidade (efetivo − ausências)</li>
          </ul>
          <p className="small muted">
            Escolha uma data com folga para pedir serviço: a chance de atendimento é maior.
            {carga.some((c) => c.semEscala) && ' Dias sem escala lançada usam o efetivo completo (ausências ainda não informadas).'}
          </p>
        </>
      )}
    </div>
  );
}
