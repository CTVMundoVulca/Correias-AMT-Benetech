import {
  ABSENCE_TYPES,
  AppState,
  CURRENT_VERSION,
  Day,
  FUNCOES,
  Worker,
  emptyDay,
  emptyState,
} from '../domain/types';
import { isValidWeekKey } from '../domain/isoWeek';
import { cleanName } from '../domain/names';

/**
 * Migrações: cada função leva o estado da versão N para N+1.
 * Para criar a versão 2, adicione `1: (s) => ({ ...s, version: 2, ... })`
 * e suba CURRENT_VERSION em domain/types.ts.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {};

export class InvalidDataError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valida e saneia o estado lido (localStorage, backup importado ou backend). */
export function migrate(raw: unknown): AppState {
  if (raw == null) return emptyState();
  if (!isObj(raw) || typeof raw.version !== 'number') throw new InvalidDataError('Arquivo sem o campo "version".');
  let s: any = raw;
  if (s.version > CURRENT_VERSION)
    throw new InvalidDataError(`Dados da versão ${s.version}, mais nova que este aplicativo (${CURRENT_VERSION}).`);
  while (s.version < CURRENT_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new InvalidDataError(`Sem migração a partir da versão ${s.version}.`);
    s = step(s);
  }
  return sanitize(s);
}

function sanitize(s: any): AppState {
  if (!Array.isArray(s.workers) || !isObj(s.weeks)) throw new InvalidDataError('Estrutura de dados inválida.');
  const workers: Worker[] = [];
  const ids = new Set<string>();
  for (const w of s.workers) {
    if (!isObj(w) || typeof w.id !== 'string' || typeof w.nome !== 'string' || ids.has(w.id)) continue;
    ids.add(w.id);
    workers.push({
      id: w.id,
      nome: cleanName(w.nome),
      funcao: (FUNCOES as readonly string[]).includes(w.funcao as string) ? (w.funcao as Worker['funcao']) : 'Vulcanizador',
      ativo: w.ativo !== false,
    });
  }
  const weeks: AppState['weeks'] = {};
  for (const [key, wk] of Object.entries(s.weeks as Record<string, any>)) {
    if (!isValidWeekKey(key) || !isObj(wk) || !Array.isArray(wk.days)) continue;
    const days: Day[] = Array.from({ length: 7 }, (_, i) => sanitizeDay((wk.days as unknown[])[i], ids));
    weeks[key] = { key, days };
  }
  return { version: CURRENT_VERSION, workers, weeks };
}

function sanitizeDay(d: any, ids: Set<string>): Day {
  if (!isObj(d)) return emptyDay();
  const activities = (Array.isArray(d.activities) ? d.activities : [])
    .filter((a: any) => isObj(a) && typeof a.id === 'string' && typeof a.nome === 'string')
    .map((a: any) => ({
      id: a.id,
      nome: cleanName(a.nome),
      workerIds: [...new Set<string>((Array.isArray(a.workerIds) ? a.workerIds : []).filter((x: any) => ids.has(x)))],
    }));
  const seen = new Set<string>();
  const absences = (Array.isArray(d.absences) ? d.absences : []).filter((a: any) => {
    const ok = isObj(a) && ids.has(a.workerId as string) && (ABSENCE_TYPES as readonly string[]).includes(a.tipo as string) && !seen.has(a.workerId as string);
    if (ok) seen.add(a.workerId as string);
    return ok;
  });
  return { activities, absences };
}
