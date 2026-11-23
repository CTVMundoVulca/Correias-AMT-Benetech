import { describe, expect, it, vi } from 'vitest';
import { reducer, withApoio, type Action } from '../state/reducer';
import { AppState, apoioNaData, cleanPeriodosApoio, ehExecucao, emptyState, periodoApoioEm, proximoPeriodoApoio } from '../domain/types';
import { addDays, diasEntre, fromIsoDate, locateDay } from '../domain/isoWeek';
import { getDay, pendingWorkers } from '../domain/schedule';
import { projetarConfig } from '../cloud/publico';
import type { DocMaps } from '../cloud/sync';

function build(actions: Action[]): AppState {
  return actions.reduce(reducer, emptyState());
}

describe('apoio por período: apoioNaData / ehExecucao', () => {
  it('fixo (apoio: true) continua apoio em qualquer data', () => {
    expect(apoioNaData({ apoio: true }, '2020-01-01')).toBe(true);
    expect(apoioNaData({ apoio: true }, '2099-01-01')).toBe(true);
  });

  it('sem apoio nenhum: nunca é apoio', () => {
    expect(apoioNaData({}, '2026-11-23')).toBe(false);
  });

  it('período fechado: apoio só entre início e fim, inclusive', () => {
    const w = { apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] };
    expect(apoioNaData(w, '2026-11-01')).toBe(false); // antes
    expect(apoioNaData(w, '2026-11-02')).toBe(true); // início
    expect(apoioNaData(w, '2026-11-10')).toBe(true); // meio
    expect(apoioNaData(w, '2026-11-22')).toBe(true); // fim
    expect(apoioNaData(w, '2026-11-23')).toBe(false); // voltou ao contrato
  });

  it('período em aberto (sem fim): apoio desde o início, sem data de volta', () => {
    const w = { apoioPeriodos: [{ inicio: '2026-11-10', fim: '' }] };
    expect(apoioNaData(w, '2026-11-09')).toBe(false);
    expect(apoioNaData(w, '2026-11-10')).toBe(true);
    expect(apoioNaData(w, '2030-01-01')).toBe(true);
  });

  it('apoioPeriodos tem prioridade sobre apoio fixo quando os dois existem', () => {
    const w = { apoio: true, apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] };
    expect(apoioNaData(w, '2026-11-23')).toBe(false); // fixo diria true; período manda
  });

  it('ehExecucao: apoio por período não conta como execução só durante o período', () => {
    const w = { funcao: 'Vulcanizador', apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] };
    expect(ehExecucao(w, '2026-11-10')).toBe(false);
    expect(ehExecucao(w, '2026-11-23')).toBe(true);
  });

  it('sem data: considera hoje', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00-03:00'));
    try {
      expect(apoioNaData({ apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] })).toBe(false);
      expect(apoioNaData({ apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-23' }] })).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('periodoApoioEm / proximoPeriodoApoio', () => {
    const w = { apoioPeriodos: [{ inicio: '2026-12-01', fim: '2026-12-14' }, { inicio: '2026-11-02', fim: '2026-11-22' }] };
    expect(periodoApoioEm(w, '2026-11-10')).toEqual({ inicio: '2026-11-02', fim: '2026-11-22' });
    expect(periodoApoioEm(w, '2026-11-23')).toBeUndefined();
    expect(proximoPeriodoApoio(w, '2026-11-23')).toEqual({ inicio: '2026-12-01', fim: '2026-12-14' });
    expect(proximoPeriodoApoio(w, '2026-12-01')).toBeUndefined();
  });
});

describe('cleanPeriodosApoio: sanitiza o que vem de fora (nuvem/localStorage)', () => {
  it('descarta datas inválidas, fim antes do início; mantém fim em aberto', () => {
    const limpo = cleanPeriodosApoio([
      { inicio: '2026-11-02', fim: '2026-11-22' },
      { inicio: 'lixo', fim: '2026-11-22' },
      { inicio: '2026-11-10', fim: '2026-11-01' }, // fim antes do início
      { inicio: '2026-12-01', fim: '' },
      'string qualquer',
      null,
    ]);
    expect(limpo).toEqual([
      { inicio: '2026-11-02', fim: '2026-11-22' },
      { inicio: '2026-12-01', fim: '' },
    ]);
  });

  it('não é array → lista vazia', () => {
    expect(cleanPeriodosApoio(undefined)).toEqual([]);
    expect(cleanPeriodosApoio('x')).toEqual([]);
  });

  it('limita ao máximo (PERIODOS_APOIO_MAX)', () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({ inicio: `2026-01-${String(i + 1).padStart(2, '0')}`, fim: '' }));
    expect(cleanPeriodosApoio(muitos)).toHaveLength(20);
  });
});

