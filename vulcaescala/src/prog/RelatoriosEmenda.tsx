import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useAtividades, useProg } from './context';
import { gravarAtividade, ouvirRelatoriosEmenda } from './data';
import { corDaArea } from './Painel';
import { dataBr } from './Solicitar';
import { AREA_INTERNA, hojeIso, mesesEntre, pct, semAcento, type Atividade } from './model';
import { INICIO_CONTROLE, JANELA, MOTIVOS_DISPENSA, TIPOS_COM_RELATORIO, TIPOS_SINALIZAVEIS, cruzar, diasEntre, normTag, type LinhaRel, type RelResumo } from './relEmenda';

type Periodo = 'mes' | 'tudo';
type Filtro = 'pendente' | 'feito' | 'dispensado' | 'hoje' | 'orfao' | 'prep' | 'todas';

const COMO = { manual: 'vinculado à mão', om: 'pela OM', tag: 'pela TAG e data' } as const;

const menosDias = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - n));
  return x.toISOString().slice(0, 10);
};
const nomeRel = (r: RelResumo) => `Nº ${r.numero || '—'} · ${r.tag || 'sem TAG'} · ${dataBr(r.data)}${r.om ? ` · OM ${r.om}` : ''}`;

/**
 * Controle dos relatórios de emenda (Gestão: programadores e administradores).
 * Cruza as trocas de correia e emendas/intercalações da programação com os relatórios
 * lançados no app Registro de Emenda.
 */
