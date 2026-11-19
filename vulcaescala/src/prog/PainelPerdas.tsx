import { useState } from 'react';
import { DetalhePerdas } from './Detalhes';
import { equipamentoDaPerda, horasPorEquipamento, motivoDaPerda, perdasPorMotivo, somarPerdas, type Perda } from './atrasosProg';

const num = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const hh = (n: number) => `${num(n, n >= 100 ? 0 : 1)} HH`;
const h = (n: number) => `${num(n)} h`;

type Filtro = { tipo: 'todas' } | { tipo: 'origem'; v: Perda['origem'] } | { tipo: 'motivo'; v: string } | { tipo: 'equip'; v: string };

/**
 * Horas perdidas do período, no estilo de painel: totais, divisão atrasos × cancelamentos,
 * ranking por motivo e por equipamento. Tocar em qualquer parte abre a lista que forma o número.
 */
export function PainelPerdas({ perdas, titulo, carregando = false }: { perdas: Perda[]; titulo: string; carregando?: boolean }) {
  const [f, setF] = useState<Filtro | null>(null);
  const t = somarPerdas(perdas);
  const motivos = perdasPorMotivo(perdas).slice(0, 6);
  const equips = horasPorEquipamento(perdas).slice(0, 6);
  const pAt = t.hh ? (t.hhAtrasos / t.hh) * 100 : 0;
  const igual = (a: Filtro | null, b: Filtro) => JSON.stringify(a) === JSON.stringify(b);
  const alterna = (n: Filtro) => setF((x) => (igual(x, n) ? null : n));
  const filtrada =
    !f || f.tipo === 'todas'
      ? perdas
      : perdas.filter((p) => (f.tipo === 'origem' ? p.origem === f.v : f.tipo === 'motivo' ? motivoDaPerda(p) === f.v : equipamentoDaPerda(p) === f.v));
  const nomeF = !f || f.tipo === 'todas' ? 'Todas as perdas' : f.tipo === 'origem' ? (f.v === 'atraso' ? 'Atrasos' : 'Cancelamentos com equipe mobilizada') : f.v;

  return (
    <section className="painel-bloco b-perdas">
      <div className="bloco-topo">
        <h3>⏳ {titulo}</h3>
        <button type="button" className="link small" onClick={() => alterna({ tipo: 'todas' })}>
          Ver lista completa →
        </button>
      </div>
      {carregando ? (
        <p className="muted small">Carregando atrasos da Escala…</p>
      ) : perdas.length === 0 ? (
        <p className="muted small">Nenhum atraso registrado na Escala nem cancelamento com equipe mobilizada no período.</p>
      ) : (
        <>
          <div className="perdas-tot">
            <button type="button" className={'perdas-num' + (igual(f, { tipo: 'todas' }) ? ' on' : '')} onClick={() => alterna({ tipo: 'todas' })}>
              <b className="num">{hh(t.hh)}</b>
              <span>HH perdidas</span>
              <small>horas paradas × pessoas</small>
            </button>
            <button type="button" className={'perdas-num' + (igual(f, { tipo: 'todas' }) ? ' on' : '')} onClick={() => alterna({ tipo: 'todas' })}>
              <b className="num">{h(t.horas)}</b>
              <span>Equipamento parado</span>
              <small>soma das horas paradas</small>
            </button>
            <button type="button" className={'perdas-num' + (igual(f, { tipo: 'origem', v: 'atraso' }) ? ' on' : '')} onClick={() => alterna({ tipo: 'origem', v: 'atraso' })}>
              <b className="num">{t.atrasos}</b>
              <span>Atrasos registrados</span>
              <small>{h(t.horasAtrasos)} · na Escala</small>
            </button>
          </div>

          {/* de onde vem o HH: atrasos × cancelamentos */}
          <div className="perdas-split" role="group" aria-label="HH por origem">
            <button
              type="button"
              className={'ps-seg ps-atraso' + (f && !igual(f, { tipo: 'origem', v: 'atraso' }) && f.tipo !== 'todas' ? ' apagado' : '')}
              style={{ flexGrow: Math.max(t.hhAtrasos, 0.0001) }}
              onClick={() => alterna({ tipo: 'origem', v: 'atraso' })}
              title={`Atrasos: ${hh(t.hhAtrasos)}`}
            />
            <button
              type="button"
              className={'ps-seg ps-canc' + (f && !igual(f, { tipo: 'origem', v: 'cancelamento' }) && f.tipo !== 'todas' ? ' apagado' : '')}
              style={{ flexGrow: Math.max(t.hhCancel, 0.0001) }}
              onClick={() => alterna({ tipo: 'origem', v: 'cancelamento' })}
              title={`Cancelamentos: ${hh(t.hhCancel)}`}
            />
          </div>
          <div className="perdas-leg small">
            <button type="button" className="leg-btn" onClick={() => alterna({ tipo: 'origem', v: 'atraso' })}>
              <span className="sw ps-atraso" /> Atrasos (Escala) <b className="num">{hh(t.hhAtrasos)}</b> <span className="muted num">{Math.round(pAt)}%</span>
            </button>
            <button type="button" className="leg-btn" onClick={() => alterna({ tipo: 'origem', v: 'cancelamento' })}>
              <span className="sw ps-canc" /> Cancelamentos ({t.cancelamentos}) <b className="num">{hh(t.hhCancel)}</b> <span className="muted num">{100 - Math.round(pAt)}%</span>
            </button>
          </div>

          <div className="perdas-rank">
            <div>
              <h4>Por motivo (HH)</h4>
              <ul className="hbars">
                {motivos.map((g) => (
                  <li key={g.chave}>
                    <button type="button" className={'hbar hbar-btn' + (igual(f, { tipo: 'motivo', v: g.chave }) ? ' on' : '')} onClick={() => alterna({ tipo: 'motivo', v: g.chave })} title={`${g.chave}: ${hh(g.hh)} · ${h(g.horas)} · ${g.n} registro(s)`}>
                      <span className="hbar-nome">{g.chave}</span>
                      <span className="hbar-trilho">
                        <span className="hbar-pilha" style={{ width: `${(g.hh / (motivos[0].hh || 1)) * 100}%` }}>
                          <span className={'seg-area ' + (g.origem === 'atraso' ? 'ps-atraso' : 'ps-canc')} style={{ flexGrow: 1 }} />
                        </span>
                        <span className="hbar-valor num">{hh(g.hh)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Por equipamento (horas paradas)</h4>
              <ul className="hbars">
                {equips.map((g) => (
                  <li key={g.chave}>
                    <button type="button" className={'hbar hbar-btn' + (igual(f, { tipo: 'equip', v: g.chave }) ? ' on' : '')} onClick={() => alterna({ tipo: 'equip', v: g.chave })} title={`${g.chave}: ${h(g.horas)} · ${hh(g.hh)}`}>
                      <span className="hbar-nome">{g.chave}</span>
                      <span className="hbar-trilho">
                        <span className="hbar-pilha" style={{ width: `${(g.horas / (equips[0].horas || 1)) * 100}%` }}>
                          <span className="seg-area a-perda" style={{ flexGrow: 1 }} />
                        </span>
                        <span className="hbar-valor num">
                          {h(g.horas)} · {hh(g.hh)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="small muted">Toque num número, num motivo ou num equipamento para ver os registros. Atraso sem horário de fim só entra quando for encerrado.</p>
        </>
      )}
      {f && <DetalhePerdas titulo={nomeF} perdas={filtrada} onFechar={() => setF(null)} />}
    </section>
  );
}
