import { useMemo, useState } from 'react';
import { MONTHS, MONTHS_SHORT } from '../domain/isoWeek';
import { PdfBotao } from '../ui/PdfBotao';
import { Indicadores } from './Indicadores';
import { DetalheAtividades, DetalheEmergenciasOm } from './Detalhes';
import { GraficoBarras, GraficoColunas, LegendaSeries, SERIES, type Serie } from './graficos';
import { useAtividades, useOms, useProg } from './context';
import { CampoArea } from './CampoArea';
import {
  AREA_INTERNA,
  contarOms,
  emergenciasPorOm,
  omFutura,
  fmtHH,
  hojeIso,
  mesesEntre,
  pct,
  porArea,
  porEquipamento,
  porMes,
  porTipo,
  resumir,
  type Atividade,
  type Grupo,
} from './model';

type Periodo = 'mes' | 'tri' | 'ano' | 'livre';
/** cartão clicado: mostra as atividades que formam o número */
type SelKpi = 'todas' | 'emergencia' | 'oms_emerg' | 'nao_programada' | 'cancelada' | 'mobilizadas' | 'retrabalho' | 'pessoas';
const FILTRO_KPI: Record<Exclude<SelKpi, 'oms_emerg'>, { nome: string; f: (a: Atividade) => boolean }> = {
  todas: { nome: 'Atividades', f: () => true },
  pessoas: { nome: 'Atividades com pessoas (não canceladas)', f: (a) => a.classe !== 'cancelada' && a.pessoas > 0 },
  emergencia: { nome: 'Emergências (registros-dia)', f: (a) => a.classe === 'emergencia' },
  nao_programada: { nome: 'Não programadas', f: (a) => a.classe === 'nao_programada' },
  cancelada: { nome: 'Canceladas', f: (a) => a.classe === 'cancelada' },
  mobilizadas: { nome: 'Canceladas com a equipe mobilizada', f: (a) => a.classe === 'cancelada' && a.mobilizada },
  retrabalho: { nome: 'Retrabalhos', f: (a) => a.retrabalho },
};

const nomeMes = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const curtoMes = (ym: string) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

function somaMeses(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m < 1) {
    m += 12;
    y--;
  }
  while (m > 12) {
    m -= 12;
    y++;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}


