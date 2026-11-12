import { useEffect, useMemo, useState } from 'react';
import { COL_PUB_DIAS } from '../cloud/publico';
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, fromIsoDate, isoWeekOf, locateDay } from '../domain/isoWeek';
import { useProg } from './context';
import type { PubConfig } from '../cloud/publico';
import { cargaCapacidade, LIMITE_OCUPACAO } from './kpis';
import type { Atividade } from './model';

/** Por dia: ausências DO CONTRATO e pessoas de apoio escaladas (cópia pública da escala). */
function useEscalaDias(dias: string[], efetivo: PubConfig['efetivo'] | null): { aus: Map<string, number>; apoio: Map<string, number> } | null {
  const { api } = useProg();
  const chave = dias.join(',');
  const contrato = useMemo(() => new Set((efetivo ?? []).filter((w) => !w.apoio).map((w) => w.id)), [efetivo]);
  const apoioIds = useMemo(() => new Set((efetivo ?? []).filter((w) => w.apoio).map((w) => w.id)), [efetivo]);
  const [m, setM] = useState<{ aus: Map<string, number>; apoio: Map<string, number> } | null>(null);
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
        const aus = new Map<string, number>();
        const apoio = new Map<string, number>();
        for (const doc of snap.docs) {
          const d = porId.get(doc.id);
          if (!d) continue;
          const x = doc.data() ?? {};
          const a = Array.isArray(x.absences) ? (x.absences as { workerId: string }[]) : [];
          aus.set(d, a.filter((y) => contrato.has(y.workerId)).length);
          const ws = new Set<string>();
          for (const at of Array.isArray(x.activities) ? (x.activities as { workerIds?: string[] }[]) : []) for (const w of at.workerIds ?? []) if (apoioIds.has(w)) ws.add(w);
          apoio.set(d, ws.size);
        }
        setM({ aus, apoio });
      },
      () => setM({ aus: new Map(), apoio: new Map() }),
    );
  }, [api, chave, contrato, apoioIds]);
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
  /** efetivo da escala (cópia pública); null = carregando */
  efetivo: PubConfig['efetivo'] | null;
  onDia: (d: string) => void;
}) {
  const esc = useEscalaDias(dias, efetivo);
  const contrato = efetivo ? efetivo.filter((w) => w.ativo && !w.apoio).length : null;
  const carga = useMemo(
    () => (lista && contrato !== null && esc ? cargaCapacidade(dias, lista, contrato, esc.aus, esc.apoio) : null),
    [dias, lista, contrato, esc],
  );
  const max = carga ? Math.max(1, ...carga.map((c) => Math.max(c.capacidade + c.apoio, c.programado))) : 1;

  return (
    <div className="carga">
      <div className="bloco-topo">
        <h3>📊 Carga × capacidade — próximos 10 dias úteis</h3>
        <span className="small muted">pessoas livres por dia</span>
      </div>
      <div className="carga-mes">{tituloMeses(dias)}</div>
      {carga === null ? (
        <p className="muted small">Carregando…</p>
      ) : contrato === 0 ? (
        <p className="muted small">O efetivo da escala ainda não foi cadastrado: sem base para a capacidade.</p>
      ) : (
        <>
          <div className="carga-semanas" aria-hidden>
            {semanasDe(dias).map((g) => (
              <span key={g.semana} className="carga-sem" style={{ gridColumn: `span ${g.n}` }}>
                Sem. {g.semana}
              </span>
            ))}
          </div>
          <ul className="carga-faixa">
            {carga.map((c) => {
              const d = fromIsoDate(c.data)!;
              const alt = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
              const i = carga.indexOf(c);
              const novaSemana = i > 0 && locateDay(fromIsoDate(carga[i - 1].data)!).weekKey !== locateDay(d).weekKey;
              const novoMes = i > 0 && carga[i - 1].data.slice(5, 7) !== c.data.slice(5, 7);
              return (
                <li key={c.data} className={novaSemana ? 'carga-nova-sem' : ''}>
                  <button
                    className={'carga-col ' + c.nivel}
                    onClick={() => onDia(c.data)}
                    title={`${c.programado} pessoas programadas · contrato ${c.capacidade} disponíveis${c.apoio ? ` + ${c.apoio} de apoio` : ''}`}
                    aria-label={`${WEEKDAYS_SHORT[locateDay(d).dayIndex]} ${c.data.slice(8)}/${c.data.slice(5, 7)}: ${c.programado} programadas de ${c.capacidade + c.apoio}, ${c.livres} livres`}
                  >
                    <span className="carga-num num">
                      {c.programado > c.capacidade + c.apoio ? <b>+{c.programado - c.capacidade - c.apoio}</b> : <b>{c.livres}</b>}
                    </span>
                    <span className="carga-rot">{c.programado > c.capacidade + c.apoio ? 'acima' : c.livres === 1 ? 'livre' : 'livres'}</span>
                    <span className="carga-coluna" aria-hidden>
                      <span className="carga-cap" style={{ height: alt(c.capacidade + c.apoio) }} />
                      <span className="carga-prog" style={{ height: alt(c.programado) }} />
                    </span>
                    {c.apoio > 0 && <span className="carga-apoio">+{c.apoio} apoio</span>}
                    <span className="carga-data">
                      <b>{WEEKDAYS_SHORT[locateDay(d).dayIndex]}</b>
                      <span className="num carga-dia-n">{Number(c.data.slice(8))}</span>
                      {novoMes && <span className="carga-novo-mes">{MONTHS_SHORT[Number(c.data.slice(5, 7)) - 1]}</span>}
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
            <li>┆ capacidade (efetivo do contrato − ausências, + apoio escalado)</li>
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

/** "Novembro 2026" ou "Novembro – Dezembro 2026" (ou com os dois anos na virada do ano). */
export function tituloMeses(dias: string[]): string {
  if (!dias.length) return '';
  const a = dias[0];
  const b = dias[dias.length - 1];
  const nome = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
  if (a.slice(0, 7) === b.slice(0, 7)) return `${nome(a)} ${a.slice(0, 4)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${nome(a)} – ${nome(b)} ${a.slice(0, 4)}`;
  return `${nome(a)} ${a.slice(0, 4)} – ${nome(b)} ${b.slice(0, 4)}`;
}

/** Dias agrupados pela semana ISO (para a faixa "Sem. 46 | Sem. 47"). */
export function semanasDe(dias: string[]): { semana: number; n: number }[] {
  const out: { semana: number; n: number }[] = [];
  for (const d of dias) {
    const w = isoWeekOf(fromIsoDate(d)!).week;
    const ult = out[out.length - 1];
    if (ult && ult.semana === w) ult.n++;
    else out.push({ semana: w, n: 1 });
  }
  return out;
}
