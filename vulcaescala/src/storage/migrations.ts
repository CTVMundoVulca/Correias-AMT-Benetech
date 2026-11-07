import {
  AUSENCIAS_PADRAO,
  CORES_AUSENCIA,
  AppState,
  TipoAusencia,
  cleanNomeAusencia,
  cleanSigla,
  CURRENT_VERSION,
  Day,
  FUNCOES_PADRAO,
  Worker,
  cleanFuncao,
  cleanMatricula,
  emptyDay,
  emptyState,
} from '../domain/types';
import { isValidWeekKey } from '../domain/isoWeek';
import { FERIADO_NOME_MAX, isoValido } from '../domain/feriados';
import { cleanName, nameKey } from '../domain/names';

/**
 * Migrações: cada função leva o estado da versão N para N+1.
 * Para criar a versão 2, adicione `1: (s) => ({ ...s, version: 2, ... })`
 * e suba CURRENT_VERSION em domain/types.ts.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // v2: lista de funções editável (antes era fixa no código)
  1: (s) => ({ ...s, version: 2, funcoes: [...FUNCOES_PADRAO] }),
  // v3: tipos de ausência editáveis (antes eram fixos no código; mesmos ids)
  2: (s) => ({ ...s, version: 3, ausencias: AUSENCIAS_PADRAO.map((a) => ({ ...a })) }),
  // v4: feriados municipais (Vitória); os nacionais são calculados
  3: (s) => ({ ...s, version: 4, feriados: {} }),
};

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
  // funções: sem repetição (ignora maiúsculas/acentos); vazia → lista padrão
  const funcoes: string[] = [];
  const addFuncao = (f: unknown) => {
    const c = typeof f === 'string' ? cleanFuncao(f) : '';
    if (c && !funcoes.some((x) => nameKey(x) === nameKey(c))) funcoes.push(c);
    return funcoes.find((x) => nameKey(x) === nameKey(c)) ?? '';
  };
  (Array.isArray(s.funcoes) ? s.funcoes : []).forEach(addFuncao);
  if (!funcoes.length) FUNCOES_PADRAO.forEach(addFuncao);

  const workers: Worker[] = [];
  const ids = new Set<string>();
  for (const w of s.workers) {
    if (!isObj(w) || typeof w.id !== 'string' || typeof w.nome !== 'string' || ids.has(w.id)) continue;
    ids.add(w.id);
    workers.push({
      id: w.id,
      nome: cleanName(w.nome),
      // função que não está na lista (dado antigo/de outro aparelho) entra na lista
      funcao: addFuncao(w.funcao) || funcoes[0],
      ativo: w.ativo !== false,
      ...(typeof w.matricula === 'string' && cleanMatricula(w.matricula) ? { matricula: cleanMatricula(w.matricula) } : {}),
    });
  }
  // tipos de ausência: válidos, sem id repetido; vazia → lista padrão
  const ausencias: TipoAusencia[] = [];
  for (const a of Array.isArray(s.ausencias) ? s.ausencias : []) {
    if (!isObj(a) || typeof a.id !== 'string' || !a.id || ausencias.some((x) => x.id === a.id)) continue;
    const nome = cleanNomeAusencia(String(a.nome ?? ''));
    if (!nome) continue;
    ausencias.push({
      id: a.id,
      nome,
      sigla: cleanSigla(String(a.sigla ?? '')) || nome.charAt(0).toUpperCase(),
      cor: (CORES_AUSENCIA as readonly string[]).includes(a.cor as string) ? (a.cor as TipoAusencia['cor']) : 'cinza',
      ativo: a.ativo !== false,
    });
  }
  if (!ausencias.length) AUSENCIAS_PADRAO.forEach((a) => ausencias.push({ ...a }));

  const weeks: AppState['weeks'] = {};
  for (const [key, wk] of Object.entries(s.weeks as Record<string, any>)) {
    if (!isValidWeekKey(key) || !isObj(wk) || !Array.isArray(wk.days)) continue;
    const days: Day[] = Array.from({ length: 7 }, (_, i) => sanitizeDay((wk.days as unknown[])[i], ids));
    weeks[key] = { key, days };
  }
  const feriados: Record<string, string> = {};
  if (isObj(s.feriados))
    for (const [k, v] of Object.entries(s.feriados)) {
      const nome = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, FERIADO_NOME_MAX) : '';
      if (isoValido(k) && nome) feriados[k] = nome;
    }
  return { version: CURRENT_VERSION, workers, funcoes, ausencias, feriados, weeks };
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
    // qualquer tipo (a lista é editável); id desconhecido aparece como "Tipo removido"
    const ok =
      isObj(a) && ids.has(a.workerId as string) && typeof a.tipo === 'string' && a.tipo.length > 0 && a.tipo.length <= 40 && !seen.has(a.workerId as string);
    if (ok) seen.add(a.workerId as string);
    return ok;
  });
  return { activities, absences };
}
