import { useState, type ReactNode } from 'react';
import { CLASSES, type ContagemClasse } from './model';

export type Serie = keyof ContagemClasse;

/** Ordem fixa das séries (cores por classe, nunca pela posição). */
export const SERIES: { k: Serie; nome: string }[] = [...CLASSES.map((c) => ({ k: c.id as Serie, nome: c.nome })), { k: 'sem', nome: 'Não classificada' }];

export interface Linha {
  id: string;
  nome: string;
  /** segunda linha do rótulo (ex.: área do equipamento) */
  sub?: string;
  v: number;
  /** quebra por classificação: desenha a barra empilhada */
  classes?: ContagemClasse;
}

const fmtPadrao = (n: number) => n.toLocaleString('pt-BR');
const pctDe = (v: number, t: number) => (t ? `${Math.round((v / t) * 100)}%` : '—');

/**
 * Legenda clicável: toca numa classificação para destacá-la em todos os gráficos
 * empilhados (as outras ficam esmaecidas). Toca de novo para voltar.
 */
export function LegendaSeries({ foco, setFoco }: { foco: Serie | null; setFoco: (s: Serie | null) => void }) {
  return (
    <div className="leg-int" role="group" aria-label="Destacar classificação">
      {SERIES.map((s) => (
        <button key={s.k} type="button" className={'leg-btn' + (foco === s.k ? ' on' : '') + (foco && foco !== s.k ? ' off' : '')} aria-pressed={foco === s.k} onClick={() => setFoco(foco === s.k ? null : s.k)}>
          <span className={'sw s-' + s.k} aria-hidden /> {s.nome}
        </button>
      ))}
      {foco && (
        <button type="button" className="leg-btn limpar" onClick={() => setFoco(null)}>
          ✕ Mostrar todas
        </button>
      )}
    </div>
  );
}

