import { WEEKDAYS_SHORT } from '../../domain/isoWeek';
import { duracaoMin, fmtDuracao, totaisPorMotivo } from '../../cloud/atrasos';
import { useAtrasosApi, useAtrasosSemana } from './AtrasosCtx';

/** Resumo da semana: tempo parado por motivo + lista de atrasos por atividade (sai no PDF). */
export function AtrasosResumo({ weekKey }: { weekKey: string }) {
  const c = useAtrasosApi();
  const lista = useAtrasosSemana(weekKey);
  if (!c) return null;
  const totais = totaisPorMotivo(lista ?? []);
  const totalMin = totais.reduce((s, t) => s + t.min, 0);
  return (
    <div className="card pad">
      <h2>Atrasos da semana</h2>
      {lista === null ? (
        <p className="muted small">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="muted small">Nenhum atraso registrado nesta semana.</p>
      ) : (
        <>
          <ul className="plain-list atraso-totais">
            {totais.map((t) => (
              <li key={t.motivo}>
                <b>{t.motivo}</b>
                <span className="tabnum">
                  {fmtDuracao(t.min)} · {t.qtd} registro{t.qtd === 1 ? '' : 's'}
                </span>
              </li>
            ))}
            <li className="atraso-total">
              <b>Total parado</b>
              <span className="tabnum">{fmtDuracao(totalMin)}</span>
            </li>
          </ul>
          <ul className="plain-list atraso-tab">
            {lista.map((a) => {
              const d = duracaoMin(a.inicio, a.fim);
              const dia = Number(a.diaId.slice(-1));
              return (
                <li key={a.id}>
                  <span className="num">{WEEKDAYS_SHORT[dia]}</span>
                  <span className="tabnum">
                    {a.inicio}–{a.fim || '…'}
                  </span>
                  <span>
                    <b>{a.atividadeNome}</b> · {a.motivo} · {d === null ? 'em andamento' : fmtDuracao(d)}
                    {a.descricao && <span className="small muted"> — {a.descricao}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
