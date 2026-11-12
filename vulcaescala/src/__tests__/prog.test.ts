import { describe, expect, it } from 'vitest';
import {
  AREA_INTERNA,
  alocacaoDoDia,
  atividadeVazia,
  classificar,
  recebidoEm,
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

describe('classificação (regra da vulcanização AMT)', () => {
  const c = (data: string, comunicado: Date, mun: Record<string, string> = {}) => classificar(data, comunicado, mun)?.classe;
  it('fim de semana e feriado = emergência, mesmo comunicada com antecedência', () => {
    expect(c('2026-11-14', new Date(2026, 9, 1))).toBe('emergencia'); // sábado
    expect(c('2026-11-15', new Date(2026, 9, 1))).toBe('emergencia'); // domingo (e Proclamação)
    expect(c('2026-11-20', new Date(2026, 9, 1))).toBe('emergencia'); // Consciência Negra (sexta)
    expect(c('2026-09-08', new Date(2026, 7, 1), { '2026-09-08': 'Nossa Senhora da Vitória' })).toBe('emergencia'); // municipal
    expect(classificar('2026-11-20', new Date(2026, 9, 1))?.motivo).toBe('feriado (Consciência Negra)');
  });
  it('48 h corridas do recebimento do pedido até 07:15 do dia da atividade', () => {
    // quinta 12/11/2026 07:15 − 48 h = terça 10/11 07:15
    expect(c('2026-11-12', new Date(2026, 10, 10, 7, 15))).toBe('programada');
    expect(c('2026-11-12', new Date(2026, 10, 10, 7, 16))).toBe('nao_programada');
    expect(c('2026-11-12', new Date(2026, 10, 9, 15, 0))).toBe('programada');
    expect(c('2026-11-12', new Date(2026, 10, 12, 9, 0))).toBe('nao_programada'); // no próprio dia
    // antes das 07:15 da terça conta como 07:15 da terça → ainda 48 h
    expect(c('2026-11-12', new Date(2026, 10, 10, 6, 0))).toBe('programada');
    // segunda à noite (depois das 17:15) conta como terça 07:15 → 48 h
    expect(c('2026-11-12', new Date(2026, 10, 9, 20, 0))).toBe('programada');
    // terça 17:30 → recebido quarta 07:15 → 24 h
    expect(c('2026-11-12', new Date(2026, 10, 10, 17, 30))).toBe('nao_programada');
  });
  it('pedido no fim de semana conta a partir de 07:15 do próximo dia útil', () => {
    // sexta 06/11 16:00 para segunda 09/11: 63 h 15 min → programada
    expect(c('2026-11-09', new Date(2026, 10, 6, 16, 0))).toBe('programada');
    // sábado 07/11 para terça 10/11: recebido segunda 09/11 07:15 → 24 h → não programada
    expect(c('2026-11-10', new Date(2026, 10, 7, 10, 0))).toBe('nao_programada');
    // sábado 07/11 para quarta 11/11: recebido segunda 07:15 → 48 h → programada
    expect(c('2026-11-11', new Date(2026, 10, 7, 10, 0))).toBe('programada');
    // quinta 19/11 18:00, sexta 20/11 é feriado → recebido segunda 23/11 07:15; atividade terça 24/11 → não programada
    expect(c('2026-11-24', new Date(2026, 10, 19, 18, 0))).toBe('nao_programada');
    expect(recebidoEm(new Date(2026, 10, 19, 18, 0)).toString()).toBe(new Date(2026, 10, 23, 7, 15).toString());
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

import { completarPapeis, permissoes, situacaoEfetiva, completarOm } from '../prog/model';

describe('papéis da gestão', () => {
  const p = completarPapeis({ admins: ['Chefe@x.com'], programadores: ['prog@x.com', 'invalido'], supervisores: ['sup@x.com'] });
  it('limpa a lista (minúsculas, e-mails válidos)', () => {
    expect(p.admins).toEqual(['chefe@x.com']);
    expect(p.programadores).toEqual(['prog@x.com']);
  });
  it('cada papel com o que pode', () => {
    expect(permissoes(null, p, false)).toEqual({ programar: false, retorno: false, administrar: false });
    expect(permissoes('prog@x.com', p, false)).toEqual({ programar: true, retorno: false, administrar: false });
    expect(permissoes('SUP@x.com', p, false)).toEqual({ programar: false, retorno: true, administrar: false });
    expect(permissoes('chefe@x.com', p, false)).toEqual({ programar: true, retorno: true, administrar: true });
    expect(permissoes('outro@x.com', p, true)).toEqual({ programar: true, retorno: true, administrar: true }); // administrador da escala
    expect(permissoes('outro@x.com', p, false).programar).toBe(false);
  });
});

describe('situação da OM: baixa (programação) > retorno (supervisor) > cadastro', () => {
  const base = completarOm('900000000001', { situacao: 'aberta', primeiraData: '2026-11-10', ultimaData: '2026-11-10' });
  it('retorno do supervisor muda aberta para realizada e de volta', () => {
    expect(situacaoEfetiva(base, { realizada: true, em: 't', por: 's' }).situacao).toBe('retornada');
    expect(situacaoEfetiva({ ...base, situacao: 'retornada' }, { realizada: false, em: 't', por: 's' }).situacao).toBe('aberta');
    expect(situacaoEfetiva(base, undefined).situacao).toBe('aberta');
  });
  it('baixada continua baixada', () => {
    expect(situacaoEfetiva({ ...base, situacao: 'baixada' }, { realizada: false, em: 't', por: 's' }).situacao).toBe('baixada');
  });
});
