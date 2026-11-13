import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { COL_MES, COL_OMS, gravarAtividadesEmLote, gravarOms, limparPlanilhaAntes, type ResumoLimpeza } from './data';
import { dataBr } from './Solicitar';
import { anoDaOm, completarAtividade, completarOm, mesDe, resumir, tipoPelaDescricao, classificar, type Atividade, type OmInfo } from './model';

/** O app passa a valer a partir desta data: o que é anterior na planilha não entra (dados imprecisos). */
export const CORTE_PLANILHA = '2026-11-02';

/** Só o que é a partir do corte; OMs só as que aparecem nessas atividades. */
export function aPartirDe(p: Pacote, corte: string): Pacote {
  const atividades = p.atividades.filter((a) => a.data >= corte);
  const usadas = new Set(atividades.map((a) => a.om).filter(Boolean));
  return { ...p, atividades, oms: p.oms.filter((o) => usadas.has(o.om)) };
}

interface Pacote {
  atividades: Atividade[];
  oms: OmInfo[];
  origem: string;
}

/** Lê o arquivo gerado a partir da planilha (formato "prog-amt-v1"). */
export function lerPacote(texto: string, feriados: Record<string, string> = {}): Pacote {
  const j = JSON.parse(texto);
  if (!j || j.formato !== 'prog-amt-v1' || !Array.isArray(j.atividades)) throw new Error('Arquivo não é uma exportação da planilha de programação.');
  const atividades = (j.atividades as unknown[])
    .map((v) => {
      const x = (v ?? {}) as { id?: unknown; tipo?: unknown; descricao?: unknown };
      // tipo de serviço: o mesmo cálculo do app, a partir da descrição
      const tipo = typeof x.tipo === 'string' && x.tipo ? x.tipo : tipoPelaDescricao(String(x.descricao ?? ''));
      return completarAtividade(String(x.id ?? ''), { ...x, tipo });
    })
    .filter((a): a is Atividade => !!a && !!a.id)
    // regra: fim de semana/feriado = emergência (a planilha não diz quando a demanda foi comunicada,
    // então programada/não programada só ficam se estavam marcadas na planilha)
    .map((a) => (a.classe === '' && classificar(a.data, new Date(0), feriados)?.classe === 'emergencia' ? { ...a, classe: 'emergencia' as const } : a));
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
  const { api, por, feriados, pode } = useProg();
  const [corte, setCorte] = useState(CORTE_PLANILHA);
  const [limpeza, setLimpeza] = useState<ResumoLimpeza | null>(null);
  const [limpando, setLimpando] = useState<'' | 'verificando' | 'apagando' | 'feito'>('');
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
      setPacote(lerPacote(await f.text(), feriados));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Arquivo inválido.');
    }
  };

  const filtrado = pacote ? aPartirDe(pacote, corte) : null;

  const verificarLimpeza = async () => {
    setLimpando('verificando');
    try {
      setLimpeza(await limparPlanilhaAntes(api, corte, por, true));
      setLimpando('');
    } catch {
      setLimpando('');
      toast('Não foi possível verificar (precisa de internet).', 'danger');
    }
  };
  const confirmarLimpeza = async () => {
    setLimpando('apagando');
    try {
      const r = await limparPlanilhaAntes(api, corte, por, false);
      setLimpeza(r);
      setLimpando('feito');
      toast(`Removidas ${r.atividades} atividade(s) e ${r.oms} OM(s) da planilha anteriores a ${dataBr(corte)}`);
    } catch {
      setLimpando('');
      toast('A nuvem recusou a limpeza. Só administradores podem limpar.', 'danger');
    }
  };

  const importar = async () => {
    const pacote = filtrado;
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

  const r = filtrado ? resumir(filtrado.atividades) : null;
  const datas = filtrado?.atividades.map((a) => a.data).sort() ?? [];
  const foraDoCorte = pacote && filtrado ? pacote.atividades.length - filtrado.atividades.length : 0;

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
            <button className="btn primary" onClick={() => void importar()} disabled={!filtrado?.atividades.length || fase === 'gravando'}>
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
          <label className="field">
            Importar a partir de
            <input className="input" type="date" value={corte} onChange={(e) => {
                if (!e.target.value) return;
                setCorte(e.target.value);
                setLimpeza(null);
              }} />
          </label>
          <input className="input" type="file" accept=".json,application/json" onChange={(e) => void abrir(e.target.files?.[0])} />
          {erro && <p className="banner danger">{erro}</p>}
          {pacote && filtrado && r && (
            <div className="banner info small">
              <b>{pacote.origem || 'Planilha'}</b>
              <br />
              {r.total} atividades de {datas[0]?.split('-').reverse().join('/')} a {datas[datas.length - 1]?.split('-').reverse().join('/')} · {filtrado.oms.length}{' '}
              OMs
              {foraDoCorte > 0 && (
                <>
                  <br />
                  {foraDoCorte} atividade(s) anteriores a {dataBr(corte)} ficam de fora
                </>
              )}
              <br />
              Classificadas na planilha: {r.total - r.classes.sem} · sem classificação: {r.classes.sem}
            </div>
          )}
          <p className="small muted">
            Pode importar de novo sem duplicar: o que já está no app (inclusive o que foi alterado aqui) é mantido.
          </p>
          {pode.administrar && (
            <section className="limpeza stack">
              <b>🧹 Remover do app o histórico da planilha anterior a {dataBr(corte)}</b>
              <p className="small muted">
                Apaga só o que veio da planilha antes dessa data (atividades e OMs sem registro feito no app). O que foi lançado no app, os retornos do
                supervisor e as solicitações das áreas ficam.
              </p>
              {!limpeza ? (
                <button type="button" className="btn small" disabled={!!limpando} onClick={() => void verificarLimpeza()}>
                  {limpando === 'verificando' ? 'Verificando…' : 'Verificar o que seria removido'}
                </button>
              ) : limpando === 'feito' ? (
                <p className="banner ok small">
                  Removidas {limpeza.atividades} atividade(s) ({limpeza.meses.length} mês(es)) e {limpeza.oms} OM(s).
                </p>
              ) : limpeza.atividades + limpeza.oms === 0 ? (
                <p className="small">Nada da planilha antes de {dataBr(corte)} no app.</p>
              ) : (
                <div className="banner warn small stack">
                  <span>
                    Serão removidas <b>{limpeza.atividades}</b> atividade(s) da planilha ({limpeza.meses.map((m) => m.split('-').reverse().join('/')).join(', ')}) e{' '}
                    <b>{limpeza.oms}</b> OM(s) encerradas antes de {dataBr(corte)}.
                    {limpeza.doAppMantidas > 0 && ` ${limpeza.doAppMantidas} atividade(s) lançadas no app antes dessa data serão mantidas.`} Não dá para desfazer
                    (só importando o arquivo de novo).
                  </span>
                  <div className="row">
                    <button type="button" className="btn small" onClick={() => setLimpeza(null)} disabled={limpando === 'apagando'}>
                      Cancelar
                    </button>
                    <button type="button" className="btn danger small" onClick={() => void confirmarLimpeza()} disabled={limpando === 'apagando'}>
                      {limpando === 'apagando' ? 'Removendo…' : 'Remover agora'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
