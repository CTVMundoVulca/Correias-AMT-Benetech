import { describe, expect, it } from 'vitest';
import { situacaoPlantao, PLANTAO_ID } from '../domain/plantao';
import { reducer } from '../state/reducer';
import { seedState } from '../domain/seed';
import { planejar } from '../integracao/progEscala';

describe('plantão (fins de semana e feriados)', () => {
  it('fim de semana: 1 líder + 6; feriado: 1 líder + 8', () => {
    const ids = ['L', 'a', 'b', 'c', 'd', 'e', 'f'];
    expect(situacaoPlantao({ workerIds: ids, liderId: 'L' }, false)).toMatchObject({ executantes: 6, exigidos: 6, faltamExecutantes: 0, completo: true });
    expect(situacaoPlantao({ workerIds: ids, liderId: 'L' }, true)).toMatchObject({ exigidos: 8, faltamExecutantes: 2, completo: false });
    // sem líder: todos contam como executantes, mas não está completo
    expect(situacaoPlantao({ workerIds: ids }, false)).toMatchObject({ liderId: null, executantes: 7, completo: false });
    // papel de quem não está alocado não vale
    expect(situacaoPlantao({ workerIds: ['a'], liderId: 'X', veiculoId: 'a', caminhaoId: 'Z' }, false)).toMatchObject({ liderId: null, veiculoId: 'a', caminhaoId: null });
  });

  it('papéis só entre os alocados; retirar a pessoa limpa o papel', () => {
    let s = seedState((n) => n);
    const ref = { weekKey: '2026-W47', dayIndex: 5 };
    s = reducer(s, { type: 'activity/add', ...ref, id: PLANTAO_ID, nome: 'PLANTÃO' });
    s = reducer(s, { type: 'activity/setWorker', ...ref, activityId: PLANTAO_ID, workerId: 'A', allocated: true });
    s = reducer(s, { type: 'activity/papel', ...ref, activityId: PLANTAO_ID, papel: 'liderId', workerId: 'A' });
    s = reducer(s, { type: 'activity/papel', ...ref, activityId: PLANTAO_ID, papel: 'caminhaoId', workerId: 'A' });
    s = reducer(s, { type: 'activity/papel', ...ref, activityId: PLANTAO_ID, papel: 'veiculoId', workerId: 'B' }); // B não está alocado
    let p = s.weeks['2026-W47'].days[5].activities[0];
    expect([p.liderId, p.caminhaoId, p.veiculoId]).toEqual(['A', 'A', undefined]);
    s = reducer(s, { type: 'activity/setWorker', ...ref, activityId: PLANTAO_ID, workerId: 'A', allocated: false });
    p = s.weeks['2026-W47'].days[5].activities[0];
    expect([p.liderId, p.caminhaoId]).toEqual([undefined, undefined]);
  });

  it('o plantão não vira atividade da programação', () => {
    const r = planejar({
      dias: [{ data: '2026-11-21', weekKey: '2026-W47', dayIndex: 5, day: { activities: [{ id: PLANTAO_ID, nome: 'PLANTÃO', workerIds: ['A'] }], absences: [] } }],
      progs: [],
      meses: new Set(['2026-11']),
      hoje: '2026-11-18',
      agora: new Date('2026-11-18T10:00:00-03:00'),
      feriados: {},
      por: 'x',
      refDe: () => ({ weekKey: '2026-W47', dayIndex: 5 }),
      desde: '2026-11-16',
    });
    expect(r.prog).toEqual([]);
    expect(r.avisos).toEqual([]);
  });
});
