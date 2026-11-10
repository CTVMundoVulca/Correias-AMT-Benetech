import { describe, expect, it } from 'vitest';
import { agoraHHMM, duracaoMin, fmtDuracao, normMotivo, totaisPorMotivo, type Atraso } from '../cloud/atrasos';

const at = (inicio: string, fim: string, motivo: string): Atraso => ({
  id: inicio + fim, semana: '2026-W46', diaId: '2026-W46_1', atividadeId: 'a', atividadeNome: 'A', inicio, fim, motivo,
  descricao: '', criadoUid: 'u', criadoEm: '', atualizadoEm: '', por: '',
});

describe('atrasos', () => {
  it('duração em minutos (inclusive virando a meia-noite); em andamento = null', () => {
    expect(duracaoMin('08:30', '10:00')).toBe(90);
    expect(duracaoMin('23:30', '00:15')).toBe(45);
    expect(duracaoMin('08:30', '')).toBeNull();
    expect(duracaoMin('8h', '10:00')).toBeNull();
  });
  it('formata 90 → 1h30, 120 → 2h, 45 → 45 min', () => {
    expect(fmtDuracao(90)).toBe('1h30');
    expect(fmtDuracao(120)).toBe('2h');
    expect(fmtDuracao(45)).toBe('45 min');
  });
  it('horário atual HH:MM', () => {
    expect(agoraHHMM(new Date(2026, 10, 10, 8, 5))).toBe('08:05');
  });
  it('totais por motivo, só com fim, do maior para o menor', () => {
    const t = totaisPorMotivo([at('08:30', '10:00', 'Bloqueio'), at('13:00', '13:20', 'Limpeza'), at('14:00', '14:30', 'Bloqueio'), at('15:00', '', 'Recurso')]);
    expect(t).toEqual([
      { motivo: 'Bloqueio', min: 120, qtd: 2 },
      { motivo: 'Limpeza', min: 20, qtd: 1 },
    ]);
  });
  it('motivo novo: primeira letra maiúscula, sem espaços sobrando', () => {
    expect(normMotivo('  falta   de  andaime ')).toBe('Falta de andaime');
  });
});
