import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAtrasosApi } from '../atrasos/AtrasosCtx';
import { useStore } from '../../state/store';
import type { DayRef } from '../../state/reducer';
import { addDays, fromIsoDate, locateDay, toIsoDate, weekDates } from '../../domain/isoWeek';
import type { Day } from '../../domain/types';
import { gravarAtividade, ouvirMeses } from '../../prog/data';
import { AREA_INTERNA, hojeIso, mesesEntre, ordenarAtividades, type Atividade } from '../../prog/model';
import { SYNC_DESDE, nomeNaEscala, planejar, type DiaEscala } from '../../integracao/progEscala';

/**
 * Integração Programação ⇄ Escala.
 * - As atividades programadas do dia aparecem no dia da escala e o líder inclui com um toque
 *   (vira uma atividade da escala com id "prog-…", então não entra duas vezes).
 * - Com a Escala aberta por um administrador e tudo sincronizado, as mudanças de nome/data
 *   passam de um lado para o outro e as atividades criadas na escala entram na programação
 *   (ver integracao/progEscala.ts). Nada é apagado automaticamente: vira aviso.
 */
const Ctx = createContext<Atividade[]>([]);
const AvisosCtx = createContext<Map<string, string>>(new Map());

export const idNaEscala = (a: Pick<Atividade, 'id'>) => `prog-${a.id}`;
export { nomeNaEscala };

const dataDoRef = (r: DayRef) => toIsoDate(weekDates(r.weekKey)[r.dayIndex]);
const refDe = (data: string): DayRef => locateDay(fromIsoDate(data)!);

/** Aviso da integração para uma atividade da escala (ex.: "Cancelada na programação"). */
export const useAvisoProg = (r: DayRef, activityId: string) => useContext(AvisosCtx).get(`${dataDoRef(r)}|${activityId}`) ?? '';

export function ProgDaSemana({ semana, children }: { semana: string; children: ReactNode }) {
  const c = useAtrasosApi();
  const { state, dispatch, cloud } = useStore();
  const [l, setL] = useState<Atividade[]>([]);
  useEffect(() => {
    if (!c?.isAdmin) return;
    const d = weekDates(semana).map(toIsoDate);
    return ouvirMeses(c.api, mesesEntre(d[0], d[6]), (lista) => setL(lista));
  }, [c, semana]);

  // ---- sincronização (todas as semanas de SYNC_DESDE até ~2 meses à frente)
  const hoje = hojeIso();
  const meses = useMemo(() => mesesEntre(SYNC_DESDE > hoje ? hoje : SYNC_DESDE, toIsoDate(addDays(fromIsoDate(hoje)!, 62))), [hoje]);
  const [progs, setProgs] = useState<{ lista: Atividade[]; pronto: boolean }>({ lista: [], pronto: false });
  useEffect(() => {
    if (!c?.isAdmin) return;
    return ouvirMeses(c.api, meses, (lista, p, n) => setProgs({ lista, pronto: n >= meses.length && !p.offline && !p.pendente }));
  }, [c, meses]);
  const info = cloud?.info;
  const escalaPronta = !!info && info.loaded && info.status === 'ok' && info.pending === 0;
  const [avisos, setAvisos] = useState<Map<string, string>>(new Map());
  const ultimo = useRef('');
  useEffect(() => {
    if (!c?.isAdmin || !escalaPronta || !progs.pronto) return;
    const t = setTimeout(() => {
      const dias: DiaEscala[] = [];
      for (const w of Object.values(state.weeks))
        w.days.forEach((day: Day, i) => dias.push({ weekKey: w.key, dayIndex: i, data: toIsoDate(weekDates(w.key)[i]), day }));
      const plano = planejar({ dias, progs: progs.lista, meses: new Set(meses), hoje, agora: new Date(), feriados: state.feriados, por: c.por, refDe });
      setAvisos(new Map(plano.avisos.map((a) => [`${a.data}|${a.activityId}`, a.texto])));
      if (!plano.escala.length && !plano.prog.length) return;
      // a mesma mudança não é reenviada enquanto a nuvem não confirma (evita gravar duas vezes)
      const assinatura = JSON.stringify([plano.escala, plano.prog.map((a) => [a.id, a.descricao, a.data, a.escalaNome, a.foraDaEscala, a.pessoas])]);
      if (assinatura === ultimo.current) return;
      ultimo.current = assinatura;
      plano.escala.forEach(dispatch);
      for (const a of plano.prog) void gravarAtividade(c.api, a, c.por).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [c, escalaPronta, progs, state.weeks, state.feriados, meses, hoje, dispatch]);

  return (
    <Ctx.Provider value={l}>
      <AvisosCtx.Provider value={avisos}>{children}</AvisosCtx.Provider>
    </Ctx.Provider>
  );
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
              <b>{a.area || AREA_INTERNA}</b>
              {a.equipamento && (
                <>
                  {' '}
                  · <b>{a.equipamento}</b>
                </>
              )}{' '}
              · {a.descricao}
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
