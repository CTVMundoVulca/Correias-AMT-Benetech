import { useEffect, useMemo, useState } from 'react';
import { newId } from '../domain/ids';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { irPara, podeExcluir, useEmenda } from './context';
import { buscarTag, excluirEmenda, ouvirMes } from './data';
import { emendaVazia, fmtData, hojeIso, mesAtual, nomeMes, ordenar, somaMes, type Emenda } from './model';
import { ouvirFotos } from './data';
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
  const ctx = useEmenda();
  const { api, setPendencia, lideranca } = ctx;
  const toast = useToast();
  const confirm = useConfirm();
  // seleção de vários relatórios para excluir de uma vez
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);
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

  const excluiveis = filtrada.filter((e) => podeExcluir(ctx, e));
  const sairSelecao = () => {
    setSelecionando(false);
    setSel(new Set());
  };
  // ao trocar de mês ou buscar, a seleção recomeça
  useEffect(() => setSel(new Set()), [ym, q]);
  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todosMarcados = excluiveis.length > 0 && excluiveis.every((e) => sel.has(e.id));
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(excluiveis.map((e) => e.id)));

  const excluirSelecionados = async () => {
    const alvo = (lista ?? []).filter((e) => sel.has(e.id) && podeExcluir(ctx, e));
    if (!alvo.length) return;
    const ok = await confirm({
      title: `Excluir ${alvo.length} relatório(s)?`,
      message: (
        <>
          <p>Os relatórios abaixo e todas as fotos deles serão apagados para todos. Não há como desfazer.</p>
          <ul className="small">
            {alvo.slice(0, 8).map((e) => (
              <li key={e.id}>
                Emenda nº {e.numero || '?'} — TAG {e.tag || '?'} ({fmtData(e.data)})
              </li>
            ))}
            {alvo.length > 8 && <li>… e mais {alvo.length - 8}</li>}
          </ul>
        </>
      ),
      confirmLabel: `Excluir ${alvo.length}`,
      danger: true,
      requireText: 'EXCLUIR',
    });
    if (!ok) return;
    setExcluindo(true);
    let n = 0;
    for (const e of alvo) {
      try {
        await excluirEmenda(api, e.id);
        n++;
      } catch {
        /* sem internet ou sem permissão: segue com os outros */
      }
    }
    setExcluindo(false);
    sairSelecao();
    if (n === alvo.length) toast(`${n} relatório(s) excluído(s)`);
    else toast(`${n} de ${alvo.length} excluído(s). Os outros precisam de internet ou de permissão.`, 'warn');
  };

  const nova = async () => {
    const hoje = hojeIso();
    // não grava nada agora: o relatório só é criado quando algo for preenchido
    irPara(`#/n/${newId()}/${ym === mesAtual() ? hoje : `${ym}-01`}`);
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
        <div className="row between">
          <p className="small muted tabnum">
            {lista === null ? 'Carregando…' : `${filtrada.length} de ${lista.length} emenda(s) em ${nomeMes(ym)}`}
          </p>
          {excluiveis.length > 0 && !selecionando && (
            <button className="btn small" onClick={() => setSelecionando(true)}>
              Selecionar
            </button>
          )}
        </div>
        {selecionando && (
          <div className="sel-bar" role="toolbar" aria-label="Relatórios selecionados">
            <div className="sel-top">
              <label className="row nowrap small">
                <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} /> Todos ({excluiveis.length})
              </label>
              <span className="small tabnum sel-count">{sel.size} selecionado(s)</span>
            </div>
            <div className="sel-acoes">
              <button className="btn small" onClick={sairSelecao}>
                Cancelar
              </button>
              <button className="btn small danger" disabled={!sel.size || excluindo} onClick={excluirSelecionados}>
                {excluindo ? 'Excluindo…' : `Excluir (${sel.size})`}
              </button>
            </div>
          </div>
        )}
        {lideranca && lista && <LimparVazios lista={lista} />}
        <ul className="plain-list emenda-list">
          {filtrada.map((e) => (
            <EmendaItem
              key={e.id}
              e={e}
              selecao={selecionando ? { marcado: sel.has(e.id), alternar: () => alternar(e.id) } : undefined}
            />
          ))}
        </ul>
        {lista && lista.length === 0 && <p className="muted small">Nenhuma emenda neste mês.</p>}
      </div>
      {listasOpen && <ListasDialog onClose={() => setListasOpen(false)} />}
      {efetivoOpen && <EfetivoDialog onClose={() => setEfetivoOpen(false)} />}
    </section>
  );
}

