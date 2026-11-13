import type { FirebaseApi } from '../cloud/firebase';
import { COL_EMENDAS } from '../emenda/data';
import type { RelResumo } from './relEmenda';
import {
  AREAS_PADRAO,
  anoDaOm,
  completarAtividade,
  completarOm,
  completarSolicitacao,
  completarParada,
  completarPapeis,
  completarPedidoParada,
  PAPEIS_VAZIOS,
  type Papeis,
  type PedidoParada,
  type Retorno,
  type Parada,
  mesDe,
  type Area,
  type Atividade,
  type OmInfo,
  type Solicitacao,
} from './model';

/**
 * Firestore da Programação (projeto Firebase do AMT):
 *   prog_mes/{AAAA-MM}         { itens: { [atividadeId]: Atividade } } — a programação do mês
 *   prog_oms/{AAAA}            { oms: { [numeroOm]: OmInfo } } — situação das OMs (ano da 1ª programação)
 *   prog_solicitacoes/{id}     pedidos das áreas (qualquer pessoa com o link)
 *   prog_config/areas          { lista: [{ nome, contato }] }
 *
 * Um documento por mês: o painel e o dashboard leem 1 documento por mês (barato), e cada
 * gravação mexe só na própria atividade (merge do campo), então dois programadores podem
 * editar o mesmo mês ao mesmo tempo. Sem internet o Firestore guarda no aparelho e envia depois.
 */
export const COL_MES = 'prog_mes';
export const COL_OMS = 'prog_oms';
export const COL_SOLIC = 'prog_solicitacoes';
export const DOC_AREAS = 'prog_config/areas';

type Unsub = () => void;

export interface Pendencia {
  pendente: boolean;
  offline: boolean;
}

