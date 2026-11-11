import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAtrasosApi } from '../atrasos/AtrasosCtx';
import { useStore } from '../../state/store';
import { toIsoDate, weekDates } from '../../domain/isoWeek';
import type { Day } from '../../domain/types';
import { ouvirMeses } from '../../prog/data';
import { AREA_INTERNA, mesesEntre, ordenarAtividades, type Atividade } from '../../prog/model';

/**
 * Integração Programação → Escala: as atividades programadas do dia aparecem no dia da
 * escala e o líder inclui com um toque (vira uma atividade da escala com id "prog-…",
 * então não entra duas vezes). Só para quem edita a escala, com a nuvem ligada.
 */
const Ctx = createContext<Atividade[]>([]);

export function ProgDaSemana({ semana, children }: { semana: string; children: ReactNode }) {
  const c = useAtrasosApi();
  const [l, setL] = useState<Atividade[]>([]);
  useEffect(() => {
    if (!c?.isAdmin) return;
    const d = weekDates(semana).map(toIsoDate);
    return ouvirMeses(c.api, mesesEntre(d[0], d[6]), (lista) => setL(lista));
  }, [c, semana]);
  return <Ctx.Provider value={l}>{children}</Ctx.Provider>;
}

export const idNaEscala = (a: Pick<Atividade, 'id'>) => `prog-${a.id}`;

/** Nome da atividade na escala: descrição + área (ex.: "TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO"). */
export function nomeNaEscala(a: Atividade): string {
  const base = a.descricao || a.equipamento || 'ATIVIDADE PROGRAMADA';
  return a.area ? `${base} — ${a.area}` : base;
}

export function ProgDoDia({ data, day, weekKey, dayIndex }: { data: string; day: Day; weekKey: string; dayIndex: number }) {
  const lista = useContext(Ctx);
  const { dispatch } = useStore();
  const naEscala = new Set(day.activities.map((a) => a.id));
  const faltam = ordenarAtividades(lista.filter((a) => a.data === data && a.classe !== 'cancelada' && !naEscala.has(idNaEscala(a))));
  if (!faltam.length) return null;
  const incluir = (a: Atividade) => dispatch({ type: 'activity/add', weekKey, dayIndex, id: idNaEscala(a), nome: nomeNaEscala(a) });
  return (
    <div className="pend-strip prog-strip">
      <div className="row between">
        <strong>📋 Da programação ({faltam.length})</strong>
        {faltam.length > 1 && (
          <button className="btn small" onClick={() => faltam.forEach(incluir)}>
            Incluir todas
          </button>
        )}
      </div>
      <ul className="plain-list">
        {faltam.map((a) => (
          <li key={a.id} className="row between nowrap prog-strip-item">
            <span className="grow">
              <b>{a.area || AREA_INTERNA}</b> · {a.descricao}
              {a.pessoas > 0 && <span className="muted"> · 👷 {a.pessoas}</span>}
            </span>
            <button className="btn small" onClick={() => incluir(a)}>
              Incluir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
