import { describe, expect, it } from 'vitest';
import {
  AREA_INTERNA,
  alocacaoDoDia,
  atividadeVazia,
  classeSugerida,
  completarAtividade,
  diasEntre,
  limparOm,
  mesesEntre,
  porArea,
  porEquipamento,
  resumir,
  tipoPelaDescricao,
  type Atividade,
} from '../prog/model';
import { omDaAtividade } from '../prog/data';

const at = (p: Partial<Atividade>): Atividade => ({ ...atividadeVazia(p.id ?? Math.random().toString(36), p.data ?? '2026-11-11', 'x'), ...p });

describe('classificação sugerida', () => {
  it('lançada antes da segunda-feira da semana = programada; durante a semana = não programada', () => {
    // 11/11/2026 é quarta; a semana começa em 09/11
    expect(classeSugerida('2026-11-11', new Date(2026, 10, 6, 15))).toBe('programada');
    expect(classeSugerida('2026-11-11', new Date(2026, 10, 8, 23, 30))).toBe('programada'); // domingo à noite (horário local)
    expect(classeSugerida('2026-11-11', new Date(2026, 10, 9, 7))).toBe('nao_programada');
    expect(classeSugerida('2026-11-11', new Date(2026, 10, 1), true)).toBe('emergencia');
  });
});

describe('tipo de serviço pela descrição (verbos da planilha)', () => {
  it.each([
    ['TROCAR CORREIA M-104', 'Troca de correia'],
    ['TROCAR EMENDA DA CORREIA B-5', 'Emenda / intercalação'],
    ['INTERCALAÇÃO A GRAMPO DA CORREIA SR-3', 'Emenda / intercalação'],
    ['REPARO NA EMENDA DA CORREIA T-13', 'Reparo'],
    ['PREPARAÇÃO DA CORREIA C-3', 'Preparação de correia'],
    ['TURNO: PREPARAÇÃO DA CORREIA B-9R', 'Preparação de correia'],
    ['BUSCAR CORREIA S-122', 'Logística (buscar, posicionar, descartar)'],
    ['DECARTE DE CORREIAS', 'Logística (buscar, posicionar, descartar)'],
    ['TREINAMENTO DA SUNCOKE', 'Treinamento / exame'],
    ['FABRICAR 100 PEÇAS', 'Fabricação de peças'],
    ['FERIADO DE CARNAVAL', 'Outros'],
  ])('%s → %s', (d, t) => expect(tipoPelaDescricao(d)).toBe(t));
});

describe('OM', () => {
  it('só dígitos', () => {
    expect(limparOm(' 9000.3326-9317 ')).toBe('900033269317');
  });
  it('cadastro da OM a partir da atividade não mexe na situação', () => {
    const a = at({ om: '900033269317', data: '2026-11-11', area: 'SINTERIZAÇÃO' });
    const nova = omDaAtividade(a, undefined)!;
    expect(nova.situacao).toBe('aberta');
    expect(nova.primeiraData).toBe('2026-11-11');
    const baixada = { ...nova, situacao: 'baixada' as const };
    const depois = omDaAtividade({ ...a, data: '2026-11-13' }, baixada)!;
    expect(depois.situacao).toBe('baixada');
    expect(depois.ultimaData).toBe('2026-11-13');
    expect(depois.primeiraData).toBe('2026-11-11');
    expect(omDaAtividade({ ...a, data: '2026-11-12' }, depois)).toBeNull(); // nada mudou
    expect(omDaAtividade({ ...a, om: '' }, undefined)).toBeNull();
  });
});

describe('painel do dia (onde está o efetivo)', () => {
  it('agrupa por área, soma pessoas e separa as canceladas', () => {
    const l = [
      at({ area: 'PÁTIO DE MINÉRIO', pessoas: 5, equipamento: 'F-1' }),
      at({ area: 'PÁTIO DE MINÉRIO', pessoas: 5, equipamento: 'L-8R' }),
      at({ area: 'ALTO FORNO 1', pessoas: 5 }),
      at({ area: 'COQUERIA', pessoas: 3, classe: 'cancelada' }),
      at({ area: '', pessoas: 2 }),
      at({ area: 'URCP', pessoas: 4, data: '2026-11-12' }),
    ];
    const r = alocacaoDoDia(l, '2026-11-11');
    expect(r.areas.map((a) => [a.area, a.pessoas])).toEqual([
      ['PÁTIO DE MINÉRIO', 10],
      ['ALTO FORNO 1', 5],
      [AREA_INTERNA, 2],
    ]);
    expect(r.pessoas).toBe(17);
    expect(r.canceladas).toHaveLength(1);
  });
});

describe('dashboard', () => {
  const l = [
    at({ area: 'COQUERIA', classe: 'programada', pessoas: 4, equipamento: 'C-3', om: '1' }),
    at({ area: 'COQUERIA', classe: 'programada', pessoas: 4, equipamento: 'C-3' }),
    at({ area: 'COQUERIA', classe: 'emergencia', pessoas: 2, equipamento: 'BC-331', retrabalho: true }),
    at({ area: 'SINTERIZAÇÃO', classe: 'nao_programada', pessoas: 5, equipamento: 'M-104' }),
    at({ area: 'SINTERIZAÇÃO', classe: 'cancelada', pessoas: 5, equipamento: 'M-104' }),
    at({ area: 'ACIARIA', classe: '', pessoas: 3 }),
  ];
  it('resumo e índices', () => {
    const r = resumir(l);
    expect(r.total).toBe(6);
    expect(r.classes).toEqual({ programada: 2, nao_programada: 1, emergencia: 1, cancelada: 1, sem: 1 });
    expect(r.pessoasDia).toBe(18); // cancelada não conta
    expect(r.retrabalho).toBe(1);
    expect(r.indiceProgramacao).toBe(0.5); // 2 de 4 executadas
    expect(r.indiceCancelamento).toBe(0.2); // 1 de 5 classificadas
    expect(r.comOm).toBe(1);
    expect(resumir([]).indiceProgramacao).toBeNull();
  });
  it('por área e equipamentos', () => {
    expect(porArea(l).map((g) => [g.chave, g.total])).toEqual([
      ['COQUERIA', 3],
      ['SINTERIZAÇÃO', 2],
      ['ACIARIA', 1],
    ]);
    expect(porEquipamento(l, 2).map((g) => g.chave)).toEqual(['C-3 · COQUERIA', 'M-104 · SINTERIZAÇÃO']);
  });
});

describe('utilidades', () => {
  it('meses entre datas e dias corridos', () => {
    expect(mesesEntre('2025-11-20', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(diasEntre('2026-11-01', '2026-11-11')).toBe(10);
  });
  it('dados inválidos da nuvem são descartados ou corrigidos', () => {
    expect(completarAtividade('x', { data: 'ontem' })).toBeNull();
    const a = completarAtividade('x', { data: '2026-11-11', pessoas: 99, classe: 'outra', equipe: 'noite' })!;
    expect(a.pessoas).toBe(40);
    expect(a.classe).toBe('');
    expect(a.equipe).toBe('dia');
  });
});
