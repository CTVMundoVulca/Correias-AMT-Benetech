import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useAtividades, useOms, useProg } from './context';
import { gravarOms, gravarRetornos } from './data';
import { useRecolhiveis } from './recolher';
import { corDaArea } from './Painel';
import { dataBr } from './Solicitar';
import { INICIO_CONTROLE_OMS, SITUACOES, buscaBate, cancelamentoDasOms, contaParaOm, contarOms, fmtDuracao, omFutura, fmtHH, horasHomemMobilizadas, diasEntre, hojeIso, mesesEntre, type Atividade, type OmInfo, type SituacaoOm } from './model';

type Filtro = SituacaoOm | 'pendentes' | 'todas' | 'futuras';

/**
 * Controle das OMs (Gestão): o SUPERVISOR marca o retorno (realizada / pendente) e a
 * PROGRAMAÇÃO dá a baixa (encerrada no SAP). Cada papel só vê os botões do que pode fazer.
 */
export function Oms() {
  const { api, por, pode } = useProg();
  const seleciona = pode.programar || pode.retorno;
  const rec = useRecolhiveis('prog:oms-grupos', () => false);
  const toast = useToast();
  const confirm = useConfirm();
  const oms = useOms();
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const hoje = hojeIso();

  const brutas = useMemo(() => [...(oms?.values() ?? [])], [oms]);
  // execução apontada na programação, por OM (do início do controle no app até o mês que vem)
  const meses = useMemo(() => {
    const [y, m] = hoje.slice(0, 7).split('-').map(Number);
    const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    return mesesEntre(INICIO_CONTROLE_OMS, `${prox}-01`);
  }, [hoje]);
  const ativs = useAtividades(meses);
  const execPorOm = useMemo(() => {
    const m = new Map<string, Atividade[]>();
    for (const a of ativs ?? []) if (a.om && contaParaOm(a)) m.set(a.om, [...(m.get(a.om) ?? []), a]);
    return m;
  }, [ativs]);
  // atividade cancelada/excluída: a OM sem nenhuma atividade ativa sai das pendentes
  const ajustes = useMemo(() => (ativs ? cancelamentoDasOms(brutas, ativs) : []), [brutas, ativs]);
  const todas = useMemo(() => {
    if (!ajustes.length) return brutas;
    const m = new Map(ajustes.map((o) => [o.om, o]));
    return brutas.map((o) => m.get(o.om) ?? o);
  }, [brutas, ajustes]);
  // a programação grava o ajuste no cadastro da OM (uma vez por mudança; vale para o Dashboard)
  const gravados = useRef(new Set<string>());
  useEffect(() => {
    if (!pode.programar || !ajustes.length || !navigator.onLine) return;
    const novos = ajustes.filter((o) => !gravados.current.has(`${o.om}:${o.cancelada}`));
    if (!novos.length) return;
    novos.forEach((o) => gravados.current.add(`${o.om}:${o.cancelada}`));
    gravarOms(api, novos, por).catch(() => novos.forEach((o) => gravados.current.delete(`${o.om}:${o.cancelada}`)));
  }, [ajustes, api, por, pode.programar]);
  // programadas para depois de hoje: ainda não há o que retornar (aba própria)
  const futuras = useMemo(() => new Set(todas.filter((o) => omFutura(o, hoje, execPorOm.get(o.om))).map((o) => o.om)), [todas, hoje, execPorOm]);
  const cont = contarOms(todas.filter((o) => !futuras.has(o.om)));
  const lista = useMemo(() => {
    const q = busca.trim();
    return todas
      .filter((o) => !o.cancelada || filtro === 'todas' || !!q)
      // com busca, procura em todas as situações (a OM aparece mesmo fora da aba aberta)
      .filter((o) =>
        q || filtro === 'todas'
          ? true
          : filtro === 'futuras'
            ? futuras.has(o.om)
            : !futuras.has(o.om) && (filtro === 'pendentes' ? o.situacao === 'aberta' || o.situacao === 'retornada' : o.situacao === filtro),
      )
      .filter((o) => !q || buscaBate(q, o.om, o.equipamento, o.area, o.descricao))
      .sort((a, b) => a.ultimaData.localeCompare(b.ultimaData) || a.om.localeCompare(b.om));
  }, [todas, filtro, busca, futuras]);

  /** programação: dá ou desfaz a baixa (documento das OMs) */
  const baixa = (alvo: OmInfo[], baixar: boolean) => {
    const agora = new Date().toISOString();
    const novas = alvo.map((o): OmInfo =>
      baixar
        ? { ...o, situacao: 'baixada', baixaEm: agora, baixaPor: por }
        : { ...o, situacao: o.retornoEm ? 'retornada' : 'aberta', baixaEm: '', baixaPor: '' },
    );
    gravarOms(api, novas, por).catch(() => toast('A nuvem recusou a alteração.', 'danger'));
    toast(novas.length === 1 ? (baixar ? 'Baixa registrada' : 'Baixa desfeita') : `${novas.length} OMs baixadas`);
    setSel(new Set());
  };
  /** supervisor: marca realizada (retorno) ou volta para pendente (documento de retornos) */
  const retorno = (alvo: OmInfo[], realizada: boolean) => {
    gravarRetornos(api, alvo.map((om) => ({ om, realizada })), por).catch(() => toast('A nuvem recusou a alteração.', 'danger'));
    toast(alvo.length === 1 ? (realizada ? 'Retorno registrado: realizada' : 'OM voltou para pendente') : `${alvo.length} OMs marcadas como realizadas`);
    setSel(new Set());
  };

  const emLote = async (acao: 'baixa' | 'retorno') => {
    const alvo = lista.filter((o) => sel.has(o.om) && o.situacao !== 'baixada' && !futuras.has(o.om));
    if (!alvo.length) return;
    const ok = await confirm({
      title: acao === 'baixa' ? `Dar baixa em ${alvo.length} OM(s)?` : `Marcar ${alvo.length} OM(s) como realizadas?`,
      message: <p>Fica registrado com a data de hoje e o seu e-mail.</p>,
      confirmLabel: acao === 'baixa' ? 'Dar baixa' : 'Marcar realizadas',
    });
    if (ok) {
      if (acao === 'baixa') baixa(alvo, true);
      else retorno(alvo, true);
    }
  };

  const filtros: { id: Filtro; nome: string; n: number }[] = [
    { id: 'pendentes', nome: 'Pendentes', n: cont.aberta + cont.retornada },
    { id: 'aberta', nome: 'Aguard. retorno', n: cont.aberta },
    { id: 'retornada', nome: 'Aguard. baixa', n: cont.retornada },
    { id: 'baixada', nome: 'Baixadas', n: cont.baixada },
    { id: 'sem_registro', nome: 'Sem registro', n: cont.sem_registro },
    { id: 'futuras', nome: 'Programadas (futuras)', n: futuras.size },
  ];

  // agrupadas por área (recolhíveis); a área com a OM pendente mais antiga vem primeiro
  const grupos = useMemo(() => {
    const m = new Map<string, OmInfo[]>();
    for (const o of lista) {
      const k = o.area || 'SEM ÁREA';
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].sort((a, b) => a[1][0].ultimaData.localeCompare(b[1][0].ultimaData) || a[0].localeCompare(b[0], 'pt-BR'));
  }, [lista]);

  const itemOm = (o: OmInfo) => {
            const atraso = o.situacao !== 'baixada' && o.ultimaData < hoje ? diasEntre(o.ultimaData, hoje) : 0;
            const futura = futuras.has(o.om);
            const proximas = futura ? [...new Set((execPorOm.get(o.om) ?? []).map((a) => a.data))].sort() : [];
            return (
              <li key={o.om} className="card pad om-item">
                <div className="row between nowrap">
                  <label className="row nowrap om-num">
                    {seleciona && !futura && (
                      <input
                        type="checkbox"
                        checked={sel.has(o.om)}
                        aria-label={`Selecionar OM ${o.om}`}
                        onChange={(e) =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(o.om);
                            else n.delete(o.om);
                            return n;
                          })
                        }
                      />
                    )}
                    <b className="num">{o.om}</b>
                  </label>
                  {futura ? (
                    <span className="badge neutral">📅 Programada</span>
                  ) : (
                    <span className={'badge sit-' + o.situacao}>{SITUACOES.find((s) => s.id === o.situacao)?.nome}</span>
                  )}
                </div>
                <div>
                  <b>{o.equipamento || '—'}</b> · {o.area || 'sem área'} — {o.descricao}
                </div>
                <div className="small muted">
                  {futura
                    ? `Programada para ${(proximas.length ? proximas : [o.primeiraData]).map((d) => dataBr(d)).join(', ')} · o retorno fica disponível no dia da execução`
                    : `Programada ${o.primeiraData === o.ultimaData ? `em ${dataBr(o.primeiraData)}` : `de ${dataBr(o.primeiraData)} a ${dataBr(o.ultimaData)}`}`}
                  {atraso > 0 && (o.situacao === 'aberta' || o.situacao === 'retornada') && <b className="text-pend"> · há {atraso} dia(s)</b>}
                  {o.retornoEm && ` · retorno ${new Date(o.retornoEm).toLocaleDateString('pt-BR')}${o.retornoPor ? ` (${o.retornoPor})` : ''}`}
                  {o.baixaEm && ` · baixa ${new Date(o.baixaEm).toLocaleDateString('pt-BR')}${o.baixaPor ? ` (${o.baixaPor})` : ''}`}
                  {o.cancelada && ' · cancelada'}
                </div>
                {(() => {
                  const l = execPorOm.get(o.om) ?? [];
                  if (!l.length) return null;
                  const exec = l.filter((a) => a.execucao === 'executada').map((a) => a.data).sort();
                  const passadas = l.filter((a) => a.classe !== 'cancelada' && a.data < hoje && !a.execucao);
                  const mob = l.filter((a) => a.classe === 'cancelada' && a.mobilizada);
                  return (
                    <div className="small om-exec">
                      {mob.map((a) => (
                        <div key={a.id} className="exec mob">
                          ⏱ Cancelada em {dataBr(a.data).slice(0, 5)}{a.motivo ? ` (${a.motivo})` : ''} · apropriar <b>{fmtHH(horasHomemMobilizadas(a))}</b> ({a.pessoas} pessoa
                          {a.pessoas === 1 ? '' : 's'} × {fmtDuracao(a.horasMobilizadas)}{a.mobInicio && a.mobFim ? `, ${a.mobInicio}–${a.mobFim}` : ''})
                        </div>
                      ))}
                      {exec.length > 0 ? (
                        <span className="exec ok">✓ Executada {exec.map((d) => dataBr(d).slice(0, 5)).join(', ')} (apontamento da programação)</span>
                      ) : passadas.length > 0 ? (
                        <span className="text-pend">Programada para {passadas.map((a) => dataBr(a.data).slice(0, 5)).join(', ')}: execução ainda não apontada</span>
                      ) : null}
                    </div>
                  );
                })()}
                {!futura && (
                <div className="row">
                  {pode.retorno && o.situacao !== 'baixada' && (o.situacao === 'retornada' ? (
                    <button className="link small" onClick={() => retorno([o], false)}>
                      Voltar para pendente
                    </button>
                  ) : (
                    <button className="btn small" onClick={() => retorno([o], true)}>
                      ✓ Realizada (retorno)
                    </button>
                  ))}
                  {pode.programar &&
                    (o.situacao === 'baixada' ? (
                      <button className="link small" onClick={() => baixa([o], false)}>
                        Desfazer baixa
                      </button>
                    ) : (
                      <button className={'btn small' + (o.situacao === 'retornada' ? ' primary' : '')} onClick={() => baixa([o], true)}>
                        ✓ Baixa no SAP
                      </button>
                    ))}
                </div>
                )}
              </li>
            );
          };

  return (
    <div className="stack prog">
      <section className="card pad stack">
        <h2>Controle de OMs</h2>
        <p className="small muted">
          Fluxo: o <b>supervisor</b> marca a OM como realizada (<b>retorno</b>) e a <b>programação</b> dá a <b>baixa</b> no SAP. “Sem registro” = OMs da
          planilha anteriores a {dataBr(INICIO_CONTROLE_OMS)}, sem o controle de retorno. OM cuja atividade foi cancelada ou excluída sai das pendentes (pela busca continua aparecendo, marcada como cancelada). A busca procura em todas as situações.
        </p>
        <div className="segmented">
          {filtros.map((f) => (
            <button key={f.id} className={'seg' + (filtro === f.id ? ' on' : '')} onClick={() => setFiltro(f.id)}>
              {f.nome} <span className="num">({f.n})</span>
            </button>
          ))}
        </div>
        <input className="input" type="search" placeholder="Buscar OM, equipamento, área…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {grupos.length > 1 && !busca.trim() && (
          <div className="row recolher-barra">
            <span className="small muted grow">
              {lista.length} OM(s) em {grupos.length} área(s) — toque na área para abrir
            </span>
            <button className="btn small" onClick={() => rec.todos(grupos.map(([a]) => a), true)}>
              ▾ Expandir todas
            </button>
            <button className="btn small" onClick={() => rec.todos(grupos.map(([a]) => a), false)}>
              ▸ Recolher todas
            </button>
          </div>
        )}
        {seleciona && sel.size > 0 && (
          <div className="row">
            {pode.retorno && (
              <button className="btn" onClick={() => void emLote('retorno')}>
                ✓ Realizadas ({sel.size})
              </button>
            )}
            {pode.programar && (
              <button className="btn primary" onClick={() => void emLote('baixa')}>
                Dar baixa ({sel.size})
              </button>
            )}
            <button className="btn" onClick={() => setSel(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}
      </section>

      {oms === null ? (
        <p className="muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="muted">Nenhuma OM neste filtro.</p>
      ) : (
        <ul className="plain-list stack">
          {seleciona && (
            <li>
              <label className="check small">
                <input
                  type="checkbox"
                  checked={lista.length > 0 && lista.every((o) => sel.has(o.om))}
                  onChange={(e) => setSel(e.target.checked ? new Set(lista.map((o) => o.om)) : new Set())}
                />{' '}
                Selecionar todas as {lista.length} desta lista
              </label>
            </li>
          )}
          {grupos.map(([area, oms]) => {
            const abre = !!busca.trim() || rec.aberto(area);
            const maisAntiga = Math.max(0, ...oms.map((o) => (o.situacao !== 'baixada' && o.ultimaData < hoje ? diasEntre(o.ultimaData, hoje) : 0)));
            const todosSel = seleciona && oms.every((o) => sel.has(o.om));
            return (
              <li key={area} className={'card om-grupo ' + corDaArea(area) + (abre ? '' : ' fechado')}>
                <div
                  className="om-grupo-cab"
                  role="button"
                  tabIndex={0}
                  aria-expanded={abre}
                  onClick={() => rec.alternar(area)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      rec.alternar(area);
                    }
                  }}
                >
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                  <span className={'sw-area ' + corDaArea(area)} />
                  <b className="grow">{area}</b>
                  <span className="small muted om-grupo-n">
                    <span className="num">{oms.length}</span> OM{oms.length === 1 ? '' : 's'}
                    {maisAntiga > 0 && <span className="badge pend">mais antiga há {maisAntiga} d</span>}
                  </span>
                </div>
                {abre && (
                  <div className="om-grupo-corpo">
                    {seleciona && (
                      <label className="check small">
                        <input
                          type="checkbox"
                          checked={todosSel}
                          onChange={(e) =>
                            setSel((s0) => {
                              const n = new Set(s0);
                              for (const o of oms) e.target.checked ? n.add(o.om) : n.delete(o.om);
                              return n;
                            })
                          }
                        />{' '}
                        Selecionar as {oms.length} desta área
                      </label>
                    )}
                    <ul className="plain-list stack">
                      {oms.slice(0, 200).map(itemOm)}
                      {oms.length > 200 && <li className="muted small">Mostrando 200 de {oms.length}. Use a busca para encontrar uma OM.</li>}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}

        </ul>
      )}
    </div>
  );
}
