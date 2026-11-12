import { useMemo, useState } from 'react';
import { MONTHS, MONTHS_SHORT } from '../domain/isoWeek';
import { PdfBotao } from '../ui/PdfBotao';
import { Indicadores } from './Indicadores';
import { useAtividades, useOms, useProg } from './context';
import {
  AREA_INTERNA,
  CLASSES,
  contarOms,
  hojeIso,
  mesesEntre,
  pct,
  porArea,
  porEquipamento,
  porMes,
  porTipo,
  resumir,
  type ContagemClasse,
  type Grupo,
} from './model';

type Periodo = 'mes' | 'tri' | 'ano' | 'livre';

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

/** Ordem fixa das séries (cores por classe, nunca pela posição). */
const SERIES: { k: keyof ContagemClasse; nome: string }[] = [...CLASSES.map((c) => ({ k: c.id as keyof ContagemClasse, nome: c.nome })), { k: 'sem', nome: 'Não classificada' }];

/** Análise de todas as atividades da vulcanização (todos com o link veem). */
export function Dashboard() {
  const { areas } = useProg();
  const atual = hojeIso().slice(0, 7);
  const [periodo, setPeriodo] = useState<Periodo>('ano');
  const [de, setDe] = useState(`${atual.slice(0, 4)}-01`);
  const [ate, setAte] = useState(atual);
  const [area, setArea] = useState('');
  const [tabela, setTabela] = useState(false);

  const [ini, fim] =
    periodo === 'mes' ? [atual, atual] : periodo === 'tri' ? [somaMeses(atual, -2), atual] : periodo === 'ano' ? [`${atual.slice(0, 4)}-01`, atual] : de <= ate ? [de, ate] : [ate, de];
  const meses = mesesEntre(`${ini}-01`, `${fim}-01`);
  const todas = useAtividades(meses);
  const oms = useOms();

  const lista = useMemo(() => (todas ?? []).filter((a) => !area || (a.area || AREA_INTERNA) === area), [todas, area]);
  const r = resumir(lista);
  const gArea = useMemo(() => porArea(lista), [lista]);
  const gMes = useMemo(() => porMes(lista), [lista]);
  const gTipo = useMemo(() => porTipo(lista), [lista]);
  const gEquip = useMemo(() => porEquipamento(lista, 10), [lista]);
  const gPessoas = useMemo(() => [...gArea].sort((a, b) => b.pessoasDia - a.pessoasDia), [gArea]);
  const omsPeriodo = useMemo(
    () => [...(oms?.values() ?? [])].filter((o) => o.ultimaData.slice(0, 7) >= ini && o.primeiraData.slice(0, 7) <= fim && (!area || o.area === area)),
    [oms, ini, fim, area],
  );
  const cOms = contarOms(omsPeriodo);
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
        <label className="field">
          Área
          <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas as áreas</option>
            {opcoesArea.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
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
            <div className="kpis">
              <Kpi v={r.total} t="Atividades" />
              <Kpi v={r.pessoasDia} t="Pessoas × dia" />
              <Kpi v={pct(r.indiceProgramacao)} t="Índice de programação" dica="programadas ÷ executadas (prog. + não prog. + emerg.)" />
              <Kpi v={r.classes.emergencia} t={`Emergências (${pct(r.total - r.classes.sem ? r.classes.emergencia / (r.total - r.classes.sem) : null)})`} />
              <Kpi v={r.classes.nao_programada} t="Não programadas" />
              <Kpi v={r.classes.cancelada} t={`Canceladas (${pct(r.indiceCancelamento)})`} />
              <Kpi v={r.retrabalho} t="Retrabalhos" />
              {oms ? (
                <Kpi v={cOms.aberta + cOms.retornada} t="OMs sem baixa" dica={`${cOms.aberta} aguardando retorno · ${cOms.retornada} aguardando baixa`} />
              ) : (
                <Kpi v={r.comOm} t="Atividades com OM" />
              )}
            </div>
            {r.classes.sem > 0 && (
              <p className="small muted">
                {r.classes.sem} de {r.total} atividades não têm classificação (importadas da planilha sem PROG/Ñ PROG/EMERG/CANC marcado). Os índices
                consideram só as classificadas.
              </p>
            )}

            <Indicadores lista={lista} ini={ini} fim={fim} area={area} oms={oms} />

            <h3 className="secao-dash">📊 Distribuição das atividades</h3>
            <Legenda />

            {tabela ? (
              <TabelaGrupos titulo="Atividades por área" grupos={gArea} />
            ) : (
              <Card titulo="Quais áreas mais solicitam serviço" sub="Atividades no período, por classificação">
                <BarrasEmpilhadas grupos={gArea} />
              </Card>
            )}

            {tabela ? (
              <TabelaGrupos titulo="Atividades por mês" grupos={gMes.map((g) => ({ ...g, chave: nomeMes(g.chave) }))} />
            ) : (
              gMes.length > 1 && (
                <Card titulo="Evolução mensal" sub="Atividades por mês, por classificação">
                  <Colunas grupos={gMes} />
                </Card>
              )
            )}

            <Card titulo="Onde o efetivo foi usado" sub="Pessoas × dia por área (soma das pessoas de cada atividade, sem as canceladas)">
              <BarrasSimples itens={gPessoas.map((g) => ({ nome: g.chave, v: g.pessoasDia }))} />
            </Card>

            <Card titulo="Equipamentos que mais demandaram" sub="Top 10 por número de atividades">
              <BarrasSimples itens={gEquip.map((g) => ({ nome: g.chave, v: g.total }))} />
            </Card>

            <Card titulo="Tipos de serviço" sub="Atividades por tipo">
              <BarrasSimples itens={gTipo.map((g) => ({ nome: g.chave, v: g.total }))} />
            </Card>

            {oms && (
            <Card titulo="Situação das OMs programadas no período">
              <BarrasSimples
                itens={[
                  { nome: 'Aguardando retorno da supervisão', v: cOms.aberta },
                  { nome: 'Aguardando baixa da programação', v: cOms.retornada },
                  { nome: 'Baixadas', v: cOms.baixada },
                  { nome: 'Sem registro (planilha)', v: cOms.sem_registro },
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

function Kpi({ v, t, dica }: { v: number | string; t: string; dica?: string }) {
  return (
    <div className="kpi" title={dica}>
      <b>{v}</b>
      <span>{t}</span>
    </div>
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

function Legenda() {
  return (
    <ul className="legend-viz" aria-label="Legenda das classificações">
      {SERIES.map((s) => (
        <li key={s.k}>
          <span className={'sw s-' + s.k} aria-hidden /> {s.nome}
        </li>
      ))}
    </ul>
  );
}

const dicaGrupo = (g: Grupo) =>
  `${g.chave}: ${g.total} atividade(s) — ` +
  SERIES.filter((s) => g.classes[s.k])
    .map((s) => `${s.nome} ${g.classes[s.k]}`)
    .join(', ');

/** Barras horizontais empilhadas por classificação (uma linha por grupo). */
function BarrasEmpilhadas({ grupos }: { grupos: Grupo[] }) {
  if (!grupos.length) return <p className="muted small">Sem atividades no período.</p>;
  const max = Math.max(...grupos.map((g) => g.total));
  return (
    <ul className="hbars" role="list">
      {grupos.map((g) => (
        <li key={g.chave} className="hbar" title={dicaGrupo(g)}>
          <span className="hbar-nome">{g.chave}</span>
          <span className="hbar-trilho">
            <span className="hbar-pilha" style={{ width: `${(g.total / max) * 100}%` }}>
              {SERIES.filter((s) => g.classes[s.k]).map((s) => (
                <span key={s.k} className={'seg-viz s-' + s.k} style={{ flexGrow: g.classes[s.k] }} />
              ))}
            </span>
            <span className="hbar-valor num">{g.total}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function BarrasSimples({ itens }: { itens: { nome: string; v: number }[] }) {
  const vis = itens.filter((i) => i.v > 0);
  if (!vis.length) return <p className="muted small">Sem dados no período.</p>;
  const max = Math.max(...vis.map((i) => i.v));
  return (
    <ul className="hbars" role="list">
      {vis.map((i) => (
        <li key={i.nome} className="hbar" title={`${i.nome}: ${i.v}`}>
          <span className="hbar-nome">{i.nome}</span>
          <span className="hbar-trilho">
            <span className="hbar-pilha" style={{ width: `${(i.v / max) * 100}%` }}>
              <span className="seg-viz s-unica" style={{ flexGrow: 1 }} />
            </span>
            <span className="hbar-valor num">{i.v}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Colunas por mês, empilhadas por classificação. */
function Colunas({ grupos }: { grupos: Grupo[] }) {
  const max = Math.max(1, ...grupos.map((g) => g.total));
  return (
    <div className="cols" role="list">
      {grupos.map((g) => (
        <div key={g.chave} className="col" role="listitem" title={dicaGrupo({ ...g, chave: nomeMes(g.chave) })}>
          <span className="col-valor num">{g.total}</span>
          <span className="col-trilho">
            <span className="col-pilha" style={{ height: `${(g.total / max) * 100}%` }}>
              {SERIES.filter((s) => g.classes[s.k]).map((s) => (
                <span key={s.k} className={'seg-viz s-' + s.k} style={{ flexGrow: g.classes[s.k] }} />
              ))}
            </span>
          </span>
          <span className="col-nome">{curtoMes(g.chave)}</span>
        </div>
      ))}
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