/** Ouve vários meses; entrega a união das atividades (e se há gravações pendentes). */
export function ouvirMeses(
  api: FirebaseApi,
  meses: string[],
  cb: (l: Atividade[], p: Pendencia, carregados: number) => void,
  onErr: (e: unknown) => void = () => {},
): Unsub {
  const { fsMod, fs } = api;
  const por = new Map<string, { itens: Atividade[]; pend: boolean; cache: boolean }>();
  const emitir = () => {
    const l: Atividade[] = [];
    let pend = false;
    let cache = false;
    for (const v of por.values()) {
      l.push(...v.itens);
      pend ||= v.pend;
      cache ||= v.cache;
    }
    cb(l, { pendente: pend, offline: cache }, por.size);
  };
  const unsubs = meses.map((mes) =>
    fsMod.onSnapshot(
      fsMod.doc(fs, COL_MES, mes),
      { includeMetadataChanges: true },
      (snap) => {
        const itens = (snap.data()?.itens ?? {}) as Record<string, unknown>;
        const l: Atividade[] = [];
        for (const [id, v] of Object.entries(itens)) {
          const a = completarAtividade(id, v);
          if (a && mesDe(a.data) === mes) l.push(a);
        }
        por.set(mes, { itens: l, pend: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache });
        emitir();
      },
      (e) => {
        por.set(mes, { itens: [], pend: false, cache: false });
        emitir();
        onErr(e);
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

const carimbo = (por: string) => ({ atualizadoEm: new Date().toISOString(), atualizadoPor: por });

/**
 * Grava a atividade (inteira) no documento do mês. Se a data mudou de mês, retira do mês
 * antigo na mesma gravação. Não espera a nuvem: sem internet fica pendente no aparelho.
 */
export function gravarAtividade(api: FirebaseApi, a: Atividade, por: string, mesAnterior?: string): Promise<void> {
  const { fsMod, fs } = api;
  const mes = mesDe(a.data);
  const item = { ...a, atualizadoEm: new Date().toISOString(), atualizadoPor: por };
  const b = fsMod.writeBatch(fs);
  b.set(fsMod.doc(fs, COL_MES, mes), { itens: { [a.id]: item }, ...carimbo(por) }, { merge: true });
  if (mesAnterior && mesAnterior !== mes)
    b.set(fsMod.doc(fs, COL_MES, mesAnterior), { itens: { [a.id]: fsMod.deleteField() }, ...carimbo(por) }, { merge: true });
  return b.commit();
}

export function excluirAtividade(api: FirebaseApi, a: Pick<Atividade, 'id' | 'data'>, por: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_MES, mesDe(a.data)), { itens: { [a.id]: fsMod.deleteField() }, ...carimbo(por) }, { merge: true });
}

/** Grava várias atividades de uma vez (importação). Lotes de até 400 meses×itens por commit. */
export async function gravarAtividadesEmLote(api: FirebaseApi, lista: Atividade[], por: string): Promise<void> {
  const { fsMod, fs } = api;
  const porMes = new Map<string, Record<string, Atividade>>();
  for (const a of lista) {
    const m = porMes.get(mesDe(a.data)) ?? {};
    m[a.id] = a;
    porMes.set(mesDe(a.data), m);
  }
  // um set por mês (cada documento < 1 MB): ~200 atividades × ~400 bytes
  const b = fsMod.writeBatch(fs);
  for (const [mes, itens] of porMes) b.set(fsMod.doc(fs, COL_MES, mes), { itens, ...carimbo(por) }, { merge: true });
  await b.commit();
}

// ------------------------------------------------------------------ OMs

/** OMs dos anos pedidos, indexadas pelo número. */
export function ouvirOms(api: FirebaseApi, anos: string[], cb: (m: Map<string, OmInfo>, p: Pendencia) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  const por = new Map<string, { oms: OmInfo[]; pend: boolean; cache: boolean }>();
  const emitir = () => {
    const m = new Map<string, OmInfo>();
    let pend = false;
    let cache = false;
    // ano mais antigo primeiro: se a mesma OM aparecer em dois anos, vale o registro mais novo
    for (const ano of [...por.keys()].sort()) {
      const v = por.get(ano)!;
      for (const o of v.oms) m.set(o.om, o);
      pend ||= v.pend;
      cache ||= v.cache;
    }
    cb(m, { pendente: pend, offline: cache });
  };
  const unsubs = anos.map((ano) =>
    fsMod.onSnapshot(
      fsMod.doc(fs, COL_OMS, ano),
      { includeMetadataChanges: true },
      (snap) => {
        const oms = (snap.data()?.oms ?? {}) as Record<string, unknown>;
        por.set(ano, {
          oms: Object.entries(oms).map(([om, v]) => completarOm(om, v)),
          pend: snap.metadata.hasPendingWrites,
          cache: snap.metadata.fromCache,
        });
        emitir();
      },
      (e) => {
        por.set(ano, { oms: [], pend: false, cache: false });
        emitir();
        onErr(e);
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Grava (merge) OMs; cada uma vai para o documento do ano da primeira programação. */
export function gravarOms(api: FirebaseApi, oms: OmInfo[], por: string): Promise<void> {
  const { fsMod, fs } = api;
  const porAno = new Map<string, Record<string, OmInfo>>();
  for (const o of oms) {
    const ano = anoDaOm(o) || new Date().getFullYear().toString();
    const m = porAno.get(ano) ?? {};
    m[o.om] = o;
    porAno.set(ano, m);
  }
  const b = fsMod.writeBatch(fs);
  for (const [ano, m] of porAno) b.set(fsMod.doc(fs, COL_OMS, ano), { oms: m, ...carimbo(por) }, { merge: true });
  return b.commit();
}

/**
 * Atualiza o cadastro da OM a partir da atividade salva: cria a OM (aguardando retorno) se
 * ainda não existe e mantém primeira/última data. Nunca mexe na situação já registrada.
 */
export function omDaAtividade(a: Atividade, atual: OmInfo | undefined): OmInfo | null {
  if (!a.om) return null;
  if (!atual)
    return {
      om: a.om,
      area: a.area,
      equipamento: a.equipamento,
      descricao: a.descricao,
      primeiraData: a.data,
      ultimaData: a.data,
      situacao: 'aberta',
      retornoEm: '',
      retornoPor: '',
      baixaEm: '',
      baixaPor: '',
      cancelada: false,
    };
  const primeira = atual.primeiraData && atual.primeiraData < a.data ? atual.primeiraData : a.data;
  const ultima = atual.ultimaData > a.data ? atual.ultimaData : a.data;
  if (primeira === atual.primeiraData && ultima === atual.ultimaData && atual.area) return null;
  return {
    ...atual,
    area: atual.area || a.area,
    equipamento: atual.equipamento || a.equipamento,
    descricao: atual.descricao || a.descricao,
    // o documento continua no ano original (primeiraData define o ano)
    primeiraData: atual.primeiraData || primeira,
    ultimaData: ultima,
  };
}

// ------------------------------------------------------------------ solicitações

export function ouvirSolicitacoes(api: FirebaseApi, cb: (l: Solicitacao[], p: Pendencia) => void, desde: string, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  const q = fsMod.query(fsMod.collection(fs, COL_SOLIC), fsMod.where('criadoEm', '>=', desde));
  return fsMod.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => completarSolicitacao(d.id, d.data())).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
        { pendente: snap.metadata.hasPendingWrites, offline: snap.metadata.fromCache },
      ),
    onErr,
  );
}

/** Solicitações em aberto (todas as datas) — a caixa de entrada do programador. */
export function ouvirAbertas(api: FirebaseApi, cb: (l: Solicitacao[]) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  const q = fsMod.query(fsMod.collection(fs, COL_SOLIC), fsMod.where('status', '==', 'aberta'));
  return fsMod.onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => completarSolicitacao(d.id, d.data())).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))),
    onErr,
  );
}

