import { useState } from 'react';
import { useStore } from '../../state/store';
import type { DayRef } from '../../state/reducer';
import { absenceOf, folgaAutoDoDia, getDay, sortByName } from '../../domain/schedule';
import { diasEntre, toIsoDate, weekDates } from '../../domain/isoWeek';
import { matchesSearch } from '../../domain/names';
import { apoioNaData, tipoAusencia } from '../../domain/types';
import { AusenciasDialog } from '../workers/AusenciasDialog';
import { useToast } from '../../ui/Toast';
import { Modal } from '../../ui/Modal';

interface Props {
  dayRef: DayRef;
  dayLabel: string;
  onClose: () => void;
}

/** Escolhe o tipo e toca nos colaboradores. Fica aberta para registrar várias. */
export function AbsencePicker({ dayRef, dayLabel, onClose }: Props) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const tipos = state.ausencias.filter((a) => a.ativo);
  const [escolhido, setTipo] = useState<string>(tipos[0]?.id ?? '');
  // se o tipo escolhido foi ocultado/removido (em outro aparelho), volta para o primeiro
  const tipo = tipos.some((t) => t.id === escolhido) ? escolhido : (tipos[0]?.id ?? '');
  const [gerenciar, setGerenciar] = useState(false);
  const [query, setQuery] = useState('');
  const day = getDay(state, dayRef.weekKey, dayRef.dayIndex);
  const feriado = folgaAutoDoDia(state, dayRef.weekKey, dayRef.dayIndex);
  const dataDoDia = toIsoDate(weekDates(dayRef.weekKey)[dayRef.dayIndex]);
  // "por período": em vez de marcar dia por dia (ex.: atestado de 14 dias), aplica o mesmo
  // tipo em todos os dias do intervalo de uma vez — sem criar outro formato de dado: cada
  // dia continua recebendo a própria ação "absence/set", igual ao plantão (usePlantao).
  const [porPeriodo, setPorPeriodo] = useState(false);
  const [inicio, setInicio] = useState(dataDoDia);
  const [fim, setFim] = useState('');
  const dias = porPeriodo ? (fim ? diasEntre(inicio, fim) : []) : [dayRef];
  const list = sortByName(state.workers.filter((w) => w.ativo && matchesSearch(w.nome, query)));

  return (
    <Modal
      title="Registrar ausência"
      subtitle={dayLabel}
      onClose={onClose}
      footer={
        <>
          <span className="small muted foot-info">
            <span className="num">{day.absences.length}</span> ausente(s)
          </span>
          <button className="btn primary" onClick={onClose}>
            Concluído
          </button>
        </>
      }
    >
      <div className="segmented" role="radiogroup" aria-label="Tipo de ausência">
        {tipos.map((t) => (
          <button key={t.id} role="radio" aria-checked={tipo === t.id} className={'seg' + (tipo === t.id ? ' on' : '')} onClick={() => setTipo(t.id)}>
            {t.nome}
          </button>
        ))}
      </div>
      <button className="link small" onClick={() => setGerenciar(true)}>
        Editar tipos de ausência…
      </button>
      {gerenciar && <AusenciasDialog onClose={() => setGerenciar(false)} />}

      <div className="segmented" role="radiogroup" aria-label="Alcance">
        <button type="button" role="radio" aria-checked={!porPeriodo} className={'seg' + (!porPeriodo ? ' on' : '')} onClick={() => setPorPeriodo(false)}>
          Só este dia
        </button>
        <button type="button" role="radio" aria-checked={porPeriodo} className={'seg' + (porPeriodo ? ' on' : '')} onClick={() => setPorPeriodo(true)}>
          Vários dias
        </button>
      </div>
      {porPeriodo && (
        <div className="two-cols">
          <label className="field">
            De
            <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="field">
            Até
            <input className="input" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} />
          </label>
        </div>
      )}

      <input
        className="input"
        type="search"
        placeholder="Buscar colaborador…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-autofocus
        aria-label="Buscar colaborador"
      />
      {porPeriodo && !fim ? (
        <p className="small muted">Escolha a data final para aplicar a ausência no período.</p>
      ) : (
        <>
          <p className="small muted">
            {porPeriodo ? (
              <>
                Toque para marcar <b>{tipoAusencia(state, tipo).nome}</b> em <b>{dias.length}</b> dia(s), de{' '}
                {inicio.split('-').reverse().join('/')} a {fim.split('-').reverse().join('/')}.
              </>
            ) : (
              <>
                Toque para marcar <b>{tipoAusencia(state, tipo).nome}</b>. Quem estiver alocado sai das atividades do dia.
              </>
            )}
          </p>
          <ul className="plain-list">
            {list.map((w) => {
              const cur = !porPeriodo ? absenceOf(day, w.id) : undefined;
              const inActivity = !porPeriodo && day.activities.some((a) => a.workerIds.includes(w.id));
              const hereAll = dias.length > 0 && dias.every((r) => absenceOf(getDay(state, r.weekKey, r.dayIndex), w.id) === tipo);
              return (
                <li key={w.id}>
                  <button
                    className={'pick' + (hereAll ? ' st-here' : cur || inActivity ? ' st-elsewhere' : '')}
                    aria-pressed={hereAll}
                    onClick={() => {
                      const novoTipo = hereAll ? null : tipo;
                      for (const r of dias) dispatch({ type: 'absence/set', ...r, workerId: w.id, tipo: novoTipo });
                      toast(
                        dias.length > 1
                          ? novoTipo
                            ? `Ausência registrada em ${dias.length} dias`
                            : `Ausência removida em ${dias.length} dias`
                          : novoTipo
                            ? 'Ausência registrada'
                            : 'Ausência removida',
                      );
                    }}
                  >
                    <span className="pick-name">
                      {w.nome} {apoioNaData(w, porPeriodo ? inicio : dataDoDia) && <span className="tag-apoio">Apoio</span>}
                    </span>
                    {!porPeriodo && (hereAll || cur || inActivity) && (
                      <span className={'pick-status' + (cur && !hereAll ? ` tinted cor-${tipoAusencia(state, cur).cor}` : '')}>
                        {hereAll ? '✓' : cur ? tipoAusencia(state, cur).nome : 'Alocado'}
                      </span>
                    )}
                    {!porPeriodo && !hereAll && !cur && !inActivity && feriado && <span className="pick-status muted">Folga automática</span>}
                    {porPeriodo && hereAll && <span className="pick-status">✓</span>}
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="muted small">Ninguém encontrado.</li>}
          </ul>
        </>
      )}
    </Modal>
  );
}