describe('withApoio: os dois modos não se combinam', () => {
  const base = { id: 'a', nome: 'ANA', funcao: 'Vulcanizador', ativo: true };

  it('período vence o fixo quando os dois são passados', () => {
    expect(withApoio(base, true, [{ inicio: '2026-11-02', fim: '' }])).toEqual({ ...base, apoioPeriodos: [{ inicio: '2026-11-02', fim: '' }] });
  });

  it('trocar de período para fixo apaga os períodos antigos', () => {
    const comPeriodo = withApoio(base, undefined, [{ inicio: '2026-11-02', fim: '' }]);
    expect(withApoio(comPeriodo, true, [])).toEqual({ ...base, apoio: true });
  });

  it('trocar para "não é apoio" apaga os dois campos', () => {
    const comPeriodo = withApoio(base, undefined, [{ inicio: '2026-11-02', fim: '' }]);
    expect(withApoio(comPeriodo, false, [])).toEqual(base);
  });
});

describe('bug relatado: voltar ao contrato não pode gerar pendência retroativa', () => {
  const W = '2026-W45'; // 02/11/2026 (seg) a 08/11/2026 (dom)
  const ref0 = { weekKey: W, dayIndex: 0 }; // 02/11 — início do apoio
  const refFimSemana = { weekKey: W, dayIndex: 4 }; // 06/11 — dentro do período
  const W2 = '2026-W48'; // 23/11/2026 (seg) — depois do fim do período (22/11)
  const refVolta = { weekKey: W2, dayIndex: 0 };

  function cenario(): AppState {
    return build([
      { type: 'worker/add', id: 'claude', nome: 'claude', funcao: 'Vulcanizador' },
      { type: 'worker/add', id: 'outro', nome: 'outro', funcao: 'Vulcanizador' },
      // claude foi de apoio ao contrato da Suzano de 02/11 a 22/11
      { type: 'worker/update', id: 'claude', nome: 'claude', funcao: 'Vulcanizador', apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] },
      { type: 'activity/add', ...ref0, id: 'x', nome: 'emenda' },
      { type: 'activity/add', ...refFimSemana, id: 'y', nome: 'emenda' },
      { type: 'activity/add', ...refVolta, id: 'z', nome: 'emenda' },
    ]);
  }

  it('durante o período de apoio: não aparece pendente mesmo sem ser alocado', () => {
    const s = cenario();
    const pend = pendingWorkers(getDay(s, W, 0), s.workers, '2026-11-02').map((w) => w.id);
    expect(pend).toEqual(['outro']); // claude está de apoio nesse dia: não é pendência
    const pend2 = pendingWorkers(getDay(s, W, 4), s.workers, '2026-11-06').map((w) => w.id);
    expect(pend2).toEqual(['outro']);
  });

  it('depois de voltar ao contrato: dia seguinte com atividade nova mostra claude como pendente', () => {
    const s = cenario();
    const pend = pendingWorkers(getDay(s, W2, 0), s.workers, '2026-11-23').map((w) => w.id);
    expect(pend).toEqual(['claude', 'outro']);
  });

  it('os dias passados (já dentro do período) continuam sem pendência mesmo depois que a pessoa voltou', () => {
    // a correção do bug era exatamente isto: desmarcar "apoio" hoje não pode acender
    // pendência nos dias já passados em que a pessoa ainda estava de apoio.
    const s = cenario();
    const pendPassado = pendingWorkers(getDay(s, W, 0), s.workers, '2026-11-02').map((w) => w.id);
    expect(pendPassado).toEqual(['outro']);
  });
});