export function RelatoriosEmenda() {
  const { api, por, pode } = useProg();
  const toast = useToast();
  const hoje = hojeIso();
  const atual = hoje.slice(0, 7);
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [filtro, setFiltro] = useState<Filtro>('pendente');
  const [busca, setBusca] = useState('');
  const [vincular, setVincular] = useState<Atividade | null>(null);
  const [dispensar, setDispensar] = useState<Atividade | null>(null);

  const inicioMes = INICIO_CONTROLE.slice(0, 7);
  const ini = periodo === 'mes' && atual > inicioMes ? atual : inicioMes;
  // o mês seguinte entra para as preparações já programadas (sinalizar antes)
  const [ay, am] = atual.split('-').map(Number);
  const proximo = am === 12 ? `${ay + 1}-01` : `${ay}-${String(am + 1).padStart(2, '0')}`;
  const meses = mesesEntre(`${ini}-01`, `${proximo}-01`);
  const ativs = useAtividades(meses);
  const [rels, setRels] = useState<RelResumo[] | null>(null);
  const relDe = menosDias(ini === inicioMes ? INICIO_CONTROLE : `${ini}-01`, JANELA.antes);
  useEffect(() => {
    setRels(null);
    return ouvirRelatoriosEmenda(api, relDe, hoje, setRels, () => setRels([]));
  }, [api, relDe, hoje]);

  const c = useMemo(() => (ativs && rels ? cruzar(ativs, rels, hoje) : null), [ativs, rels, hoje]);

  if (!pode.programar) return <p className="muted">Só programadores e administradores veem o controle dos relatórios de emenda.</p>;

  const q = semAcento(busca.trim().toUpperCase());
  const bate = (...t: string[]) => !q || t.some((x) => semAcento(x.toUpperCase()).includes(q) || (normTag(x) && normTag(x).includes(normTag(q))));
  const linhas = (c?.linhas ?? [])
    .filter((l) => filtro === 'todas' || l.sit === filtro)
    .filter((l) => bate(l.a.equipamento, l.a.om, l.a.area, l.a.descricao));
  const orfaos = (c?.semAtividade ?? []).filter((r) => bate(r.tag, r.om, r.numero));
  const exigem = c ? c.total - c.dispensados : 0;
  const preps = (ativs ?? [])
    .filter((a) => TIPOS_SINALIZAVEIS.includes(a.tipo) && a.classe !== 'cancelada' && a.data >= INICIO_CONTROLE)
    .filter((a) => bate(a.equipamento, a.om, a.area, a.descricao))
    .sort((x, y) => y.data.localeCompare(x.data));

  const salvar = (a: Atividade, msg: string) => {
    gravarAtividade(api, a, por).catch(() => toast('A nuvem recusou a alteração.', 'danger'));
    toast(msg);
  };

  const FILTROS: [Filtro, string, number | undefined][] = [
    ['pendente', '⏳ Pendentes', c?.pendentes],
    ['feito', '✓ Com relatório', c?.feitos],
    ['hoje', '🕐 Hoje', c?.linhas.filter((l) => l.sit === 'hoje').length],
    ['dispensado', '🚫 Dispensadas', c?.dispensados],
    ['orfao', '❓ Relatório sem atividade', c?.semAtividade.length],
    ['prep', '🧩 Preparações sinalizadas', preps.filter((a) => a.relExige).length],
    ['todas', 'Todas', c?.linhas.length],
  ];

  return (
    <div className="stack prog rel-emenda">
      <section className="card pad stack">
        <h2>📝 Relatórios de emenda</h2>
        <p className="small muted">
          Toda atividade de <b>{TIPOS_COM_RELATORIO.join(' ou ').toLowerCase()}</b> executada precisa do relatório no app Registro de Emenda. O controle procura o
          relatório pela <b>OM</b> e, sem OM, pela <b>TAG</b> com data de {JANELA.antes} dia antes a {JANELA.depois} dias depois da programada. Canceladas,
          não executadas e reprogramadas não entram. O controle vale a partir de {dataBr(INICIO_CONTROLE)}. Preparações que precisam de relatório são
          sinalizadas em <b>🧩 Preparações</b> (ou no formulário da atividade). Só a Gestão vê esta tela.
        </p>
        <div className="segmented">
          {(
            [
              ['tudo', `Desde o início (${dataBr(INICIO_CONTROLE)})`],
              ['mes', 'Mês atual'],
            ] as [Periodo, string][]
          ).map(([id, nome]) => (
            <button key={id} type="button" className={'seg' + (periodo === id ? ' on' : '')} onClick={() => setPeriodo(id)}>
              {nome}
            </button>
          ))}
        </div>
      </section>

      {!c ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <b>{exigem}</b>
              <span>Exigem relatório</span>
              <span className="kpi-sub">até ontem, sem as dispensadas</span>
            </div>
            <div className="kpi">
              <b>{pct(exigem ? c.feitos / exigem : null)}</b>
              <span>Com relatório</span>
              <span className="kpi-sub">{c.feitos} de {exigem}</span>
            </div>
            <div className={'kpi' + (c.pendentes ? ' kpi-alerta' : '')}>
              <b>{c.pendentes}</b>
              <span>Pendentes</span>
              <span className="kpi-sub">{c.linhas.filter((l) => l.sit === 'pendente' && l.dias > 2).length} há mais de 2 dias</span>
            </div>
            <div className="kpi">
              <b>{c.semAtividade.length}</b>
              <span>Relatórios sem atividade</span>
              <span className="kpi-sub">não batem com a programação</span>
            </div>
          </div>

          <section className="card pad stack">
            <div className="chips-filtro" role="group" aria-label="Filtrar">
              {FILTROS.map(([id, nome, n]) => (
                <button key={id} type="button" className={'leg-btn' + (filtro === id ? ' on' : '')} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                  {nome} <b className="num">{n ?? 0}</b>
                </button>
              ))}
            </div>
            <input className="input" type="search" placeholder="Buscar TAG, OM ou área" value={busca} onChange={(e) => setBusca(e.target.value)} />

            {filtro === 'prep' ? (
              preps.length === 0 ? (
                <p className="small muted">Nenhuma preparação de correia no período.</p>
              ) : (
                <>
                  <p className="small muted">
                    Preparações de correia do período (inclusive as já programadas). Toque em “Exige relatório” nas que precisam: a partir do dia da
                    atividade elas entram no controle, pendentes até o relatório aparecer.
                  </p>
                  <ul className="plain-list rel-lista">
                    {preps.map((a) => (
                      <li key={a.id} className={'rel-item' + (a.relExige ? ' rel-feito' : '')}>
                        <div className="rel-topo">
                          <span className="num rel-data">{dataBr(a.data).slice(0, 5)}</span>
                          <span className={'sw-area ' + corDaArea(a.area || AREA_INTERNA)} aria-hidden />
                          <b className="grow rel-tag">
                            {a.equipamento || '—'} <span className="muted rel-area">· {a.area || AREA_INTERNA}</span>
                          </b>
                          {a.data > hoje && <span className="badge neutral">programada</span>}
                          {a.relExige && <span className="badge rel-ok">📝 exige relatório</span>}
                        </div>
                        <div className="small rel-desc">
                          {a.tipo}
                          {a.descricao && <span className="muted"> — {a.descricao}</span>}
                        </div>
                        <div className="rel-acoes">
                          {a.relExige ? (
                            <button type="button" className="btn small" onClick={() => salvar({ ...a, relExige: false }, 'Sinalização removida')}>
                              Não exige relatório
                            </button>
                          ) : (
                            <button type="button" className="btn small" onClick={() => salvar({ ...a, relExige: true }, 'Preparação sinalizada: exige relatório')}>
                              📝 Exige relatório
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : filtro === 'orfao' ? (
              orfaos.length === 0 ? (
                <p className="small muted">Todos os relatórios do período batem com alguma atividade da programação.</p>
              ) : (
                <>
                  <p className="small muted">
                    Relatórios do app de Emenda que não encontraram atividade no período (pela OM ou pela TAG e data). Confira se a atividade foi lançada na
                    programação ou se a TAG/OM do relatório está diferente; se for o caso, vincule pela atividade.
                  </p>
                  <ul className="plain-list rel-lista">
                    {orfaos.map((r) => (
                      <li key={r.id} className="rel-item">
                        <div className="rel-topo">
                          <span className="num rel-data">{dataBr(r.data)}</span>
                          <b className="grow">{r.tag || 'sem TAG'}</b>
                          <span className="badge neutral">Relatório nº {r.numero || '—'}</span>
                        </div>
                        <div className="small muted">{r.om ? `OM ${r.om}` : 'sem OM no relatório'}</div>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : linhas.length === 0 ? (
              <p className="small muted">{filtro === 'pendente' ? '✓ Nenhum relatório pendente no período.' : 'Nada neste filtro.'}</p>
            ) : (
              <ul className="plain-list rel-lista">
                {(filtro === 'pendente' ? linhas : [...linhas].reverse()).map((l) => (
                  <Linha
                    key={l.a.id}
                    l={l}
                    onVincular={() => setVincular(l.a)}
                    onDispensar={() => setDispensar(l.a)}
                    onNaoExige={() => salvar({ ...l.a, relExige: false }, 'Sinalização removida')}
                    onDesfazer={() =>
                      salvar(
                        { ...l.a, relDispensa: '', relEmendas: l.como === 'manual' ? [] : l.a.relEmendas },
                        l.sit === 'dispensado' ? 'Dispensa desfeita' : 'Vínculo removido',
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {vincular && rels && (
        <VincularDialog
          a={vincular}
          rels={rels}
          onClose={() => setVincular(null)}
          onSalvar={(ids) => {
            salvar({ ...vincular, relEmendas: ids, relDispensa: ids.length ? '' : vincular.relDispensa }, ids.length ? 'Relatório vinculado' : 'Vínculo removido');
            setVincular(null);
          }}
        />
      )}
      {dispensar && (
        <DispensarDialog
          a={dispensar}
          onClose={() => setDispensar(null)}
          onSalvar={(motivo) => {
            salvar({ ...dispensar, relDispensa: motivo }, 'Relatório dispensado');
            setDispensar(null);
          }}
        />
      )}
    </div>
  );
}

function Linha({ l, onVincular, onDispensar, onDesfazer, onNaoExige }: { l: LinhaRel; onVincular: () => void; onDispensar: () => void; onDesfazer: () => void; onNaoExige: () => void }) {
  const a = l.a;
  const area = a.area || AREA_INTERNA;
  return (
    <li className={'rel-item rel-' + l.sit}>
      <div className="rel-topo">
        <span className="num rel-data">{dataBr(a.data).slice(0, 5)}</span>
        <span className={'sw-area ' + corDaArea(area)} aria-hidden />
        <b className="grow rel-tag">
          {a.equipamento || '—'} <span className="muted rel-area">· {area}</span>
        </b>
        {l.sit === 'pendente' && <span className={'badge ' + (l.dias > 2 ? 'rel-atraso' : 'rel-pend')}>⏳ há {l.dias} dia{l.dias === 1 ? '' : 's'}</span>}
        {l.sit === 'hoje' && <span className="badge neutral">🕐 hoje</span>}
        {l.sit === 'feito' && <span className="badge rel-ok">✓ com relatório</span>}
        {l.sit === 'dispensado' && <span className="badge neutral">🚫 dispensado</span>}
      </div>
      <div className="small rel-desc">
        {a.tipo}
        {a.descricao && <span className="muted"> — {a.descricao}</span>}
      </div>
      <div className="small muted rel-meta">
        {a.relExige && !TIPOS_COM_RELATORIO.includes(a.tipo) && <span className="rel-sinal">📝 sinalizada: exige relatório</span>}
        {a.om ? <span className="num">OM {a.om}</span> : <span>sem OM</span>}
        {a.execucao === 'executada' ? <span>✓ executada</span> : a.execucao === '' && <span>sem apontamento de execução</span>}
      </div>
      {l.sit === 'feito' && (
        <div className="small rel-achados">
          {l.rels.map((r) => (
            <span key={r.id} className="quebra-item">
              📄 {nomeRel(r)}
            </span>
          ))}
          <span className="muted">({COMO[l.como!]})</span>
        </div>
      )}
      {l.sit === 'dispensado' && <div className="small muted">Motivo: {a.relDispensa}</div>}
      <div className="rel-acoes">
        {(l.sit === 'pendente' || l.sit === 'hoje') && (
          <>
            <button type="button" className="btn small" onClick={onVincular}>
              🔗 Vincular relatório
            </button>
            <button type="button" className="btn small" onClick={onDispensar}>
              Dispensar
            </button>
            <a className="btn small" href="../emenda/" target="_blank" rel="noopener">
              Abrir app de emenda ↗
            </a>
          </>
        )}
        {a.relExige && !TIPOS_COM_RELATORIO.includes(a.tipo) && l.sit !== 'feito' && (
          <button type="button" className="btn small" onClick={onNaoExige}>
            Não exige relatório
          </button>
        )}
        {l.sit === 'feito' && l.como === 'manual' && (
          <button type="button" className="btn small" onClick={onDesfazer}>
            Desvincular
          </button>
        )}
        {l.sit === 'feito' && l.como !== 'manual' && (
          <button type="button" className="btn small" onClick={onVincular}>
            Corrigir vínculo
          </button>
        )}
        {l.sit === 'dispensado' && (
          <button type="button" className="btn small" onClick={onDesfazer}>
            Desfazer dispensa
          </button>
        )}
      </div>
    </li>
  );
}

/** Escolher à mão o(s) relatório(s) da atividade (troca com duas emendas = dois relatórios). */
function VincularDialog({ a, rels, onClose, onSalvar }: { a: Atividade; rels: RelResumo[]; onClose: () => void; onSalvar: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(a.relEmendas);
  const [busca, setBusca] = useState('');
  const tag = normTag(a.equipamento);
  const q = normTag(busca);
  // mesma TAG primeiro, depois a data mais próxima
  const lista = [...rels]
    .filter((r) => !q || normTag(r.tag).includes(q) || r.om.includes(busca.trim()) || r.numero === busca.trim())
    .sort((x, y) => Number(normTag(y.tag) === tag) - Number(normTag(x.tag) === tag) || Math.abs(diasEntre(a.data, x.data)) - Math.abs(diasEntre(a.data, y.data)))
    .slice(0, 30);
  return (
    <Modal
      title="Vincular relatório de emenda"
      subtitle={`${a.equipamento || '—'} · ${a.area || AREA_INTERNA} · ${dataBr(a.data)}${a.om ? ` · OM ${a.om}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => onSalvar(sel)}>
            Salvar
          </button>
        </>
      }
    >
      <input className="input" type="search" placeholder="Buscar TAG, OM ou nº do relatório" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {lista.length === 0 ? (
        <p className="small muted section-gap">Nenhum relatório no período carregado.</p>
      ) : (
        <ul className="plain-list stack section-gap">
          {lista.map((r) => (
            <li key={r.id}>
              <label className="check">
                <input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} />
                <span>
                  {nomeRel(r)}
                  {normTag(r.tag) === tag && <span className="badge neutral"> mesma TAG</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Uma troca de correia pode ter mais de um relatório (uma emenda em cada ponta): marque todos.</p>
    </Modal>
  );
}

function DispensarDialog({ a, onClose, onSalvar }: { a: Atividade; onClose: () => void; onSalvar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_DISPENSA[0]);
  const [outro, setOutro] = useState('');
  const final = motivo === 'Outro' ? outro.trim() : motivo;
  return (
    <Modal
      title="Dispensar relatório"
      subtitle={`${a.equipamento || '—'} · ${dataBr(a.data)} · ${a.tipo}`}
      size="small"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={!final} onClick={() => onSalvar(final.slice(0, 200))}>
            Dispensar
          </button>
        </>
      }
    >
      <div className="stack" role="radiogroup" aria-label="Motivo">
        {MOTIVOS_DISPENSA.map((m) => (
          <label key={m} className="check">
            <input type="radio" name="motivo-dispensa" checked={motivo === m} onChange={() => setMotivo(m)} />
            {m}
          </label>
        ))}
        {motivo === 'Outro' && <input className="input" maxLength={200} placeholder="Descreva o motivo" value={outro} onChange={(e) => setOutro(e.target.value)} />}
      </div>
    </Modal>
  );
}
