import { useState } from 'react';
import { horasPorEquipamento, somarPerdas, type Perda } from './atrasosProg';
import { AREA_INTERNA, fmtHH, nomeClasse, type Atividade, type OcorrenciaEmergencia } from './model';

const br = (d: string) => d.split('-').reverse().join('/');
const curto = (d: string) => br(d).slice(0, 5);

/**
 * Detalhe de um indicador (drill-through): as atividades que formam o número clicado.
 * Uma linha por atividade (registro do dia), mais recentes primeiro.
 */
export function DetalheAtividades({ titulo, lista, onFechar }: { titulo: string; lista: Atividade[]; onFechar: () => void }) {
  const l = [...lista].sort((a, b) => b.data.localeCompare(a.data) || (a.area || '').localeCompare(b.area || ''));
  return (
    <section className="painel-bloco detalhe-ind" aria-live="polite">
      <div className="bloco-topo">
        <h3>
          🔎 {titulo} <span className="badge neutral num">{l.length}</span>
        </h3>
        <button type="button" className="btn small" onClick={onFechar}>
          ✕ Limpar seleção
        </button>
      </div>
      {l.length === 0 ? (
        <p className="muted small">Nenhuma atividade nesta seleção.</p>
      ) : (
        <div className="table-wrap">
          <table className="detalhe-tab">
            <thead>
              <tr>
                <th>Data</th>
                <th>Área</th>
                <th>Equipamento</th>
                <th>OM</th>
                <th className="col-larga">Serviço</th>
                <th>Classificação</th>
                <th>Pessoas</th>
              </tr>
            </thead>
            <tbody>
              {l.map((a) => (
                <tr key={a.id}>
                  <td data-label="Data" className="num">{br(a.data)}</td>
                  <td data-label="Área" className="small">{a.area || AREA_INTERNA}</td>
                  <td data-label="Equipamento">
                    <b>{a.equipamento || '—'}</b>
                  </td>
                  <td data-label="OM" className="num small">{a.om || <span className="muted">sem OM</span>}</td>
                  <td data-label="Serviço" className="col-larga small">
                    {a.tipo}
                    {a.descricao && <span className="muted"> — {a.descricao}</span>}
                    {a.classe === 'cancelada' && a.motivo && <div className="muted">Motivo: {a.motivo}</div>}
                  </td>
                  <td data-label="Classificação">
                    <span className={'pill cl-' + (a.classe || 'sem')}>{nomeClasse(a.classe)}</span>
                  </td>
                  <td data-label="Pessoas" className="num">{a.classe === 'cancelada' ? '—' : a.pessoas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Detalhe das emergências por OM: cada OM uma vez, com os dias trabalhados nela. */
export function DetalheEmergenciasOm({ titulo, ocorrencias, onFechar }: { titulo: string; ocorrencias: OcorrenciaEmergencia[]; onFechar: () => void }) {
  const diasOm = ocorrencias.reduce((s, g) => s + g.dias.length, 0);
  return (
    <section className="painel-bloco detalhe-ind" aria-live="polite">
      <div className="bloco-topo">
        <h3>
          🔎 {titulo} <span className="badge neutral num">{ocorrencias.length} OM(s) · {diasOm} dia(s)-OM</span>
        </h3>
        <button type="button" className="btn small" onClick={onFechar}>
          ✕ Limpar seleção
        </button>
      </div>
      {ocorrencias.length === 0 ? (
        <p className="muted small">Nenhuma emergência nesta seleção.</p>
      ) : (
        <div className="table-wrap">
          <table className="detalhe-tab">
            <thead>
              <tr>
                <th>OM</th>
                <th>Área</th>
                <th>Equipamento</th>
                <th>Dias trabalhados</th>
                <th className="col-larga">Datas</th>
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map((g) => (
                <tr key={g.chave}>
                  <td data-label="OM" className="num">{g.om || <span className="muted">sem OM</span>}</td>
                  <td data-label="Área" className="small">{g.area}</td>
                  <td data-label="Equipamento">
                    <b>{g.equipamento || '—'}</b>
                  </td>
                  <td data-label="Dias" className="num">
                    <b>{g.dias.length}</b>
                  </td>
                  <td data-label="Datas" className="col-larga small num">{g.dias.map(curto).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">
        Cada OM conta uma vez, mesmo trabalhada em vários dias. Sem número de OM, registros da mesma área e do mesmo equipamento contam como uma ocorrência. Dias-OM = soma dos
        dias trabalhados em cada OM.
      </p>
    </section>
  );
}

/** Detalhe das horas perdidas: atrasos registrados na Escala e cancelamentos com a equipe mobilizada. */
export function DetalhePerdas({ titulo, perdas, onFechar }: { titulo: string; perdas: Perda[]; onFechar: () => void }) {
  const t = somarPerdas(perdas);
  const eq = horasPorEquipamento(perdas);
  const h = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return (
    <section className="painel-bloco detalhe-ind" aria-live="polite">
      <div className="bloco-topo">
        <h3>
          🔎 {titulo} <span className="badge neutral num">{fmtHH(t.hh)} · {h(t.horas)} parado</span>
        </h3>
        <button type="button" className="btn small" onClick={onFechar}>
          ✕ Limpar seleção
        </button>
      </div>
      <p className="small muted">
        Atrasos: {t.atrasos} ({fmtHH(t.hhAtrasos)} · {h(t.horasAtrasos)}) · Cancelamentos com equipe mobilizada: {t.cancelamentos} ({fmtHH(t.hhCancel)}). HH = horas × pessoas
        na atividade (alocadas na Escala; sem Escala, as da programação). Atraso ainda sem horário de fim não entra.
      </p>
      {eq.length > 0 && (
        <>
          <h4>Horas paradas por equipamento</h4>
          <ul className="hbars">
            {eq.slice(0, 8).map((g) => (
              <li key={g.chave} className="hbar" title={`${g.chave}: ${h(g.horas)} · ${fmtHH(g.hh)}`}>
                <span className="hbar-nome">{g.chave}</span>
                <span className="hbar-trilho">
                  <span className="hbar-pilha" style={{ width: `${(g.horas / eq[0].horas) * 100}%` }}>
                    <span className="seg-area a-perda" style={{ flexGrow: 1 }} />
                  </span>
                  <span className="hbar-valor num">
                    {h(g.horas)} · {fmtHH(g.hh)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {perdas.length === 0 ? (
        <p className="muted small">Nenhum atraso ou cancelamento com equipe mobilizada nesta seleção.</p>
      ) : (
        <div className="table-wrap">
          <table className="detalhe-tab">
            <thead>
              <tr>
                <th>Data</th>
                <th>Equipamento</th>
                <th>OM</th>
                <th className="col-larga">Motivo</th>
                <th>Horário</th>
                <th>Horas</th>
                <th>Pessoas</th>
                <th>HH</th>
              </tr>
            </thead>
            <tbody>
              {perdas.map((p) => (
                <tr key={p.id}>
                  <td data-label="Data" className="num">
                    {p.data ? br(p.data) : '—'}
                  </td>
                  <td data-label="Equipamento">
                    <b>{p.equipamento || '—'}</b>
                    <div className="small muted">{p.area || p.atividade}</div>
                  </td>
                  <td data-label="OM" className="num small">
                    {p.om || <span className="muted">{p.semVinculo ? 'só na Escala' : 'sem OM'}</span>}
                  </td>
                  <td data-label="Motivo" className="col-larga small">
                    <span className={'pill ' + (p.origem === 'atraso' ? 'cl-nao_programada' : 'cl-cancelada')}>{p.origem === 'atraso' ? 'Atraso' : 'Cancelamento'}</span> {p.motivo}
                  </td>
                  <td data-label="Horário" className="num small">
                    {p.faixas || (p.inicio && p.fim ? `${p.inicio}–${p.fim}` : '—')}
                  </td>
                  <td data-label="Horas" className="num">
                    {h(p.horas)}
                  </td>
                  <td data-label="Pessoas" className="num">
                    {p.pessoas || '—'}
                  </td>
                  <td data-label="HH" className="num">
                    <b>{fmtHH(p.hh)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Botão "Ver as N atividades" dentro do detalhe de um gráfico: abre a lista completa ali mesmo. */
export function VerAtividades({ titulo, lista }: { titulo: string; lista: Atividade[] }) {
  const [aberto, setAberto] = useState(false);
  if (!lista.length) return null;
  return aberto ? (
    <DetalheAtividades titulo={titulo} lista={lista} onFechar={() => setAberto(false)} />
  ) : (
    <button type="button" className="btn small" onClick={() => setAberto(true)}>
      🔎 Ver as {lista.length} atividade(s)
    </button>
  );
}
