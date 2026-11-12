import type { FirebaseApi } from './firebase';
import { dayDocId, mapsToState, type DocMaps } from './sync';
import { AUSENCIAS_PADRAO, FUNCOES_PADRAO, type AppState, type Day, type TipoAusencia, type Worker } from '../domain/types';

/**
 * CÓPIA PÚBLICA DA ESCALA (visualização sem login)
 *
 * As regras do Firestore liberam documentos inteiros, não campos. Para quem só tem o
 * link ver a escala SEM ver o motivo de ausências sensíveis (atestado = saúde, LGPD),
 * a liderança mantém uma cópia à parte:
 *   escala_publica/{AAAA-Www_D}    atividades + ausências com tipo genérico
 *   escala_publica_config/geral    efetivo (nome e função, sem matrícula), funções,
 *                                  tipos de ausência visíveis e feriados
 * Só "folga" e "férias" aparecem com o nome; qualquer outro tipo vira "Ausência".
 */
export const COL_PUB_DIAS = 'escala_publica';
export const DOC_PUB_CONFIG = 'escala_publica_config/geral';

/** Tipos que aparecem com o nome para quem não está logado. */
export const AUS_PUBLICAS = new Set(['folga', 'ferias']);
export const AUS_GENERICA: TipoAusencia = { id: 'ausencia', nome: 'Ausência', sigla: 'AU', cor: 'laranja', ativo: true };

export interface PubConfig {
  efetivo: { id: string; nome: string; funcao: string; ativo: boolean; apoio?: boolean }[];
  funcoes: string[];
  ausencias: TipoAusencia[];
  feriados: Record<string, string>;
}

export function projetarDia(d: Day): Day {
  return {
    activities: d.activities.map((a) => ({ id: a.id, nome: a.nome, workerIds: [...a.workerIds] })),
    absences: d.absences.map((a) => ({ workerId: a.workerId, tipo: AUS_PUBLICAS.has(a.tipo) ? a.tipo : AUS_GENERICA.id })),
  };
}

