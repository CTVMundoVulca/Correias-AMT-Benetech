import { useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS, addDays, fromIsoDate, toIsoDate } from '../domain/isoWeek';
import type { Day } from '../domain/types';
import type { PubConfig } from '../cloud/publico';
import { useAtividades, useParadas, useProg } from './context';
import { ouvirSolicitacoes } from './data';
import { ouvirEscalaDoDia } from './efetivo';
import { CargaCapacidade } from './CargaCapacidade';
import { DiaSelecionado } from './DiaSelecionado';
import { proximosDiasUteis } from './kpis';
import { CalendarioMes, MapaSemana, corDaArea, diasDaSemana, gradeDoMes, mesDeIso, segundaDe, type Mes } from './Painel';
import { dataBr } from './Solicitar';
import { TIPOS_PARADA, hojeIso, mesDe, mesesEntre, pct, porArea, resumir, type Solicitacao } from './model';

const somaMes = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const STATUS_SOLIC: Record<Solicitacao['status'], { nome: string; cls: string }> = {
  aberta: { nome: 'Aguardando', cls: 'st-aberta' },
  programada: { nome: 'Programada', cls: 'st-programada' },
  recusada: { nome: 'Recusada', cls: 'st-recusada' },
  cancelada: { nome: 'Cancelada', cls: 'st-cancelada' },
};
const URG: Record<Solicitacao['urgencia'], { nome: string; cls: string }> = {
  normal: { nome: 'Normal', cls: 'ur-normal' },
  urgente: { nome: 'Urgente', cls: 'ur-urgente' },
  emergencia: { nome: 'Equip. parado', cls: 'ur-parado' },
};