/** Análise de todas as atividades da vulcanização (todos com o link veem). */
export function Dashboard() {
  const { areas } = useProg();
  const atual = hojeIso().slice(0, 7);
  const [periodo, setPeriodo] = useState<Periodo>('ano');
  const [de, setDe] = useState(`${atual.slice(0, 4)}-01`);
  const [ate, setAte] = useState(atual);
  const [area, setArea] = useState('');
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState<Serie | null>(null);
  const [selKpi, setSelKpi] = useState<SelKpi | null>(null);
  const clicar = (k: SelKpi) => setSelKpi((x) => (x === k ? null : k));

  const [ini, fim] =
    periodo === 'mes' ? [atual, atual] : periodo === 'tri' ? [somaMeses(atual, -2), atual] : periodo === 'ano' ? [`${atual.slice(0, 4)}-01`, atual] : de <= ate ? [de, ate] : [ate, de];
  const meses = mesesEntre(`${ini}-01`, `${fim}-01`);
  const todas = useAtividades(meses);
  const oms = useOms();

  const lista = useMemo(() => (todas ?? []).filter((a) => !area || (a.area || AREA_INTERNA) === area), [todas, area]);
  const r = resumir(lista);
  const emerg = useMemo(() => emergenciasPorOm(lista), [lista]);
  const gArea = useMemo(() => porArea(lista), [lista]);
  const gMes = useMemo(() => porMes(lista), [lista]);
  const gTipo = useMemo(() => porTipo(lista), [lista]);
  const gEquip = useMemo(() => porEquipamento(lista, 10), [lista]);
  const gPessoas = useMemo(() => [...gArea].sort((a, b) => b.pessoasDia - a.pessoasDia), [gArea]);
  const omsPeriodo = useMemo(
    () => [...(oms?.values() ?? [])].filter((o) => o.ultimaData.slice(0, 7) >= ini && o.primeiraData.slice(0, 7) <= fim && (!area || o.area === area)),
    [oms, ini, fim, area],
  );
  // OMs programadas para depois de hoje ainda não estão "sem baixa"
  const cOms = contarOms(omsPeriodo.filter((o) => !omFutura(o, hojeIso())));
  const opcoesArea = useMemo(() => [...new Set([...areas.map((a) => a.nome), ...gArea.map((g) => g.chave)])].sort(), [areas, gArea]);
  const titulo = `Dashboard Vulcanização - ${ini === fim ? nomeMes(ini) : `${curtoMes(ini)} a ${curtoMes(fim)}`}${area ? ` - ${area}` : ''}`;

  return (
    <div className="stack prog">
      <section className="card pad stack filtros-dash">
        <div className="segmented">
          {(
            [
              ['mes', 'Mês atual'],
              ['tri', 'Últimos 3 meses'],
              ['ano', 'Ano'],
              ['livre', 'Escolher'],
            ] as [Periodo, string][]
          ).map(([id, nome]) => (
            <button key={id} className={'seg' + (periodo === id ? ' on' : '')} onClick={() => setPeriodo(id)}>
              {nome}
            </button>
          ))}
        </div>
        {periodo === 'livre' && (
          <div className="two-cols">
            <label className="field">
              De
              <input className="input" type="month" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
            </label>
            <label className="field">
              Até
              <input className="input" type="month" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
            </label>
          </div>
        )}
        <CampoArea value={area} onChange={setArea} opcoes={opcoesArea} vazio="Todas as áreas" />
        <div className="row between">
          <button className="btn small" onClick={() => setTabela((t) => !t)}>
            {tabela ? 'Ver gráficos' : 'Ver em tabela'}
          </button>
          <PdfBotao alvo={() => document.getElementById('dash')} titulo={titulo} className="btn small" />
        </div>
      </section>

      <div id="dash" className="stack dash viz-root">
        <h2>{titulo.replace('Dashboard Vulcanização - ', '')}</h2>
        {todas === null ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            <p className="small muted dica-int">Toque num cartão para ver as atividades que formam o número.</p>
            <div className="kpis">
              <Kpi v={r.total} t="Atividades" sel={selKpi} k="todas" onK={clicar} />
              <Kpi v={r.pessoasDia} t="Pessoas × dia" sel={selKpi} k="pessoas" onK={clicar} />
              <Kpi v={pct(r.indiceProgramacao)} t="Índice de programação" dica="programadas ÷ executadas (prog. + não prog. + emerg.)" />
              <Kpi v={r.classes.emergencia} t={`Emergências — registros-dia (${pct(r.total - r.classes.sem ? r.classes.emergencia / (r.total - r.classes.sem) : null)})`} sel={selKpi} k="emergencia" onK={clicar} />
              <Kpi
                v={emerg.ocorrencias.length}
                t={`OMs em emergência · ${emerg.diasOm} dias-OM`}
                dica={emerg.media === null ? undefined : `média de ${emerg.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s) por OM`}
                sel={selKpi}
                k="oms_emerg"
                onK={clicar}
              />
              <Kpi v={r.classes.nao_programada} t="Não programadas" sel={selKpi} k="nao_programada" onK={clicar} />
              <Kpi v={r.classes.cancelada} t={`Canceladas (${pct(r.indiceCancelamento)})`} sel={selKpi} k="cancelada" onK={clicar} />
              <Kpi
                v={fmtHH(r.horasPerdidas)}
                t="HH em cancelamentos (equipe mobilizada)"
                dica={`${r.mobilizadas} atividade(s) canceladas com a equipe mobilizada · horas apropriadas na OM (pessoas × horas)`}
                sel={selKpi}
                k="mobilizadas"
                onK={clicar}
              />
              <Kpi v={r.retrabalho} t="Retrabalhos" sel={selKpi} k="retrabalho" onK={clicar} />
              {oms ? (
                <Kpi v={cOms.aberta + cOms.retornada} t="OMs sem baixa" dica={`${cOms.aberta} aguardando retorno · ${cOms.retornada} aguardando baixa`} />
              ) : (
                <Kpi v={r.comOm} t="Atividades com OM" />
              )}
            </div>
            {selKpi === 'oms_emerg' ? (
              <DetalheEmergenciasOm titulo="OMs em emergência" ocorrencias={emerg.ocorrencias} onFechar={() => setSelKpi(null)} />
            ) : (
              selKpi && <DetalheAtividades titulo={FILTRO_KPI[selKpi].nome} lista={lista.filter(FILTRO_KPI[selKpi].f)} onFechar={() => setSelKpi(null)} />
            )}
            {r.classes.sem > 0 && (
              <p className="small muted">
                {r.classes.sem} de {r.total} atividades não têm classificação (importadas da planilha sem PROG/Ñ PROG/EMERG/CANC marcado). Os índices
                consideram só as classificadas.
              </p>
            )}

            <Indicadores lista={lista} ini={ini} fim={fim} area={area} oms={oms} />

            <h3 className="secao-dash">📊 Distribuição das atividades</h3>
            {!tabela && <p className="small muted dica-int">Toque numa classificação para destacá-la; toque numa barra para ver o detalhe.</p>}
            <LegendaSeries foco={foco} setFoco={setFoco} />

            {tabela ? (
              <TabelaGrupos titulo="Atividades por área" grupos={gArea} />
            ) : (
              <Card titulo="Quais áreas mais solicitam serviço" sub="Atividades no período, por classificação">
                <GraficoBarras
                  foco={foco}
                  linhas={gArea.map((g) => ({ id: g.chave, nome: g.chave, v: g.total, classes: g.classes }))}
                  detalhe={(l) => (
                    <div className="gb-det-acoes">
                      <span className="small muted">{gArea.find((g) => g.chave === l.id)?.pessoasDia ?? 0} pessoas×dia</span>
                      {!area && (
                        <button type="button" className="btn small" onClick={() => setArea(l.id)}>
                          🔎 Ver o dashboard só desta área
                        </button>
                      )}
                    </div>
                  )}
                />
              </Card>
            )}

            {tabela ? (
              <TabelaGrupos titulo="Atividades por mês" grupos={gMes.map((g) => ({ ...g, chave: nomeMes(g.chave) }))} />
            ) : (
              gMes.length > 1 && (
                <Card titulo="Evolução mensal" sub="Atividades por mês, por classificação">
                  <GraficoColunas
                    foco={foco}
                    colunas={gMes.map((g) => ({ id: g.chave, rotulo: gMes[0].chave.slice(0, 4) === gMes[gMes.length - 1].chave.slice(0, 4) ? MONTHS_SHORT[Number(g.chave.slice(5, 7)) - 1] : curtoMes(g.chave), nomeLongo: nomeMes(g.chave), total: g.total, classes: g.classes, pessoasDia: g.pessoasDia }))}
                  />
                </Card>
              )
            )}

            {r.horasPorMotivo.length > 0 && (
              <Card titulo="HH em cancelamentos, por motivo" sub="Canceladas com a equipe mobilizada: pessoas × horas à disposição (apropriadas na OM)">
                <GraficoBarras
                  unidade="HH"
                  linhas={r.horasPorMotivo.map((g) => ({ id: g.motivo, nome: g.motivo, v: g.horas }))}
                  detalhe={(l) => {
                    const g = r.horasPorMotivo.find((x) => x.motivo === l.id)!;
                    return <p className="small muted">{g.n} atividade(s) · {fmtHH(g.horas)}</p>;
                  }}
                />
              </Card>
            )}

            <Card titulo="Onde o efetivo foi usado" sub="Pessoas × dia por área (soma das pessoas de cada atividade, sem as canceladas)">
              <GraficoBarras
                unidade="pessoas×dia"
                linhas={gPessoas.map((g) => ({ id: g.chave, nome: g.chave, v: g.pessoasDia }))}
                detalhe={(l) => {
                  const g = gPessoas.find((x) => x.chave === l.id)!;
                  const exec = g.total - g.classes.cancelada;
                  return (
                    <p className="small muted">
                      {exec} atividade(s) não canceladas · média de {exec ? (g.pessoasDia / exec).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'} pessoas por atividade
                    </p>
                  );
                }}
              />
            </Card>

            <Card titulo="Equipamentos que mais demandaram" sub="Top 10 por número de atividades">
              <GraficoBarras
                foco={foco}
                linhas={gEquip.map((g) => {
                  const [tag, ...resto] = g.chave.split(' · ');
                  return { id: g.chave, nome: tag, sub: resto.join(' · '), v: g.total, classes: g.classes };
                })}
                detalhe={(l) => <UltimasDoEquipamento lista={lista} chave={l.id} />}
              />
            </Card>

            <Card titulo="Tipos de serviço" sub="Atividades por tipo, por classificação">
              <GraficoBarras foco={foco} linhas={gTipo.map((g) => ({ id: g.chave, nome: g.chave, v: g.total, classes: g.classes }))} />
            </Card>

            {oms && (
              <Card titulo="Situação das OMs programadas no período">
                <GraficoBarras
                  unidade="OMs"
                  linhas={[
                    { id: 'aberta', nome: 'Aguardando retorno da supervisão', v: cOms.aberta },
                    { id: 'retornada', nome: 'Aguardando baixa da programação', v: cOms.retornada },
                    { id: 'baixada', nome: 'Baixadas', v: cOms.baixada },
                    { id: 'sem', nome: 'Sem registro (planilha)', v: cOms.sem_registro },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ v, t, dica, sel, k, onK }: { v: number | string; t: string; dica?: string; sel?: SelKpi | null; k?: SelKpi; onK?: (k: SelKpi) => void }) {
  if (!k || !onK)
    return (
      <div className="kpi" title={dica}>
        <b>{v}</b>
        <span>{t}</span>
      </div>
    );
  return (
    <button type="button" className={'kpi kpi-click' + (sel === k ? ' on' : '')} title={(dica ? dica + ' · ' : '') + 'Ver as atividades'} aria-pressed={sel === k} onClick={() => onK(k)}>
      <b>{v}</b>
      <span>{t}</span>
      {dica && <span className="kpi-sub">{dica}</span>}
    </button>
  );
}

function Card({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card pad chart-card pdf-inteiro">
      <h3>{titulo}</h3>
      {sub && <p className="small muted">{sub}</p>}
      {children}
    </section>
  );
}

/** Últimas atividades de um equipamento (detalhe da barra). */
function UltimasDoEquipamento({ lista, chave }: { lista: Atividade[]; chave: string }) {
  const ult = lista
    .filter((a) => a.area && `${a.equipamento} · ${a.area}` === chave)
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 5);
  return (
    <div className="gb-ultimas">
      <span className="small muted">Últimas atividades</span>
      <ul className="plain-list">
        {ult.map((a) => (
          <li key={a.id} className="small">
            <span className="num">{a.data.split('-').reverse().join('/')}</span> · {a.tipo}
            {a.descricao && <span className="muted"> — {a.descricao}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabelaGrupos({ titulo, grupos }: { titulo: string; grupos: Grupo[] }) {
  return (
    <section className="card pad pdf-inteiro">
      <h3>{titulo}</h3>
      <div className="table-wrap">
        <table className="grid-table tabela-dash">
          <thead>
            <tr>
              <th className="name-col">—</th>
              <th>Total</th>
              {SERIES.map((s) => (
                <th key={s.k}>{s.nome}</th>
              ))}
              <th>Pessoas × dia</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.chave}>
                <td className="name-col" title={g.chave}>
                  {g.chave}
                </td>
                <td className="total">{g.total}</td>
                {SERIES.map((s) => (
                  <td key={s.k} className="cell">
                    {g.classes[s.k] || '·'}
                  </td>
                ))}
                <td className="cell">{g.pessoasDia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
