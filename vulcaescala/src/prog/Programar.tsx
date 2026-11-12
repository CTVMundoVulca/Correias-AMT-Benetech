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
import { LinhaAtividade, curtoDia, diasDaSemana, rotuloDia, segundaDe } from './Painel';
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
  const [areasAberto, setAreasAberto] = useState(false);
  const [importar, setImportar] = useState(false);

  useEffect(() => ouvirAbertas(api, setAbertas), [api]);

  const daSemana = useMemo(() => ordenarAtividades((lista ?? []).filter((a) => a.data >= dias[0] && a.data <= dias[6])), [lista, dias]);
  const r = resumir(daSemana);
  const semanaNum = isoWeekOf(fromIsoDate(segunda)!).week;
  const mudar = (n: number) => setSegunda(toIsoDate(addDays(fromIsoDate(segunda)!, 7 * n)));

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
  const recusar = (s: Solicitacao) => {
    const motivo = window.prompt('Motivo da recusa (aparece para quem pediu):', '');
    if (motivo === null) return;
    gravarSolicitacao(api, { ...s, status: 'recusada', resposta: motivo.trim().slice(0, 300), atualizadoEm: new Date().toISOString(), atualizadoPor: por }).catch(() =>
      toast('Não foi possível recusar.', 'danger'),
    );
    toast('Solicitação recusada');
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
                  <button className="btn small" onClick={() => recusar(s)}>
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card pad">
        <div className="row between nowrap">
          <button className="btn" onClick={() => mudar(-1)} aria-label="Semana anterior">
            ‹
          </button>
          <div className="center">
            <b>Semana {semanaNum}</b>
            <div className="small muted">
              {curtoDia(dias[0])} a {curtoDia(dias[6])}
            </div>
          </div>
          <button className="btn" onClick={() => mudar(1)} aria-label="Próxima semana">
            ›
          </button>
        </div>
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
          return (
            <section key={d} className={'card pad prog-dia' + (d === hojeIso() ? ' today' : '')}>
              <div className="row between">
                <h3>
                  {rotuloDia(d)} {d === hojeIso() && <span className="badge today">Hoje</span>}
                </h3>
                <span className="small muted">
                  {doDia.length} ativ. · 👷 <span className="num">{pessoas}</span>
                </span>
              </div>
              {lista === null ? (
                <p className="muted small">Carregando…</p>
              ) : (
                <ul className="plain-list ativ-list">
                  {doDia.map((a) => (
                    <LinhaAtividade key={a.id} a={a} mostrarArea onClick={() => setEdicao({ a, nova: false })} />
                  ))}
                </ul>
              )}
              <button className="btn small add-ativ" onClick={() => nova(d)}>
                + Atividade
              </button>
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
    </div>
  );
}