/** Central: visão geral da programação, demandas, efetivo do dia, paradas e semana. */
export function Central() {
  const { api, feriados, linkAreas } = useProg();
  const hoje = hojeIso();
  const mesAtual = hoje.slice(0, 7);
  const mesAnt = somaMes(mesAtual, -1);
  const [mes, setMes] = useState<Mes>(() => mesDeIso(hoje));
  const [dia, setDia] = useState(hoje);
  const grade = gradeDoMes(mes);
  const segunda = segundaDe(dia);
  const semana = diasDaSemana(segunda);
  const ini = [grade[0], semana[0], `${mesAnt}-01`].sort()[0];
  const proximos = proximosDiasUteis(hoje, 10, feriados);
  const fim = [grade[grade.length - 1], semana[6], hoje, proximos[proximos.length - 1] ?? hoje].sort().reverse()[0];
  const lista = useAtividades(mesesEntre(ini, fim));
  const paradas = useParadas();

  const [solic, setSolic] = useState<Solicitacao[] | null>(null);
  useEffect(() => ouvirSolicitacoes(api, (l) => setSolic(l), toIsoDate(addDays(fromIsoDate(hoje)!, -120)), () => setSolic([])), [api, hoje]);

  // escala do dia selecionado (quem está em cada atividade); o cadastro do efetivo vale para a capacidade
  const [escala, setEscala] = useState<{ efetivo: PubConfig['efetivo']; dia: Day | null } | null>(null);
  useEffect(() => {
    setEscala(null);
    return ouvirEscalaDoDia(api, dia, (efetivo, d) => {
      setEscala({ efetivo, dia: d });
      if (efetivo.length) setEfetivoCad(efetivo);
    });
  }, [api, dia]);
  // cadastro do efetivo (o mesmo em qualquer dia): não "pisca" ao trocar o dia selecionado
  const [efetivoCad, setEfetivoCad] = useState<PubConfig['efetivo'] | null>(null);
  const detalheRef = useRef<HTMLElement>(null);

  const doMes = useMemo(() => (lista ?? []).filter((a) => mesDe(a.data) === mesAtual), [lista, mesAtual]);
  const doMesAnt = useMemo(() => (lista ?? []).filter((a) => mesDe(a.data) === mesAnt), [lista, mesAnt]);
  const r = resumir(doMes);
  const exec = r.classes.programada + r.classes.nao_programada + r.classes.emergencia;
  const variacao = doMesAnt.length ? (doMes.length - doMesAnt.length) / doMesAnt.length : null;
  const top = porArea(doMes.filter((a) => a.classe !== 'cancelada')).slice(0, 5);
  const fila = (solic ?? []).filter((s) => s.status === 'aberta').concat((solic ?? []).filter((s) => s.status !== 'aberta')).slice(0, 6);
  const abertas = (solic ?? []).filter((s) => s.status === 'aberta').length;
  const proximas = paradas.filter((p) => p.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4);
  const escolher = (d: string, rolar = false) => {
    setDia(d);
    setMes(mesDeIso(d));
    // leva até o detalhe do dia (principalmente no celular)
    if (rolar) setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const solicPorId = useMemo(() => new Map((solic ?? []).map((x) => [x.id, x])), [solic]);
  const nomeMes = MONTHS[Number(mesAtual.slice(5)) - 1];

  return (
    <div className="central">
      {/* 1. em que dias há folga — tocar num dia mostra o detalhe logo abaixo */}
      <section className="painel-bloco b-carga">
        <CargaCapacidade dias={proximos} lista={lista} efetivo={efetivoCad ?? (escala ? escala.efetivo : null)} selecionado={dia} onDia={(d) => escolher(d, true)} />
      </section>

      {/* 2. o dia selecionado: onde está o efetivo, quem está em cada atividade e quem pediu */}
      <section className="painel-bloco b-dia" ref={detalheRef}>
        <DiaSelecionado dia={dia} lista={lista} solicPorId={solicPorId} escala={escala} paradas={paradas} />
      </section>

      {/* 3. o que ainda está aguardando programação */}
      <div className="central-grid uma">
        {/* fila de demandas */}
        <section className="painel-bloco b-fila">
          <div className="bloco-topo">
            <h3>📥 Fila de demandas {abertas > 0 && <span className="badge pend num">{abertas} aguardando</span>}</h3>
            <a className="link small" href="#/solicitar">
              Ver todas →
            </a>
          </div>
          {solic === null ? (
            <p className="muted small">Carregando…</p>
          ) : fila.length === 0 ? (
            <p className="muted small">Nenhuma solicitação nos últimos 120 dias.</p>
          ) : (
            <div className="table-wrap">
              <table className="fila">
                <thead>
                  <tr>
                    <th>Área</th>
                    <th>Serviço</th>
                    <th>Urgência</th>
                    <th className="col-larga">Solicitante</th>
                    <th>Para</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fila.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className={'sw-area ' + corDaArea(s.area)} /> {s.area}
                      </td>
                      <td className="fila-serv">
                        {s.equipamento && <b>{s.equipamento} </b>}
                        <span className="muted">{s.descricao}</span>
                        {s.om && <div className="small num muted">OM {s.om}</div>}
                      </td>
                      <td>
                        <span className={'pill ' + URG[s.urgencia].cls}>{URG[s.urgencia].nome}</span>
                      </td>
                      <td className="col-larga small">
                        {s.solicitante}
                        {s.contato && <div className="muted">📞 {s.contato}</div>}
                      </td>
                      <td className="num small">{dataBr(s.dataDesejada).slice(0, 5)}</td>
                      <td>
                        <span className={'pill ' + STATUS_SOLIC[s.status].cls}>{STATUS_SOLIC[s.status].nome}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* 4. navegação: mês (com paradas) e semana — o dia escolhido aqui atualiza o detalhe acima */}
      <div className="central-grid dupla">
        {/* calendário com paradas */}
        <section className="painel-bloco b-cal">
          <CalendarioMes mes={mes} setMes={setMes} dia={dia} onDia={(d) => escolher(d, true)} lista={lista} paradas={paradas} semana={segunda} />
          {proximas.length > 0 && (
            <ul className="plain-list prox-paradas">
              {proximas.map((p) => {
                const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
                return (
                  <li key={p.id} className={'parada-faixa parada-' + p.tipo}>
                    <b>
                      {t.icone} {p.area}
                    </b>{' '}
                    · {p.inicio === p.fim ? dataBr(p.inicio).slice(0, 5) : `${dataBr(p.inicio).slice(0, 5)}–${dataBr(p.fim).slice(0, 5)}`} · {t.nome}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="painel-bloco b-semana">
          <MapaSemana segunda={segunda} dia={dia} onDia={(d) => escolher(d, true)} lista={lista} />
        </section>
      </div>

      {/* 5. indicadores do mês (análise) */}
      <h3 className="secao-central">📈 Indicadores de {nomeMes}</h3>
      <div className="kpi-faixa kpi-mes">
        <Kpi ico="📋" cor="k-azul" titulo="Atividades no mês" valor={lista ? r.total : '…'} extra={variacao === null ? undefined : `${variacao >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(variacao * 100))}% vs mês anterior`} />
        <Kpi ico="📅" cor="k-prog" titulo="Programadas" valor={r.classes.programada} extra={pct(exec ? r.classes.programada / exec : null)} />
        <Kpi ico="⏱" cor="k-naoprog" titulo="Não programadas" valor={r.classes.nao_programada} extra={pct(exec ? r.classes.nao_programada / exec : null)} />
        <Kpi ico="⚡" cor="k-emerg" titulo="Emergências" valor={r.classes.emergencia} extra={pct(exec ? r.classes.emergencia / exec : null)} />
      </div>
      <div className="central-grid dupla">
        {/* classificação do mês */}
        <section className="painel-bloco b-classe">
          <div className="bloco-topo">
            <h3>Classificação — {nomeMes}</h3>
          </div>
          <Rosca
            total={exec}
            fatias={[
              { k: 'programada', nome: 'Programadas', v: r.classes.programada },
              { k: 'nao_programada', nome: 'Não programadas', v: r.classes.nao_programada },
              { k: 'emergencia', nome: 'Emergências', v: r.classes.emergencia },
            ]}
          />
          {r.classes.cancelada + r.classes.sem > 0 && (
            <p className="small muted center">
              + {r.classes.cancelada} cancelada(s){r.classes.sem ? ` · ${r.classes.sem} sem classificação` : ''}
            </p>
          )}
        </section>
        {/* áreas que mais solicitaram */}
        <section className="painel-bloco b-top">
          <div className="bloco-topo">
            <h3>Áreas que mais demandaram — {nomeMes}</h3>
          </div>
          {top.length === 0 ? (
            <p className="muted small">Sem atividades no mês.</p>
          ) : (
            <ul className="hbars">
              {top.map((g) => (
                <li key={g.chave} className="hbar" title={`${g.chave}: ${g.total} atividade(s)`}>
                  <span className="hbar-nome">
                    <span className={'sw-area ' + corDaArea(g.chave)} /> {g.chave}
                  </span>
                  <span className="hbar-trilho">
                    <span className="hbar-pilha" style={{ width: `${(g.total / top[0].total) * 100}%` }}>
                      <span className={'seg-area ' + corDaArea(g.chave)} style={{ flexGrow: 1 }} />
                    </span>
                    <span className="hbar-valor num">{g.total}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AcoesRapidas linkAreas={linkAreas} />
    </div>
  );
}

function Kpi({ ico, cor, titulo, valor, extra }: { ico: string; cor: string; titulo: string; valor: number | string; extra?: string }) {
  return (
    <div className="kpi-c">
      <span className={'kpi-ico ' + cor} aria-hidden>
        {ico}
      </span>
      <span className="kpi-txt">
        <span className="kpi-tit">{titulo}</span>
        <b className="num">{valor}</b>
        {extra && <span className="kpi-extra num">{extra}</span>}
      </span>
    </div>
  );
}

/** Rosca de 3 fatias (classificação). Rótulos diretos na legenda, com número e %. */
function Rosca({ total, fatias }: { total: number; fatias: { k: string; nome: string; v: number }[] }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="rosca">
      <svg viewBox="0 0 110 110" role="img" aria-label={fatias.map((f) => `${f.nome} ${f.v}`).join(', ')}>
        <circle cx="55" cy="55" r={R} fill="none" className="rosca-fundo" strokeWidth="16" />
        {total > 0 &&
          fatias
            .filter((f) => f.v)
            .map((f) => {
              const len = (f.v / total) * C;
              const el = (
                <circle
                  key={f.k}
                  cx="55"
                  cy="55"
                  r={R}
                  fill="none"
                  strokeWidth="16"
                  className={'rosca-seg s-' + f.k}
                  strokeDasharray={`${Math.max(0, len - 2)} ${C}`}
                  strokeDashoffset={-acc}
                  transform="rotate(-90 55 55)"
                >
                  <title>{`${f.nome}: ${f.v}`}</title>
                </circle>
              );
              acc += len;
              return el;
            })}
        <text x="55" y="55" textAnchor="middle" className="rosca-total">
          {total}
        </text>
        <text x="55" y="70" textAnchor="middle" className="rosca-sub">
          executadas
        </text>
      </svg>
      <ul className="rosca-leg">
        {fatias.map((f) => (
          <li key={f.k}>
            <span className={'sw s-' + f.k} /> {f.nome}
            <b className="num">
              {f.v} <span className="muted">({pct(total ? f.v / total : null)})</span>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}


export function AcoesRapidas({ linkAreas = false }: { linkAreas?: boolean }) {
  const acoes = [
    { href: '#/solicitar', ico: '➕', nome: 'Nova solicitação', destaque: true },
    { href: '#/paradas', ico: '⛔', nome: 'Informar parada' },
    { href: '#/painel', ico: '📍', nome: 'Dia a dia' },
    { href: '#/dashboard', ico: '📊', nome: 'Relatórios' },
    ...(linkAreas ? [] : [{ href: '#/g', ico: '⚙', nome: 'Gestão' }]),
  ];
  return (
    <nav className="acoes-rapidas" aria-label="Ações rápidas">
      <span className="acoes-tit">⚡ Ações rápidas</span>
      {acoes.map((a) => (
        <a key={a.href} href={a.href} className={'acao' + (a.destaque ? ' destaque' : '')}>
          <span aria-hidden>{a.ico}</span>
          {a.nome}
        </a>
      ))}
    </nav>
  );
}
