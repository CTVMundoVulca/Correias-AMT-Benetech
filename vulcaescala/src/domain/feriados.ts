/**
 * Feriados — mesma lógica do App de Registro de Horários / RDO (contrato Suzano):
 * nacionais calculados automaticamente (fixos + móveis pela Páscoa) e municipais
 * cadastrados à mão (no AMT: Vitória), numa lista compartilhada pela liderança.
 */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como "AAAA-MM-DD". */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function somaDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const cache = new Map<number, Record<string, string>>();

/** Feriados nacionais do ano (mesma lista do Registro de Horários). */
export function feriadosNacionais(ano: number): Record<string, string> {
  const c = cache.get(ano);
  if (c) return c;
  const p = (m: number, d: number) => `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const pas = pascoa(ano);
  const h: Record<string, string> = {
    [p(1, 1)]: 'Confraternização Universal',
    [p(4, 21)]: 'Tiradentes',
    [p(5, 1)]: 'Dia do Trabalho',
    [p(9, 7)]: 'Independência do Brasil',
    [p(10, 12)]: 'Nossa Senhora Aparecida',
    [p(11, 2)]: 'Finados',
    [p(11, 15)]: 'Proclamação da República',
    [p(11, 20)]: 'Consciência Negra',
    [p(12, 25)]: 'Natal',
    [somaDias(pas, -47)]: 'Carnaval',
    [somaDias(pas, -2)]: 'Sexta-feira Santa',
    [somaDias(pas, 60)]: 'Corpus Christi',
  };
  cache.set(ano, h);
  return h;
}

/** Nome do feriado na data (municipal tem prioridade no nome), ou null. */
export function feriadoEm(municipais: Record<string, string>, iso: string): string | null {
  return municipais[iso] ?? feriadosNacionais(Number(iso.slice(0, 4)))[iso] ?? null;
}

export const FERIADO_NOME_MAX = 60;
export const isoValido = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
