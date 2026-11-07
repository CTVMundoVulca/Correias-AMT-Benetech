import { describe, expect, it } from 'vitest';
import { reducer, type Action } from '../state/reducer';
import { AppState, emptyState } from '../domain/types';
import { allocationStatus, getDay, pendingWorkers, weekPending, workerHistory } from '../domain/schedule';
import { activityRows, weekKpis, workerGrid } from '../domain/summary';
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
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'b', tipo: 'folga' },
    ]);
    expect(pendingWorkers(getDay(s, W, 0), s.workers).map((w) => w.id)).toEqual(['c']); // davi inativo não conta
  });

  it('dia sem atividade não gera pendência, mesmo com gente ativa', () => {
    const s = build(base);
    expect(pendingWorkers(getDay(s, W, 1), s.workers)).toEqual([]);
    // ausência sozinha também não cria pendência
    const s2 = reducer(s, { type: 'absence/set', weekKey: W, dayIndex: 1, workerId: 'a', tipo: 'folga' });
    expect(pendingWorkers(getDay(s2, W, 1), s2.workers)).toEqual([]);
  });

  it('pendência é recalculada a cada alteração', () => {
    let s = build(base);
    expect(pendingWorkers(getDay(s, W, 0), s.workers).map((w) => w.id)).toEqual(['a', 'b', 'c']);
    s = reducer(s, { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' });
    s = reducer(s, { type: 'absence/set', ...ref, workerId: 'b', tipo: 'exame' });
    expect(pendingWorkers(getDay(s, W, 0), s.workers).map((w) => w.id)).toEqual(['c']);
    s = reducer(s, { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'c' });
    expect(pendingWorkers(getDay(s, W, 0), s.workers)).toEqual([]);
    // remover a atividade devolve a pessoa para pendente
    s = reducer(s, { type: 'activity/remove', ...ref, activityId: 'y' });
    expect(pendingWorkers(getDay(s, W, 0), s.workers).map((w) => w.id)).toEqual(['c']);
  });

  it('pendências da semana por dia', () => {
    const s = build([
      ...base,
      { type: 'activity/add', weekKey: W, dayIndex: 3, id: 'z', nome: 'inspeção' },
      { type: 'activity/setWorker', allocated: true, weekKey: W, dayIndex: 3, activityId: 'z', workerId: 'a' },
    ]);
    expect(weekPending(s, W)).toEqual({
      days: [
        { dayIndex: 0, count: 3 },
        { dayIndex: 3, count: 2 },
      ],
      total: 5,
      hasActivities: true,
    });
    expect(weekPending(s, '2026-W46')).toEqual({ days: [], total: 0, hasActivities: false });
  });

  it('alocar/desalocar é idempotente', () => {
    const s = build([
      ...base,
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
    ]);
    // repetir a mesma ação não duplica (idempotente: importante com vários aparelhos)
    expect(getDay(s, W, 0).activities[0].workerIds).toEqual(['a']);
    const s2 = reducer(s, { type: 'activity/setWorker', allocated: false, ...ref, activityId: 'x', workerId: 'a' });
    expect(getDay(s2, W, 0).activities[0].workerIds).toEqual([]);
    expect(reducer(s2, { type: 'activity/setWorker', allocated: false, ...ref, activityId: 'x', workerId: 'a' })).toEqual(s2);
  });

  it('status na janela de alocação', () => {
    const s = build([
      ...base,
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
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
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', ...ref, workerId: 'a', tipo: 'exame' },
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'a' },
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

  it('excluir colaborador retira de todas as atividades e ausências de todas as semanas', () => {
    const W2 = '2027-W01';
    const s = build([
      ...base,
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'c' },
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'c' },
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'a' },
      { type: 'absence/set', weekKey: W, dayIndex: 4, workerId: 'c', tipo: 'falta' },
      { type: 'activity/add', weekKey: W2, dayIndex: 2, id: 'k', nome: 'emenda' },
      { type: 'activity/setWorker', allocated: true, weekKey: W2, dayIndex: 2, activityId: 'k', workerId: 'c' },
      { type: 'absence/set', weekKey: W2, dayIndex: 5, workerId: 'c', tipo: 'ferias' },
      { type: 'worker/remove', id: 'c' },
    ]);
    expect(s.workers.map((w) => w.id)).not.toContain('c');
    const all = JSON.stringify(s.weeks);
    expect(all).not.toContain('"c"');
    // os demais continuam onde estavam
    expect(getDay(s, W, 0).activities[1].workerIds).toEqual(['a']);
    expect(getDay(s, W2, 2).activities[0].workerIds).toEqual([]);
  });

  it('histórico do colaborador', () => {
    const s = build([
      ...base,
      { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
      { type: 'absence/set', weekKey: W, dayIndex: 1, workerId: 'a', tipo: 'folga' },
    ]);
    const h = workerHistory(s, 'a', new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z'));
    expect(h.map((r) => [r.date.toISOString().slice(0, 10), r.activities, r.absence])).toEqual([
      ['2026-11-02', ['EMENDA TR-05'], undefined],
      ['2026-11-03', [], 'folga'],
    ]);
  });
});

describe('resumo da semana', () => {
  const s = build([
    ...base,
    { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' },
    { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'a' },
    { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'y', workerId: 'c' },
    { type: 'absence/set', ...ref, workerId: 'b', tipo: 'atestado' },
    { type: 'absence/set', weekKey: W, dayIndex: 1, workerId: 'd', tipo: 'ferias' },
  ]);

  it('indicadores', () => {
    expect(weekKpis(s, W)).toEqual({ activities: 2, allocations: 3, absences: 2, activeWorkers: 3 });
  });

  it('tabela colaborador × dia (inativo só aparece se tiver registro)', () => {
    const g = workerGrid(s, W);
    expect(g.map((r) => r.worker.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(g[0].cells[0]).toEqual({ kind: 'on' });
    expect(g[0].daysAllocated).toBe(1); // duas atividades no mesmo dia = 1 dia
    expect(g[1].cells[0]).toEqual({ kind: 'abs', tipo: 'atestado' });
    expect(g[3].cells[1]).toEqual({ kind: 'abs', tipo: 'ferias' });
    expect(g[2].cells[6]).toEqual({ kind: 'none' });
    const s2 = reducer(s, { type: 'absence/set', weekKey: W, dayIndex: 1, workerId: 'd', tipo: null });
    expect(workerGrid(s2, W).map((r) => r.worker.id)).toEqual(['a', 'b', 'c']);
  });

  it('atividades da semana com nomes', () => {
    expect(activityRows(s, W)).toEqual([
      { dayIndex: 0, nome: 'EMENDA TR-05', workerNames: ['ANA'] },
      { dayIndex: 0, nome: 'REPARO', workerNames: ['ANA', 'CARLA'] },
    ]);
  });
});

describe('migração / validação', () => {
  it('vazio → estado inicial', () => {
    expect(migrate(null)).toEqual(emptyState());
  });

  it('ida e volta preserva os dados', () => {
    const s = build([...base, { type: 'activity/setWorker', allocated: true, ...ref, activityId: 'x', workerId: 'a' }]);
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
