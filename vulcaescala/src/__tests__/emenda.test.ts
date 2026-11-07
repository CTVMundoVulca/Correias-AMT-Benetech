import { describe, expect, it } from 'vitest';
import { completarEmenda, intervaloMes, nomeMes, novaEmenda, ordenar, recalcular, somaHora, somaMes, type Emenda } from '../emenda/model';

const base = () => novaEmenda('e1', '2026-11-07', 'teste');
const com = (p: Partial<Emenda>, alterados: (keyof Emenda)[]) => {
  const e = { ...base(), ...p };
  return { ...e, ...recalcular(e, alterados) };
};

describe('cálculos automáticos (regras do app do Suzano)', () => {
  it('viés: frio = largura/2; quente = largura × 0,364', () => {
    expect(com({ largura: '1200' }, ['largura']).vies).toBe('600');
    expect(com({ largura: '1200', tipoEmenda: 'Quente' }, ['largura']).vies).toBe('437');
  });

  it('lona: passes = lonas − 1 e compr. passe = total / passes', () => {
    const e = com({ qtdLona: '4', comprTotal: '1500' }, ['qtdLona']);
    expect(e.qtdPasses).toBe('3');
    expect(e.comprPasse).toBe('500');
    expect(e.chanfro).toBe('N/A');
  });

  it('cabo de aço a quente: estágios e chanfro', () => {
    const e = com({ tipoCorreia: 'Cabo Aço', tipoEmenda: 'Quente', comprTotal: '2000' }, ['comprTotal']);
    expect(e.estagio1).toBe('1820');
    expect(e.estagio2).toBe('930');
    expect(e.chanfro).toBe('60');
    expect(e.pressaoVulc).toBe('10');
  });

  it('demãos e fechamento: frio +10min, quente +30min, cabo de aço +3h', () => {
    expect(com({ demao1: '08:00' }, ['demao1'])).toMatchObject({ demao2: '09:00', horaFechada: '09:10', rodilhada: 'Sim' });
    expect(com({ demao1: '08:40', tipoEmenda: 'Quente' }, ['demao1'])).toMatchObject({ demao2: '09:40', horaFechada: '10:10', horaAbertura: '14:10' });
    expect(com({ demao1: '22:30', tipoCorreia: 'Cabo Aço' }, ['demao1'])).toMatchObject({ demao2: '23:30', horaFechada: '02:30' });
  });

  it('quente: parâmetros padrão da prensa e data do teste', () => {
    const e = com({ tipoEmenda: 'Quente' }, ['tipoEmenda']);
    expect(e).toMatchObject({ tempVulc: '150°', tempoVulc: '45', pressaoVulc: '8', tempAbertura: '60°', dataTeste: '2026-11-07', rodilhada: 'N/A' });
    const frio = com({ tipoEmenda: 'Frio' }, ['tipoEmenda']);
    expect(frio).toMatchObject({ tempVulc: 'N/A', pressaoVulc: 'N/A', horaAbertura: 'N/A', dataTeste: 'N/A' });
  });

  it('alterar campo que não é gatilho não recalcula (respeita edição manual)', () => {
    expect(recalcular({ ...base(), vies: '999' }, ['tag'])).toEqual({});
  });

  it('somaHora passa da meia-noite', () => {
    expect(somaHora('23:50', 20)).toBe('00:10');
    expect(somaHora('', 20)).toBe('');
  });
});

describe('meses', () => {
  it('navegação e nome', () => {
    expect(somaMes('2026-11', 1)).toBe('2026-12');
    expect(somaMes('2026-12', 1)).toBe('2027-01');
    expect(somaMes('2026-01', -1)).toBe('2025-12');
    expect(nomeMes('2026-07')).toBe('Julho de 2026');
    expect(intervaloMes('2026-02')).toEqual(['2026-02-01', '2026-02-31']);
  });

  it('ordena por data (mais recente) e número', () => {
    const a = { ...base(), id: 'a', data: '2026-11-03', numero: '2' };
    const b = { ...base(), id: 'b', data: '2026-11-05', numero: '1' };
    const c = { ...base(), id: 'c', data: '2026-11-03', numero: '10' };
    expect(ordenar([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('registro incompleto', () => {
  it('completa campos que faltam sem perder os existentes', () => {
    const e = completarEmenda({ id: 'x', tag: 'TR-05', libTecnico: { nome: 'ANA' } as never });
    expect(e.tag).toBe('TR-05');
    expect(e.libTecnico).toMatchObject({ nome: 'ANA', assinatura: '' });
    expect(e.efetivo).toEqual([]);
  });
});
