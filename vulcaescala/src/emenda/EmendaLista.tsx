import { useEffect, useMemo, useState } from 'react';
import { newId } from '../domain/ids';
import { useToast } from '../ui/Toast';
import { irPara, useEmenda } from './context';
import { buscarTag, criarEmenda, ouvirMes } from './data';
import { fmtData, hojeIso, mesAtual, nomeMes, novaEmenda, ordenar, somaMes, type Emenda } from './model';
import { ListasDialog } from './ListasDialog';
import { EfetivoDialog } from './EfetivoDialog';

const MES_KEY = 'vulcaescala:emenda-mes';

function mesInicial(): string {
  try {
    const m = sessionStorage.getItem(MES_KEY);
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  } catch {
    /* ignore */
  }
  return mesAtual();
}

/** Relatórios organizados por mês: só o mês escolhido é carregado da nuvem. */
export function EmendaLista() {
  const { api, por, setPendencia } = useEmenda();
  const toast = useToast();
  const [ym, setYm] = useState(mesInicial);
  const [lista, setLista] = useState<Emenda[] | null>(null);
  const [busca, setBusca] = useState('');
  const [global, setGlobal] = useState<Emenda[] | null>(null);
  const [listasOpen, setListasOpen] = useState(false);
  const [efetivoOpen, setEfetivoOpen] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(MES_KEY, ym);
    } catch {
      /* ignore */
    }
    setLista(null);
    return ouvirMes(
      api,
      ym,
      (l, p) => {
        setLista(ordenar(l));
        setPendencia(p.pendente, p.offline);
      },
      () => {
        setLista([]);
        toast('Não foi possível carregar as emendas (verifique as regras do Firebase).', 'danger');
      },
    );
  }, [api, ym, setPendencia, toast]);

  const q = busca.trim().toUpperCase();
  const filtrada = useMemo(
    () => (lista ?? []).filter((e) => !q || e.tag.toUpperCase().includes(q) || e.numero.includes(q) || e.om.toUpperCase().includes(q)),
    [lista, q],
  );

  const nova = async () => {
    const hoje = hojeIso();
    const e = novaEmenda(newId(), ym === mesAtual() ? hoje : `${ym}-01`, por);
    void criarEmenda(api, e).catch(() => toast('Falha ao criar na nuvem; ficou salvo neste aparelho.', 'warn'));
    irPara(`#/e/${e.id}`);
  };

  const buscarTodos = async () => {
    try {
      const r = await buscarTag(api, q);
      setGlobal(ordenar(r));
    } catch {
      toast('Busca indisponível sem conexão.', 'warn');
    }
  };

  return (
    <section>
      <div className="card pad stack">
        <div className="row between">
          <h1>Relatórios de emenda</h1>
          <div className="row nowrap">
            <button className="btn small" onClick={() => setEfetivoOpen(true)}>
              Efetivo…
            </button>
            <button className="btn small" onClick={() => setListasOpen(true)}>
              Materiais…
            </button>
          </div>
        </div>
        <div className="mes-nav">
          <button className="btn" onClick={() => setYm((m) => somaMes(m, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <label className="mes-atual">
            <span className="sr-only">Escolher mês</span>
            <input
              type="month"
              className="input"
              value={ym}
              onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && setYm(e.target.value)}
              aria-label="Escolher mês"
            />
            <strong>{nomeMes(ym)}</strong>
          </label>
          <button className="btn" onClick={() => setYm((m) => somaMes(m, 1))} aria-label="Próximo mês">
            ›
          </button>
        </div>
        {ym !== mesAtual() && (
          <button className="link small" onClick={() => setYm(mesAtual())}>
            Voltar para o mês atual
          </button>
        )}
        <button className="btn primary" onClick={nova}>
          + Nova emenda
        </button>
      </div>

      <div className="card pad stack">
        <input
          className="input"
          type="search"
          placeholder="Buscar TAG, nº da emenda ou OM no mês"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setGlobal(null);
          }}
          aria-label="Buscar"
        />
        {q && (
          <button className="link small" onClick={buscarTodos}>
            Buscar a TAG “{q}” em todos os meses
          </button>
        )}
        {global && (
          <div className="stack">
            <h3>
              TAG “{q}” em todos os meses: <span className="num">{global.length}</span>
            </h3>
            <ul className="plain-list emenda-list">
              {global.map((e) => (
                <EmendaItem key={e.id} e={e} />
              ))}
            </ul>
            <hr />
          </div>
        )}
        <p className="small muted tabnum">
          {lista === null ? 'Carregando…' : `${filtrada.length} de ${lista.length} emenda(s) em ${nomeMes(ym)}`}
        </p>
        <ul className="plain-list emenda-list">
          {filtrada.map((e) => (
            <EmendaItem key={e.id} e={e} />
          ))}
        </ul>
        {lista && lista.length === 0 && <p className="muted small">Nenhuma emenda neste mês.</p>}
      </div>
      {listasOpen && <ListasDialog onClose={() => setListasOpen(false)} />}
      {efetivoOpen && <EfetivoDialog onClose={() => setEfetivoOpen(false)} />}
    </section>
  );
}

function EmendaItem({ e }: { e: Emenda }) {
  const assinaturas = [e.libTecnico.assinatura, e.libSupervisor.assinatura].filter(Boolean).length;
  return (
    <li>
      <button className="emenda-item" onClick={() => irPara(`#/e/${e.id}`)}>
        <span className="grow">
          <strong>
            Emenda nº {e.numero || '?'} — TAG {e.tag || '?'}
          </strong>
          <span className="small muted">
            {fmtData(e.data)} · {e.tipoCorreia} · {e.tipoEmenda}
            {e.om ? ` · OM ${e.om}` : ''}
          </span>
        </span>
        <span className={'badge ' + (assinaturas === 2 ? 'ok' : 'neutral')} title="Liberações assinadas">
          ✍ {assinaturas}/2
        </span>
      </button>
    </li>
  );
}
