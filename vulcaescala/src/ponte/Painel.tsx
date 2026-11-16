import { useMemo } from 'react';
import { irPara, usePonte } from './context';
import { dataBr, doDia, horaDe, ordenarOperadores, situacaoTreinamento, somaDias, textoTreinamento, type Checklist } from './model';

const DIAS_HISTORICO = 30;

/** Painel do QR Code (sem login): checklist de hoje, operadores habilitados e histórico. */
export function Painel() {
  const { checklists, operadores, hoje, admin, operador } = usePonte();
  const deHoje = checklists ? doDia(checklists, hoje) : null;
  const ativos = useMemo(() => ordenarOperadores(operadores.filter((o) => o.ativo)), [operadores]);
  const dias = useMemo(() => Array.from({ length: DIAS_HISTORICO }, (_, i) => somaDias(hoje, -i)), [hoje]);

  return (
    <div className="stack">
      <section className={'card pad ponte-hoje ' + (!checklists ? '' : !deHoje ? 'pend' : deHoje.resultado === 'bloqueada' ? 'bloq' : 'ok')}>
        <div className="small muted">Checklist de hoje · {dataBr(hoje)}</div>
        {!checklists ? (
          <p className="muted">Carregando…</p>
        ) : !deHoje ? (
          <>
            <h2>⚠ Checklist de hoje ainda não foi feito</h2>
            <p>A inspeção diária deve ser feita por um operador habilitado antes do uso da ponte rolante.</p>
          </>
        ) : (
          <>
            <h2>{deHoje.resultado === 'bloqueada' ? '⛔ Ponte INTERDITADA' : '✓ Checklist feito — ponte liberada'}</h2>
            <p>
              Por <b>{deHoje.nome}</b> · Matrícula <b>{deHoje.matricula}</b> · às {horaDe(deHoje.feitoEm)}
              {!deHoje.recebidoEm && ' · aguardando envio'}
            </p>
            {deHoje.resultado === 'bloqueada' && (
              <p>
                Não está em condições de operar{deHoje.observacao ? `: ${deHoje.observacao.replace(/[.\s]+$/, '')}` : ''}. Não use a ponte até a correção e um novo checklist.
              </p>
            )}
            <button className="btn" onClick={() => irPara(`#/c/${deHoje.id}`)}>
              Ver checklist
            </button>
          </>
        )}
      </section>

      <div className="row">
        <button className="btn primary grow" onClick={() => irPara('#/inspecao')}>
          {operador ? `Continuar inspeção (${operador.nome.split(' ')[0]})` : 'Fazer inspeção'}
        </button>
        <button className="btn" onClick={() => irPara('#/gestao')}>
          {admin ? 'Gestão' : '⚙ Gestão'}
        </button>
      </div>

      <section className="card pad stack">
        <h3>Operadores habilitados</h3>
        {!ativos.length ? (
          <p className="muted small">Nenhum operador cadastrado.</p>
        ) : (
          <ul className="plain-list ponte-ops">
            {ativos.map((o) => {
              const s = situacaoTreinamento(o, hoje).s;
              return (
                <li key={o.id} className={'ponte-op ' + s}>
                  <div>
                    <b>{o.nome}</b> <span className="small muted">· Matrícula {o.matricula}</span>
                  </div>
                  <div className={'small ' + (s === 'vencido' ? 'text-danger' : s === 'vence' ? 'text-pend' : 'muted')}>
                    {s === 'vencido' ? '⛔ ' : s === 'vence' ? '⚠ ' : ''}
                    {textoTreinamento(o, hoje)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card pad stack">
        <h3>Histórico ({DIAS_HISTORICO} dias)</h3>
        <ul className="plain-list ponte-hist">
          {dias.map((d) => {
            const c = checklists ? doDia(checklists, d) : null;
            const outros = checklists ? checklists.filter((x) => x.data === d && x.id !== c?.id) : [];
            return <LinhaDia key={d} data={d} c={c} extras={outros.length} />;
          })}
        </ul>
      </section>
    </div>
  );
}

function LinhaDia({ data, c, extras }: { data: string; c: Checklist | null; extras: number }) {
  const dow = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  if (!c)
    return (
      <li className="ponte-dia sem">
        <span className="num">{dataBr(data).slice(0, 5)}</span> <span className="small muted">{dow}</span>
        <span className="small text-pend">sem checklist</span>
      </li>
    );
  return (
    <li className="ponte-dia">
      <button className="ponte-dia-btn" onClick={() => irPara(`#/c/${c.id}`)}>
        <span className="num">{dataBr(data).slice(0, 5)}</span> <span className="small muted">{dow}</span>
        <span className={'badge ' + (c.resultado === 'bloqueada' ? 'danger' : 'ok')}>{c.resultado === 'bloqueada' ? 'Interditada' : 'Liberada'}</span>
        <span className="small">
          {c.nome} · {c.matricula} · {horaDe(c.feitoEm)}
          {extras > 0 && ` (+${extras})`}
        </span>
      </button>
    </li>
  );
}
