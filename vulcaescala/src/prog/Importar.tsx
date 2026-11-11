import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { COL_MES, COL_OMS, gravarAtividadesEmLote, gravarOms } from './data';
import { anoDaOm, completarAtividade, completarOm, mesDe, resumir, tipoPelaDescricao, type Atividade, type OmInfo } from './model';

interface Pacote {
  atividades: Atividade[];
  oms: OmInfo[];
  origem: string;
}

/** Lê o arquivo gerado a partir da planilha (formato "prog-amt-v1"). */
export function lerPacote(texto: string): Pacote {
  const j = JSON.parse(texto);
  if (!j || j.formato !== 'prog-amt-v1' || !Array.isArray(j.atividades)) throw new Error('Arquivo não é uma exportação da planilha de programação.');
  const atividades = (j.atividades as unknown[])
    .map((v) => {
      const x = (v ?? {}) as { id?: unknown; tipo?: unknown; descricao?: unknown };
      // tipo de serviço: o mesmo cálculo do app, a partir da descrição
      const tipo = typeof x.tipo === 'string' && x.tipo ? x.tipo : tipoPelaDescricao(String(x.descricao ?? ''));
      return completarAtividade(String(x.id ?? ''), { ...x, tipo });
    })
    .filter((a): a is Atividade => !!a && !!a.id);
  const oms = (Array.isArray(j.oms) ? (j.oms as unknown[]) : [])
    .map((v) => completarOm(String((v as { om?: unknown })?.om ?? ''), v))
    .filter((o) => /^\d{6,14}$/.test(o.om) && !!o.primeiraData);
  return { atividades, oms, origem: String(j.origem ?? '') };
}

/**
 * Importa o histórico da planilha. Seguro para repetir: atividades e OMs que já existem
 * na nuvem (inclusive as alteradas no app) NÃO são sobrescritas — só entra o que falta.
 */
export function Importar({ onClose }: { onClose: () => void }) {
  const { api, por } = useProg();
  const toast = useToast();
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [erro, setErro] = useState('');
  const [fase, setFase] = useState<'escolher' | 'gravando' | 'feito'>('escolher');
  const [resultado, setResultado] = useState('');

  const abrir = async (f: File | undefined) => {
    setErro('');
    setPacote(null);
    if (!f) return;
    try {
      setPacote(lerPacote(await f.text()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Arquivo inválido.');
    }
  };

  const importar = async () => {
    if (!pacote) return;
    if (!navigator.onLine) return toast('A importação precisa de internet.', 'warn');
    setFase('gravando');
    try {
      const { fsMod, fs } = api;
      const meses = [...new Set(pacote.atividades.map((a) => mesDe(a.data)))];
      const existentes = new Set<string>();
      for (const m of meses) {
        const snap = await fsMod.getDocFromServer(fsMod.doc(fs, COL_MES, m));
        Object.keys(snap.data()?.itens ?? {}).forEach((id) => existentes.add(id));
      }
      const novas = pacote.atividades.filter((a) => !existentes.has(a.id));
      const anos = [...new Set(pacote.oms.map(anoDaOm))];
      const omsExistentes = new Set<string>();
      for (const ano of anos) {
        const snap = await fsMod.getDocFromServer(fsMod.doc(fs, COL_OMS, ano));
        Object.keys(snap.data()?.oms ?? {}).forEach((om) => omsExistentes.add(om));
      }
      const omsNovas = pacote.oms.filter((o) => !omsExistentes.has(o.om));
      if (novas.length) await gravarAtividadesEmLote(api, novas, por);
      if (omsNovas.length) await gravarOms(api, omsNovas, por);
      setResultado(
        `${novas.length} atividade(s) e ${omsNovas.length} OM(s) importadas.` +
          (pacote.atividades.length - novas.length ? ` ${pacote.atividades.length - novas.length} atividade(s) já existiam e foram mantidas.` : ''),
      );
      setFase('feito');
    } catch (e) {
      setFase('escolher');
      setErro(`Falha na importação${e instanceof Error ? `: ${e.message}` : ''}. Nada foi apagado; pode tentar de novo.`);
    }
  };

  const r = pacote ? resumir(pacote.atividades) : null;
  const datas = pacote?.atividades.map((a) => a.data).sort() ?? [];

  return (
    <Modal
      title="Importar planilha"
      subtitle="Histórico da planilha de programação (arquivo .json convertido)"
      onClose={onClose}
      footer={
        fase === 'feito' ? (
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={fase === 'gravando'}>
              Cancelar
            </button>
            <button className="btn primary" onClick={() => void importar()} disabled={!pacote || fase === 'gravando'}>
              {fase === 'gravando' ? 'Importando…' : 'Importar'}
            </button>
          </>
        )
      }
    >
      {fase === 'feito' ? (
        <p className="banner ok">{resultado}</p>
      ) : (
        <div className="stack">
          <input className="input" type="file" accept=".json,application/json" onChange={(e) => void abrir(e.target.files?.[0])} />
          {erro && <p className="banner danger">{erro}</p>}
          {pacote && r && (
            <div className="banner info small">
              <b>{pacote.origem || 'Planilha'}</b>
              <br />
              {r.total} atividades de {datas[0]?.split('-').reverse().join('/')} a {datas[datas.length - 1]?.split('-').reverse().join('/')} · {pacote.oms.length}{' '}
              OMs
              <br />
              Classificadas na planilha: {r.total - r.classes.sem} · sem classificação: {r.classes.sem}
            </div>
          )}
          <p className="small muted">
            Pode importar de novo sem duplicar: o que já está no app (inclusive o que foi alterado aqui) é mantido.
          </p>
        </div>
      )}
    </Modal>
  );
}
