import { describe, expect, it } from 'vitest';
import { mascararDoc, normNome } from '../emenda/model';

describe('mascararDoc', () => {
  it('mascara CPF (com ou sem pontuação), mostrando só os 5 últimos dígitos', () => {
    expect(mascararDoc('12345678901')).toBe('***.***.789-01');
    expect(mascararDoc('123.456.789-01')).toBe('***.***.789-01');
    expect(mascararDoc('123.456.789.01')).toBe('***.***.789-01');
  });
  it('matrícula aparece inteira', () => {
    expect(mascararDoc('70001258')).toBe('70001258');
    expect(mascararDoc('4826263562')).toBe('4826263562');
    expect(mascararDoc('')).toBe('');
  });
});

describe('normNome', () => {
  it('maiúsculas e sem espaços repetidos', () => {
    expect(normNome('  joão   da  silva ')).toBe('JOÃO DA SILVA');
  });
});

import { emendaVazia, novaEmenda } from '../emenda/model';

describe('emendaVazia', () => {
  it('relatório só aberto (com data e controle) é vazio; qualquer dado preenchido não é', () => {
    const e = novaEmenda('x', '2026-11-09', 'anônimo');
    expect(emendaVazia(e)).toBe(true);
    expect(emendaVazia({ ...e, criadoUid: 'u1', atualizadoPor: 'a@b.c', data: '2026-11-01' })).toBe(true);
    expect(emendaVazia({ ...e, tag: 'TR-01' })).toBe(false);
    expect(emendaVazia({ ...e, libTecnico: { ...e.libTecnico, nome: 'ALCEMAR' } })).toBe(false);
    expect(emendaVazia({ ...e, tipoEmenda: 'Quente' })).toBe(false);
  });
});

import { pontoOrvalho, recalcular } from '../emenda/model';

describe('ponto de orvalho (Magnus, coeficientes OMM 17,62 / 243,12 °C)', () => {
  it('valores de referência (1 casa decimal, vírgula)', () => {
    expect(pontoOrvalho('20', '50')).toBe('9,3');
    expect(pontoOrvalho('25', '60')).toBe('16,7');
    expect(pontoOrvalho('30', '80')).toBe('26,2');
    expect(pontoOrvalho('15', '100')).toBe('15,0'); // saturado: orvalho = temperatura
    expect(pontoOrvalho('27,5', '65')).toBe(pontoOrvalho('27.5', '65')); // aceita vírgula
  });
  it('vazio quando falta dado ou o valor é inválido', () => {
    expect(pontoOrvalho('', '60')).toBe('');
    expect(pontoOrvalho('25', '')).toBe('');
    expect(pontoOrvalho('25', '0')).toBe('');
    expect(pontoOrvalho('25', '120')).toBe('');
  });
  it('recalcula só o orvalho ao mudar temperatura/umidade (não mexe em campos ajustados à mão)', () => {
    const e = { ...novaEmenda('x', '2026-11-11', ''), largura: '1200', vies: '999', tempAmbiente: '25', umidade: '60' };
    expect(recalcular(e, ['umidade'])).toEqual({ orvalho: '16,7' });
  });
});

import { margemOrvalho } from '../emenda/model';

describe('superfície × ponto de orvalho (mínimo 3 °C)', () => {
  it('abaixo de 3 °C: alerta; 3 °C ou mais: ok', () => {
    expect(margemOrvalho('22', '20,3')).toMatchObject({ diff: 1.7, ok: false });
    expect(margemOrvalho('23,3', '20,3')).toMatchObject({ diff: 3, ok: true });
    expect(margemOrvalho('30', '20,3')?.texto).toBe('9,7 °C acima do orvalho ✓');
    expect(margemOrvalho('18', '20,3')).toMatchObject({ ok: false }); // superfície abaixo do orvalho
  });
  it('sem superfície ou sem orvalho: sem aviso', () => {
    expect(margemOrvalho('', '20,3')).toBeNull();
    expect(margemOrvalho('25', '')).toBeNull();
  });
});

import { completarEmenda } from '../emenda/model';

describe('efetivo em dois grupos (preparação × troca)', () => {
  it('relatório antigo (sem efetivoPreparo) continua com o efetivo na troca e preparação vazia', () => {
    const antigo = { id: 'x', data: '2026-11-01', efetivo: [{ workerId: '', nome: 'ADILSON', matricula: '1' }] } as never;
    const e = completarEmenda(antigo);
    expect(e.efetivo).toHaveLength(1);
    expect(e.efetivoPreparo).toEqual([]);
    expect(e.dataPreparo).toBe('');
  });
  it('preencher só a preparação já não é relatório vazio', () => {
    const e = novaEmenda('x', '2026-11-11', '');
    expect(emendaVazia({ ...e, efetivoPreparo: [{ workerId: '', nome: 'BRUNO', matricula: '2' }] })).toBe(false);
  });
});
