import { useMemo } from 'react';
import { useProg } from './context';
import { GraficoBarras } from './graficos';
import { useDadosKpi, diasEntreDatas } from './kpiDados';
import {
  aderencia,
  antecedenciaPorArea,
  backlogSemanas,
  demandas,
  esperas,
  motivosCancelamento,
  ocupacaoEfetivo,
  omsIdadeCiclo,
  percentSemOm,
  reincidencias,
  vidaEmendas,
} from './kpis';
import { AREA_INTERNA, hojeIso, pct, resumir, type Atividade, type OmInfo } from './model';

const num1 = (v: number | null, suf = '') => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suf}`);
const fmtHoras = (h: number | null) => (h === null ? '—' : h >= 48 ? `${num1(h / 24)} dias` : `${num1(h)} h`);

/** Situação frente à referência: só para quem já tem dado (nunca inventa "ok"). */
function Ref({ v, alvo, maior = true, texto }: { v: number | null; alvo: number; maior?: boolean; texto: string }) {
  if (v === null) return <span className="ref muted">{texto}</span>;
  const ok = maior ? v >= alvo : v <= alvo;
  return (
    <span className={'ref ' + (ok ? 'ref-ok' : 'ref-baixo')}>
      {ok ? '✓' : '⚠'} {texto}
    </span>
  );
}

function Tile({ v, t, sub, children }: { v: string | number; t: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="kpi">
      <b>{v}</b>
      <span>{t}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {children}
    </div>
  );
}

function Barras({ itens, fmt = (n: number) => String(n) }: { itens: { chave: string; n: number }[]; fmt?: (n: number) => string }) {
  return <GraficoBarras linhas={itens.map((i) => ({ id: i.chave, nome: i.chave, v: i.n }))} fmt={fmt} unidade="" vazio="Sem registros no período." />;
}

/**
 * Indicadores de gestão da programação (Relatórios). Recebe as atividades já filtradas
 * pelo período e pela área; cruza com solicitações, Escala, atrasos e Registro de Emenda.
 */
export function Indicadores({ lista, ini, fim, area, oms }: { lista: Atividade[]; ini: string; fim: string; area: string; oms: Map<string, OmInfo> | null }) {
  const { feriados } = useProg();
  const hoje = hojeIso();
  const de = `${ini}-01`;
  const ultimo = (() => {
    const [y, m] = fim.split('-').map(Number);
    return `${fim}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  })();
  const ate = ultimo < hoje ? ultimo : hoje;
  const dados = useDadosKpi(de, ate);

  const ad = useMemo(() => aderencia(lista, hoje), [lista, hoje]);
  const r = resumir(lista);
  const exec = r.classes.programada + r.classes.nao_programada + r.classes.emergencia;
  const cancel = useMemo(() => motivosCancelamento(lista), [lista]);
  const antec = useMemo(() => antecedenciaPorArea(lista), [lista]);
  const semOm = percentSemOm(lista);
  const solic = useMemo(() => (dados?.solicitacoes ?? []).filter((s) => !area || s.area === area), [dados, area]);
  const dem = demandas(solic);
  const back = backlogSemanas(lista, solic.filter((s) => s.status === 'aberta'), dados?.efetivo ?? 0, hoje);
  const omsL = useMemo(() => [...(oms?.values() ?? [])].filter((o) => !area || o.area === area), [oms, area]);
  const ciclo = omsIdadeCiclo(omsL, hoje);
  const diasEsc = useMemo(() => (dados ? diasEntreDatas(dados.escalaDesde, ate) : []), [dados, ate]);
  const ocup = ocupacaoEfetivo(
    lista.filter((a) => a.data >= (dados?.escalaDesde ?? de)),
    dados?.efetivo ?? 0,
    diasEsc,
    dados?.escala ?? [],
    feriados,
  );
  const esp = useMemo(() => esperas(dados?.atrasos ?? []), [dados]);
  const r30 = useMemo(() => reincidencias(lista, 30), [lista]);
  const r90 = useMemo(() => reincidencias(lista, 90), [lista]);
  const vida = useMemo(() => vidaEmendas(dados?.emendas ?? []), [dados]);
  const nomeArea = (a: string) => (a === AREA_INTERNA ? 'INTERNO' : a);

  return (
    <div className="stack indicadores">
      {/* ---------------- 1. programação ---------------- */}
      <section className="card pad stack pdf-inteiro">
        <h3>📅 Programação</h3>
        <div className="kpis">
          <Tile v={pct(ad.indice)} t="Aderência à programação" sub={`${ad.executadas} executadas de ${ad.executadas + ad.naoExecutadas + ad.reprogramadas} apontadas`}>
            <Ref v={ad.indice} alvo={0.85} texto="ref. ≥ 85%" />
          </Tile>
          <Tile v={pct(exec ? r.classes.programada / exec : null)} t="Trabalho programado" sub="programadas ÷ executadas">
            <Ref v={exec ? r.classes.programada / exec : null} alvo={0.8} texto="ref. ≥ 80% (80/20)" />
          </Tile>
          <Tile v={pct(ad.instabilidade === null ? null : 1 - ad.instabilidade)} t="Estabilidade" sub="atividades sem reprogramação">
            <Ref v={ad.instabilidade === null ? null : 1 - ad.instabilidade} alvo={0.9} texto="ref. ≥ 90%" />
          </Tile>
          <Tile v={pct(ad.cobertura)} t="Execução apontada" sub={`${ad.semApontamento} sem apontamento`} />
        </div>
        {ad.cobertura !== null && ad.cobertura < 0.8 && (
          <p className="small muted">
            Só {pct(ad.cobertura)} das atividades até hoje têm apontamento: a aderência fica mais confiável quando a programação aponta todo dia (Gestão →
            Programação → “Apontar execução”).
          </p>
        )}
        <div className="dois-blocos">
          <div>
            <h4>Por que não foi executado</h4>
            <Barras itens={ad.motivosNaoExecucao} />
          </div>
          <div>
            <h4>Motivos de cancelamento</h4>
            <Barras itens={cancel} />
          </div>
        </div>
        <h4>Antecedência média do pedido, por área</h4>
        <p className="small muted">Da comunicação até 07:15 do dia. Menos de 48 h vira “não programada”.</p>
        <Barras itens={antec.map((x) => ({ chave: `${nomeArea(x.area)} (${x.n})`, n: Math.round(x.horas) }))} fmt={(h) => fmtHoras(h)} />
      </section>

      {/* ---------------- 2. demandas, OMs, backlog ---------------- */}
      <section className="card pad stack pdf-inteiro">
        <h3>📥 Demandas, OMs e backlog</h3>
        {dados === null ? (
          <p className="muted small">Carregando…</p>
        ) : (
          <div className="kpis">
            <Tile v={fmtHoras(dem.respostaHoras)} t="Tempo de resposta" sub={`${dem.respondidas} de ${dem.total} pedidos respondidos`}>
              <Ref v={dem.respostaHoras} alvo={24} maior={false} texto="ref. ≤ 24 h" />
            </Tile>
            <Tile v={pct(dem.noPrazo)} t="Atendidos na data pedida" sub={`${dem.recusadas} recusado(s)`} />
            <Tile v={back.semanas === null ? '—' : `${num1(back.semanas)} sem.`} t="Backlog" sub={`${back.programado + back.pedidos} pessoas×dia · capacidade ${back.capacidade}/sem.`}>
              <span className={'ref ' + (back.semanas === null ? 'muted' : back.semanas >= 2 && back.semanas <= 4 ? 'ref-ok' : 'ref-baixo')}>
                {back.semanas === null ? '' : back.semanas >= 2 && back.semanas <= 4 ? '✓' : '⚠'} ref. 2–4 semanas
              </span>
            </Tile>
            <Tile v={pct(semOm)} t="Serviço sem OM" sub="atividades de áreas sem número de OM" />
          </div>
        )}
        {back.semEstimativa > 0 && (
          <p className="small muted">
            {back.semEstimativa} pedido(s) em aberto sem estimativa de pessoas × dias não entram no backlog.
          </p>
        )}
        {oms && (
          <div className="kpis">
            <Tile v={ciclo.faixa.ate7} t="OMs pendentes até 7 dias" />
            <Tile v={ciclo.faixa.ate30} t="OMs pendentes 8–30 dias" />
            <Tile v={ciclo.faixa.mais30} t="OMs pendentes > 30 dias" />
            <Tile v={`${num1(ciclo.diasAteRetorno)} / ${num1(ciclo.diasAteBaixa)}`} t="Dias até retorno / até baixa" sub="média do ciclo da OM" />
          </div>
        )}
      </section>

      {/* ---------------- 3. efetivo e esperas ---------------- */}
      <section className="card pad stack pdf-inteiro">
        <h3>👥 Efetivo e esperas</h3>
        {dados === null ? (
          <p className="muted small">Carregando…</p>
        ) : (
          <>
            <div className="kpis">
              <Tile v={pct(ocup.ocupacao)} t="Ocupação do efetivo" sub={`${ocup.programado} programadas ÷ ${ocup.disponivel} disponíveis (pessoas×dia)`} />
              <Tile v={pct(ocup.absenteismo)} t="Absenteísmo" sub={`efetivo do contrato ${dados.efetivo} · ${ocup.diasUteis} dias úteis`} />
              <Tile v={`${num1(esp.horas)} h`} t="Horas perdidas com espera" sub={`${esp.registros} atraso(s) registrados na escala`} />
              <Tile
                v={ocup.apoioPessoasDia}
                t="Apoio de outros contratos (pessoas×dia)"
                sub={`${ocup.diasComApoio} dia(s) com reforço · ${pct(ocup.diasUteis ? ocup.diasComApoio / ocup.diasUteis : null)} dos dias úteis`}
              />
            </div>
            {dados.escalaDesde > de && (
              <p className="small muted">Ocupação e absenteísmo consideram os últimos 92 dias do período (a partir de {dados.escalaDesde.split('-').reverse().join('/')}).</p>
            )}
            {ocup.diasComEscala === 0 && <p className="small muted">A escala do período ainda não tem dias lançados: ocupação e absenteísmo ficam sem base.</p>}
            <div className="dois-blocos">
              <div>
                <h4>Horas perdidas por motivo</h4>
                <Barras itens={esp.porMotivo.map((x) => ({ chave: x.chave, n: Math.round(x.horas * 10) / 10 }))} fmt={(h) => `${num1(h)} h`} />
              </div>
              <div>
                <h4>Atividades com mais espera</h4>
                <Barras itens={esp.porAtividade.map((x) => ({ chave: x.chave, n: Math.round(x.horas * 10) / 10 }))} fmt={(h) => `${num1(h)} h`} />
              </div>
            </div>
            {area && <p className="small muted">Os atrasos não são filtrados por área (vêm da escala).</p>}
          </>
        )}
      </section>

      {/* ---------------- 4. confiabilidade ---------------- */}
      <section className="card pad stack pdf-inteiro">
        <h3>🔁 Confiabilidade por TAG</h3>
        <div className="kpis">
          <Tile v={r30.length} t="Equipamentos com reincidência < 30 dias" sub="emenda ou reparo de novo" />
          <Tile v={r90.length} t="Reincidência < 90 dias" />
          <Tile v={vida.length ? `${num1(vida.reduce((s, v) => s + v.mediaDias, 0) / vida.length)} dias` : '—'} t="Vida média da emenda" sub={`${vida.length} correia(s) com 2+ emendas no Registro`} />
        </div>
        {r90.length > 0 && (
          <div className="table-wrap">
            <table className="grid-table tabela-dash">
              <thead>
                <tr>
                  <th className="name-col">Equipamento</th>
                  <th>Área</th>
                  <th>Intervenções</th>
                  <th>Reincid. ≤ 90 d</th>
                  <th>Menor intervalo</th>
                </tr>
              </thead>
              <tbody>
                {r90.slice(0, 10).map((x) => (
                  <tr key={x.tag + x.area}>
                    <td className="name-col">{x.tag}</td>
                    <td className="small">{nomeArea(x.area)}</td>
                    <td className="cell">{x.eventos}</td>
                    <td className="cell">{x.reincidencias}</td>
                    <td className="cell">{x.menorIntervalo} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h4>Vida da emenda por correia (Registro de Emenda) — menores primeiro</h4>
        {dados === null ? (
          <p className="muted small">Carregando…</p>
        ) : vida.length === 0 ? (
          <p className="muted small">Ainda não há correias com duas ou mais emendas registradas no período.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid-table tabela-dash">
              <thead>
                <tr>
                  <th className="name-col">TAG</th>
                  <th>Emendas</th>
                  <th>Vida média</th>
                  <th>Menor</th>
                </tr>
              </thead>
              <tbody>
                {vida.slice(0, 10).map((v) => (
                  <tr key={v.tag}>
                    <td className="name-col">{v.tag}</td>
                    <td className="cell">{v.emendas}</td>
                    <td className="cell">{Math.round(v.mediaDias)} d</td>
                    <td className="cell">{v.menorDias} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">
          Reincidência considera reparos e emendas (corretivas); a troca de correia é serviço planejado e não conta. Mesma OM ou intervenções até 7 dias uma da outra contam como um só serviço. “L-21”, “L 21” e “l21” são tratados como a mesma correia.
        </p>
      </section>
    </div>
  );
}
