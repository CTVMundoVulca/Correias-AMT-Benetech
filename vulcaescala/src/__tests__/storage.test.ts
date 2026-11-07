import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, STORAGE_KEY } from '../storage/LocalStorageRepository';
import { MemoryRepository } from '../storage/MemoryRepository';
import { CorruptDataError } from '../storage/StorageRepository';
import { INITIAL_WORKERS, seedState } from '../domain/seed';
import { emptyState } from '../domain/types';
import { reducer } from '../state/reducer';


class FakeStorage implements Storage {
  map = new Map<string, string>();
  failWrites = false;
  failReads = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    if (this.failReads) throw new Error('SecurityError');
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
}

let n = 0;
const seqId = () => `id${++n}`;

describe('efetivo inicial', () => {
  it('30 vulcanizadores ativos, em maiúsculas, sem nomes repetidos', () => {
    const s = seedState(seqId);
    expect(s.workers).toHaveLength(30);
    expect(INITIAL_WORKERS).toHaveLength(30);
    expect(s.workers.every((w) => w.funcao === 'Vulcanizador' && w.ativo)).toBe(true);
    expect(s.workers.map((w) => w.nome)).toContain('CÍCERO');
    expect(s.workers.map((w) => w.nome)).toContain('LUCAS JORDÃO');
    expect(new Set(s.workers.map((w) => w.nome)).size).toBe(30);
  });
});

describe('LocalStorageRepository', () => {
  it('sem dados → null', async () => {
    expect(await new LocalStorageRepository(new FakeStorage()).load()).toBeNull();
  });

  it('grava e lê de volta', async () => {
    const st = new FakeStorage();
    const repo = new LocalStorageRepository(st);
    const s = seedState(seqId);
    await repo.save(s);
    expect(await repo.load()).toEqual(s);
    expect(JSON.parse(st.map.get(STORAGE_KEY)!).version).toBe(2);
  });

  it('dados corrompidos: lança CorruptDataError e preserva uma cópia', async () => {
    const st = new FakeStorage();
    st.map.set(STORAGE_KEY, '{isto não é json');
    const err = await new LocalStorageRepository(st).load().catch((e) => e);
    expect(err).toBeInstanceOf(CorruptDataError);
    expect(st.map.get(err.backupKey)).toBe('{isto não é json');
  });

  it('leitura bloqueada vira erro tratável, não exceção solta', async () => {
    const st = new FakeStorage();
    st.failReads = true;
    await expect(new LocalStorageRepository(st).load()).rejects.toBeInstanceOf(CorruptDataError);
  });

  it('falha de gravação vira erro com mensagem', async () => {
    const st = new FakeStorage();
    st.failWrites = true;
    await expect(new LocalStorageRepository(st).save(emptyState())).rejects.toThrow(/falha ao gravar/);
  });
});

describe('MemoryRepository', () => {
  it('funciona sem armazenamento do navegador', async () => {
    const repo = new MemoryRepository();
    expect(repo.persistent).toBe(false);
    expect(await repo.load()).toBeNull();
    await repo.save(seedState(seqId));
    expect((await repo.load())!.workers).toHaveLength(30);
  });
});

describe('nome duplicado', () => {
  it('reducer ignora duplicado sem diferenciar maiúsculas nem acentos', () => {
    let s = reducer(emptyState(), { type: 'worker/add', id: 'a', nome: 'Cláudio', funcao: 'Vulcanizador' });
    s = reducer(s, { type: 'worker/add', id: 'b', nome: 'claudio', funcao: 'Líder' });
    s = reducer(s, { type: 'worker/add', id: 'c', nome: '  CLÁUDIO ', funcao: 'Líder' });
    expect(s.workers.map((w) => w.id)).toEqual(['a']);
    s = reducer(s, { type: 'worker/add', id: 'd', nome: 'Bruno', funcao: 'Líder' });
    s = reducer(s, { type: 'worker/update', id: 'd', nome: 'claudio', funcao: 'Líder' });
    expect(s.workers.find((w) => w.id === 'd')!.nome).toBe('BRUNO');
  });
});

