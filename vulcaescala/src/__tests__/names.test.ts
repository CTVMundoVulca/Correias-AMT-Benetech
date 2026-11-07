import { describe, expect, it } from 'vitest';
import { cleanName, matchesSearch, nameKey, similarNames } from '../domain/names';

describe('nomes', () => {
  it('padroniza espaços e caixa', () => {
    expect(cleanName('  emenda   tr-05 ')).toBe('EMENDA TR-05');
    expect(cleanName('joão')).toBe('JOÃO');
  });

  it('chave ignora acentos e pontuação', () => {
    expect(nameKey('João  Antônio.')).toBe('JOAO ANTONIO');
  });

  it.each(['JHENIFERSON', 'JHENIFFERSON', 'JENIFERSON', 'JHENIFERSOM', 'jheniferson', 'JHENIFERSON SILVA', 'GENIFERSON'])(
    'variação %s é parecida com JHENIFERSON',
    (v) => expect(similarNames('JHENIFERSON', v)).toBe(true),
  );

  it.each([
    ['JOSE', 'JOAO'],
    ['MARCOS', 'MARIA'],
    ['PAULO', 'PEDRO'],
  ])('%s e %s não são parecidos', (a, b) => expect(similarNames(a, b)).toBe(false));

  it('busca sem acento', () => {
    expect(matchesSearch('JOÃO SILVA', 'joao')).toBe(true);
    expect(matchesSearch('JOÃO SILVA', 'pedro')).toBe(false);
  });
});
