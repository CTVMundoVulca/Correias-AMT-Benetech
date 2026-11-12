import { useState, type FormEvent } from 'react';
import { newId } from '../domain/ids';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useParadas, useProg } from './context';
import { excluirParada, gravarParada } from './data';
import { dataBr } from './Solicitar';
import { corDaArea } from './Painel';
import { DESCRICAO_MAX, EQUIP_MAX, TIPOS_PARADA, hojeIso, limparTexto, maiusculas, type Parada } from './model';

/** Calendário de paradas: todos consultam; administradores lançam. */
export function Paradas() {
  const { isAdmin, por } = useProg();
  const lista = useParadas();
  const [verPassadas, setVerPassadas] = useState(false);
  const [edicao, setEdicao] = useState<{ p: Parada; nova: boolean } | null>(null);
  const hoje = hojeIso();
  const vis = lista
    .filter((p) => (verPassadas ? p.fim < hoje : p.fim >= hoje))
    .sort((a, b) => (verPassadas ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));

  const nova = () => {
    const agora = new Date().toISOString();
    setEdicao({
      nova: true,
      p: { id: newId(), tipo: 'geral', area: '', equipamento: '', descricao: '', inicio: hoje, fim: hoje, criadoEm: agora, criadoPor: por, atualizadoEm: agora, atualizadoPor: por },
    });
  };

  return (
    <div className="stack prog">
      <section className="card pad stack">
        <div className="row between">
          <h2>Calendário de paradas</h2>
          {isAdmin && (
            <button className="btn primary small" onClick={nova}>
              + Parada
            </button>
          )}
        </div>
        <ul className="legenda-areas grande">
          {TIPOS_PARADA.map((t) => (
            <li key={t.id}>
              <span className={'sw-parada parada-' + t.id}>{t.icone}</span> {t.nome}
            </li>
          ))}
        </ul>
        <div className="segmented">
          <button className={'seg' + (!verPassadas ? ' on' : '')} onClick={() => setVerPassadas(false)}>
            Em andamento e próximas
          </button>
          <button className={'seg' + (verPassadas ? ' on' : '')} onClick={() => setVerPassadas(true)}>
            Encerradas
          </button>
        </div>
      </section>
      {vis.length === 0 ? (
        <p className="muted">{verPassadas ? 'Nenhuma parada encerrada.' : 'Nenhuma parada programada.'}</p>
      ) : (
        <ul className="plain-list stack">
          {vis.map((p) => {
            const t = TIPOS_PARADA.find((x) => x.id === p.tipo)!;
            const agora = p.inicio <= hoje && hoje <= p.fim;
            const corpo = (
              <>
                <div className="row between nowrap">
                  <b>
                    {t.icone} {t.nome}
                  </b>
                  {agora && <span className="badge today">Agora</span>}
                </div>
                <div>
                  <span className={'sw-area ' + corDaArea(p.area)} /> <b>{p.area || '—'}</b>
                  {p.equipamento && ` · ${p.equipamento}`}
                </div>
                <div className="small">{p.inicio === p.fim ? dataBr(p.inicio) : `${dataBr(p.inicio)} a ${dataBr(p.fim)}`}</div>
                {p.descricao && <div className="small muted">{p.descricao}</div>}
              </>
            );
            return (
              <li key={p.id} className={'card parada-item parada-' + p.tipo}>
                {isAdmin ? (
                  <button className="ativ-btn pad" onClick={() => setEdicao({ p, nova: false })}>
                    {corpo}
                  </button>
                ) : (
                  <div className="pad">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edicao && <ParadaDialog atual={edicao.p} nova={edicao.nova} onClose={() => setEdicao(null)} />}
    </div>
  );
}

function ParadaDialog({ atual, nova, onClose }: { atual: Parada; nova: boolean; onClose: () => void }) {
  const { api, por, areas } = useProg();
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState(atual);
  const set = <K extends keyof Parada>(k: K, v: Parada[K]) => setP((x) => ({ ...x, [k]: v }));

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    const x: Parada = { ...p, area: limparTexto(p.area, 60), equipamento: maiusculas(p.equipamento, EQUIP_MAX), descricao: limparTexto(p.descricao, DESCRICAO_MAX) };
    if (!x.area) return toast('Escolha a área.', 'warn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)) return toast('Informe o início.', 'warn');
    if (!x.fim || x.fim < x.inicio) x.fim = x.inicio;
    gravarParada(api, x, por, nova ? undefined : atual.inicio.slice(0, 4)).catch(() => toast('A nuvem recusou a parada.', 'danger'));
    toast(nova ? 'Parada lançada' : 'Parada atualizada');
    onClose();
  };
  const excluir = async () => {
    if (!(await confirm({ title: 'Excluir esta parada?', message: <p>{atual.area}</p>, confirmLabel: 'Excluir', danger: true }))) return;
    excluirParada(api, atual, por).catch(() => toast('Não foi possível excluir.', 'danger'));
    toast('Parada excluída');
    onClose();
  };

  return (
    <Modal
      title={nova ? 'Lançar parada' : 'Parada'}
      onClose={onClose}
      footer={
        <>
          {!nova && (
            <button className="btn ghost-danger" type="button" onClick={() => void excluir()}>
              Excluir
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" form="form-parada">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-parada" className="stack" onSubmit={salvar}>
        <span className="field">Tipo</span>
        <div className="segmented" role="radiogroup" aria-label="Tipo de parada">
          {TIPOS_PARADA.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={p.tipo === t.id} className={'seg' + (p.tipo === t.id ? ' on' : '')} onClick={() => set('tipo', t.id)}>
              {t.icone} {t.nome}
            </button>
          ))}
        </div>
        <label className="field">
          Área
          <select className="input" value={p.area} onChange={(e) => set('area', e.target.value)}>
            <option value="">Escolha…</option>
            {areas.map((a) => (
              <option key={a.nome}>{a.nome}</option>
            ))}
            {p.area && !areas.some((a) => a.nome === p.area) && <option>{p.area}</option>}
          </select>
        </label>
        <label className="field">
          Equipamento (opcional)
          <input className="input" value={p.equipamento} maxLength={EQUIP_MAX} onChange={(e) => set('equipamento', e.target.value)} />
        </label>
        <div className="two-cols">
          <label className="field">
            Início
            <input className="input" type="date" value={p.inicio} onChange={(e) => set('inicio', e.target.value)} />
          </label>
          <label className="field">
            Fim
            <input className="input" type="date" value={p.fim} min={p.inicio} onChange={(e) => set('fim', e.target.value)} />
          </label>
        </div>
        <label className="field">
          Observação (opcional)
          <textarea className="input" rows={2} maxLength={DESCRICAO_MAX} value={p.descricao} onChange={(e) => set('descricao', e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
