import { describe, expect, it } from 'vitest';
import { completarChecklist, completarOperador, doDia, emailOperador, faltando, fimDoDiaBrasilia, pinValido, resultadoDe, situacaoTreinamento, textoTreinamento } from '../ponte/model';

const itens = [
  { id: 'a', grupo: 'G', texto: 'Freio', bloqueia: true },
  { id: 'b', grupo: 'G', texto: 'Iluminação', bloqueia: false },
];

describe('ponte rolante', () => {
  it('treinamento: válido, vence em até 30 dias, vencido (bloqueia)', () => {
    expect(situacaoTreinamento({ validade: '2027-01-30' }, '2026-11-16').s).toBe('ok');
    expect(situacaoTreinamento({ validade: '2026-12-01' }, '2026-11-16')).toEqual({ s: 'vence', dias: 15 });
    expect(situacaoTreinamento({ validade: '2026-11-16' }, '2026-11-16').s).toBe('vence'); // vale até o fim do dia
    expect(situacaoTreinamento({ validade: '2026-11-15' }, '2026-11-16').s).toBe('vencido');
    expect(situacaoTreinamento({ validade: '' }, '2026-11-16').s).toBe('vencido');
    expect(textoTreinamento({ validade: '2026-11-15', nome: 'X' }, '2026-11-16')).toBe('Treinamento vencido em 15/11/2026 — não pode operar a ponte rolante');
    expect(new Date(fimDoDiaBrasilia('2026-11-16')).toISOString()).toBe('2026-11-17T02:59:59.999Z');
  });

  it('resultado: item crítico não conforme bloqueia; os outros não', () => {
    expect(resultadoDe(itens, { a: { r: 'C', obs: '' }, b: { r: 'NC', obs: 'x' } })).toBe('liberada');
    expect(resultadoDe(itens, { a: { r: 'NC', obs: 'x' }, b: { r: 'C', obs: '' } })).toBe('bloqueada');
    expect(faltando(itens, { a: { r: 'NA', obs: '' } }).map((i) => i.id)).toEqual(['b']);
  });

  it('PIN de 6 números e conta interna aleatória', () => {
    expect(pinValido('482913')).toBe(true);
    expect(pinValido('4829')).toBe(false);
    expect(pinValido('48291a')).toBe(false);
    const e1 = emailOperador();
    expect(e1).toMatch(/^op-[a-z0-9]+@operadores\.vulcaescala\.example\.com$/);
    expect(e1).not.toBe(emailOperador());
  });

  it('dados da nuvem: operador e checklist normalizados; vale o mais recente do dia', () => {
    expect(completarOperador('o1', { nome: 'FULANO', matricula: '1', validade: '2027-01-01', authEmail: 'OP@X.COM' })).toMatchObject({ ativo: true, authEmail: 'op@x.com', validadeAte: fimDoDiaBrasilia('2027-01-01') });
    expect(completarOperador('o1', { matricula: '1' })).toBeNull();
    const c = (id: string, feitoEm: string) => completarChecklist(id, { data: '2026-11-16', feitoEm, itens, respostas: { a: { r: 'C' }, z: { r: 'X' } }, resultado: 'liberada' })!;
    expect(c('1', 'x').respostas).toEqual({ a: { r: 'C', obs: '' } });
    expect(doDia([c('1', '2026-11-16T10:00'), c('2', '2026-11-16T14:00')], '2026-11-16')?.id).toBe('2');
    expect(doDia([c('1', '2026-11-16T10:00')], '2026-11-17')).toBeNull();
  });
});