/** Quebra por classificação (chips com cor + número + %). */
export function Quebra({ classes, total }: { classes: ContagemClasse; total: number }) {
  return (
    <div className="quebra">
      {SERIES.filter((s) => classes[s.k]).map((s) => (
        <span key={s.k} className="quebra-item">
          <span className={'sw s-' + s.k} aria-hidden />
          <span>{s.nome}</span>
          <b className="num">{classes[s.k]}</b>
          <span className="muted num">{pctDe(classes[s.k], total)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Barras horizontais interativas. Cada linha é um botão: o toque (ou clique) abre o
 * detalhe logo abaixo — participação no total, quebra por classificação e o que mais
 * a tela quiser mostrar (`detalhe`).
 */
export function GraficoBarras({
  linhas,
  fmt = fmtPadrao,
  foco = null,
  unidade = 'atividades',
  detalhe,
  vazio = 'Sem dados no período.',
}: {
  linhas: Linha[];
  fmt?: (n: number) => string;
  foco?: Serie | null;
  unidade?: string;
  detalhe?: (l: Linha) => ReactNode;
  vazio?: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const vis = linhas.filter((l) => l.v > 0);
  if (!vis.length) return <p className="muted small">{vazio}</p>;
  const max = Math.max(...vis.map((l) => l.v));
  const total = vis.reduce((s, l) => s + l.v, 0);
  return (
    <ul className="gb" role="list">
      {vis.map((l, i) => {
        const aberto = sel === l.id;
        const focoV = foco && l.classes ? l.classes[foco] : null;
        return (
          <li key={l.id} className={'gb-linha' + (aberto ? ' aberto' : '')}>
            <button type="button" className="gb-btn" aria-expanded={aberto} onClick={() => setSel(aberto ? null : l.id)}>
              <span className="gb-rank num">{i + 1}</span>
              <span className="gb-rotulo">
                <span className="gb-nome">{l.nome}</span>
                {l.sub && <span className="gb-sub">{l.sub}</span>}
              </span>
              <span className="gb-trilho">
                <span className="gb-barra" style={{ width: `${Math.max(2, (l.v / max) * 100)}%` }}>
                  {l.classes ? (
                    SERIES.filter((s) => l.classes![s.k]).map((s) => (
                      <span key={s.k} className={'gb-seg s-' + s.k + (foco && foco !== s.k ? ' apagado' : '')} style={{ flexGrow: l.classes![s.k] }} />
                    ))
                  ) : (
                    <span className="gb-seg s-unica" style={{ flexGrow: 1 }} />
                  )}
                </span>
              </span>
              <span className="gb-valor num">
                {focoV !== null ? (
                  <>
                    <b>{focoV}</b>
                    <small>/{fmt(l.v)}</small>
                  </>
                ) : (
                  <b>{fmt(l.v)}</b>
                )}
              </span>
            </button>
            {aberto && (
              <div className="gb-detalhe">
                <div className="gb-det-topo">
                  <b className="num">{fmt(l.v)}</b> {unidade} · <b className="num">{pctDe(l.v, total)}</b> do total exibido
                </div>
                {l.classes && <Quebra classes={l.classes} total={l.v} />}
                {detalhe?.(l)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface Coluna {
  id: string;
  rotulo: string;
  nomeLongo: string;
  total: number;
  classes: ContagemClasse;
  pessoasDia: number;
}

/** Arredonda o topo do eixo para um número "redondo" (1, 2, 5 × 10ⁿ). */
function topoEixo(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/**
 * Colunas mensais empilhadas por classificação, com grade, linha da média e
 * seleção: tocar num mês mostra o detalhe dele embaixo.
 */
export function GraficoColunas({ colunas, foco = null }: { colunas: Coluna[]; foco?: Serie | null }) {
  const [sel, setSel] = useState<string | null>(null);
  const valor = (c: Coluna) => (foco ? c.classes[foco] : c.total);
  const max = topoEixo(Math.max(1, ...colunas.map(valor)));
  const media = colunas.length ? colunas.reduce((s, c) => s + valor(c), 0) / colunas.length : 0;
  const ticks = [max, max / 2, 0];
  const c = colunas.find((x) => x.id === sel) ?? null;
  return (
    <div className="gc">
      <div className="gc-area">
        <div className="gc-eixo num" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{Math.round(t)}</span>
          ))}
        </div>
        <div className="gc-plot">
          {ticks.map((t) => (
            <span key={t} className="gc-grade" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden />
          ))}
          <span className="gc-media" style={{ bottom: `${(media / max) * 100}%` }} aria-hidden />
          <div className="gc-cols">
            {colunas.map((col) => {
              const v = valor(col);
              const on = sel === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  className={'gc-col' + (on ? ' on' : '') + (sel && !on ? ' fora' : '')}
                  aria-pressed={on}
                  aria-label={`${col.nomeLongo}: ${v}`}
                  onClick={() => setSel(on ? null : col.id)}
                >
                  <span className="gc-val num" style={{ bottom: `calc(${(v / max) * 100}% + 3px)` }}>
                    {v}
                  </span>
                  <span className="gc-pilha" style={{ height: `${(v / max) * 100}%` }}>
                    {foco ? (
                      <span className={'gb-seg s-' + foco} style={{ flexGrow: 1 }} />
                    ) : (
                      SERIES.filter((s) => col.classes[s.k]).map((s) => <span key={s.k} className={'gb-seg s-' + s.k} style={{ flexGrow: col.classes[s.k] }} />)
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="gc-rotulos" aria-hidden>
        <span className="gc-eixo-vazio" />
        <div className="gc-cols">
          {colunas.map((col) => (
            <span key={col.id} className={'gc-rot' + (sel === col.id ? ' on' : '')}>
              {col.rotulo}
            </span>
          ))}
        </div>
      </div>
      {c ? (
        <div className="gb-detalhe">
          <div className="gb-det-topo">
            <b>{c.nomeLongo}</b> · <b className="num">{c.total}</b> atividades · <b className="num">{c.pessoasDia}</b> pessoas×dia ·{' '}
            {media > 0 && (valor(c) >= media ? `${Math.round((valor(c) / media - 1) * 100)}% acima` : `${Math.round((1 - valor(c) / media) * 100)}% abaixo`)}
            {media > 0 && ' da média'}
          </div>
          <Quebra classes={c.classes} total={c.total} />
        </div>
      ) : (
        <p className="small muted gc-dica">
          <span className="gc-media-leg" aria-hidden /> média {Math.round(media)} por mês · toque num mês para ver o detalhe.
        </p>
      )}
    </div>
  );
}