export function projetarConfig(m: DocMaps): PubConfig {
  const aus = (m.ausencias ?? AUSENCIAS_PADRAO).filter((t) => AUS_PUBLICAS.has(t.id)).map((t) => ({ ...t }));
  return {
    efetivo: Object.values(m.workers)
      .map((w) => ({ id: w.id, nome: w.nome, funcao: w.funcao, ativo: w.ativo, ...(w.apoio ? { apoio: true } : {}) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    funcoes: [...(m.funcoes ?? FUNCOES_PADRAO)],
    ausencias: [...aus, { ...AUS_GENERICA }],
    feriados: { ...(m.feriados ?? {}) },
  };
}

/** Dias da cópia pública que precisam ser gravados/apagados para ficar igual à escala real. */
export function diffPublico(priv: DocMaps, pub: Record<string, Day>): { gravar: Record<string, Day>; apagar: string[] } {
  const gravar: Record<string, Day> = {};
  for (const [id, d] of Object.entries(priv.days)) {
    if (!d.activities.length && !d.absences.length) continue;
    const p = projetarDia(d);
    if (JSON.stringify(p) !== JSON.stringify(pub[id] ? projetarDia(pub[id]) : null)) gravar[id] = p;
  }
  const apagar = Object.keys(pub).filter((id) => !gravar[id] && !(priv.days[id] && (priv.days[id].activities.length || priv.days[id].absences.length)));
  return { gravar, apagar };
}

/** Estado só de leitura montado a partir da cópia pública. */
export function estadoPublico(cfg: PubConfig | null, dias: Record<string, Day>): AppState {
  const workers: Record<string, Worker> = {};
  for (const w of cfg?.efetivo ?? []) workers[w.id] = { id: w.id, nome: w.nome, funcao: w.funcao, ativo: w.ativo, ...(w.apoio ? { apoio: true } : {}) };
  const ausencias = cfg?.ausencias?.length ? cfg.ausencias : [...AUSENCIAS_PADRAO.filter((t) => AUS_PUBLICAS.has(t.id)), AUS_GENERICA];
  return mapsToState({ workers, days: dias, funcoes: cfg?.funcoes ?? null, ausencias, feriados: cfg?.feriados ?? null });
}

const readDay = (x: unknown): Day => {
  const d = (x ?? {}) as Partial<Day>;
  return { activities: Array.isArray(d.activities) ? d.activities : [], absences: Array.isArray(d.absences) ? d.absences : [] };
};

/** Escuta a cópia pública (usado pela visualização e pelo publicador). */
export function ouvirPublico(
  api: FirebaseApi,
  cb: (cfg: PubConfig | null, dias: Record<string, Day>, meta: { loaded: boolean; offline: boolean }) => void,
  onErr: (e: unknown) => void,
): () => void {
  const { fsMod, fs } = api;
  let cfg: PubConfig | null = null;
  let dias: Record<string, Day> = {};
  let okCfg = false;
  let okDias = false;
  let offline = false;
  const emit = () => cb(cfg, dias, { loaded: okCfg && okDias, offline });
  const u1 = fsMod.onSnapshot(
    fsMod.doc(fs, DOC_PUB_CONFIG),
    { includeMetadataChanges: true },
    (s) => {
      cfg = s.exists() ? (s.data() as PubConfig) : null;
      okCfg = true;
      offline = s.metadata.fromCache;
      emit();
    },
    onErr,
  );
  const u2 = fsMod.onSnapshot(
    fsMod.collection(fs, COL_PUB_DIAS),
    { includeMetadataChanges: true },
    (s) => {
      const n: Record<string, Day> = {};
      s.docs.forEach((d) => (n[d.id] = readDay(d.data())));
      dias = n;
      okDias = true;
      offline = s.metadata.fromCache;
      emit();
    },
    onErr,
  );
  return () => {
    u1();
    u2();
  };
}

/**
 * Publicador (aparelhos da liderança): mantém a cópia pública igual à escala confirmada
 * na nuvem. Compara e grava só o que mudou — também corrige a cópia se ela ficou para trás
 * (ex.: alteração feita por um aparelho com a versão antiga do app).
 */
export class Publicador {
  private pubCfg: PubConfig | null = null;
  private pubDias: Record<string, Day> = {};
  private pubOk = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;
  private rodando = false;

  constructor(
    private readonly api: FirebaseApi,
    private readonly fonte: () => DocMaps | null,
    private readonly esperaMs = 1500,
  ) {
    this.unsub = ouvirPublico(
      api,
      (cfg, dias, meta) => {
        this.pubCfg = cfg;
        this.pubDias = dias;
        // só compara com a cópia que veio do servidor (não com o cache do aparelho)
        if (meta.loaded && !meta.offline) this.pubOk = true;
        this.agendar();
      },
      () => {},
    );
  }

  agendar(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.publicar(), this.esperaMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsub?.();
    this.unsub = null;
  }

  async publicar(): Promise<number> {
    const priv = this.fonte();
    if (!priv || !this.pubOk || this.rodando) return 0;
    this.rodando = true;
    try {
      const { fsMod, fs } = this.api;
      const ops: ((b: ReturnType<typeof fsMod.writeBatch>) => void)[] = [];
      const cfg = projetarConfig(priv);
      if (JSON.stringify(cfg) !== JSON.stringify(this.pubCfg)) ops.push((b) => b.set(fsMod.doc(fs, DOC_PUB_CONFIG), cfg));
      const { gravar, apagar } = diffPublico(priv, this.pubDias);
      for (const [id, d] of Object.entries(gravar)) ops.push((b) => b.set(fsMod.doc(fs, COL_PUB_DIAS, id), d));
      for (const id of apagar) ops.push((b) => b.delete(fsMod.doc(fs, COL_PUB_DIAS, id)));
      for (let i = 0; i < ops.length; i += 400) {
        const b = fsMod.writeBatch(fs);
        ops.slice(i, i + 400).forEach((op) => op(b));
        await b.commit();
      }
      return ops.length;
    } catch {
      return 0; // sem permissão/sem internet: tenta de novo na próxima mudança
    } finally {
      this.rodando = false;
    }
  }
}

export { dayDocId };
