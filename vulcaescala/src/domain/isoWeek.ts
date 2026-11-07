/**
 * Semana ISO 8601: começa na segunda-feira; a semana 1 é a que contém a
 * primeira quinta-feira do ano (equivalente: a que contém 4 de janeiro).
 * Todas as contas usam UTC para não sofrer com horário de verão.
 */
const DAY_MS = 86_400_000;

export interface IsoWeek {
  year: number;
  week: number;
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** Converte uma data local (do relógio do aparelho) para meia-noite UTC do mesmo dia civil. */
export function toUtcDay(local: Date): Date {
  return utc(local.getFullYear(), local.getMonth(), local.getDate());
}

export function isoWeekOf(day: Date): IsoWeek {
  const d = new Date(day.getTime());
  const dow = d.getUTCDay() || 7; // 1 = seg … 7 = dom
  d.setUTCDate(d.getUTCDate() + 4 - dow); // quinta-feira da mesma semana
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - utc(year, 0, 1).getTime()) / DAY_MS + 1) / 7);
  return { year, week };
}

export function weeksInYear(year: number): number {
  // 28 de dezembro sempre está na última semana ISO do ano
  return isoWeekOf(utc(year, 11, 28)).week;
}

export function weekKey({ year, week }: IsoWeek): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function parseWeekKey(key: string): IsoWeek {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Chave de semana inválida: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > weeksInYear(year)) throw new Error(`Semana fora do ano: ${key}`);
  return { year, week };
}

export function isValidWeekKey(key: string): boolean {
  try {
    parseWeekKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Segunda-feira (UTC) da semana ISO. */
export function mondayOf({ year, week }: IsoWeek): Date {
  const jan4 = utc(year, 0, 4);
  const dow = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() + ((week - 1) * 7 - (dow - 1)) * DAY_MS);
}

/** As 7 datas (UTC) da semana, de segunda a domingo. */
export function weekDates(key: string): Date[] {
  const mon = mondayOf(parseWeekKey(key));
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * DAY_MS));
}

export function addWeeks(key: string, n: number): string {
  const mon = mondayOf(parseWeekKey(key));
  return weekKey(isoWeekOf(new Date(mon.getTime() + n * 7 * DAY_MS)));
}

export function currentWeekKey(now: Date = new Date()): string {
  return weekKey(isoWeekOf(toUtcDay(now)));
}

/** Localiza a semana e o índice (0 = seg) de uma data UTC. */
export function locateDay(day: Date): { weekKey: string; dayIndex: number } {
  return { weekKey: weekKey(isoWeekOf(day)), dayIndex: (day.getUTCDay() + 6) % 7 };
}

export function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** "AAAA-MM-DD" ⇄ Date UTC, usado em <input type="date"> */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
