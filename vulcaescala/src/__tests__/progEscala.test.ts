import { describe, expect, it } from 'vitest';
import { atividadeVazia, type Atividade } from '../prog/model';
import { planejar, nomeNaEscala, descricaoDoNome, type DiaEscala } from '../integracao/progEscala';
import type { Activity } from '../domain/types';

const HOJE = '2026-11-18';
const at = (id: string, data: string, x: Partial<Atividade> = {}): Atividade => ({
  ...atividadeVazia(id, data, 't'),
  descricao: 'TROCAR CORREIA F-1',
  area: 'PÁTIO DE MINÉRIO',
  tipo: 'Troca de correia',
  classe: 'programada',
  ...x,
});
const dia = (data: string, activities: Activity[], i = 0, absences: { workerId: string; tipo: string }[] = []): DiaEscala => ({
  data,
  weekKey: '2026-W47',
  dayIndex: i,
  day: { activities, absences },
});
const refDe = (data: string) => ({ weekKey: '2026-W47', dayIndex: Number(data.slice(8)) - 16 });
const rodar = (dias: DiaEscala[], progs: Atividade[]) =>
  planejar({ dias, progs, meses: new Set(['2026-11']), hoje: HOJE, agora: new Date('2026-11-18T10:00:00-03:00'), feriados: {}, por: 'adm@x', refDe, desde: '2026-11-16' });