describe('diasEntre: lista de dias (semana + índice) de um período', () => {
  it('período dentro da mesma semana', () => {
    const dias = diasEntre('2026-11-02', '2026-11-04');
    expect(dias).toEqual([
      { weekKey: '2026-W45', dayIndex: 0 },
      { weekKey: '2026-W45', dayIndex: 1 },
      { weekKey: '2026-W45', dayIndex: 2 },
    ]);
  });

  it('período atravessando a virada de semana', () => {
    const dias = diasEntre('2026-11-07', '2026-11-09'); // sáb, dom, seg (semana seguinte)
    expect(dias).toEqual([
      { weekKey: '2026-W45', dayIndex: 5 },
      { weekKey: '2026-W45', dayIndex: 6 },
      { weekKey: '2026-W46', dayIndex: 0 },
    ]);
  });

  it('datas inválidas ou invertidas → lista vazia', () => {
    expect(diasEntre('lixo', '2026-11-09')).toEqual([]);
    expect(diasEntre('2026-11-09', '2026-11-02')).toEqual([]);
  });

  it('respeita o limite máximo de dias', () => {
    expect(diasEntre('2026-01-01', '2030-01-01', 5)).toHaveLength(5);
  });
});

describe('ausência por período: mesma ação "absence/set" aplicada em cada dia do intervalo', () => {
  it('atestado de 14 dias (ex.: Lucas Jordão), atravessando semanas, em uma só operação', () => {
    let s = build([{ type: 'worker/add', id: 'lucas', nome: 'lucas jordao', funcao: 'Vulcanizador' }]);
    const dias = diasEntre('2026-11-23', '2026-12-06'); // 14 dias, 3 semanas
    expect(dias).toHaveLength(14);
    for (const r of dias) s = reducer(s, { type: 'absence/set', ...r, workerId: 'lucas', tipo: 'atestado' });
    for (const r of dias) expect(getDay(s, r.weekKey, r.dayIndex).absences).toEqual([{ workerId: 'lucas', tipo: 'atestado' }]);
    // fora do período, sem ausência (dia imediatamente antes do início e imediatamente depois do fim)
    const antes = locateDay(addDays(fromIsoDate('2026-11-23')!, -1));
    const depois = locateDay(addDays(fromIsoDate('2026-12-06')!, 1));
    expect(getDay(s, antes.weekKey, antes.dayIndex).absences).toEqual([]);
    expect(getDay(s, depois.weekKey, depois.dayIndex).absences).toEqual([]);

    // "desmarcar" o período inteiro (reaplicar com tipo null) remove de todos os dias de novo
    for (const r of dias) s = reducer(s, { type: 'absence/set', ...r, workerId: 'lucas', tipo: null });
    for (const r of dias) expect(getDay(s, r.weekKey, r.dayIndex).absences).toEqual([]);
  });
});

describe('cópia pública (projetarConfig): apoio por período vira apoio "hoje" resolvido', () => {
  it('publica apoio=true só quando a data de hoje está dentro do período', () => {
    const priv: DocMaps = {
      workers: {
        comPeriodoAtivo: { id: 'comPeriodoAtivo', nome: 'A', funcao: 'Vulcanizador', ativo: true, apoioPeriodos: [{ inicio: '2026-11-02', fim: '2026-11-22' }] },
        comPeriodoPassado: { id: 'comPeriodoPassado', nome: 'B', funcao: 'Vulcanizador', ativo: true, apoioPeriodos: [{ inicio: '2026-01-01', fim: '2026-01-15' }] },
        fixo: { id: 'fixo', nome: 'C', funcao: 'Vulcanizador', ativo: true, apoio: true },
      },
      days: {},
      funcoes: ['Vulcanizador'],
      ausencias: null,
      feriados: {},
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00-03:00'));
    try {
      const cfg = projetarConfig(priv);
      const porId = Object.fromEntries(cfg.efetivo.map((w) => [w.id, w.apoio ?? false]));
      expect(porId).toEqual({ comPeriodoAtivo: true, comPeriodoPassado: false, fixo: true });
      // datas do período não vazam para a cópia pública
      expect(JSON.stringify(cfg)).not.toContain('2026-11-02');
    } finally {
      vi.useRealTimers();
    }
  });
});
