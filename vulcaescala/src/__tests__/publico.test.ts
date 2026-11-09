import { describe, expect, it } from 'vitest';
import { diffPublico, estadoPublico, projetarConfig, projetarDia } from '../cloud/publico';
import type { DocMaps } from '../cloud/sync';

const dia = {
  activities: [{ id: 'a1', nome: 'TR-01', workerIds: ['w1'] }],
  absences: [
    { workerId: 'w2', tipo: 'atestado' },
    { workerId: 'w3', tipo: 'folga' },
    { workerId: 'w4', tipo: 'ferias' },
    { workerId: 'w5', tipo: 'falta' },
    { workerId: 'w6', tipo: 'exame' },
    { workerId: 'w7', tipo: 'tipo-criado-pela-lideranca' },
  ],
};
const priv: DocMaps = {
  workers: { w1: { id: 'w1', nome: 'ADILSON', funcao: 'Vulcanizador', ativo: true, matricula: '12345' } },
  days: { '2026-W45_0': dia, '2026-W45_1': { activities: [], absences: [] } },
  funcoes: ['Vulcanizador'],
  ausencias: null,
  feriados: { '2026-09-08': 'Aniversário de Vitória' },
};

describe('cópia pública da escala', () => {
  it('atestado, exame, falta e tipos novos viram "ausencia"; folga e férias continuam', () => {
    expect(projetarDia(dia).absences.map((a) => a.tipo)).toEqual(['ausencia', 'folga', 'ferias', 'ausencia', 'ausencia', 'ausencia']);
    expect(JSON.stringify(projetarDia(dia))).not.toMatch(/atestado|exame|falta/);
  });
  it('efetivo público sem matrícula', () => {
    const c = projetarConfig(priv);
    expect(c.efetivo).toEqual([{ id: 'w1', nome: 'ADILSON', funcao: 'Vulcanizador', ativo: true }]);
    expect(JSON.stringify(c)).not.toContain('12345');
    expect(c.ausencias.map((t) => t.id)).toEqual(['folga', 'ferias', 'ausencia']);
  });
  it('diff: grava o que mudou, apaga o que sumiu, ignora dia vazio e o que já está igual', () => {
    const r1 = diffPublico(priv, {});
    expect(Object.keys(r1.gravar)).toEqual(['2026-W45_0']);
    expect(r1.apagar).toEqual([]);
    const r2 = diffPublico(priv, { '2026-W45_0': projetarDia(dia), '2026-W40_2': { activities: [], absences: [] } });
    expect(r2.gravar).toEqual({});
    expect(r2.apagar).toEqual(['2026-W40_2']);
  });
  it('estado de visualização mostra "Ausência" com nome', () => {
    const todos: DocMaps = { ...priv, workers: Object.fromEntries(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'].map((id) => [id, { id, nome: id.toUpperCase(), funcao: 'Vulcanizador', ativo: true }])) };
    const st = estadoPublico(projetarConfig(todos), { '2026-W45_0': projetarDia(dia) });
    expect(st.ausencias.find((t) => t.id === 'ausencia')?.nome).toBe('Ausência');
    expect(st.workers[0].matricula).toBeUndefined();
    expect(st.weeks['2026-W45'].days[0].absences).toHaveLength(6);
  });
});
