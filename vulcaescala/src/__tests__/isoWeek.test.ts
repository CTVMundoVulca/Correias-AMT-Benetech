import { describe, expect, it } from 'vitest';
import { addWeeks, currentWeekKey, formatDate, isoWeekOf, parseWeekKey, weekDates, weekKey, weeksInYear, locateDay } from '../domain/isoWeek';

const d = (s: string) => new Date(s + 'T00:00:00Z');

describe('semana ISO 8601', () => {
  it.each([
    ['2026-11-07', '2026-W45'], // sábado
    ['2026-01-01', '2026-W01'], // quinta → semana 1
    ['2027-01-01', '2026-W53'], // sexta → última semana de 2026
    ['2024-12-30', '2025-W01'], // segunda → semana 1 do ano seguinte
    ['2021-01-03', '2020-W53'],
    ['2023-01-01', '2022-W52'],
  ])('%s → %s', (date, key) => {
    expect(weekKey(isoWeekOf(d(date)))).toBe(key);
  });

  it('número de semanas por ano', () => {
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
    expect(weeksInYear(2020)).toBe(53);
  });

  it('datas da semana: segunda a domingo', () => {
    const days = weekDates('2026-W45');
    expect(days.map(formatDate)).toEqual([
      '02/11/2026', '03/11/2026', '04/11/2026', '05/11/2026', '06/11/2026', '07/11/2026', '08/11/2026',
    ]);
    expect(weekDates('2025-W01')[0].toISOString().slice(0, 10)).toBe('2024-12-30');
  });

  it('navegação atravessa a virada do ano', () => {
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
    expect(addWeeks('2025-W52', 1)).toBe('2026-W01');
  });

  it('2026 tem 53 semanas: W53 vai de 28/12/2026 a 03/01/2027', () => {
    const days = weekDates('2026-W53');
    expect(formatDate(days[0])).toBe('28/12/2026');
    expect(formatDate(days[6])).toBe('03/01/2027');
    expect(addWeeks('2026-W52', 1)).toBe('2026-W53');
  });

  it('"Semana atual" usa a data local do aparelho (inclusive tarde da noite)', () => {
    expect(currentWeekKey(new Date(2026, 10, 7, 14, 0))).toBe('2026-W45');
    expect(currentWeekKey(new Date(2026, 0, 1, 23, 59))).toBe('2026-W01');
    expect(currentWeekKey(new Date(2027, 0, 3, 23, 59))).toBe('2026-W53');
    expect(currentWeekKey(new Date(2027, 0, 4, 0, 1))).toBe('2027-W01');
    expect(currentWeekKey(new Date(2026, 0, 4, 12))).toBe('2026-W01'); // 4 de janeiro sempre na semana 1
  });

  it('rejeita chave inválida', () => {
    expect(() => parseWeekKey('2025-W53')).toThrow();
    expect(() => parseWeekKey('SEMANA 01')).toThrow();
  });

  it('locateDay', () => {
    expect(locateDay(d('2026-11-08'))).toEqual({ weekKey: '2026-W45', dayIndex: 6 });
    expect(locateDay(d('2026-11-09'))).toEqual({ weekKey: '2026-W46', dayIndex: 0 });
  });
});