export function gravarSolicitacao(api: FirebaseApi, s: Solicitacao): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_SOLIC, s.id), s);
}

// ------------------------------------------------------------------ áreas

export function ouvirAreas(api: FirebaseApi, cb: (l: Area[]) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, DOC_AREAS),
    (snap) => {
      const l = snap.data()?.lista;
      cb(
        Array.isArray(l) && l.length
          ? l
              .filter((a) => a && typeof a.nome === 'string' && a.nome)
              .map((a) => ({ nome: String(a.nome), contato: typeof a.contato === 'string' ? a.contato : '' }))
          : AREAS_PADRAO,
      );
    },
    () => cb(AREAS_PADRAO),
  );
}

export function gravarAreas(api: FirebaseApi, lista: Area[]): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, DOC_AREAS), { lista });
}

/** Feriados municipais cadastrados na escala (cópia pública: qualquer sessão do app lê). */
export function ouvirFeriados(api: FirebaseApi, cb: (m: Record<string, string>) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, 'escala_publica_config/geral'),
    (snap) => {
      const f = snap.data()?.feriados;
      cb(f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, string>) : {});
    },
    () => cb({}),
  );
}

// ------------------------------------------------------------------ paradas

export const COL_PARADAS = 'prog_paradas';

/** Paradas dos anos pedidos (um documento por ano, pelo ano de início). */
export function ouvirParadas(api: FirebaseApi, anos: string[], cb: (l: Parada[]) => void): Unsub {
  const { fsMod, fs } = api;
  const por = new Map<string, Parada[]>();
  const unsubs = anos.map((ano) =>
    fsMod.onSnapshot(
      fsMod.doc(fs, COL_PARADAS, ano),
      (snap) => {
        const m = (snap.data()?.paradas ?? {}) as Record<string, unknown>;
        por.set(
          ano,
          Object.entries(m)
            .map(([id, v]) => completarParada(id, v))
            .filter((p): p is Parada => !!p),
        );
        cb([...por.values()].flat());
      },
      () => {
        por.set(ano, []);
        cb([...por.values()].flat());
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

export function gravarParada(api: FirebaseApi, p: Parada, por: string, anoAnterior?: string): Promise<void> {
  const { fsMod, fs } = api;
  const ano = p.inicio.slice(0, 4);
  const b = fsMod.writeBatch(fs);
  b.set(fsMod.doc(fs, COL_PARADAS, ano), { paradas: { [p.id]: { ...p, atualizadoEm: new Date().toISOString(), atualizadoPor: por } }, ...carimbo(por) }, { merge: true });
  if (anoAnterior && anoAnterior !== ano) b.set(fsMod.doc(fs, COL_PARADAS, anoAnterior), { paradas: { [p.id]: fsMod.deleteField() }, ...carimbo(por) }, { merge: true });
  return b.commit();
}

export function excluirParada(api: FirebaseApi, p: Pick<Parada, 'id' | 'inicio'>, por: string): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_PARADAS, p.inicio.slice(0, 4)), { paradas: { [p.id]: fsMod.deleteField() }, ...carimbo(por) }, { merge: true });
}

// ------------------------------------------------------------------ papéis

export const DOC_PAPEIS = 'prog_config/papeis';

/** Papéis da gestão. Só quem está logado com e-mail lê (a regra confere). */
export function ouvirPapeis(api: FirebaseApi, cb: (p: Papeis) => void): Unsub {
  const { fsMod, fs } = api;
  return fsMod.onSnapshot(
    fsMod.doc(fs, DOC_PAPEIS),
    (snap) => cb(completarPapeis(snap.data())),
    () => cb(PAPEIS_VAZIOS),
  );
}

export function gravarPapeis(api: FirebaseApi, p: Papeis): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, DOC_PAPEIS), completarPapeis(p));
}