describe('sincronização Escala ⇄ Programação', () => {
  it('nome na escala e descrição de volta', () => {
    expect(nomeNaEscala({ descricao: 'TROCAR CORREIA F-1', equipamento: 'F-1', area: 'PÁTIO DE MINÉRIO' })).toBe('TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO');
    expect(descricaoDoNome('trocar correia f-2 — pátio de minério', 'PÁTIO DE MINÉRIO')).toBe('TROCAR CORREIA F-2');
    expect(descricaoDoNome('REPARO NA C-3', 'PÁTIO DE MINÉRIO')).toBe('REPARO NA C-3');
  });

  it('nomes iguais: só registra o nome sincronizado (nada muda na escala)', () => {
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO', workerIds: ['w1'] }], 2)], [at('a', '2026-11-18')]);
    expect(p.escala).toEqual([]);
    expect(p.prog.map((x) => x.escalaNome)).toEqual(['TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO']);
    // segunda passada: estável
    const p2 = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO', workerIds: ['w1'] }], 2)], p.prog);
    expect(p2.prog).toEqual([]);
    expect(p2.escala).toEqual([]);
  });

  it('a escala mudou o nome: a programação recebe a nova descrição', () => {
    const a = at('a', '2026-11-18', { escalaNome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'TROCAR CORREIA F-1 E EMENDA — PÁTIO DE MINÉRIO', workerIds: [] }], 2)], [a]);
    expect(p.escala).toEqual([]);
    expect(p.prog[0].descricao).toBe('TROCAR CORREIA F-1 E EMENDA');
    expect(p.prog[0].escalaNome).toBe('TROCAR CORREIA F-1 E EMENDA — PÁTIO DE MINÉRIO');
  });

  it('a programação mudou (ou sem registro): a escala recebe o nome', () => {
    const a = at('a', '2026-11-18', { descricao: 'TROCAR CORREIA F-1 (NOVA)', escalaNome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO', workerIds: [] }], 2)], [a]);
    expect(p.escala).toEqual([{ type: 'activity/rename', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a', nome: 'TROCAR CORREIA F-1 (NOVA) — PÁTIO DE MINÉRIO' }]);
    const semRegistro = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'OUTRO NOME', workerIds: [] }], 2)], [at('a', '2026-11-18')]);
    expect(semRegistro.escala[0]).toMatchObject({ type: 'activity/rename', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' });
  });

  it('atividade nova na escala entra na programação para revisão', () => {
    const p = rodar([dia('2026-11-19', [{ id: 'x9', nome: 'LIMPEZA DA OFICINA', workerIds: ['w1', 'w2'] }], 3)], []);
    expect(p.prog).toHaveLength(1);
    expect(p.prog[0]).toMatchObject({ id: 'esc-x9', data: '2026-11-19', descricao: 'LIMPEZA DA OFICINA', origem: 'escala', revisarEscala: true, pessoas: 2, escalaNome: 'LIMPEZA DA OFICINA' });
    expect(p.prog[0].classe).toBe('nao_programada'); // lançada com menos de 48 h
  });

  it('antes da data de início e fora dos meses carregados nada é criado', () => {
    expect(rodar([dia('2026-11-10', [{ id: 'x1', nome: 'ANTIGA', workerIds: [] }])], []).prog).toEqual([]);
    expect(rodar([dia('2026-12-02', [{ id: 'x2', nome: 'DEZEMBRO', workerIds: [] }])], []).prog).toEqual([]);
  });

  it('a programação mudou a data: a atividade vai para o novo dia com a equipe', () => {
    const a = at('a', '2026-11-20', { escalaNome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' });
    const p = rodar(
      [dia('2026-11-18', [{ id: 'prog-a', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO', workerIds: ['w1', 'w2'] }], 2), dia('2026-11-20', [], 4)],
      [a],
    );
    expect(p.escala).toEqual([
      { type: 'activity/remove', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a' },
      { type: 'activity/put', weekKey: '2026-W47', dayIndex: 4, id: 'prog-a', nome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO', workerIds: ['w1', 'w2'] },
    ]);
  });

  it('dia passado não é mexido; mudança de data para trás vira aviso', () => {
    const a = at('a', '2026-11-25');
    const p = rodar([dia('2026-11-17', [{ id: 'prog-a', nome: 'X', workerIds: ['w1'] }], 1)], [a]);
    expect(p.escala).toEqual([]); // o dia 17 já passou: fica o histórico
    const b = at('b', '2026-11-17');
    const p2 = rodar([dia('2026-11-19', [{ id: 'prog-b', nome: 'X', workerIds: [] }], 3)], [b]);
    expect(p2.escala).toEqual([]);
    expect(p2.avisos[0].texto).toContain('mudou a data para 17/11/2026');
  });

  it('cancelada ou excluída na programação: só avisa na escala', () => {
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'X', workerIds: ['w1'] }, { id: 'prog-z', nome: 'Y', workerIds: [] }], 2)], [at('a', '2026-11-18', { classe: 'cancelada' })]);
    expect(p.escala).toEqual([]);
    expect(p.avisos.map((x) => [x.activityId, x.texto])).toEqual([
      ['prog-z', 'Não encontrada na programação (foi excluída?)'],
      ['prog-a', 'Cancelada na programação'],
    ]);
  });

  it('removida da escala: a programação recebe o aviso (nada é apagado)', () => {
    const a = at('a', '2026-11-18', { escalaNome: 'TROCAR CORREIA F-1 — PÁTIO DE MINÉRIO' });
    const p = rodar([dia('2026-11-18', [{ id: 'outra', nome: 'OUTRA', workerIds: [] }], 2)], [a, at('esc-outra', '2026-11-18', { descricao: 'OUTRA', area: '', origem: 'escala', escalaNome: 'OUTRA' })]);
    expect(p.prog.find((x) => x.id === 'a')?.foraDaEscala).toBe(true);
    // nunca incluída na escala: sem aviso
    const p2 = rodar([dia('2026-11-18', [], 2)], [at('b', '2026-11-18')]);
    expect(p2.prog).toEqual([]);
  });

  it('atividade criada na escala acompanha a quantidade de pessoas alocadas', () => {
    const e = at('esc-x9', '2026-11-19', { descricao: 'LIMPEZA', area: '', origem: 'escala', escalaNome: 'LIMPEZA', pessoas: 2 });
    const p = rodar([dia('2026-11-19', [{ id: 'x9', nome: 'LIMPEZA', workerIds: ['w1', 'w2', 'w3'] }], 3)], [e]);
    expect(p.prog[0].pessoas).toBe(3);
  });
});

describe('escala: colocar atividade com a equipe em outro dia', () => {
  it('quem está ausente no novo dia fica de fora; não duplica', async () => {
    const { reducer } = await import('../state/reducer');
    const { seedState } = await import('../domain/seed');
    let s = seedState((n) => n);
    s = reducer(s, { type: 'absence/set', weekKey: '2026-W47', dayIndex: 4, workerId: 'B', tipo: 'folga' });
    s = reducer(s, { type: 'activity/put', weekKey: '2026-W47', dayIndex: 4, id: 'prog-a', nome: 'troca', workerIds: ['A', 'B'] });
    s = reducer(s, { type: 'activity/put', weekKey: '2026-W47', dayIndex: 4, id: 'prog-a', nome: 'troca', workerIds: ['A'] });
    const acts = s.weeks['2026-W47'].days[4].activities;
    expect(acts).toEqual([{ id: 'prog-a', nome: 'TROCA', workerIds: ['A'] }]);
  });
});

describe('OMs do período do app', () => {
  it('“sem registro” a partir de 02/11/2026 vale como aguardando retorno; antes continua sem registro', async () => {
    const { situacaoEfetiva } = await import('../prog/model');
    const om = (d: string) => ({ om: '900039862681', area: 'URCP', equipamento: 'CT-135', descricao: 'TROCAR CORREIA CT-135', primeiraData: d, ultimaData: d, situacao: 'sem_registro' as const, retornoEm: '', retornoPor: '', baixaEm: '', baixaPor: '', cancelada: false });
    expect(situacaoEfetiva(om('2026-11-12'), undefined).situacao).toBe('aberta');
    expect(situacaoEfetiva(om('2026-11-12'), { realizada: true, em: 'x', por: 'sup' } as never).situacao).toBe('retornada');
    expect(situacaoEfetiva(om('2026-10-20'), undefined).situacao).toBe('sem_registro');
  });
});
