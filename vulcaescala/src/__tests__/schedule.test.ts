import { describe, expect, it } from 'vitest';
import { reducer, type Action } from '../state/reducer';
import { AppState, emptyState } from '../domain/types';
import { allocationStatus, getDay, pendingWorkers, previousDayWithData, workerHistory } from '../domain/schedule';
import { migrate, InvalidDataError } from '../storage/migrations';

const W = '2026-W45';
const ref = { weekKey: W, dayIndex: 0 };

function build(actions: Action[]): AppState {
  return actions.reduce(reducer, emptyState());
}

const base: Action[] = [
  { type: 'worker/add', id: 'a', nome: 'ana', funcao: 'Vulcanizador' },
  { type: 'worker/add', id: 'b', nome: 'bruno', funcao: 'Líder' },
  { type: 'worker/add', id: 'c', nome: 'carla', funcao: 'Auxiliar' },
  { type: 'worker/add', id: 'd', nome: 'davi', funcao: 'Mecânico' },
  { type: 'worker/setActive', id: 'd', ativo: false },
  { type: 'activity/add', ...ref, id: 'x', nome: 'emenda tr-05' },
  { type: 'activity/add', ...ref, id: 'y', nome: 'reparo' },
];

describe('escala', () => {
  it('nome da atividade é salvo em maiúsculas', () => {
    expect(getDay(build(base), W, 0).activities.map((a) => a.nome)).toEqual(['EMENDA TR-05', 'REPARO']);
  });

  it('pendentes = ativos sem alocação e sem ausência', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'b', tipo: 'folga' },
    ]);
    expect(pendingWorkers(getDay(s, W, 0), s.workers).map((w) => w.id)).toEqual(['c']); // davi inativo não conta
  });

  it('toggle marca e desmarca', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
    ]);
    expect(getDay(s, W, 0).activities[0].workerIds).toEqual([]);
  });

  it('status na janela de alocação', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'b', tipo: 'atestado' },
    ]);
    const day = getDay(s, W, 0);
    expect(allocationStatus(day, 'x', 'a')).toEqual({ kind: 'here' });
    expect(allocationStatus(day, 'y', 'a')).toEqual({ kind: 'elsewhere', activities: ['EMENDA TR-05'] });
    expect(allocationStatus(day, 'y', 'b')).toEqual({ kind: 'absent', tipo: 'atestado' });
    expect(allocationStatus(day, 'y', 'c')).toEqual({ kind: 'free' });
  });

  it('ausência retira das atividades e bloqueia alocação', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'a', tipo: 'exame' },
      { type: 'activity/toggleWorker', ...ref, activityId: 'y', workerId: 'a' },
    ]);
    const day = getDay(s, W, 0);
    expect(day.activities.flatMap((a) => a.workerIds)).toEqual([]);
    expect(day.absences).toEqual([{ workerId: 'a', tipo: 'exame' }]);
  });

  it('uma ausência por pessoa por dia (troca o tipo)', () => {
    const s = build([
      ...base,
      { type: 'absence/set', ...ref, workerId: 'a', tipo: 'folga' },
      { type: 'absence/set', ...ref, workerId: 'a', tipo: 'falta' },
    ]);
    expect(getDay(s, W, 0).absences).toEqual([{ workerId: 'a', tipo: 'falta' }]);
  });

  it('repetir dia anterior copia atividades e, opcionalmente, ausências', () => {
    const s0 = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'b', tipo: 'ferias' },
    ]);
    const prev = previousDayWithData(s0, W, 2)!;
    expect(prev).toMatchObject({ weekKey: W, dayIndex: 0 });
    const s = reducer(s0, { type: 'day/copy', weekKey: W, dayIndex: 2, from: prev, withAbsences: true });
    const day = getDay(s, W, 2);
    expect(day.activities.map((a) => [a.nome, a.workerIds])).toEqual([
      ['EMENDA TR-05', ['a']],
      ['REPARO', []],
    ]);
    expect(day.activities[0].id).not.toBe('x');
    expect(day.absences).toEqual([{ workerId: 'b', tipo: 'ferias' }]);
  });

  it('procura dia anterior atravessando semanas', () => {
    const s = build(base);
    expect(previousDayWithData(s, '2026-W46', 0)).toMatchObject({ weekKey: W, dayIndex: 0 });
  });

  it('excluir colaborador limpa as escalas', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'c' },
      { type: 'worker/remove', id: 'c' },
    ]);
    expect(getDay(s, W, 0).activities[0].workerIds).toEqual([]);
  });

  it('histórico do colaborador', () => {
    const s = build([
      ...base,
      { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', weekKey: W, dayIndex: 1, workerId: 'a', tipo: 'folga' },
    ]);
    const h = workerHistory(s, 'a', new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z'));
    expect(h.map((r) => [r.date.toISOString().slice(0, 10), r.activities, r.absence])).toEqual([
      ['2026-11-02', ['EMENDA TR-05'], undefined],
      ['2026-11-03', [], 'folga'],
    ]);
  });
});

describe('migração / validação', () => {
  it('vazio → estado inicial', () => {
    expect(migrate(null)).toEqual(emptyState());
  });

  it('ida e volta preserva os dados', () => {
    const s = build([...base, { type: 'activity/toggleWorker', ...ref, activityId: 'x', workerId: 'a' }]);
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('descarta ids órfãos, semanas inválidas e ausências duplicadas', () => {
    const s = migrate({
      version: 1,
      workers: [{ id: 'a', nome: 'ana', funcao: 'Inexistente', ativo: true }],
      weeks: {
        'lixo': {},
        [W]: {
          key: W,
          days: [
            {
              activities: [{ id: 'x', nome: 'emenda', workerIds: ['a', 'zz', 'a'] }],
              absences: [{ workerId: 'a', tipo: 'folga' }, { workerId: 'a', tipo: 'falta' }, { workerId: 'zz', tipo: 'folga' }],
            },
          ],
        },
      },
    });
    expect(Object.keys(s.weeks)).toEqual([W]);
    expect(s.workers[0]).toEqual({ id: 'a', nome: 'ANA', funcao: 'Vulcanizador', ativo: true });
    expect(s.weeks[W].days).toHaveLength(7);
    expect(s.weeks[W].days[0].activities[0].workerIds).toEqual(['a']);
    expect(s.weeks[W].days[0].absences).toEqual([{ workerId: 'a', tipo: 'folga' }]);
  });

  it('rejeita versão futura e arquivo sem versão', () => {
    expect(() => migrate({ version: 99, workers: [], weeks: {} })).toThrow(InvalidDataError);
    expect(() => migrate({ workers: [] })).toThrow(InvalidDataError);
  });
});
