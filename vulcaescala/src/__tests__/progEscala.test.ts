import { describe, expect, it } from 'vitest';
import { atividadeVazia, type Atividade } from '../prog/model';
import { planejar, nomeNaEscala, descricaoDoNome, partesDoNome, type DiaEscala } from '../integracao/progEscala';
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
    expect(nomeNaEscala({ descricao: 'RETIRAR CORREIA E FAZER BY PASS - NOITE', equipamento: 'M-11', area: 'PÁTIO DE MINÉRIO' })).toBe('M-11 - PÁTIO DE MINÉRIO · RETIRAR CORREIA E FAZER BY PASS - NOITE');
    expect(descricaoDoNome('m-11 - pátio de minério · retirar correia', 'PÁTIO DE MINÉRIO', 'M-11')).toBe('RETIRAR CORREIA');
    expect(partesDoNome('M-11 - PÁTIO DE MINÉRIO · RETIRAR CORREIA')).toEqual({ cabecalho: 'M-11 - PÁTIO DE MINÉRIO', descricao: 'RETIRAR CORREIA' });
    expect(partesDoNome('LIMPEZA DA OFICINA')).toEqual({ cabecalho: '', descricao: 'LIMPEZA DA OFICINA' });
    // formato antigo ainda é entendido
    expect(descricaoDoNome('trocar correia f-2 — pátio de minério', 'PÁTIO DE MINÉRIO')).toBe('TROCAR CORREIA F-2');
    expect(descricaoDoNome('REPARO NA C-3', 'PÁTIO DE MINÉRIO')).toBe('REPARO NA C-3');
  });

  it('nomes iguais: só registra o nome sincronizado (nada muda na escala)', () => {
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1', workerIds: ['w1'] }], 2)], [at('a', '2026-11-18')]);
    expect(p.escala).toEqual([]);
    expect(p.prog.map((x) => x.escalaNome)).toEqual(['PÁTIO DE MINÉRIO · TROCAR CORREIA F-1']);
    // segunda passada: estável
    const p2 = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1', workerIds: ['w1'] }], 2)], p.prog);
    expect(p2.prog).toEqual([]);
    expect(p2.escala).toEqual([]);
  });

  it('a escala mudou o nome: a programação recebe a nova descrição', () => {
    const a = at('a', '2026-11-18', { escalaNome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1' });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1 E EMENDA', workerIds: [] }], 2)], [a]);
    expect(p.escala).toEqual([]);
    expect(p.prog[0].descricao).toBe('TROCAR CORREIA F-1 E EMENDA');
    expect(p.prog[0].escalaNome).toBe('PÁTIO DE MINÉRIO · TROCAR CORREIA F-1 E EMENDA');
  });

  it('a programação mudou (ou sem registro): a escala recebe o nome', () => {
    const a = at('a', '2026-11-18', { descricao: 'TROCAR CORREIA F-1 (NOVA)', escalaNome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1' });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1', workerIds: [] }], 2)], [a]);
    expect(p.escala).toEqual([{ type: 'activity/rename', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1 (NOVA)' }]);
    const semRegistro = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'OUTRO NOME', workerIds: [] }], 2)], [at('a', '2026-11-18')]);
    expect(semRegistro.escala[0]).toMatchObject({ type: 'activity/rename', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1' });
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
    const a = at('a', '2026-11-20', { escalaNome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1' });
    const p = rodar(
      [dia('2026-11-18', [{ id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1', workerIds: ['w1', 'w2'] }], 2), dia('2026-11-20', [], 4)],
      [a],
    );
    expect(p.escala).toEqual([
      { type: 'activity/remove', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a' },
      { type: 'activity/put', weekKey: '2026-W47', dayIndex: 4, id: 'prog-a', nome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1', workerIds: ['w1', 'w2'] },
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
    const a = at('a', '2026-11-18', { escalaNome: 'PÁTIO DE MINÉRIO · TROCAR CORREIA F-1' });
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

describe('OM com atividade cancelada ou excluída', () => {
  it('sem atividade ativa a OM fica cancelada; voltando a ter, deixa de estar', async () => {
    const { cancelamentoDasOms } = await import('../prog/model');
    const om = (n: string, d: string, x: Record<string, unknown> = {}) => ({ om: n, area: 'URCP', equipamento: 'N-11', descricao: 'TROCAR CORREIA N-11', primeiraData: d, ultimaData: d, situacao: 'aberta' as const, retornoEm: '', retornoPor: '', baixaEm: '', baixaPor: '', cancelada: false, ...x });
    const oms = [om('1', '2026-11-10'), om('2', '2026-11-10'), om('3', '2026-10-20'), om('4', '2026-11-10', { situacao: 'retornada' }), om('5', '2026-11-10', { cancelada: true })];
    const ativs = [at('a', '2026-11-10', { om: '1', classe: 'cancelada' }), at('b', '2026-11-11', { om: '5' })];
    // 1: só atividade cancelada → cancela; 2: atividade excluída → cancela; 3: antes do período, 4: já retornada → intocadas; 5: voltou a ter atividade
    expect(cancelamentoDasOms(oms, ativs).map((o) => [o.om, o.cancelada])).toEqual([['1', true], ['2', true], ['5', false]]);
    expect(cancelamentoDasOms(cancelamentoDasOms(oms, ativs).concat(oms.slice(2, 4)), ativs)).toEqual([]); // idempotente
  });
});

describe('cancelada com a equipe mobilizada (apropriar horas na OM)', () => {
  it('a OM continua para retorno e baixa; horas entram no KPI', async () => {
    const { cancelamentoDasOms, resumir, completarAtividade } = await import('../prog/model');
    const om = { om: '4', area: 'URCP', equipamento: 'D-4', descricao: 'REPARO D-4', primeiraData: '2026-11-12', ultimaData: '2026-11-12', situacao: 'aberta' as const, retornoEm: '', retornoPor: '', baixaEm: '', baixaPor: '', cancelada: true };
    const d4 = at('d4', '2026-11-12', { om: '4', classe: 'cancelada', motivo: 'Equipamento não liberado (bloqueio)', mobilizada: true, horasMobilizadas: 3.5, pessoas: 4 });
    expect(cancelamentoDasOms([om], [d4]).map((o) => o.cancelada)).toEqual([false]);
    expect(cancelamentoDasOms([{ ...om, cancelada: false }], [{ ...d4, mobilizada: false }]).map((o) => o.cancelada)).toEqual([true]);
    const r = resumir([d4, at('x', '2026-11-12', { classe: 'cancelada', motivo: 'Chuva / condição climática' })]);
    expect(r.classes.cancelada).toBe(2); // continua cancelada nos indicadores
    expect([r.mobilizadas, r.horasPerdidas]).toEqual([1, 14]);
    expect(r.horasPorMotivo).toEqual([{ motivo: 'Equipamento não liberado (bloqueio)', horas: 14, n: 1 }]);
    // da nuvem: só vale em cancelada; horas limitadas
    expect(completarAtividade('a', { ...d4, classe: 'programada' })).toMatchObject({ mobilizada: false, horasMobilizadas: 0 });
    expect(completarAtividade('a', { ...d4, horasMobilizadas: 99 })?.horasMobilizadas).toBe(24);
  });
});

describe('OM programada para depois de hoje', () => {
  it('não entra nas pendentes até o dia da execução', async () => {
    const { omFutura } = await import('../prog/model');
    const om = (d: string, x: Record<string, unknown> = {}) => ({ om: '1', area: 'URCP', equipamento: 'L-203', descricao: 'X', primeiraData: d, ultimaData: d, situacao: 'aberta' as const, retornoEm: '', retornoPor: '', baixaEm: '', baixaPor: '', cancelada: false, ...x });
    const H = '2026-11-16';
    expect(omFutura(om('2026-11-19'), H)).toBe(true); // L-203 no dia 19
    expect(omFutura(om('2026-11-16'), H)).toBe(false); // hoje já pode ter retorno
    expect(omFutura(om('2026-11-19', { situacao: 'retornada' }), H)).toBe(false);
    // primeira data antiga, mas a atividade foi reprogramada para o dia 19
    expect(omFutura(om('2026-11-12'), H, [{ data: '2026-11-19' }])).toBe(true);
    // uma das atividades já passou: pendente
    expect(omFutura(om('2026-11-12'), H, [{ data: '2026-11-12' }, { data: '2026-11-19' }])).toBe(false);
  });
});

describe('tempo parado pela hora de início e fim', () => {
  it('calcula a duração, inclusive passando da meia-noite', async () => {
    const { duracaoHoras, fmtDuracao, completarAtividade } = await import('../prog/model');
    expect(duracaoHoras('07:10', '09:00')).toBeCloseTo(110 / 60);
    expect(fmtDuracao(duracaoHoras('07:10', '09:00'))).toBe('1h50');
    expect(duracaoHoras('22:30', '01:00')).toBe(2.5);
    expect(duracaoHoras('07:00', '')).toBe(0);
    expect(duracaoHoras('25:00', '09:00')).toBe(0);
    const d = completarAtividade('a', { ...at('a', '2026-11-16'), classe: 'cancelada', mobilizada: true, mobInicio: '07:15', mobFim: '10:45', horasMobilizadas: 3.5 });
    expect(d).toMatchObject({ mobInicio: '07:15', mobFim: '10:45', horasMobilizadas: 3.5 });
    expect(completarAtividade('a', { ...at('a', '2026-11-16'), classe: 'programada', mobInicio: '07:15' })?.mobInicio).toBe('');
  });
});

describe('equipamento e área no começo do nome da escala', () => {
  const base = { descricao: 'EQUIPE DIA - TROCA DA CORREIA', equipamento: 'L-203', area: 'PÁTIO DE MINÉRIO' };
  it('monta e desmonta o nome', () => {
    expect(nomeNaEscala(base)).toBe('L-203 - PÁTIO DE MINÉRIO · EQUIPE DIA - TROCA DA CORREIA');
    expect(nomeNaEscala({ ...base, equipamento: '' })).toBe('PÁTIO DE MINÉRIO · EQUIPE DIA - TROCA DA CORREIA');
    expect(nomeNaEscala({ ...base, area: '', equipamento: '' })).toBe('EQUIPE DIA - TROCA DA CORREIA');
    expect(descricaoDoNome('L-203 - PÁTIO DE MINÉRIO · EQUIPE DIA - TROCA DA CORREIA', base.area, base.equipamento)).toBe('EQUIPE DIA - TROCA DA CORREIA');
    expect(descricaoDoNome('EQUIPE DIA - TROCA DA CORREIA (L-203) — PÁTIO DE MINÉRIO', base.area, base.equipamento)).toBe('EQUIPE DIA - TROCA DA CORREIA');
  });

  it('nome antigo sem mudança na escala: a escala recebe o formato novo (equipe mantida)', () => {
    const antigo = 'EQUIPE DIA - TROCA DA CORREIA (L-203) — PÁTIO DE MINÉRIO';
    const x = at('a', '2026-11-18', { ...base, escalaNome: antigo });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: antigo, workerIds: ['w1'] }], 2)], [x]);
    expect(p.escala).toEqual([{ type: 'activity/rename', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a', nome: 'L-203 - PÁTIO DE MINÉRIO · EQUIPE DIA - TROCA DA CORREIA' }]);
    expect(p.prog[0].descricao).toBe('EQUIPE DIA - TROCA DA CORREIA');
  });

  it('nome antigo editado na escala: a edição vai para a programação (não é perdida)', () => {
    const x = at('a', '2026-11-18', { ...base, escalaNome: 'EQUIPE DIA - TROCA DA CORREIA (L-203) — PÁTIO DE MINÉRIO' });
    const p = rodar([dia('2026-11-18', [{ id: 'prog-a', nome: 'EQUIPE NOITE - TROCA DA CORREIA (L-203) — PÁTIO DE MINÉRIO', workerIds: [] }], 2)], [x]);
    expect(p.prog[0].descricao).toBe('EQUIPE NOITE - TROCA DA CORREIA');
    expect(p.escala).toEqual([{ type: 'activity/rename', weekKey: '2026-W47', dayIndex: 2, activityId: 'prog-a', nome: 'L-203 - PÁTIO DE MINÉRIO · EQUIPE NOITE - TROCA DA CORREIA' }]);
  });
});

describe('cancelamento com equipe mobilizada: vários períodos de espera', () => {
  it('soma os períodos e mantém compatibilidade com o lançamento antigo', async () => {
    const { completarAtividade, periodosDaMob, horasDosPeriodos, faixasMob, horasHomemMobilizadas } = await import('../prog/model');
    const per = [{ inicio: '09:00', fim: '10:00', motivo: 'Bloqueio', descricao: '' }, { inicio: '13:00', fim: '14:30', motivo: '', descricao: 'Aguardando PT' }];
    expect(horasDosPeriodos(per)).toBe(2.5);
    const d = completarAtividade('a', { ...at('a', '2026-11-16'), classe: 'cancelada', mobilizada: true, pessoas: 3, mobPeriodos: per, mobInicio: '09:00', mobFim: '14:30', horasMobilizadas: 2.5 })!;
    expect(d.mobPeriodos).toEqual(per);
    expect(faixasMob(d)).toBe('09:00–10:00 (Bloqueio), 13:00–14:30 (Aguardando PT)');
    expect(horasHomemMobilizadas(d)).toBe(7.5);
    // antigo: só início e fim
    const antigo = completarAtividade('b', { ...at('b', '2026-11-16'), classe: 'cancelada', mobilizada: true, mobInicio: '07:15', mobFim: '10:45', horasMobilizadas: 3.5 })!;
    expect(antigo.mobPeriodos).toEqual([]);
    expect(periodosDaMob(antigo)).toEqual([{ inicio: '07:15', fim: '10:45', motivo: '', descricao: '' }]);
    // horários inválidos e linhas vazias saem
    expect(completarAtividade('c', { ...at('c', '2026-11-16'), classe: 'cancelada', mobilizada: true, mobPeriodos: [{ inicio: '25:00', fim: '' }, { inicio: '08:00', fim: '09:00' }] as never })!.mobPeriodos).toEqual([{ inicio: '08:00', fim: '09:00', motivo: '', descricao: '' }]);
  });

  it('cada período entra nas horas perdidas com o seu motivo (uma atividade cancelada só)', async () => {
    const { completarAtividade } = await import('../prog/model');
    const { perdasDoPeriodo, somarPerdas, perdasPorMotivo } = await import('../prog/atrasosProg');
    const d = completarAtividade('a', {
      ...at('a', '2026-11-16'), classe: 'cancelada', motivo: 'Nível de silo', mobilizada: true, pessoas: 3, mobInicio: '09:00', mobFim: '14:30', horasMobilizadas: 2.5,
      mobPeriodos: [{ inicio: '09:00', fim: '10:00', motivo: 'Bloqueio', descricao: '' }, { inicio: '13:00', fim: '14:30', motivo: 'Recurso', descricao: 'munck' }],
    })!;
    const l = perdasDoPeriodo([d], null);
    expect(l.map((p) => [p.inicio, p.horas, p.hh])).toEqual([['09:00', 1, 3], ['13:00', 1.5, 4.5]]);
    const t = somarPerdas(l);
    expect([t.hh, t.cancelamentos]).toEqual([7.5, 1]);
    expect(perdasPorMotivo(l).map((m) => m.chave)).toEqual(['Cancelamento: espera · Recurso', 'Cancelamento: espera · Bloqueio']);
  });
});

describe('atividade lançada na Escala pelo formulário da Programação', () => {
  it('nasce ligada à programação: nada a sincronizar e nada a revisar', () => {
    // o formulário grava na programação (origem "app") e a escala inclui com o id "prog-<id>"
    const a = at('nova1', '2026-11-18', { descricao: 'REPARO NA EMENDA DA CORREIA C-5', area: 'COQUERIA', equipamento: 'C-5', classe: 'emergencia', pessoas: 3 });
    const nome = nomeNaEscala(a);
    expect(nome).toBe('C-5 - COQUERIA · REPARO NA EMENDA DA CORREIA C-5');
    const p = rodar([dia('2026-11-18', [{ id: 'prog-nova1', nome, workerIds: [] }], 2)], [a]);
    expect(p.escala).toEqual([]);
    expect(p.avisos).toEqual([]);
    expect(p.prog.map((x) => [x.id, x.escalaNome, x.revisarEscala])).toEqual([['nova1', nome, false]]);
    // segunda passada: estável
    expect(rodar([dia('2026-11-18', [{ id: 'prog-nova1', nome, workerIds: [] }], 2)], p.prog).prog).toEqual([]);
  });
});
