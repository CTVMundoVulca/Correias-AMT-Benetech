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
