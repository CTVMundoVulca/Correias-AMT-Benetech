import { useMemo, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useOms, useProg } from './context';
import { gravarOms } from './data';
import { dataBr } from './Solicitar';
import { SITUACOES, contarOms, diasEntre, hojeIso, semAcento, type OmInfo, type SituacaoOm } from './model';

type Filtro = SituacaoOm | 'pendentes' | 'todas';

/**
 * Controle de baixa das OMs: retorno da supervisão (executada) → baixa da programação (encerrada).
 * Todos consultam; só administradores registram.
 */
export function Oms() {
  const { api, por, isAdmin } = useProg();
  const toast = useToast();
  const confirm = useConfirm();
  const oms = useOms();
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const hoje = hojeIso();

  const todas = useMemo(() => [...(oms?.values() ?? [])], [oms]);
  const cont = contarOms(todas);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim().toUpperCase());
    return todas
      .filter((o) => !o.cancelada || filtro === 'todas')
      .filter((o) =>
        filtro === 'todas' ? true : filtro === 'pendentes' ? o.situacao === 'aberta' || o.situacao === 'retornada' : o.situacao === filtro,
      )
      .filter((o) => !q || semAcento(`${o.om} ${o.equipamento} ${o.area} ${o.descricao}`.toUpperCase()).includes(q))
      .sort((a, b) => a.ultimaData.localeCompare(b.ultimaData) || a.om.localeCompare(b.om));
  }, [todas, filtro, busca]);

  const mudar = (alvo: OmInfo[], situacao: SituacaoOm) => {
    const agora = new Date().toISOString();
    const novas = alvo.map((o) => {
      const x: OmInfo = { ...o, situacao };
      if (situacao === 'aberta') Object.assign(x, { retornoEm: '', retornoPor: '', baixaEm: '', baixaPor: '' });
      if (situacao === 'retornada') Object.assign(x, { retornoEm: o.retornoEm || agora, retornoPor: o.retornoPor || por, baixaEm: '', baixaPor: '' });
      if (situacao === 'baixada')
        Object.assign(x, { retornoEm: o.retornoEm || agora, retornoPor: o.retornoPor || por, baixaEm: agora, baixaPor: por });
      return x;
    });
    gravarOms(api, novas, por).catch(() => toast('A nuvem recusou a alteração.', 'danger'));
    toast(novas.length === 1 ? 'OM atualizada' : `${novas.length} OMs atualizadas`);
    setSel(new Set());
  };

  const baixarSelecionadas = async () => {
    const alvo = lista.filter((o) => sel.has(o.om));
    if (!alvo.length) return;
    const ok = await confirm({
      title: `Dar baixa em ${alvo.length} OM(s)?`,
      message: <p>Registra o retorno da supervisão (se faltar) e a baixa da programação com a data de hoje e o seu e-mail.</p>,
      confirmLabel: 'Dar baixa',
    });
    if (ok) mudar(alvo, 'baixada');
  };

  const filtros: { id: Filtro; nome: string; n: number }[] = [
    { id: 'pendentes', nome: 'Pendentes', n: cont.aberta + cont.retornada },
    { id: 'aberta', nome: 'Aguard. retorno', n: cont.aberta },
    { id: 'retornada', nome: 'Aguard. baixa', n: cont.retornada },
    { id: 'baixada', nome: 'Baixadas', n: cont.baixada },
    { id: 'sem_registro', nome: 'Sem registro', n: cont.sem_registro },
  ];

  return (
    <div className="stack prog">
      <section className="card pad stack">
        <h2>Controle de OMs</h2>
        <p className="small muted">
          Fluxo: a supervisão devolve a OM como executada (<b>retorno</b>) e a programação encerra no SAP (<b>baixa</b>). “Sem registro” = OMs da
          planilha antes da semana 10, quando o controle de retorno ainda não existia.
        </p>
        <div className="segmented">
          {filtros.map((f) => (
            <button key={f.id} className={'seg' + (filtro === f.id ? ' on' : '')} onClick={() => setFiltro(f.id)}>
              {f.nome} <span className="num">({f.n})</span>
            </button>
          ))}
        </div>
        <input className="input" type="search" placeholder="Buscar OM, equipamento, área…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {isAdmin && sel.size > 0 && (
          <div className="row">
            <button className="btn primary" onClick={() => void baixarSelecionadas()}>
              Dar baixa nas {sel.size} selecionadas
            </button>
            <button className="btn" onClick={() => setSel(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}
      </section>

      {oms === null ? (
        <p className="muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="muted">Nenhuma OM neste filtro.</p>
      ) : (
        <ul className="plain-list stack">
          {isAdmin && (
            <li>
              <label className="check small">
                <input
                  type="checkbox"
                  checked={lista.length > 0 && lista.every((o) => sel.has(o.om))}
                  onChange={(e) => setSel(e.target.checked ? new Set(lista.map((o) => o.om)) : new Set())}
                />{' '}
                Selecionar todas as {lista.length} desta lista
              </label>
            </li>
          )}
          {lista.slice(0, 300).map((o) => {
            const atraso = o.situacao !== 'baixada' && o.ultimaData < hoje ? diasEntre(o.ultimaData, hoje) : 0;
            return (
              <li key={o.om} className="card pad om-item">
                <div className="row between nowrap">
                  <label className="row nowrap om-num">
                    {isAdmin && (
                      <input
                        type="checkbox"
                        checked={sel.has(o.om)}
                        aria-label={`Selecionar OM ${o.om}`}
                        onChange={(e) =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(o.om);
                            else n.delete(o.om);
                            return n;
                          })
                        }
                      />
                    )}
                    <b className="num">{o.om}</b>
                  </label>
                  <span className={'badge sit-' + o.situacao}>{SITUACOES.find((s) => s.id === o.situacao)?.nome}</span>
                </div>
                <div>
                  <b>{o.equipamento || '—'}</b> · {o.area || 'sem área'} — {o.descricao}
                </div>
                <div className="small muted">
                  Programada {o.primeiraData === o.ultimaData ? `em ${dataBr(o.primeiraData)}` : `de ${dataBr(o.primeiraData)} a ${dataBr(o.ultimaData)}`}
                  {atraso > 0 && (o.situacao === 'aberta' || o.situacao === 'retornada') && <b className="text-pend"> · há {atraso} dia(s)</b>}
                  {o.retornoEm && ` · retorno ${new Date(o.retornoEm).toLocaleDateString('pt-BR')}${o.retornoPor ? ` (${o.retornoPor})` : ''}`}
                  {o.baixaEm && ` · baixa ${new Date(o.baixaEm).toLocaleDateString('pt-BR')}${o.baixaPor ? ` (${o.baixaPor})` : ''}`}
                  {o.cancelada && ' · cancelada'}
                </div>
                {isAdmin && (
                  <div className="row">
                    {(o.situacao === 'aberta' || o.situacao === 'sem_registro') && (
                      <button className="btn small" onClick={() => mudar([o], 'retornada')}>
                        ✓ Retorno da supervisão
                      </button>
                    )}
                    {o.situacao !== 'baixada' && (
                      <button className="btn small primary" onClick={() => mudar([o], 'baixada')}>
                        ✓ Baixa da programação
                      </button>
                    )}
                    {(o.situacao === 'retornada' || o.situacao === 'baixada') && (
                      <button className="link small" onClick={() => mudar([o], o.situacao === 'baixada' ? 'retornada' : 'aberta')}>
                        Desfazer
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {lista.length > 300 && <li className="muted small">Mostrando 300 de {lista.length}. Use a busca para encontrar uma OM.</li>}
        </ul>
      )}
    </div>
  );
}
