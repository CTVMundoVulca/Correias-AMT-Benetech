import { describe, expect, it } from 'vitest';
import { atividadeVazia, completarSolicitacao, completarOm, type Atividade } from '../prog/model';
import { aderencia, antecedenciaPorArea, backlogSemanas, demandas, esperas, motivosCancelamento, ocupacaoEfetivo, omsIdadeCiclo, percentSemOm, reincidencias, vidaEmendas } from '../prog/kpis';

let n = 0;
const at = (p: Partial<Atividade>): Atividade => ({ ...atividadeVazia(`a${n++}`, p.data ?? '2026-11-10', 'x'), area: 'COQUERIA', ...p });

describe('aderência à programação', () => {
  const l = [
    at({ execucao: 'executada' }),
    at({ execucao: 'executada' }),
    at({ execucao: 'executada' }),
    at({ execucao: 'nao_executada', execMotivo: 'Falta de material' }),
    at({ execucao: 'reprogramada', execMotivo: 'Chuva / condição climática' }),
    at({}), // sem apontamento
    at({ classe: 'cancelada' }),
    at({ data: '2026-11-20' }), // futura: não entra
  ];
  const r = aderencia(l, '2026-11-12');
  it('executadas ÷ apontadas; cobertura do apontamento', () => {
    expect([r.previstas, r.executadas, r.naoExecutadas, r.reprogramadas, r.semApontamento]).toEqual([6, 3, 1, 1, 1]);
    expect(r.indice).toBeCloseTo(0.6);
    expect(r.cobertura).toBeCloseTo(5 / 6);
    expect(r.motivosNaoExecucao.map((m) => m.chave)).toEqual(['Chuva / condição climática', 'Falta de material']);
  });
  it('sem apontamento: índice nulo (não inventa 0% nem 100%)', () => {
    expect(aderencia([at({})], '2026-11-12').indice).toBeNull();
  });
  it('motivos de cancelamento', () => {
    expect(motivosCancelamento([at({ classe: 'cancelada', motivo: 'Pedido duplicado' }), at({ classe: 'cancelada' })]).map((m) => m.chave)).toEqual(['Pedido duplicado', 'Sem motivo']);
  });
  it('antecedência por área (horas até 07:15 do dia)', () => {
    const a = antecedenciaPorArea([at({ data: '2026-11-12', comunicadoEm: new Date(2026, 10, 10, 7, 15).toISOString() })]);
    expect(a[0].horas).toBeCloseTo(48);
  });
});

describe('demandas e backlog', () => {
  const s = (p: object) => completarSolicitacao('s' + n++, { area: 'X', descricao: 'Y', solicitante: 'Z', ...p });
  const l = [
    s({ status: 'programada', criadoEm: '2026-11-10T10:00:00Z', atualizadoEm: '2026-11-10T14:00:00Z', dataDesejada: '2026-11-12', dataProgramada: '2026-11-12' }),
    s({ status: 'programada', criadoEm: '2026-11-10T10:00:00Z', atualizadoEm: '2026-11-11T10:00:00Z', dataDesejada: '2026-11-12', dataProgramada: '2026-11-14' }),
    s({ status: 'aberta', estimativa: 8 }),
    s({ status: 'aberta' }),
  ];
  it('tempo de resposta e atendimento na data', () => {
    const d = demandas(l);
    expect(d.respostaHoras).toBeCloseTo(14); // (4 h + 24 h) / 2
    expect(d.noPrazo).toBeCloseTo(0.5);
    expect(d.abertas).toBe(2);
  });
  it('backlog em semanas = (programado futuro + estimativas) ÷ (efetivo × 5)', () => {
    const b = backlogSemanas([at({ data: '2026-11-13', pessoas: 12 }), at({ data: '2026-11-01', pessoas: 50 })], l.filter((x) => x.status === 'aberta'), 4, '2026-11-12');
    expect(b.programado).toBe(12);
    expect(b.pedidos).toBe(8);
    expect(b.semEstimativa).toBe(1);
    expect(b.semanas).toBeCloseTo(1);
  });
});

describe('OMs', () => {
  const o = (p: object) => completarOm('9' + String(n++).padStart(11, '0'), { primeiraData: '2026-10-01', ...p });
  it('idade das pendentes e ciclo retorno/baixa', () => {
    const r = omsIdadeCiclo(
      [
        o({ situacao: 'aberta', ultimaData: '2026-11-10' }),
        o({ situacao: 'retornada', ultimaData: '2026-10-25', retornoEm: '2026-10-27T10:00:00Z' }),
        o({ situacao: 'aberta', ultimaData: '2026-09-01' }),
        o({ situacao: 'baixada', ultimaData: '2026-10-01', retornoEm: '2026-10-03T10:00:00Z', baixaEm: '2026-10-07T10:00:00Z' }),
      ],
      '2026-11-12',
    );
    expect(r.faixa).toEqual({ ate7: 1, ate30: 1, mais30: 1 });
    expect(r.diasAteRetorno).toBeCloseTo(2);
    expect(r.diasAteBaixa).toBeCloseTo(4);
  });
  it('% sem OM', () => {
    expect(percentSemOm([at({ om: '1' }), at({})])).toBeCloseTo(0.5);
  });
});

