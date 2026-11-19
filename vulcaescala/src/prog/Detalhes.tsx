import { AREA_INTERNA, nomeClasse, type Atividade, type OcorrenciaEmergencia } from './model';

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