// ------------------------------------------------------------------ retornos (supervisor)

export const COL_RETORNOS = 'prog_retornos';

/** Retornos marcados pelo supervisor, por OM (um documento por ano, o mesmo ano do cadastro da OM). */
export function ouvirRetornos(api: FirebaseApi, anos: string[], cb: (m: Map<string, Retorno>) => void): Unsub {
  const { fsMod, fs } = api;
  const por = new Map<string, Record<string, Retorno>>();
  const emitir = () => {
    const m = new Map<string, Retorno>();
    for (const ano of [...por.keys()].sort()) for (const [om, r] of Object.entries(por.get(ano)!)) m.set(om, r);
    cb(m);
  };
  const unsubs = anos.map((ano) =>
    fsMod.onSnapshot(
      fsMod.doc(fs, COL_RETORNOS, ano),
      (snap) => {
        const raw = (snap.data()?.retornos ?? {}) as Record<string, Partial<Retorno>>;
        const r: Record<string, Retorno> = {};
        for (const [om, v] of Object.entries(raw)) r[om] = { realizada: v?.realizada === true, em: String(v?.em ?? ''), por: String(v?.por ?? '') };
        por.set(ano, r);
        emitir();
      },
      () => {
        por.set(ano, {});
        emitir();
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

export function gravarRetornos(api: FirebaseApi, itens: { om: OmInfo; realizada: boolean }[], por: string): Promise<void> {
  const { fsMod, fs } = api;
  const agora = new Date().toISOString();
  const porAno = new Map<string, Record<string, Retorno>>();
  for (const { om, realizada } of itens) {
    const ano = anoDaOm(om) || new Date().getFullYear().toString();
    const m = porAno.get(ano) ?? {};
    m[om.om] = { realizada, em: agora, por };
    porAno.set(ano, m);
  }
  const b = fsMod.writeBatch(fs);
  for (const [ano, m] of porAno) b.set(fsMod.doc(fs, COL_RETORNOS, ano), { retornos: m, ...carimbo(por) }, { merge: true });
  return b.commit();
}

// ------------------------------------------------------------------ paradas informadas pelas áreas

export const COL_PEDIDOS_PARADA = 'prog_paradas_pedidos';

export function ouvirPedidosParada(api: FirebaseApi, desde: string, cb: (l: PedidoParada[]) => void): Unsub {
  const { fsMod, fs } = api;
  const q = fsMod.query(fsMod.collection(fs, COL_PEDIDOS_PARADA), fsMod.where('criadoEm', '>=', desde));
  return fsMod.onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs
          .map((d) => completarPedidoParada(d.id, d.data()))
          .filter((p): p is PedidoParada => !!p)
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      ),
    () => cb([]),
  );
}

export function gravarPedidoParada(api: FirebaseApi, p: PedidoParada): Promise<void> {
  const { fsMod, fs } = api;
  return fsMod.setDoc(fsMod.doc(fs, COL_PEDIDOS_PARADA, p.id), p);
}

// ------------------------------------------------------------------ relatórios de emenda

/** Relatórios do app Registro de Emenda com data no intervalo (só o que o cruzamento usa). */
export function ouvirRelatoriosEmenda(api: FirebaseApi, de: string, ate: string, cb: (l: RelResumo[]) => void, onErr: (e: unknown) => void = () => {}): Unsub {
  const { fsMod, fs } = api;
  const q = fsMod.query(fsMod.collection(fs, COL_EMENDAS), fsMod.where('data', '>=', de), fsMod.where('data', '<=', ate));
  return fsMod.onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const x = d.data() ?? {};
          return { id: d.id, tag: String(x.tag ?? ''), data: String(x.data ?? ''), om: String(x.om ?? ''), numero: String(x.numero ?? '') };
        }),
      ),
    onErr,
  );
}
