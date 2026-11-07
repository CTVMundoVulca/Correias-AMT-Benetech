import type * as FsMod from 'firebase/firestore';
import { AppState, CURRENT_VERSION, Day, FUNCOES_PADRAO, Worker, emptyDay, emptyWeek } from '../domain/types';
import { cleanName } from '../domain/names';
import { migrate } from '../storage/migrations';
import { Action, reducer } from '../state/reducer';
import type { FirebaseApi } from './firebase';

/**
 * Sincronização com o Firestore — padrão dos apps CTV:
 *  - os dados aparecem na hora a partir do cache deste aparelho (bootLocal);
 *  - a nuvem conecta em segundo plano (attach) e passa a mandar;
 *  - cada alteração entra numa FILA salva no aparelho e é enviada por transação.
 *    Sem internet, a fila espera; nada se perde ao fechar o app.
 *  - o que chega da nuvem nunca apaga alterações ainda não enviadas: a tela mostra
 *    sempre "dados da nuvem + fila pendente aplicada por cima".
 *
 * Coleções (projeto Firebase só do contrato AMT):
 *   escala_efetivo/{workerId}   um colaborador
 *   escala_dias/{AAAA-Www_D}    um dia da escala (atividades + ausências)
 *   escala_config/membros       { emails: [...] } quem pode acessar
 *   escala_config/funcoes       { lista: [...] } funções do cadastro
 */

export const COL_EFETIVO = 'escala_efetivo';
export const COL_DIAS = 'escala_dias';
export const DOC_MEMBROS = 'escala_config/membros';
export const DOC_FUNCOES = 'escala_config/funcoes';
/** Só administradores (pela regra do Firestore) conseguem ler este documento. */
export const DOC_ADMIN = 'escala_config/admin';
export const CACHE_KEY = 'vulcaescala:nuvem';

export type SyncStatus = 'connecting' | 'ok' | 'saving' | 'offline' | 'denied' | 'error';

export interface SyncInfo {
  status: SyncStatus;
  pending: number;
  /** a primeira leitura da nuvem já chegou */
  loaded: boolean;
  lastError: string | null;
  membros: string[] | null;
  /** a nuvem não tem nenhum dado ainda */
  cloudEmpty: boolean;
  /** administrador segundo as regras do Firestore */
  isAdmin: boolean;
}

interface DocMaps {
  workers: Record<string, Worker>;
  days: Record<string, Day>;
  /** null = documento ainda não existe na nuvem (usa a lista padrão) */
  funcoes?: string[] | null;
}

export const dayDocId = (weekKey: string, dayIndex: number) => `${weekKey}_${dayIndex}`;

function parseDayId(id: string): { weekKey: string; dayIndex: number } | null {
  const m = /^(\d{4}-W\d{2})_([0-6])$/.exec(id);
  return m ? { weekKey: m[1], dayIndex: Number(m[2]) } : null;
}

/** Monta o AppState a partir dos documentos (validado: descarta lixo e ids órfãos). */
export function mapsToState(maps: DocMaps): AppState {
  const weeks: Record<string, { key: string; days: Day[] }> = {};
  for (const [id, day] of Object.entries(maps.days)) {
    const loc = parseDayId(id);
    if (!loc) continue;
    const wk = (weeks[loc.weekKey] ??= emptyWeek(loc.weekKey));
    wk.days[loc.dayIndex] = { activities: day.activities, absences: day.absences };
  }
  try {
    return migrate({ version: CURRENT_VERSION, workers: Object.values(maps.workers), funcoes: maps.funcoes ?? FUNCOES_PADRAO, weeks });
  } catch {
    return { version: CURRENT_VERSION, workers: [], funcoes: [...FUNCOES_PADRAO], weeks: {} };
  }
}

function stateToMaps(state: AppState): DocMaps {
  const workers: Record<string, Worker> = {};
  for (const w of state.workers) workers[w.id] = w;
  const days: Record<string, Day> = {};
  for (const wk of Object.values(state.weeks))
    wk.days.forEach((d, i) => {
      if (d.activities.length || d.absences.length) days[dayDocId(wk.key, i)] = d;
    });
  return { workers, days, funcoes: state.funcoes };
}

