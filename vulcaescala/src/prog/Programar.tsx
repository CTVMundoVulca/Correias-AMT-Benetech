import { useEffect, useMemo, useState } from 'react';
import { newId } from '../domain/ids';
import { addDays, fromIsoDate, isoWeekOf, toIsoDate } from '../domain/isoWeek';
import { useToast } from '../ui/Toast';
import { PdfBotao } from '../ui/PdfBotao';
import { useAtividades, useOms, useProg } from './context';
import { gravarSolicitacao, ouvirAbertas } from './data';
import { AtividadeDialog } from './AtividadeDialog';
import { AreasDialog } from './AreasDialog';
import { Importar } from './Importar';
import { RecusarDialog } from './RecusarDialog';
import { ApontarDialog } from './ApontarDialog';
import { SeletorSemana } from './SeletorSemana';
import { BarraAreas, LinhaAtividade, curtoDia, diasDaSemana, fatiasDoDia, rotuloDia, segundaDe } from './Painel';

const CHAVE_ABERTOS = 'prog:dias-abertos';
import { dataBr } from './Solicitar';
import { URGENCIAS, atividadeVazia, hojeIso, maiusculas, mesesEntre, ordenarAtividades, resumir, tipoPelaDescricao, type Atividade, type Solicitacao } from './model';

type Edicao = { a: Atividade; nova: boolean; solic?: Solicitacao };

