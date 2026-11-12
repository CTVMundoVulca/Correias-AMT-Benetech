import { useMemo } from 'react';
import type { PubConfig } from '../cloud/publico';
import type { Day } from '../domain/types';
import { feriadoEm } from '../domain/feriados';
import { fromIsoDate, isoWeekOf } from '../domain/isoWeek';
import { useProg } from './context';
import { efetivoDoDia } from './efetivo';
import { BarraAreas, corDaArea, fatiasDoDia, rotuloDia } from './Painel';
import { TIPOS_PARADA, alocacaoDoDia, diaUtil, hojeIso, paradasNoDia, type Atividade, type Parada, type Solicitacao } from './model';

interface Props {
  dia: string;
  lista: Atividade[] | null;
  /** solicitações por id (responsável pelo pedido) */
  solicPorId: Map<string, Solicitacao>;
  /** escala (cópia pública) do dia selecionado */
  escala: { efetivo: PubConfig['efetivo']; dia: Day | null } | null;
  paradas: Parada[];
}

/**
 * O dia selecionado (na carga, no calendário ou na semana): onde está o efetivo, quem da
 * equipe está em cada atividade (escala) e quem é o responsável pela solicitação.
 */
export function DiaSelecionado({ dia, lista, solicPorId, escala, paradas }: Props) {
  const { areas, feriados } = useProg();
  const hoje = hojeIso();
  const contato = useMemo(() => new Map(areas.map((a) => [a.nome, a.contato])), [areas]);
  const doDia = useMemo(() => (lista ?? []).filter((a) => a.data === dia), [lista, dia]);
  const r = useMemo(() => alocacaoDoDia(doDia, dia), [doDia, dia]);
  const fatias = fatiasDoDia(doDia);
  const progPorId = useMemo(() => new Map(doDia.map((a) => [a.id, a])), [doDia]);
  const ef = escala ? efetivoDoDia(escala.efetivo, escala.dia, !diaUtil(dia, feriados), progPorId) : null;
  const pessoa = useMemo(() => new Map((escala?.efetivo ?? []).map((w) => [w.id, w])), [escala]);
  // quem da equipe está em cada atividade da programação (atividades "prog-…" da escala)
  const equipe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of escala?.dia?.activities ?? []) if (a.id.startsWith('prog-')) m.set(a.id.slice(5), a.workerIds);
    return m;
  }, [escala]);
  const outras = (escala?.dia?.activities ?? []).filter((a) => !a.id.startsWith('prog-') || !progPorId.has(a.id.slice(5)));
  const fer = feriadoEm(feriados, dia);
  const parDia = paradasNoDia(paradas, dia);
  const semana = isoWeekOf(fromIsoDate(dia)!).week;

  const nomes = (ids: string[]) =>
    ids
      .map((id) => pessoa.get(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <div className="dia-sel">
      <div className="dia-sel-topo">
        <div>
          <span className="dia-sel-kicker">Dia selecionado · Semana {semana}</span>
          <h2>
            {rotuloDia(dia)} {dia === hoje && <span className="badge today">Hoje</span>}
          </h2>
          {fer && <div className="small muted">🎌 {fer}</div>}
        </div>
        <div className="dia-sel-numeros">
          <div>
            <b className="num">{lista === null ? '…' : r.pessoas}</b>
            <span>programadas</span>
          </div>
          {ef && !ef.semEscala && (
            <>
              <div>
                <b className="num">{ef.alocados}</b>
                <span>escalados{ef.apoio ? ` +${ef.apoio} apoio` : ''}</span>
              </div>
              <div>
                <b className="num">{ef.disponiveis}</b>
                <span>livres</span>
              </div>
            </>
          )}
          {ef && <div className="dia-sel-contrato small muted">contrato: {ef.total}</div>}
        </div>
      </div>

      {parDia.map((p) => {
        const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
        return (
          <div key={p.id} className={'parada-faixa parada-' + p.tipo}>
            <b>
              {t.icone} {t.nome}
            </b>{' '}
            · {p.area}
            {p.equipamento && ` · ${p.equipamento}`}
          </div>
        );
      })}

      {lista !== null && r.areas.length === 0 ? (
        <p className="livre">✓ Efetivo livre: nada programado para este dia.</p>
      ) : (
        <>
          <BarraAreas fatias={fatias} alta />
          <div className="dia-sel-areas">
            {r.areas.map((g) => (
              <section key={g.area} className={'dia-area ' + corDaArea(g.area)}>
                <div className="dia-area-topo">
                  <span className={'sw-area ' + corDaArea(g.area)} />
                  <b className="grow">{g.area}</b>
                  <span className="area-pes">
                    👷 <b className="num">{g.pessoas || '—'}</b>
                  </span>
                </div>
                {contato.get(g.area) && <div className="small muted">📞 Liberação na área: {contato.get(g.area)}</div>}
                <ul className="plain-list dia-ativs">
                  {g.atividades.map((a) => {
                    const s = a.solicitacaoId ? solicPorId.get(a.solicitacaoId) : undefined;
                    const time = nomes(equipe.get(a.id) ?? []);
                    return (
                      <li key={a.id} className="dia-ativ">
                        <div className="dia-ativ-top">
                          <span className="tag-equip">{a.equipamento || '—'}</span>
                          <span className="grow">{a.descricao}</span>
                        </div>
                        <div className="dia-ativ-meta">
                          {a.pessoas > 0 && <span>👷 {a.pessoas}</span>}
                          {a.horario && <span>🕐 {a.horario}</span>}
                          {a.om && <span className="num">OM {a.om}</span>}
                          {a.classe === 'emergencia' && <span className="pill emerg">⚡ Emergência</span>}
                          {a.classe === 'nao_programada' && <span className="pill naoprog">⏱ Não programada</span>}
                          {a.execucao === 'executada' && <span className="exec ok">✓ Executada</span>}
                        </div>
                        {time.length > 0 && (
                          <div className="dia-ativ-equipe">
                            <span className="muted">Equipe:</span>
                            {time.map((w) => (
                              <span key={w.id} className={'pessoa' + (w.apoio ? ' apoio' : '')}>
                                {w.nome}
                                {w.apoio && <small> apoio</small>}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="dia-ativ-resp">
                          {s ? (
                            <>
                              <span className="muted">Pedido por</span> <b>{s.solicitante}</b>
                              {s.contato && <span> · 📞 {s.contato}</span>}
                            </>
                          ) : a.origem === 'app' && a.criadoPor && a.criadoPor !== 'planilha' ? (
                            <>
                              <span className="muted">Programado por</span> {a.criadoPor}
                            </>
                          ) : (
                            <span className="muted">Pedido registrado fora do app (planilha)</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          {outras.length > 0 && (
            <div className="small dia-outras">
              <b>Outras atividades da escala:</b>{' '}
              {outras.map((a) => (
                <span key={a.id} className="dia-outra">
                  {a.nome} ({nomes(a.workerIds).length})
                </span>
              ))}
            </div>
          )}
          {ef?.semEscala && <p className="small muted">A escala deste dia ainda não foi lançada: os nomes da equipe aparecem quando a liderança escalar.</p>}
        </>
      )}
    </div>
  );
}
