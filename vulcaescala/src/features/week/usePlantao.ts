import { useStore } from '../../state/store';
import type { Action, DayRef } from '../../state/reducer';
import { formatDate, locateDay, toIsoDate, weekDates, WEEKDAYS_SHORT } from '../../domain/isoWeek';
import { periodoPlantao, primeiroDoPeriodo } from '../../domain/plantao';

/**
 * Plantão do período (fim de semana / feriado emendado): o que se preenche no PRIMEIRO dia é
 * replicado automaticamente nos demais dias do período (criar, alocar, retirar, papéis).
 * Alterações feitas direto num dia seguinte valem só para aquele dia.
 */
export function usePlantao(dayRef: DayRef) {
  const { state, dispatch } = useStore();
  const data = weekDates(dayRef.weekKey)[dayRef.dayIndex];
  const periodo = periodoPlantao(state, data);
  const primeiro = !!periodo && primeiroDoPeriodo(periodo, data);
  const outros: DayRef[] = primeiro && periodo ? periodo.dias.slice(1).map(locateDay) : [];
  const rotulo = (d: Date) => `${WEEKDAYS_SHORT[locateDay(d).dayIndex].toLowerCase()} ${formatDate(d)}`;
  return {
    periodo,
    primeiro,
    /** exigência do período: tem feriado → 1 líder + 8; só fim de semana → 1 líder + 6 */
    feriado: !!periodo?.temFeriado,
    descricao: periodo
      ? periodo.dias.length > 1
        ? `${rotulo(periodo.dias[0])} a ${rotulo(periodo.dias[periodo.dias.length - 1])} (${periodo.dias.length} dias)`
        : rotulo(periodo.dias[0])
      : '',
    inicio: periodo ? rotulo(periodo.dias[0]) : '',
    ehInicio: (d: Date) => !!periodo && toIsoDate(periodo.dias[0]) === toIsoDate(d),
    /** despacha no dia e, se for o primeiro dia do período, repete nos demais */
    despachar: (action: Action & DayRef) => {
      dispatch(action);
      for (const r of outros) dispatch({ ...action, ...r } as Action);
    },
  };
}
