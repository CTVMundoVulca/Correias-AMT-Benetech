import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { MONTHS } from '../domain/isoWeek';

/**
 * Meta de % de atividades programadas (programadas ÷ executadas), definida pela programação.
 * Cada meta vale a partir de um mês até a próxima: assim dá para manter 80% pelo tempo que
 * quiser e mudar depois sem alterar os meses anteriores.
 */
export const DOC_METAS = 'prog_config/metas';
export interface MetaVigencia {
  /** "AAAA-MM" */
  desde: string;
  /** 0–100 */
  pct: number;
}

export function completarMetas(v: unknown): MetaVigencia[] {
  const l = Array.isArray(v) ? v : [];
  const ok = l
    .map((x) => x as Partial<MetaVigencia>)
    .filter((x): x is MetaVigencia => typeof x?.desde === 'string' && /^\d{4}-\d{2}$/.test(x.desde) && typeof x.pct === 'number' && x.pct >= 0 && x.pct <= 100);
  const porMes = new Map(ok.map((x) => [x.desde, x]));
  return [...porMes.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Meta que vale no mês "AAAA-MM" (null = sem meta definida). */
export function metaDoMes(metas: MetaVigencia[], ym: string): number | null {
  let m: number | null = null;
  for (const x of metas) if (x.desde <= ym) m = x.pct;
  return m;
}

export function useMetas(): MetaVigencia[] | null {
  const { api } = useProg();
  const [l, setL] = useState<MetaVigencia[] | null>(null);
  useEffect(() => {
    const { fsMod, fs } = api;
    return fsMod.onSnapshot(
      fsMod.doc(fs, DOC_METAS),
      (s) => setL(completarMetas(s.data()?.programadas)),
      () => setL([]),
    );
  }, [api]);
  return l;
}

const nomeYm = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

/** Editar a meta de % programadas (vigências). */
export function MetasDialog({ metas, mesAtual, onClose }: { metas: MetaVigencia[]; mesAtual: string; onClose: () => void }) {
  const { api, por } = useProg();
  const toast = useToast();
  const [l, setL] = useState<MetaVigencia[]>(metas);
  const [desde, setDesde] = useState(mesAtual);
  const [pct, setPct] = useState(String(metaDoMes(metas, mesAtual) ?? 80));
  const [salvando, setSalvando] = useState(false);

  const incluir = () => {
    const n = Number(pct.replace(',', '.'));
    if (!/^\d{4}-\d{2}$/.test(desde)) return toast('Escolha o mês de início.', 'warn');
    if (!Number.isFinite(n) || n < 0 || n > 100) return toast('A meta precisa estar entre 0 e 100%.', 'warn');
    setL((x) => completarMetas([...x.filter((m) => m.desde !== desde), { desde, pct: Math.round(n * 10) / 10 }]));
  };
  const salvar = async () => {
    setSalvando(true);
    const { fsMod, fs } = api;
    const envio = fsMod.setDoc(fsMod.doc(fs, DOC_METAS), { programadas: l, atualizadoEm: new Date().toISOString(), atualizadoPor: por });
    try {
      const r = await Promise.race([envio.then(() => 'ok' as const), new Promise<'pendente'>((ok) => setTimeout(() => ok('pendente'), 5000))]);
      if (r === 'pendente') envio.catch(() => toast('A nuvem recusou a meta. Confira se você tem o papel de programador e se as regras foram publicadas.', 'danger'));
      toast(r === 'ok' ? 'Meta salva' : 'Meta salva no aparelho: será enviada quando a conexão voltar');
      onClose();
    } catch {
      toast('Não foi possível salvar. Confira a conexão, o seu papel e se as regras do Firebase foram publicadas.', 'danger');
      setSalvando(false);
    }
  };

  return (
    <Modal
      title="Meta de atividades programadas"
      subtitle="Programadas ÷ executadas. A meta vale a partir do mês escolhido até você definir outra."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="row nowrap meta-linha">
        <label className="field grow">
          A partir de
          <input className="input" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="field meta-pct">
          Meta (%)
          <input className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Meta em porcentagem" />
        </label>
        <button type="button" className="btn" onClick={incluir}>
          Aplicar
        </button>
      </div>
      {l.length === 0 ? (
        <p className="small muted">Nenhuma meta definida ainda.</p>
      ) : (
        <ul className="plain-list meta-lista">
          {l.map((m, i) => (
            <li key={m.desde} className="row between">
              <span>
                <b className="num">{m.pct.toLocaleString('pt-BR')}%</b> de {nomeYm(m.desde)}
                {l[i + 1] ? ` até ${nomeYm(prevYm(l[i + 1].desde))}` : ' em diante'}
              </span>
              <button type="button" className="link small" onClick={() => setL((x) => x.filter((y) => y.desde !== m.desde))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