/** Liderança: exclui de uma vez os relatórios vazios do mês (abertos e nunca preenchidos). */
function LimparVazios({ lista }: { lista: Emenda[] }) {
  const { api } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  const vazias = lista.filter(emendaVazia);
  if (!vazias.length) return null;
  const limpar = async () => {
    const ok = await confirm({
      title: `Excluir ${vazias.length} relatório(s) vazio(s)?`,
      message: <p>São relatórios abertos sem nenhuma informação preenchida. Os que têm fotos são mantidos.</p>,
      confirmLabel: 'Excluir vazios',
      danger: true,
    });
    if (!ok) return;
    let n = 0;
    for (const e of vazias) {
      // confere as fotos antes: relatório com foto não é "vazio"
      const temFoto = await new Promise<boolean>((res) => {
        const u = ouvirFotos(api, e.id, (f) => (u(), res(f.length > 0)), () => res(true));
      });
      if (temFoto) continue;
      try {
        await excluirEmenda(api, e.id);
        n++;
      } catch {
        /* sem internet ou sem permissão: segue */
      }
    }
    toast(n ? `${n} relatório(s) vazio(s) excluído(s)` : 'Nenhum relatório excluído', n ? 'ok' : 'warn');
  };
  return (
    <div className="banner warn row between">
      <span className="small">{vazias.length} relatório(s) vazio(s) neste mês</span>
      <button className="btn small" onClick={limpar}>
        Excluir vazios
      </button>
    </div>
  );
}

/** Confirma e exclui (relatório + fotos). Usado na lista e no editor. */
export function useExcluirEmenda() {
  const { api } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  return async (e: Emenda): Promise<boolean> => {
    const ok = await confirm({
      title: 'Excluir este relatório?',
      message: (
        <p>
          Emenda nº {e.numero || '?'} — TAG {e.tag || '?'} ({fmtData(e.data)}) e todas as fotos serão apagadas para todos. Não há como
          desfazer.
        </p>
      ),
      confirmLabel: 'Excluir',
      danger: true,
      requireText: 'EXCLUIR',
    });
    if (!ok) return false;
    try {
      await excluirEmenda(api, e.id);
      toast('Relatório excluído');
      return true;
    } catch {
      toast('Não foi possível excluir. É preciso internet, e só quem criou o relatório ou a liderança pode excluir.', 'danger');
      return false;
    }
  };
}

function EmendaItem({ e, selecao }: { e: Emenda; selecao?: { marcado: boolean; alternar: () => void } }) {
  const ctx = useEmenda();
  const excluir = useExcluirEmenda();
  const assinaturas = [e.libTecnico.assinatura, e.libSupervisor.assinatura].filter(Boolean).length;
  const pode = podeExcluir(ctx, e);
  // modo seleção: tocar no relatório marca/desmarca (só os que este aparelho pode excluir)
  if (selecao)
    return (
      <li className="emenda-li">
        <label className={'emenda-item sel' + (selecao.marcado ? ' on' : '') + (pode ? '' : ' off')}>
          <input type="checkbox" checked={selecao.marcado} disabled={!pode} onChange={selecao.alternar} aria-label={`Selecionar emenda nº ${e.numero || '?'} — TAG ${e.tag || '?'}`} />
          <span className="grow">
            <strong>
              Emenda nº {e.numero || '?'} — TAG {e.tag || '?'}
            </strong>
            <span className="small muted">
              {fmtData(e.data)}
              {pode ? '' : ' · sem permissão para excluir'}
            </span>
          </span>
        </label>
      </li>
    );
  return (
    <li className="emenda-li">
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
      {pode && (
        <button className="icon-btn danger" onClick={() => void excluir(e)} aria-label={`Excluir emenda nº ${e.numero || '?'} — TAG ${e.tag || '?'}`} title="Excluir">
          🗑
        </button>
      )}
    </li>
  );
}
