import { useMemo } from 'react';
import { irPara, usePonte } from './context';
import { INICIO_PONTE, MODELO, criticosNC, dataBr, doDia, horaDe, ordenarOperadores, situacaoTreinamento, somaDias, textoTreinamento, type Checklist } from './model';

const DIAS_HISTORICO = 30;

/** Painel do QR Code (sem login): checklist de hoje, operadores habilitados e histórico. */
export function Painel() {
  const { checklists, operadores, operadoresFonte, operadoresErro, hoje, admin, operador } = usePonte();
  const deHoje = checklists ? doDia(checklists, hoje) : null;
  const ativos = useMemo(() => ordenarOperadores(operadores.filter((o) => o.ativo)), [operadores]);
  const dias = useMemo(() => Array.from({ length: DIAS_HISTORICO }, (_, i) => somaDias(hoje, -i)).filter((d) => d >= INICIO_PONTE), [hoje]);

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
            {deHoje.resultado === 'liberada' && criticosNC(deHoje.itens.length ? deHoje.itens : MODELO.itens, deHoje.respostas).length > 0 && (
              <p className="small">
                ⚠ Liberada pelo operador com item crítico em N:{' '}
                {criticosNC(deHoje.itens.length ? deHoje.itens : MODELO.itens, deHoje.respostas)
                  .map((i) => i.texto.split('.')[0])
                  .join(', ')}
                .
              </p>
            )}
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
        <SituacaoLista fonte={operadoresFonte} erro={operadoresErro} vazia={!ativos.length} />
        {!ativos.length ? (
          operadoresFonte === 'nuvem' && <p className="muted small">Nenhum operador cadastrado.</p>
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
        <h3>
          Histórico <span className="small muted">(últimos {DIAS_HISTORICO} dias, a partir de {dataBr(INICIO_PONTE)})</span>
        </h3>
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

/** Diagnóstico: por que a lista de operadores pode não aparecer neste aparelho. */
export function SituacaoLista({ fonte, erro, vazia }: { fonte: 'carregando' | 'nuvem' | 'cache' | 'erro'; erro: string; vazia: boolean }) {
  const recarregar = (
    <button className="btn small" onClick={() => window.location.reload()}>
      Tentar de novo
    </button>
  );
  if (fonte === 'erro')
    return (
      <div className="banner danger small stack" role="alert">
        <span>
          Não foi possível baixar a lista de operadores neste aparelho (<code>{erro || 'erro desconhecido'}</code>). Confira a internet e tente de novo; se continuar,
          envie esta mensagem para a liderança.
        </span>
        {recarregar}
      </div>
    );
  if (fonte === 'carregando' && vazia) return <p className="muted small">Baixando a lista de operadores…</p>;
  if (fonte === 'cache' && vazia)
    return (
      <div className="banner warn small stack" role="status">
        <span>Sem conexão com a nuvem neste aparelho: a lista de operadores ainda não foi baixada. Confira a internet (Wi-Fi ou dados móveis).</span>
        {recarregar}
      </div>
    );
  if (fonte === 'cache') return <p className="small muted">Lista do aparelho (sem conexão com a nuvem agora).</p>;
  return null;
}