/** Programação semanal (substitui a aba "SEMANA" da planilha). Só administradores. */
export function Programar() {
  const { api, por, pode } = useProg();
  const toast = useToast();
  const [segunda, setSegunda] = useState(() => segundaDe(hojeIso()));
  const dias = diasDaSemana(segunda);
  const lista = useAtividades(mesesEntre(dias[0], dias[6]));
  const oms = useOms();
  const [abertas, setAbertas] = useState<Solicitacao[]>([]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [apontar, setApontar] = useState<string | null>(null);
  // dias recolhidos/abertos (como na Escala): por padrão só o dia de hoje fica aberto; a escolha fica no aparelho
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_ABERTOS) ?? '{}') ?? {};
    } catch {
      return {};
    }
  });
  const guardar = (m: Record<string, boolean>) => {
    // só as últimas semanas (não cresce para sempre)
    const limite = toIsoDate(addDays(fromIsoDate(hojeIso())!, -60));
    const limpo = Object.fromEntries(Object.entries(m).filter(([k]) => k >= limite));
    setAbertos(limpo);
    try {
      localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(limpo));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  };
  const estaAberto = (d: string) => abertos[d] ?? d === hojeIso();
  const alternar = (d: string) => guardar({ ...abertos, [d]: !estaAberto(d) });
  const todos = (v: boolean) => guardar({ ...abertos, ...Object.fromEntries(dias.map((d) => [d, v])) });
  const [areasAberto, setAreasAberto] = useState(false);
  const [importar, setImportar] = useState(false);
  const [recusando, setRecusando] = useState<Solicitacao | null>(null);

  useEffect(() => ouvirAbertas(api, setAbertas), [api]);

  const daSemana = useMemo(() => ordenarAtividades((lista ?? []).filter((a) => a.data >= dias[0] && a.data <= dias[6])), [lista, dias]);
  const r = resumir(daSemana);
  const semanaNum = isoWeekOf(fromIsoDate(segunda)!).week;

  if (!pode.programar) return <p className="muted">Só a programação monta e altera a programação.</p>;

  const nova = (data: string) => setEdicao({ a: atividadeVazia(newId(), data, por), nova: true });
  const programarSolic = (s: Solicitacao) => {
    const a = atividadeVazia(newId(), s.dataDesejada, por);
    const desc = maiusculas(s.descricao, 200);
    setEdicao({
      nova: true,
      solic: s,
      a: { ...a, area: s.area, equipamento: s.equipamento, om: s.om, descricao: desc, tipo: tipoPelaDescricao(desc), solicitacaoId: s.id, comunicadoEm: s.criadoEm },
    });
  };
  const recusar = (s: Solicitacao, motivo: string) => {
    gravarSolicitacao(api, { ...s, status: 'recusada', resposta: motivo, atualizadoEm: new Date().toISOString(), atualizadoPor: por }).catch(() =>
      toast('Não foi possível recusar.', 'danger'),
    );
    toast('Solicitação recusada; a área vê o motivo');
  };


  return (
    <div className="stack prog">
      {abertas.length > 0 && (
        <section className="card pad stack inbox">
          <h3>
            📥 Solicitações aguardando programação <span className="badge pend num">{abertas.length}</span>
          </h3>
          <ul className="plain-list solic-list">
            {abertas.map((s) => (
              <li key={s.id} className="solic">
                <div className="row between">
                  <b>
                    {s.area}
                    {s.equipamento ? ` · ${s.equipamento}` : ''}
                  </b>
                  {s.urgencia !== 'normal' && <span className="badge danger">{URGENCIAS.find((u) => u.id === s.urgencia)?.nome}</span>}
                </div>
                <div>{s.descricao}</div>
                <div className="small muted">
                  Para {dataBr(s.dataDesejada)} · {s.om && `OM ${s.om} · `}
                  {s.solicitante}
                  {s.contato && ` (${s.contato})`} · pedido em {new Date(s.criadoEm).toLocaleString('pt-BR')}
                </div>
                <div className="row">
                  <button className="btn primary small" onClick={() => programarSolic(s)}>
                    Programar
                  </button>
                  <button className="btn small" onClick={() => setRecusando(s)}>
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card pad">
        <SeletorSemana segunda={segunda} onEscolher={setSegunda} />
        <p className="small muted center">
          {r.total} atividade{r.total === 1 ? '' : 's'} · {r.classes.programada} programada{r.classes.programada === 1 ? '' : 's'} · {r.classes.nao_programada} não
          programada{r.classes.nao_programada === 1 ? '' : 's'} · {r.classes.emergencia} emergência{r.classes.emergencia === 1 ? '' : 's'} · {r.classes.cancelada}{' '}
          cancelada{r.classes.cancelada === 1 ? '' : 's'}
          {r.classes.sem > 0 && ` · ${r.classes.sem} sem classificação`}
        </p>
        <div className="row center-row">
          <button className="btn small" onClick={() => setSegunda(segundaDe(hojeIso()))}>
            Semana atual
          </button>
          <button className="btn small" onClick={() => setAreasAberto(true)}>
            Áreas e contatos
          </button>
          <button className="btn small" onClick={() => setImportar(true)}>
            Importar planilha
          </button>
          <button className="btn small" onClick={() => todos(true)}>
            ▾ Expandir todos
          </button>
          <button className="btn small" onClick={() => todos(false)}>
            ▸ Recolher todos
          </button>
          <PdfBotao alvo={() => document.getElementById('prog-semana')} titulo={`Programação Vulcanização - Semana ${semanaNum}`} className="btn small" />
        </div>
      </section>

      <div id="prog-semana" className="stack">
        <h2 className="print-only">
          Programação da Vulcanização — Semana {semanaNum} ({curtoDia(dias[0])} a {curtoDia(dias[6])})
        </h2>
        {dias.map((d) => {
          const doDia = daSemana.filter((a) => a.data === d);
          const pessoas = doDia.reduce((s, a) => s + (a.classe === 'cancelada' ? 0 : a.pessoas), 0);
          const aApontar = d <= hojeIso() ? doDia.filter((a) => a.classe !== 'cancelada' && !a.execucao).length : 0;
          return (
            <section key={d} className={'card pad prog-dia' + (d === hojeIso() ? ' today' : '') + (estaAberto(d) ? '' : ' fechado')}>
              <div
                className="dia-cab"
                role="button"
                tabIndex={0}
                aria-expanded={estaAberto(d)}
                aria-controls={`dia-${d}`}
                onClick={() => alternar(d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    alternar(d);
                  }
                }}
              >
                <span className="chevron" aria-hidden>
                  ›
                </span>
                <div className="grow dia-cab-txt">
                  <h3>
                    {rotuloDia(d)} {d === hojeIso() && <span className="badge today">Hoje</span>}
                  </h3>
                  {!estaAberto(d) && doDia.length > 0 && <BarraAreas fatias={fatiasDoDia(doDia)} />}
                </div>
                <span className="small muted dia-cab-n">
                  <span>
                    {doDia.length} ativ. · 👷 <span className="num">{pessoas}</span>
                  </span>
                  {aApontar > 0 && <span className="badge pend dia-cab-pend">⚠ {aApontar} a apontar</span>}
                </span>
              </div>
              <div className="dia-corpo" id={`dia-${d}`}>
              {lista === null ? (
                <p className="muted small">Carregando…</p>
              ) : (
                <ul className="plain-list ativ-list">
                  {doDia.map((a) => (
                    <LinhaAtividade key={a.id} a={a} mostrarArea onClick={() => setEdicao({ a, nova: false })} />
                  ))}
                </ul>
              )}
              {d <= hojeIso() && doDia.some((a) => a.classe !== 'cancelada') && (
                <button className={'btn small apontar-btn' + (aApontar ? ' pendente' : '')} onClick={() => setApontar(d)}>
                  {aApontar ? `✓ Apontar execução (${aApontar} pendente${aApontar === 1 ? '' : 's'})` : '✓ Execução apontada'}
                </button>
              )}
              <button className="btn small add-ativ" onClick={() => nova(d)}>
                + Atividade
              </button>
              </div>
            </section>
          );
        })}
      </div>

      {edicao && (
        <AtividadeDialog
          key={edicao.a.id}
          atual={edicao.a}
          nova={edicao.nova}
          oms={oms}
          solicitacao={edicao.solic}
          onClose={() => setEdicao(null)}
        />
      )}
      {areasAberto && <AreasDialog onClose={() => setAreasAberto(false)} />}
      {importar && <Importar onClose={() => setImportar(false)} />}
      {apontar && <ApontarDialog data={apontar} atividades={daSemana.filter((a) => a.data === apontar)} onClose={() => setApontar(null)} />}
      {recusando && (
        <RecusarDialog
          titulo="Recusar solicitação"
          resumo={
            <>
              <b>
                {recusando.area}
                {recusando.equipamento ? ` · ${recusando.equipamento}` : ''}
              </b>{' '}
              — {recusando.descricao}
            </>
          }
          onRecusar={(m) => recusar(recusando, m)}
          onClose={() => setRecusando(null)}
        />
      )}
    </div>
  );
}
