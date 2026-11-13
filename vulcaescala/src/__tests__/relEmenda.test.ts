import { describe, expect, it } from 'vitest';
import { atividadeVazia, type Atividade } from '../prog/model';
import { cruzar, diasEntre, exigeRelatorio, normOm, relatoriosDa, type RelResumo } from '../prog/relEmenda';

const at = (id: string, data: string, x: Partial<Atividade> = {}): Atividade => ({
  ...atividadeVazia(id, data, 't'),
  tipo: 'Troca de correia',
  equipamento: 'L-21',
  area: 'PÁTIO DE MINÉRIO',
  ...x,
});
const rel = (id: string, data: string, x: Partial<RelResumo> = {}): RelResumo => ({ id, data, tag: 'L 21', om: '', numero: '1', ...x });

describe('relatórios de emenda', () => {
  it('diasEntre conta dias de calendário', () => {
    expect(diasEntre('2026-10-30', '2026-11-02')).toBe(3);
    expect(diasEntre('2026-11-02', '2026-11-01')).toBe(-1);
  });

  it('só troca e emenda/intercalação exigem, e não quando cancelada ou não executada', () => {
    expect(exigeRelatorio(at('a', '2026-11-01'))).toBe(true);
    expect(exigeRelatorio(at('a', '2026-11-01', { tipo: 'Emenda / intercalação' }))).toBe(true);
    expect(exigeRelatorio(at('a', '2026-11-01', { tipo: 'Reparo' }))).toBe(false);
    expect(exigeRelatorio(at('a', '2026-11-01', { classe: 'cancelada' }))).toBe(false);
    expect(exigeRelatorio(at('a', '2026-11-01', { execucao: 'nao_executada' }))).toBe(false);
    expect(exigeRelatorio(at('a', '2026-11-01', { execucao: 'reprogramada' }))).toBe(false);
  });

  it('preparação só exige quando sinalizada; antes do início do controle não entra', () => {
    expect(exigeRelatorio(at('a', '2026-11-01', { tipo: 'Preparação de correia' }))).toBe(false);
    expect(exigeRelatorio(at('a', '2026-11-01', { tipo: 'Preparação de correia', relExige: true }))).toBe(true);
    const c = cruzar([at('velha', '2026-10-31'), at('nova', '2026-11-03')], [], '2026-11-10');
    expect(c.linhas.map((l) => l.a.id)).toEqual(['nova']);
    expect(cruzar([at('velha', '2026-10-31')], [], '2026-11-10', '2026-10-01').linhas).toHaveLength(1);
  });

  it('OM ignora zeros à esquerda e texto', () => {
    expect(normOm('OM 0012345')).toBe('12345');
  });

  it('casa por OM antes da TAG, e TAG só dentro da janela (-1 a +3 dias)', () => {
    const a = at('a', '2026-11-05', { om: '123', equipamento: 'X-1' });
    expect(relatoriosDa(a, [rel('r1', '2026-10-01', { om: '000123', tag: 'OUTRA' })]).como).toBe('om');
    const b = at('b', '2026-11-05');
    expect(relatoriosDa(b, [rel('r', '2026-11-04')]).como).toBe('tag');
    expect(relatoriosDa(b, [rel('r', '2026-11-08')]).como).toBe('tag');
    expect(relatoriosDa(b, [rel('r', '2026-11-03')]).rels).toHaveLength(0);
    expect(relatoriosDa(b, [rel('r', '2026-11-09')]).rels).toHaveLength(0);
  });

  it('OM e TAG somam (troca com dois relatórios)', () => {
    const a = at('a', '2026-11-05', { om: '77' });
    const r = relatoriosDa(a, [rel('r1', '2026-11-05', { om: '77' }), rel('r2', '2026-11-06')]);
    expect(r.como).toBe('om');
    expect(r.rels.map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  it('vínculo manual vale mesmo sem OM/TAG iguais', () => {
    const a = at('a', '2026-11-05', { relEmendas: ['r9'] });
    const r = relatoriosDa(a, [rel('r9', '2026-12-20', { tag: 'Z' })]);
    expect(r.como).toBe('manual');
  });

  it('situações: feito, pendente, dispensado, hoje; futuras ficam de fora; órfãos', () => {
    const hoje = '2026-11-10';
    const c = cruzar(
      [
        at('feito', '2026-11-02'),
        at('pend', '2026-11-03', { equipamento: 'SR-1' }),
        at('disp', '2026-11-04', { equipamento: 'SR-3', relDispensa: 'Outro' }),
        at('hoje', hoje, { equipamento: 'M-2' }),
        at('fut', '2026-11-12', { equipamento: 'M-11' }),
        at('reparo', '2026-11-06', { tipo: 'Reparo', equipamento: 'C-4' }),
      ],
      [rel('r1', '2026-11-02'), rel('orf', '2026-11-08', { tag: 'BC-211' }), rel('rep', '2026-11-06', { tag: 'C 4' })],
      hoje,
    );
    const sit = Object.fromEntries(c.linhas.map((l) => [l.a.id, l.sit]));
    expect(sit).toEqual({ feito: 'feito', pend: 'pendente', disp: 'dispensado', hoje: 'hoje' });
    expect(c.total).toBe(3);
    expect(c.feitos).toBe(1);
    expect(c.pendentes).toBe(1);
    expect(c.linhas.find((l) => l.a.id === 'pend')!.dias).toBe(7);
    // o relatório do reparo bate com uma atividade (não é órfão); o da BC-211 não
    expect(c.semAtividade.map((r) => r.id)).toEqual(['orf']);
  });
});

describe('importação a partir do corte', () => {
  it('só entram atividades a partir da data e as OMs delas', async () => {
    const { aPartirDe } = await import('../prog/Importar');
    const om = (n: string) => ({ om: n } as unknown as import('../prog/model').OmInfo);
    const p = { origem: 'x', atividades: [at('a', '2026-11-01', { om: '111' }), at('b', '2026-11-02', { om: '222' }), at('c', '2026-11-20')], oms: [om('111'), om('222')] };
    const f = aPartirDe(p, '2026-11-02');
    expect(f.atividades.map((x) => x.id)).toEqual(['b', 'c']);
    expect(f.oms.map((o) => o.om)).toEqual(['222']);
  });
});

describe('telefone de contato', () => {
  it('formata enquanto digita e valida DDD + número', async () => {
    const { formatarTelefone, telefoneValido } = await import('../prog/model');
    expect(formatarTelefone('27')).toBe('(27');
    expect(formatarTelefone('2733334444')).toBe('(27) 3333-4444');
    expect(formatarTelefone('27999990000')).toBe('(27) 99999-0000');
    expect(formatarTelefone('(27) 9 9999-0000 ramal')).toBe('(27) 99999-0000');
    expect(telefoneValido('(27) 99999-0000')).toBe(true);
    expect(telefoneValido('(27) 3333-4444')).toBe(true);
    expect(telefoneValido('2345')).toBe(false);
    expect(telefoneValido('Ramal 1234')).toBe(false);
    expect(telefoneValido('(27) 89999-0000')).toBe(false);
    expect(telefoneValido('(07) 3333-4444')).toBe(false);
  });
});
