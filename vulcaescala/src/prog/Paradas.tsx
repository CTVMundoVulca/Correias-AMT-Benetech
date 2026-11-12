import { useEffect, useState, type FormEvent } from 'react';
import { newId } from '../domain/ids';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useParadas, useProg } from './context';
import { excluirParada, gravarParada, gravarPedidoParada, ouvirPedidosParada } from './data';
import { dataBr, guardarSolicitante, lembrarSolicitante } from './Solicitar';
import { corDaArea } from './Painel';
import { RecusarDialog } from './RecusarDialog';
import { Fragment } from 'react';
import { MONTHS, WEEKDAYS, WEEKDAYS_SHORT, formatDate, fromIsoDate, locateDay, monthWeeks, toIsoDate } from '../domain/isoWeek';
import { feriadoEm } from '../domain/feriados';
import { DESCRICAO_MAX, EQUIP_MAX, TIPOS_PARADA, hojeIso, limparTexto, maiusculas, type Parada, type PedidoParada, type StatusPedidoParada, type TipoParada } from './model';

/** Calendário + linha do tempo das paradas confirmadas. */
function VistaParadas({ lista }: { lista: Parada[] }) {
  const [vista, setVista] = useState<'cal' | 'linha'>('cal');
  return (
    <section className="card pad">
      <div className="segmented vista-paradas">
        <button className={'seg' + (vista === 'cal' ? ' on' : '')} onClick={() => setVista('cal')}>
          📅 Calendário
        </button>
        <button className={'seg' + (vista === 'linha' ? ' on' : '')} onClick={() => setVista('linha')}>
          ▬ Linha do tempo
        </button>
      </div>
      {vista === 'cal' ? <CalendarioParadas paradas={lista} /> : <MapaParadas paradas={lista} />}
    </section>
  );
}