function readDay(data: unknown): Day {
  const d = (data ?? {}) as Partial<Day>;
  return {
    activities: Array.isArray(d.activities) ? d.activities : [],
    absences: Array.isArray(d.absences) ? d.absences : [],
  };
}

function readWorker(id: string, data: unknown): Worker {
  const w = (data ?? {}) as Partial<Worker>;
  return { id, nome: String(w.nome ?? ''), funcao: (w.funcao ?? 'Vulcanizador') as Worker['funcao'], ativo: w.ativo !== false };
}

/** Aplica uma ação de dia a um único dia, usando o mesmo reducer da tela. */
function applyToDay(day: Day, action: Action & { weekKey: string; dayIndex: number }): Day {
  const days = Array.from({ length: 7 }, emptyDay);
  days[action.dayIndex] = day;
  const mini: AppState = { version: CURRENT_VERSION, workers: [], funcoes: [], weeks: { [action.weekKey]: { key: action.weekKey, days } } };
  return reducer(mini, action).weeks[action.weekKey].days[action.dayIndex];
}

const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'cancelled', 'unknown']);

function errCode(e: unknown): string {
  const c = (e as { code?: string })?.code ?? '';
  return c.replace(/^firestore\//, '');
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class CloudSync {
  private confirmed: DocMaps = { workers: {}, days: {} };
  private pending: Action[] = [];
  private view: AppState;
  private info: SyncInfo = { status: 'connecting', pending: 0, loaded: false, lastError: null, membros: null, cloudEmpty: false, isAdmin: false };
  private loadedParts = { workers: false, days: false };
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private api: FirebaseApi | null = null;
  private email = '';
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onOnline = () => this.flush();
  /** chamado quando uma ação é recusada definitivamente pela nuvem */
  onDropped: ((a: Action, motivo: string) => void) | null = null;

  /**
   * @param storage onde guardar a cópia local e a fila (localStorage)
   * @param timeoutMs tempo máximo de cada envio; com sinal fraco a transação do Firestore
   *   pode ficar esperando indefinidamente. Ao estourar, a ação continua na fila e é
   *   reenviada depois — seguro porque todas as ações são idempotentes.
   */
  constructor(
    private readonly storage: Storage | null,
    private readonly timeoutMs = 15_000,
  ) {
    this.readCache();
    this.view = this.computeView();
    this.info.pending = this.pending.length;
  }

  // ---------- leitura para a interface ----------
  getState = (): AppState => this.view;
  getInfo = (): SyncInfo => this.info;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  hasCache(): boolean {
    return Object.keys(this.confirmed.workers).length > 0 || Object.keys(this.confirmed.days).length > 0;
  }

  // ---------- ciclo de vida ----------
  /** Conecta à nuvem (usuário já autenticado e com e-mail confirmado). */
  attach(api: FirebaseApi, email: string): void {
    this.detach();
    this.api = api;
    this.email = email.toLowerCase();
    const { fsMod, fs } = api;
    this.loadedParts = { workers: false, days: false };
    this.setInfo({ status: 'connecting', loaded: false, lastError: null, isAdmin: false });
    // pergunta ao Firestore se este usuário é administrador (a regra decide)
    fsMod
      .getDoc(fsMod.doc(fs, DOC_ADMIN))
      .then(() => this.api === api && this.setInfo({ isAdmin: true }))
      .catch(() => this.api === api && this.setInfo({ isAdmin: false }));

    this.unsubs.push(
      fsMod.onSnapshot(
        fsMod.collection(fs, COL_EFETIVO),
        (snap) => {
          const workers: Record<string, Worker> = {};
          snap.docs.forEach((d) => (workers[d.id] = readWorker(d.id, d.data())));
          this.confirmed = { ...this.confirmed, workers };
          this.afterRemote('workers', snap.metadata.fromCache);
        },
        (e) => this.onListenError(e),
      ),
      fsMod.onSnapshot(
        fsMod.collection(fs, COL_DIAS),
        (snap) => {
          const days: Record<string, Day> = {};
          snap.docs.forEach((d) => (days[d.id] = readDay(d.data())));
          this.confirmed = { ...this.confirmed, days };
          this.afterRemote('days', snap.metadata.fromCache);
        },
        (e) => this.onListenError(e),
      ),
      fsMod.onSnapshot(
        fsMod.doc(fs, DOC_FUNCOES),
        (snap) => {
          const lista = snap.data()?.lista;
          this.confirmed = { ...this.confirmed, funcoes: Array.isArray(lista) ? lista.map(String) : null };
          this.refresh();
        },
        () => undefined, // sem permissão: o erro já aparece pelas outras coleções
      ),
      fsMod.onSnapshot(
        fsMod.doc(fs, DOC_MEMBROS),
        (snap) => {
          const emails = (snap.data()?.emails as string[] | undefined) ?? [];
          this.setInfo({ membros: emails.map((e) => String(e).toLowerCase()) });
        },
        () => this.setInfo({ membros: null }),
      ),
    );
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  detach(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.api = null;
  }

  /** Ao sair da conta: apaga a cópia local (dados da equipe não ficam no aparelho). */
  clearLocal(): void {
    this.confirmed = { workers: {}, days: {}, funcoes: null };
    this.pending = [];
    this.view = this.computeView();
    this.info = { ...this.info, pending: 0 };
    try {
      this.storage?.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
    this.emit();
  }

  // ---------- escrita ----------
  dispatch = (action: Action): void => {
    if (action.type === 'state/replace') {
      void this.replaceAll(action.state);
      return;
    }
    this.pending.push(action);
    this.refresh();
    void this.flush();
  };

  /** Substitui todos os dados da nuvem (importar backup / apagar tudo / primeira carga). */
  async replaceAll(state: AppState): Promise<void> {
    const api = this.api;
    if (!api) throw new Error('sem conexão com a nuvem');
    const { fsMod, fs } = api;
    const next = stateToMaps(state);
    const ops: ((b: FsMod.WriteBatch) => void)[] = [];
    for (const id of Object.keys(this.confirmed.workers))
      if (!next.workers[id]) ops.push((b) => b.delete(fsMod.doc(fs, COL_EFETIVO, id)));
    for (const id of Object.keys(this.confirmed.days))
      if (!next.days[id]) ops.push((b) => b.delete(fsMod.doc(fs, COL_DIAS, id)));
    for (const w of Object.values(next.workers)) ops.push((b) => b.set(fsMod.doc(fs, COL_EFETIVO, w.id), { ...w }));
    for (const [id, d] of Object.entries(next.days)) ops.push((b) => b.set(fsMod.doc(fs, COL_DIAS, id), this.dayPayload(id, d)));
    ops.push((b) => b.set(fsMod.doc(fs, DOC_FUNCOES), this.funcoesPayload(next.funcoes ?? FUNCOES_PADRAO)));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fsMod.writeBatch(fs);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
    this.confirmed = next;
    this.pending = [];
    this.refresh();
  }

  async setMembros(emails: string[]): Promise<void> {
    const api = this.api;
    if (!api) throw new Error('sem conexão com a nuvem');
    const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
    await api.fsMod.setDoc(api.fsMod.doc(api.fs, DOC_MEMBROS), {
      emails: clean,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: this.email,
    });
  }

  /** Envia a fila, uma ação por vez, na ordem. */
  async flush(): Promise<void> {
    if (this.flushing || !this.api || !this.info.loaded) return;
    if (!this.pending.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setInfo({ status: 'offline' });
      return;
    }
    this.flushing = true;
    this.setInfo({ status: 'saving' });
    try {
      while (this.pending.length && this.api) {
        const action = this.pending[0];
        try {
          await this.withTimeout(this.applyRemote(action));
        } catch (e) {
          const code = errCode(e);
          if (code === 'permission-denied') {
            this.setInfo({ status: 'denied', lastError: 'Sem permissão para gravar.' });
            return;
          }
          if (TRANSIENT.has(code) || !code) {
            this.setInfo({ status: 'offline', lastError: errMsg(e) });
            this.scheduleRetry();
            return;
          }
          // recusa definitiva (ex.: dado inválido): descarta para não travar a fila
          this.pending.shift();
          this.setInfo({ lastError: errMsg(e) });
          this.refresh();
          this.onDropped?.(action, errMsg(e));
          continue;
        }
        this.pending.shift();
        this.refresh();
      }
      this.setInfo({ status: 'ok', lastError: null });
    } finally {
      this.flushing = false;
    }
  }

  // ---------- internos ----------
  private withTimeout<T>(p: Promise<T>): Promise<T> {
    let t: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(Object.assign(new Error('sem resposta da nuvem'), { code: 'deadline-exceeded' })), this.timeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, 10_000);
  }

  private dayPayload(id: string, d: Day) {
    const loc = parseDayId(id)!;
    return {
      activities: d.activities,
      absences: d.absences,
      weekKey: loc.weekKey,
      dayIndex: loc.dayIndex,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: this.email,
    };
  }

  private funcoesPayload(lista: string[]) {
    return { lista, atualizadoEm: new Date().toISOString(), atualizadoPor: this.email };
  }

  private async applyRemote(action: Action): Promise<void> {
    const { fsMod, fs } = this.api!;
    switch (action.type) {
      case 'funcao/add':
      case 'funcao/rename':
      case 'funcao/remove': {
        const ref = fsMod.doc(fs, DOC_FUNCOES);
        // renomear também troca a função nos colaboradores que a usam
        const affected =
          action.type === 'funcao/rename'
            ? Object.values(this.confirmed.workers).filter((w) => w.funcao === action.de).map((w) => w.id)
            : action.type === 'funcao/remove'
              ? Object.keys(this.confirmed.workers)
              : [];
        const result = await fsMod.runTransaction(fs, async (tx) => {
          const snap = await tx.get(ref);
          const wrefs = affected.map((id) => fsMod.doc(fs, COL_EFETIVO, id));
          const wsnaps = await Promise.all(wrefs.map((r) => tx.get(r)));
          const lista = Array.isArray(snap.data()?.lista) ? (snap.data()!.lista as string[]) : [...FUNCOES_PADRAO];
          const workers = wsnaps.filter((s) => s.exists()).map((s) => readWorker(s.id, s.data()));
          const before: AppState = { version: CURRENT_VERSION, workers, funcoes: lista, weeks: {} };
          const after = reducer(before, action);
          if (after === before) return null; // nada a fazer (repetida, em uso, duplicada…)
          tx.set(ref, this.funcoesPayload(after.funcoes));
          if (action.type === 'funcao/rename')
            after.workers.forEach((w) => tx.set(fsMod.doc(fs, COL_EFETIVO, w.id), { ...w }));
          return after;
        });
        if (result) {
          const ws = { ...this.confirmed.workers };
          result.workers.forEach((w) => (ws[w.id] = w));
          this.confirmed = { ...this.confirmed, workers: ws, funcoes: result.funcoes };
        }
        return;
      }
      case 'worker/add':
      case 'worker/update':
      case 'worker/setActive': {
        const id = action.id;
        const ref = fsMod.doc(fs, COL_EFETIVO, id);
        const result = await fsMod.runTransaction(fs, async (tx) => {
          const snap = await tx.get(ref);
          let w: Worker | null = snap.exists() ? readWorker(id, snap.data()) : null;
          if (action.type === 'worker/add') {
            if (w) return w; // já criado (ação repetida)
            w = { id, nome: cleanName(action.nome), funcao: action.funcao, ativo: true };
          } else if (!w) {
            return null; // removido por outra pessoa
          } else if (action.type === 'worker/update') {
            w = { ...w, nome: cleanName(action.nome), funcao: action.funcao };
          } else {
            w = { ...w, ativo: action.ativo };
          }
          tx.set(ref, { ...w });
          return w;
        });
        const workers = { ...this.confirmed.workers };
        if (result) workers[id] = result;
        else delete workers[id];
        this.confirmed = { ...this.confirmed, workers };
        return;
      }
      case 'worker/remove': {
        const id = action.id;
        const dayIds = Object.entries(this.confirmed.days)
          .filter(([, d]) => d.absences.some((a) => a.workerId === id) || d.activities.some((a) => a.workerIds.includes(id)))
          .map(([k]) => k);
        const updated = await fsMod.runTransaction(fs, async (tx) => {
          const refs = dayIds.map((k) => fsMod.doc(fs, COL_DIAS, k));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          const out: Record<string, Day> = {};
          snaps.forEach((s, i) => {
            if (!s.exists()) return;
            const d = readDay(s.data());
            const next: Day = {
              activities: d.activities.map((a) => ({ ...a, workerIds: a.workerIds.filter((w) => w !== id) })),
              absences: d.absences.filter((a) => a.workerId !== id),
            };
            tx.set(refs[i], this.dayPayload(dayIds[i], next));
            out[dayIds[i]] = next;
          });
          tx.delete(fsMod.doc(fs, COL_EFETIVO, id));
          return out;
        });
        const workers = { ...this.confirmed.workers };
        delete workers[id];
        this.confirmed = { workers, days: { ...this.confirmed.days, ...updated } };
        return;
      }
      case 'activity/add':
      case 'activity/rename':
      case 'activity/remove':
      case 'activity/setWorker':
      case 'absence/set': {
        const id = dayDocId(action.weekKey, action.dayIndex);
        const ref = fsMod.doc(fs, COL_DIAS, id);
        const next = await fsMod.runTransaction(fs, async (tx) => {
          const snap = await tx.get(ref);
          const cur = snap.exists() ? readDay(snap.data()) : emptyDay();
          const n = applyToDay(cur, action);
          if (!n.activities.length && !n.absences.length) {
            if (snap.exists()) tx.delete(ref);
          } else {
            tx.set(ref, this.dayPayload(id, n));
          }
          return n;
        });
        const days = { ...this.confirmed.days };
        if (next.activities.length || next.absences.length) days[id] = next;
        else delete days[id];
        this.confirmed = { ...this.confirmed, days };
        return;
      }
      case 'state/replace':
        return; // tratado em replaceAll
    }
  }

  private afterRemote(part: 'workers' | 'days', fromCache: boolean) {
    this.loadedParts[part] = true;
    const loaded = this.loadedParts.workers && this.loadedParts.days;
    const offline = fromCache && typeof navigator !== 'undefined' && navigator.onLine === false;
    const cloudEmpty = loaded && !Object.keys(this.confirmed.workers).length && !Object.keys(this.confirmed.days).length;
    this.info = {
      ...this.info,
      loaded,
      cloudEmpty,
      status: !loaded ? 'connecting' : this.pending.length ? (offline ? 'offline' : 'saving') : offline ? 'offline' : 'ok',
    };
    this.refresh();
    if (loaded) void this.flush();
  }

  private onListenError(e: unknown) {
    const code = errCode(e);
    this.setInfo({ status: code === 'permission-denied' ? 'denied' : 'error', lastError: errMsg(e) });
  }

  private computeView(): AppState {
    let s = mapsToState(this.confirmed);
    for (const a of this.pending) s = reducer(s, a);
    return s;
  }

  private refresh() {
    this.view = this.computeView();
    this.info = { ...this.info, pending: this.pending.length };
    this.writeCache();
    this.emit();
  }

  private setInfo(p: Partial<SyncInfo>) {
    this.info = { ...this.info, ...p, pending: this.pending.length };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private readCache() {
    try {
      const raw = this.storage?.getItem(CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as { confirmed?: DocMaps; pending?: Action[] };
      if (c.confirmed?.workers && c.confirmed?.days) this.confirmed = c.confirmed;
      if (Array.isArray(c.pending)) this.pending = c.pending;
    } catch {
      /* cache ilegível: ignora, a nuvem repõe */
    }
  }

  private writeCache() {
    try {
      this.storage?.setItem(CACHE_KEY, JSON.stringify({ confirmed: this.confirmed, pending: this.pending }));
    } catch {
      /* sem espaço: segue só em memória */
    }
  }
}
