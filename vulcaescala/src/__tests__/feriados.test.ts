import { describe, expect, it } from 'vitest';
import { feriadoEm, feriadosNacionais, pascoa } from '../domain/feriados';

describe('feriados', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
  ])('Páscoa %i = %s', (ano, data) => expect(pascoa(ano)).toBe(data));

  it('móveis de 2026: Carnaval 17/02, Sexta-feira Santa 03/04, Corpus Christi 04/06', () => {
    const f = feriadosNacionais(2026);
    expect(f['2026-02-17']).toBe('Carnaval');
    expect(f['2026-04-03']).toBe('Sexta-feira Santa');
    expect(f['2026-06-04']).toBe('Corpus Christi');
  });

  it('fixos, inclusive Consciência Negra (20/11)', () => {
    const f = feriadosNacionais(2026);
    expect(f['2026-11-02']).toBe('Finados');
    expect(f['2026-11-20']).toBe('Consciência Negra');
    expect(Object.keys(f)).toHaveLength(12);
  });

  it('municipal entra e tem prioridade no nome', () => {
    const mun = { '2026-09-08': 'Aniversário de Vitória' };
    expect(feriadoEm(mun, '2026-09-08')).toBe('Aniversário de Vitória');
    expect(feriadoEm(mun, '2026-11-15')).toBe('Proclamação da República');
    expect(feriadoEm(mun, '2026-11-16')).toBeNull();
  });
});