describe('confiabilidade por TAG', () => {
  it('reincidência: mesmo serviço em dias seguidos conta uma vez', () => {
    const l = [
      at({ equipamento: 'L-21', tipo: 'Emenda / intercalação', data: '2026-09-01' }),
      at({ equipamento: 'L-21', tipo: 'Emenda / intercalação', data: '2026-09-02' }), // mesmo serviço
      at({ equipamento: 'L 21', tipo: 'Reparo', data: '2026-09-20' }), // 18 dias depois → reincidência
      at({ equipamento: 'M-104', tipo: 'Reparo', data: '2026-01-01' }),
      at({ equipamento: 'M-104', tipo: 'Reparo', data: '2026-08-01' }),
      at({ equipamento: 'X-1', tipo: 'Logística (buscar, posicionar, descartar)', data: '2026-09-01' }),
    ];
    const r = reincidencias(l, 30);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tag: 'L-21', eventos: 2, reincidencias: 1, menorIntervalo: 18 });
  });
  it('vida da emenda por TAG (Registro de Emenda)', () => {
    const v = vidaEmendas([
      { tag: 'L-21', data: '2026-01-10' },
      { tag: 'l-21', data: '2026-01-11' }, // mesma parada
      { tag: 'L-21', data: '2026-04-10' },
      { tag: 'L-21', data: '2026-06-09' },
      { tag: 'B-5', data: '2026-03-01' },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].tag).toBe('L-21');
    expect(v[0].intervalos).toBe(2);
    expect(v[0].menorDias).toBe(60);
  });
});

describe('efetivo e esperas', () => {
  it('ocupação e absenteísmo só em dias úteis', () => {
    // 09–13/11/2026 (seg–sex) + 14 (sáb)
    const dias = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
    const r = ocupacaoEfetivo([at({ data: '2026-11-10', pessoas: 18 }), at({ data: '2026-11-14', pessoas: 5 })], 20, dias, [{ data: '2026-11-10', ausentes: 2 }], {});
    expect(r.diasUteis).toBe(5);
    expect(r.disponivel).toBe(98);
    expect(r.programado).toBe(18);
    expect(r.absenteismo).toBeCloseTo(0.02);
  });
  it('horas perdidas por motivo (atrasos com fim)', () => {
    const base = { id: 'x', semana: '2026-W46', diaId: '2026-W46_0', atividadeId: 'a', descricao: '', criadoUid: '', criadoEm: '', atualizadoEm: '', por: '' };
    const e = esperas([
      { ...base, atividadeNome: 'TROCAR C-3', inicio: '07:30', fim: '09:00', motivo: 'Bloqueio' },
      { ...base, atividadeNome: 'TROCAR C-3', inicio: '13:00', fim: '13:30', motivo: 'Recurso' },
      { ...base, atividadeNome: 'TROCAR C-3', inicio: '14:00', fim: '', motivo: 'Bloqueio' }, // em andamento: fora da soma
    ]);
    expect(e.horas).toBeCloseTo(2);
    expect(e.porMotivo[0]).toEqual({ chave: 'Bloqueio', horas: 1.5 });
  });
});

import { cargaCapacidade, proximosDiasUteis } from '../prog/kpis';

describe('carga × capacidade', () => {
  it('próximos dias úteis pulam fim de semana e feriado', () => {
    // 12/11/2026 qui; 13 sex; 14–15 fds; 16 seg; 20 sex = Consciência Negra
    expect(proximosDiasUteis('2026-11-12', 6, {})).toEqual(['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
    expect(proximosDiasUteis('2026-11-19', 2, {})).toEqual(['2026-11-19', '2026-11-23']);
  });
  it('folga, limite e lotado; capacidade desconta ausências', () => {
    const l = [at({ data: '2026-11-12', pessoas: 10 }), at({ data: '2026-11-13', pessoas: 18 }), at({ data: '2026-11-16', pessoas: 25 }), at({ data: '2026-11-16', pessoas: 9, classe: 'cancelada' })];
    const r = cargaCapacidade(['2026-11-12', '2026-11-13', '2026-11-16'], l, 22, new Map([['2026-11-13', 2]]));
    expect(r.map((x) => [x.programado, x.capacidade, x.livres, x.nivel, x.semEscala])).toEqual([
      [10, 22, 12, 'folga', true],
      [18, 20, 2, 'limite', false],
      [25, 22, 0, 'lotado', true],
    ]);
  });
});

import { semanasDe, tituloMeses } from '../prog/CargaCapacidade';

describe('cabeçalho da carga × capacidade', () => {
  it('mês no título e dias agrupados por semana', () => {
    const d = ['2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01'];
    expect(tituloMeses(d)).toBe('Novembro – Dezembro 2026');
    expect(tituloMeses(['2026-11-12', '2026-11-13'])).toBe('Novembro 2026');
    expect(tituloMeses(['2026-12-31', '2027-01-04'])).toBe('Dezembro 2026 – Janeiro 2027');
    expect(semanasDe(d)).toEqual([
      { semana: 48, n: 2 },
      { semana: 49, n: 2 },
    ]);
  });
});