/** Lista das paradas confirmadas (próximas ou encerradas). */
function ListaParadas({ lista, onEditar }: { lista: Parada[]; onEditar?: (p: Parada) => void }) {
  const [verPassadas, setVerPassadas] = useState(false);
  const hoje = hojeIso();
  const vis = lista
    .filter((p) => (verPassadas ? p.fim < hoje : p.fim >= hoje))
    .sort((a, b) => (verPassadas ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));
  return (
    <>
      <div className="segmented">
        <button className={'seg' + (!verPassadas ? ' on' : '')} onClick={() => setVerPassadas(false)}>
          Em andamento e próximas
        </button>
        <button className={'seg' + (verPassadas ? ' on' : '')} onClick={() => setVerPassadas(true)}>
          Encerradas
        </button>
      </div>
      {vis.length === 0 ? (
        <p className="muted">{verPassadas ? 'Nenhuma parada encerrada.' : 'Nenhuma parada confirmada.'}</p>
      ) : (
        <ul className="plain-list stack">
          {vis.map((p) => {
            const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
            const corpo = (
              <>
                <div className="row between nowrap">
                  <b>
                    {t.icone} {t.nome}
                  </b>
                  {p.inicio <= hoje && hoje <= p.fim && <span className="badge today">Agora</span>}
                </div>
                <div>
                  <span className={'sw-area ' + corDaArea(p.area)} /> <b>{p.area || '—'}</b>
                  {p.equipamento && ` · ${p.equipamento}`}
                </div>
                <div className="small">{p.inicio === p.fim ? dataBr(p.inicio) : `${dataBr(p.inicio)} a ${dataBr(p.fim)}`}</div>
                {p.descricao && <div className="small muted">{p.descricao}</div>}
              </>
            );
            return (
              <li key={p.id} className={'card parada-item parada-' + p.tipo}>
                {onEditar ? (
                  <button className="ativ-btn pad" onClick={() => onEditar(p)}>
                    {corpo}
                  </button>
                ) : (
                  <div className="pad">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Legenda() {
  return (
    <ul className="legenda-areas grande">
      {TIPOS_PARADA.map((t) => (
        <li key={t.id}>
          <span className={'sw-parada parada-' + t.id}>{t.icone}</span> {t.nome}
        </li>
      ))}
    </ul>
  );
}

const STATUS_PEDIDO: Record<StatusPedidoParada, { nome: string; cls: string }> = {
  pendente: { nome: 'A confirmar', cls: 'pend' },
  confirmada: { nome: 'Confirmada', cls: 'ok' },
  recusada: { nome: 'Recusada', cls: 'danger' },
  cancelada: { nome: 'Cancelada', cls: 'neutral' },
};

/** PAINEL: todos veem o calendário de paradas confirmadas e as áreas informam as suas. */
export function ParadasPainel() {
  const { api, uid, areas } = useProg();
  const toast = useToast();
  const confirm = useConfirm();
  const lista = useParadas();
  const salvo = lembrarSolicitante();
  const [tipo, setTipo] = useState<TipoParada>('geral');
  const [area, setArea] = useState(salvo.area);
  const [equipamento, setEquipamento] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [descricao, setDescricao] = useState('');
  const [solicitante, setSolicitante] = useState(salvo.solicitante);
  const [contato, setContato] = useState(salvo.contato);
  const [pedidos, setPedidos] = useState<PedidoParada[]>([]);
  const [filtro, setFiltro] = useState<'minhas' | 'todas'>('minhas');
  useEffect(() => ouvirPedidosParada(api, new Date(Date.now() - 120 * 86_400_000).toISOString(), setPedidos), [api]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const agora = new Date().toISOString();
    const p: PedidoParada = {
      id: newId(),
      tipo,
      area: limparTexto(area, 60),
      equipamento: maiusculas(equipamento, EQUIP_MAX),
      descricao: limparTexto(descricao, DESCRICAO_MAX),
      inicio,
      fim: fim && fim >= inicio ? fim : inicio,
      solicitante: limparTexto(solicitante, 80),
      contato: limparTexto(contato, 80),
      criadoUid: uid,
      criadoEm: agora,
      status: 'pendente',
      resposta: '',
      atualizadoEm: agora,
      atualizadoPor: 'anônimo',
    };
    if (!p.area) return toast('Escolha a área.', 'warn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio)) return toast('Informe o início da parada.', 'warn');
    if (!p.solicitante) return toast('Informe seu nome.', 'warn');
    guardarSolicitante(p.solicitante, p.contato, p.area);
    gravarPedidoParada(api, p).catch(() => toast('A nuvem recusou o envio. Confira os campos.', 'danger'));
    toast('Parada enviada; a programação vai confirmar');
    setEquipamento('');
    setInicio('');
    setFim('');
    setDescricao('');
    setFiltro('minhas');
  };
  const cancelar = async (p: PedidoParada) => {
    if (!(await confirm({ title: 'Cancelar o envio desta parada?', message: <p>{p.area}</p>, confirmLabel: 'Cancelar envio', danger: true }))) return;
    gravarPedidoParada(api, { ...p, status: 'cancelada', atualizadoEm: new Date().toISOString(), atualizadoPor: 'anônimo' }).catch(() =>
      toast('Não foi possível cancelar.', 'danger'),
    );
  };
  const vis = pedidos.filter((p) => filtro === 'todas' || p.criadoUid === uid);

  return (
    <div className="stack prog">
      <section className="card pad stack">
        <h2>Calendário de paradas</h2>
        <p className="small muted">Paradas das áreas confirmadas pela programação. A sua área vai parar? Informe abaixo.</p>
        <Legenda />
      </section>
      <VistaParadas lista={lista} />

      <form className="card pad stack" onSubmit={enviar}>
        <h3>Informar parada da área</h3>
        <div className="segmented" role="radiogroup" aria-label="Tipo de parada">
          {TIPOS_PARADA.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} className={'seg' + (tipo === t.id ? ' on' : '')} onClick={() => setTipo(t.id)}>
              {t.icone} {t.nome}
            </button>
          ))}
        </div>
        <label className="field">
          Área
          <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Escolha…</option>
            {areas.map((a) => (
              <option key={a.nome}>{a.nome}</option>
            ))}
            {area && !areas.some((a) => a.nome === area) && <option>{area}</option>}
          </select>
        </label>
        <label className="field">
          Equipamento (opcional)
          <input className="input" value={equipamento} maxLength={EQUIP_MAX} onChange={(e) => setEquipamento(e.target.value)} />
        </label>
        <div className="two-cols">
          <label className="field">
            Início
            <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="field">
            Fim
            <input className="input" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Observação (opcional)
          <textarea className="input" rows={2} maxLength={DESCRICAO_MAX} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <div className="two-cols">
          <label className="field">
            Seu nome
            <input className="input" value={solicitante} maxLength={80} autoComplete="name" onChange={(e) => setSolicitante(e.target.value)} />
          </label>
          <label className="field">
            Ramal / telefone (opcional)
            <input className="input" value={contato} maxLength={80} onChange={(e) => setContato(e.target.value)} />
          </label>
        </div>
        <button className="btn primary" type="submit">
          Enviar para a programação
        </button>
      </form>

      <section className="card pad stack">
        <div className="row between">
          <h3>Paradas enviadas</h3>
          <div className="segmented">
            <button className={'seg' + (filtro === 'minhas' ? ' on' : '')} onClick={() => setFiltro('minhas')}>
              Deste aparelho
            </button>
            <button className={'seg' + (filtro === 'todas' ? ' on' : '')} onClick={() => setFiltro('todas')}>
              Todas
            </button>
          </div>
        </div>
        {vis.length === 0 ? (
          <p className="muted small">Nenhuma parada enviada.</p>
        ) : (
          <ul className="plain-list solic-list">
            {vis.map((p) => (
              <li key={p.id} className="solic">
                <div className="row between">
                  <b>
                    {TIPOS_PARADA.find((t) => t.id === p.tipo)?.icone} {p.area}
                    {p.equipamento && ` · ${p.equipamento}`}
                  </b>
                  <span className={'badge ' + STATUS_PEDIDO[p.status].cls}>{STATUS_PEDIDO[p.status].nome}</span>
                </div>
                <div className="small">
                  {p.inicio === p.fim ? dataBr(p.inicio) : `${dataBr(p.inicio)} a ${dataBr(p.fim)}`} · {p.solicitante}
                  {p.contato && ` (${p.contato})`}
                </div>
                {p.descricao && <div className="small muted">{p.descricao}</div>}
                {p.resposta && <div className="small">Programação: {p.resposta}</div>}
                {p.status === 'pendente' && p.criadoUid === uid && (
                  <button className="link small" onClick={() => void cancelar(p)}>
                    Cancelar envio
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** GESTÃO (programador): confirmar as paradas enviadas pelas áreas e lançar/corrigir paradas. */
export function ParadasGestao() {
  const { api, por, pode } = useProg();
  const toast = useToast();
  const lista = useParadas();
  const [pedidos, setPedidos] = useState<PedidoParada[]>([]);
  const [edicao, setEdicao] = useState<{ p: Parada; nova: boolean; pedido?: PedidoParada } | null>(null);
  const [recusando, setRecusando] = useState<PedidoParada | null>(null);
  useEffect(() => ouvirPedidosParada(api, new Date(Date.now() - 120 * 86_400_000).toISOString(), setPedidos), [api]);
  const pendentes = pedidos.filter((p) => p.status === 'pendente').sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (!pode.programar) return <p className="muted">Só a programação confirma e lança paradas.</p>;

  const agora = () => new Date().toISOString();
  const nova = () =>
    setEdicao({
      nova: true,
      p: { id: newId(), tipo: 'geral', area: '', equipamento: '', descricao: '', inicio: hojeIso(), fim: hojeIso(), criadoEm: agora(), criadoPor: por, atualizadoEm: agora(), atualizadoPor: por },
    });
  const comoParada = (x: PedidoParada): Parada => ({
    id: x.id,
    tipo: x.tipo,
    area: x.area,
    equipamento: x.equipamento,
    descricao: x.descricao,
    inicio: x.inicio,
    fim: x.fim,
    criadoEm: x.criadoEm,
    criadoPor: `${x.solicitante} (área)`,
    atualizadoEm: agora(),
    atualizadoPor: por,
  });
  const confirmar = (x: PedidoParada) => {
    gravarParada(api, comoParada(x), por).catch(() => toast('A nuvem recusou a parada.', 'danger'));
    gravarPedidoParada(api, { ...x, status: 'confirmada', atualizadoEm: agora(), atualizadoPor: por }).catch(() => {});
    toast('Parada confirmada no calendário');
  };
  const recusar = (x: PedidoParada, motivo: string) => {
    gravarPedidoParada(api, { ...x, status: 'recusada', resposta: motivo, atualizadoEm: agora(), atualizadoPor: por }).catch(() =>
      toast('Não foi possível recusar.', 'danger'),
    );
    toast('Parada recusada; a área vê o motivo');
  };


  return (
    <div className="stack prog">
      {pendentes.length > 0 && (
        <section className="card pad stack inbox">
          <h3>
            📥 Paradas enviadas pelas áreas <span className="badge pend num">{pendentes.length}</span>
          </h3>
          <ul className="plain-list solic-list">
            {pendentes.map((x) => (
              <li key={x.id} className={'solic'}>
                <div className="row between">
                  <b>
                    {TIPOS_PARADA.find((t) => t.id === x.tipo)?.icone} {x.area}
                    {x.equipamento && ` · ${x.equipamento}`}
                  </b>
                  <span className="small">{TIPOS_PARADA.find((t) => t.id === x.tipo)?.nome}</span>
                </div>
                <div className="small">
                  {x.inicio === x.fim ? dataBr(x.inicio) : `${dataBr(x.inicio)} a ${dataBr(x.fim)}`} · {x.solicitante}
                  {x.contato && ` (${x.contato})`}
                </div>
                {x.descricao && <div className="small muted">{x.descricao}</div>}
                <div className="row">
                  <button className="btn primary small" onClick={() => confirmar(x)}>
                    Confirmar
                  </button>
                  <button className="btn small" onClick={() => setEdicao({ p: comoParada(x), nova: true, pedido: x })}>
                    Ajustar e confirmar
                  </button>
                  <button className="btn small" onClick={() => setRecusando(x)}>
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card pad stack">
        <div className="row between">
          <h2>Paradas confirmadas</h2>
          <button className="btn primary small" onClick={nova}>
            + Parada
          </button>
        </div>
        <Legenda />
      </section>
      <VistaParadas lista={lista} />
      <ListaParadas lista={lista} onEditar={(p) => setEdicao({ p, nova: false })} />
      {recusando && (
        <RecusarDialog
          titulo="Recusar parada"
          resumo={
            <>
              <b>{recusando.area}</b> · {recusando.inicio === recusando.fim ? dataBr(recusando.inicio) : `${dataBr(recusando.inicio)} a ${dataBr(recusando.fim)}`}
            </>
          }
          onRecusar={(m) => recusar(recusando, m)}
          onClose={() => setRecusando(null)}
        />
      )}
      {edicao && (
        <ParadaDialog
          atual={edicao.p}
          nova={edicao.nova}
          onClose={() => setEdicao(null)}
          onSalvo={(p) =>
            edicao.pedido &&
            gravarPedidoParada(api, {
              ...edicao.pedido,
              status: 'confirmada',
              resposta: edicao.pedido.inicio !== p.inicio || edicao.pedido.fim !== p.fim ? `Confirmada com ajuste: ${dataBr(p.inicio)} a ${dataBr(p.fim)}` : '',
              atualizadoEm: agora(),
              atualizadoPor: por,
            }).catch(() => {})
          }
        />
      )}
    </div>
  );
}

function ParadaDialog({ atual, nova, onClose, onSalvo }: { atual: Parada; nova: boolean; onClose: () => void; onSalvo?: (p: Parada) => void }) {
  const { api, por, areas } = useProg();
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState(atual);
  const set = <K extends keyof Parada>(k: K, v: Parada[K]) => setP((x) => ({ ...x, [k]: v }));

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    const x: Parada = { ...p, area: limparTexto(p.area, 60), equipamento: maiusculas(p.equipamento, EQUIP_MAX), descricao: limparTexto(p.descricao, DESCRICAO_MAX) };
    if (!x.area) return toast('Escolha a área.', 'warn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)) return toast('Informe o início.', 'warn');
    if (!x.fim || x.fim < x.inicio) x.fim = x.inicio;
    gravarParada(api, x, por, nova ? undefined : atual.inicio.slice(0, 4)).catch(() => toast('A nuvem recusou a parada.', 'danger'));
    onSalvo?.(x);
    toast(nova ? 'Parada lançada' : 'Parada atualizada');
    onClose();
  };
  const excluir = async () => {
    if (!(await confirm({ title: 'Excluir esta parada?', message: <p>{atual.area}</p>, confirmLabel: 'Excluir', danger: true }))) return;
    excluirParada(api, atual, por).catch(() => toast('Não foi possível excluir.', 'danger'));
    toast('Parada excluída');
    onClose();
  };

  return (
    <Modal
      title={nova ? 'Lançar parada' : 'Parada'}
      onClose={onClose}
      footer={
        <>
          {!nova && (
            <button className="btn ghost-danger" type="button" onClick={() => void excluir()}>
              Excluir
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" form="form-parada">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-parada" className="stack" onSubmit={salvar}>
        <span className="field">Tipo</span>
        <div className="segmented" role="radiogroup" aria-label="Tipo de parada">
          {TIPOS_PARADA.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={p.tipo === t.id} className={'seg' + (p.tipo === t.id ? ' on' : '')} onClick={() => set('tipo', t.id)}>
              {t.icone} {t.nome}
            </button>
          ))}
        </div>
        <label className="field">
          Área
          <select className="input" value={p.area} onChange={(e) => set('area', e.target.value)}>
            <option value="">Escolha…</option>
            {areas.map((a) => (
              <option key={a.nome}>{a.nome}</option>
            ))}
            {p.area && !areas.some((a) => a.nome === p.area) && <option>{p.area}</option>}
          </select>
        </label>
        <label className="field">
          Equipamento (opcional)
          <input className="input" value={p.equipamento} maxLength={EQUIP_MAX} onChange={(e) => set('equipamento', e.target.value)} />
        </label>
        <div className="two-cols">
          <label className="field">
            Início
            <input className="input" type="date" value={p.inicio} onChange={(e) => set('inicio', e.target.value)} />
          </label>
          <label className="field">
            Fim
            <input className="input" type="date" value={p.fim} min={p.inicio} onChange={(e) => set('fim', e.target.value)} />
          </label>
        </div>
        <label className="field">
          Observação (opcional)
          <textarea className="input" rows={2} maxLength={DESCRICAO_MAX} value={p.descricao} onChange={(e) => set('descricao', e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

/**
 * Mapa de paradas do mês: uma linha por área, uma coluna por dia; a barra mostra o período
 * de cada parada com a cor do tipo (geral / intervenção crítica / parcial).
 */
export function MapaParadas({ paradas }: { paradas: Parada[] }) {
  const { feriados } = useProg();
  const hoje = hojeIso();
  const [ym, setYm] = useState(hoje.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const nDias = new Date(y, m, 0).getDate();
  const dias = Array.from({ length: nDias }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const mudar = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const doMes = paradas.filter((p) => p.fim >= dias[0] && p.inicio <= dias[nDias - 1]);
  const porArea = new Map<string, Parada[]>();
  for (const p of doMes) porArea.set(p.area || '—', [...(porArea.get(p.area || '—') ?? []), p]);
  const linhas = [...porArea.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  const col = (d: string) => Math.max(1, Math.min(nDias, Number(d.slice(8)))) ;

  return (
    <div className="mapa-paradas">
      <div className="row between nowrap">
        <button className="btn small" onClick={() => mudar(-1)} aria-label="Mês anterior">
          ‹
        </button>
        <h3 className="center">
          Mapa de paradas — {MONTHS[m - 1]} <span className="num muted">{y}</span>
        </h3>
        <button className="btn small" onClick={() => mudar(1)} aria-label="Próximo mês">
          ›
        </button>
      </div>
      {linhas.length === 0 ? (
        <p className="muted small center">Nenhuma parada neste mês.</p>
      ) : (
        <div className="table-wrap">
          <div className="mp-grade" style={{ gridTemplateColumns: `minmax(96px, 150px) repeat(${nDias}, minmax(22px, 1fr))` }}>
            <span className="mp-canto" />
            {dias.map((d) => {
              const dt = fromIsoDate(d)!;
              const di = locateDay(dt).dayIndex;
              const folga = di >= 5 || !!feriadoEm(feriados, d);
              return (
                <span key={d} className={'mp-dia' + (folga ? ' fds' : '') + (d === hoje ? ' hoje' : '')} title={feriadoEm(feriados, d) ?? undefined}>
                  <span className="mp-dow">{WEEKDAYS_SHORT[di][0]}</span>
                  <span className="num">{d.slice(8)}</span>
                </span>
              );
            })}
            {linhas.map(([area, ps], li) => (
              <div key={area} className="mp-linha" style={{ gridRow: li + 2 }}>
                <span className="mp-area" style={{ gridColumn: 1 }} title={area}>
                  <span className={'sw-area ' + corDaArea(area)} /> {area}
                </span>
                {dias.map((d, i) => (
                  <span key={d} className={'mp-cel' + (d === hoje ? ' hoje' : '')} style={{ gridColumn: i + 2 }} />
                ))}
                {ps.map((p) => {
                  const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
                  const a = p.inicio < dias[0] ? 1 : col(p.inicio);
                  const b = p.fim > dias[nDias - 1] ? nDias : col(p.fim);
                  return (
                    <span
                      key={p.id}
                      className={'mp-barra parada-' + p.tipo}
                      style={{ gridColumn: `${a + 1} / ${b + 2}` }}
                      title={`${t.nome} · ${area}${p.equipamento ? ` · ${p.equipamento}` : ''} · ${dataBr(p.inicio)}${p.fim !== p.inicio ? ` a ${dataBr(p.fim)}` : ''}${p.descricao ? ` — ${p.descricao}` : ''}`}
                    >
                      {t.icone}
                      {b - a >= 2 && <span className="mp-rot">{p.equipamento || t.nome}</span>}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <ul className="legenda-areas">
        {TIPOS_PARADA.map((t) => (
          <li key={t.id}>
            <span className={'sw-parada parada-' + t.id}>{t.icone}</span> {t.nome}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sigla curta da área para o calendário no celular (PÁTIO DE MINÉRIO → PM, ALTO FORNO 1 → AF1). */
export function siglaArea(area: string): string {
  const p = area.split(/\s+/).filter((w) => w && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(w));
  if (p.length <= 1) return (p[0] ?? '—').slice(0, 4);
  return p.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');
}

/** Calendário mensal de paradas: dá a previsão por data e dia da semana. */
export function CalendarioParadas({ paradas }: { paradas: Parada[] }) {
  const { feriados } = useProg();
  const hoje = hojeIso();
  const [mes, setMes] = useState(() => ({ y: Number(hoje.slice(0, 4)), m: Number(hoje.slice(5, 7)) - 1 }));
  const [sel, setSel] = useState(hoje);
  const semanas = monthWeeks(mes.y, mes.m);
  const mudar = (n: number) => setMes(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const doDia = (d: string) =>
    paradas
      .filter((p) => p.inicio <= d && d <= p.fim)
      .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.area.localeCompare(b.area));
  const doSel = doDia(sel);
  const ini = toIsoDate(semanas[0].days[0]);
  const fim = toIsoDate(semanas[semanas.length - 1].days[6]);
  const noMes = paradas.filter((p) => p.fim >= ini && p.inicio <= fim).length;

  return (
    <div className="cal-paradas">
      <div className="row between nowrap">
        <button className="btn small" onClick={() => mudar(-1)} aria-label="Mês anterior">
          ‹
        </button>
        <h3 className="center">
          {MONTHS[mes.m]} <span className="num muted">{mes.y}</span>
          <div className="small muted">{noMes ? `${noMes} parada(s) no mês` : 'Sem paradas no mês'}</div>
        </h3>
        <button className="btn small" onClick={() => mudar(1)} aria-label="Próximo mês">
          ›
        </button>
      </div>
      <div className="cpar-grade" role="grid" aria-label={`Paradas de ${MONTHS[mes.m]}`}>
        <span className="cpar-cab cpar-sem">Sem</span>
        {WEEKDAYS_SHORT.map((d, i) => (
          <span key={d} className={'cpar-cab' + (i >= 5 ? ' fds' : '')}>
            {d}
          </span>
        ))}
        {semanas.map((w) => (
          <Fragment key={w.weekKey}>
            <span className="cpar-sem num">{w.week}</span>
            {w.days.map((dd, i) => {
              const d = toIsoDate(dd);
              const fer = feriadoEm(feriados, d);
              const ps = doDia(d);
              return (
                <button
                  key={d}
                  className={
                    'cpar-dia' +
                    (dd.getUTCMonth() !== mes.m ? ' fora' : '') +
                    (i >= 5 || fer ? ' fds' : '') +
                    (d === hoje ? ' hoje' : '') +
                    (d === sel ? ' sel' : '')
                  }
                  onClick={() => setSel(d)}
                  aria-label={`${WEEKDAYS[i]} ${formatDate(dd)}${fer ? `, feriado ${fer}` : ''}: ${ps.length ? ps.map((p) => `${TIPOS_PARADA.find((t) => t.id === p.tipo)?.nome} ${p.area}`).join(', ') : 'sem paradas'}`}
                >
                  <span className="cpar-num">
                    {dd.getUTCDate()}
                    {fer && <span className="cpar-fer">{fer}</span>}
                  </span>
                  {ps.slice(0, 3).map((p) => (
                    <span
                      key={p.id}
                      className={'cpar-chip parada-' + p.tipo + (p.inicio < d && i > 0 ? ' cont-esq' : '') + (p.fim > d && i < 6 ? ' cont-dir' : '')}
                      title={`${TIPOS_PARADA.find((t) => t.id === p.tipo)?.nome} · ${p.area}`}
                    >
                      <span className="cpar-ico" aria-hidden>
                        {TIPOS_PARADA.find((t) => t.id === p.tipo)?.icone}
                      </span>
                      <span className="cpar-nome">{p.area}</span>
                      <span className="cpar-sigla">{siglaArea(p.area)}</span>
                    </span>
                  ))}
                  {ps.length > 3 && <span className="cpar-mais">+{ps.length - 3}</span>}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <ul className="legenda-areas">
        {TIPOS_PARADA.map((t) => (
          <li key={t.id}>
            <span className={'sw-parada parada-' + t.id}>{t.icone}</span> {t.nome}
          </li>
        ))}
        <li className="muted">Barra emendada = parada de vários dias</li>
      </ul>
      <div className="cpar-detalhe">
        <h3>
          {WEEKDAYS[locateDay(fromIsoDate(sel)!).dayIndex]}, {formatDate(fromIsoDate(sel)!)}
          {feriadoEm(feriados, sel) && <span className="muted small"> · 🎌 {feriadoEm(feriados, sel)}</span>}
        </h3>
        {doSel.length === 0 ? (
          <p className="livre">✓ Nenhuma parada neste dia.</p>
        ) : (
          doSel.map((p) => {
            const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
            return (
              <div key={p.id} className={'parada-faixa parada-' + p.tipo}>
                <b>
                  {t.icone} {t.nome}
                </b>{' '}
                · {p.area}
                {p.equipamento && ` · ${p.equipamento}`}
                <div className="small">
                  {p.inicio === p.fim ? 'Só neste dia' : `${dataBr(p.inicio)} a ${dataBr(p.fim)}`}
                  {p.descricao && ` — ${p.descricao}`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
