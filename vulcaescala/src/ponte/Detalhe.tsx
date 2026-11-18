import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PdfBotao } from '../ui/PdfBotao';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { irPara, usePonte } from './context';
import { excluirChecklist, ouvirChecklist, ouvirFotos, type FotoItem } from './data';
import { AREA, MOTIVO_EXCLUSAO_MIN, PERGUNTA_FINAL, RESPOSTAS, criticosNC, dataBr, horaDe, type Checklist } from './model';

/** Um checklist completo (consulta e PDF para auditoria). */
export function Detalhe({ id }: { id: string }) {
  const { api, admin } = usePonte();
  const [excluindo, setExcluindo] = useState(false);
  const [c, setC] = useState<Checklist | null | undefined>(undefined);
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  useEffect(() => ouvirChecklist(api, id, setC), [api, id]);
  useEffect(() => ouvirFotos(api, id, setFotos), [api, id]);

  const topo = (
    <div className="row no-print relatorio-acoes">
      <button className="btn" onClick={() => irPara('#/')}>
        ‹ Painel
      </button>
      {c && <PdfBotao alvo={() => document.getElementById('ponte-rel')} titulo={`Checklist ponte rolante ${dataBr(c.data).replace(/\//g, '-')}`} />}
      {c && admin && !c.excluidoEm && (
        <button className="btn ghost-danger" onClick={() => setExcluindo(true)}>
          Excluir checklist
        </button>
      )}
    </div>
  );
  if (c === undefined) return <div className="container">{topo}<p className="muted">Carregando…</p></div>;
  if (!c) return <div className="container">{topo}<p className="muted">Checklist não encontrado.</p></div>;

  const grupos = [...new Set(c.itens.map((i) => i.grupo))];
  return (
    <div className="container">
      {topo}
      {excluindo && createPortal(<ExcluirDialog c={c} onClose={() => setExcluindo(false)} />, document.body)}
      <article id="ponte-rel" className="card pad stack ponte-rel">
        {c.excluidoEm && (
          <div className="ponte-excluido" role="alert">
            <b>CHECKLIST EXCLUÍDO</b> em {new Date(c.excluidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por {c.excluidoPor}
            <div>Motivo: {c.excluidoMotivo}</div>
            <div className="small">Não vale como checklist do dia; o registro fica guardado para consulta.</div>
          </div>
        )}
        <header className="stack">
          <img src="logo-benetech.png" alt="Benetech" className="ponte-rel-logo" />
          <h2>{c.modeloVersao.startsWith('FOR GTO') ? 'Check list para operação de ponte rolante' : 'Check list de pré-uso para pontes rolantes'}</h2>
          <div className="small muted">
            {c.modeloVersao.replace(' rev.', ' · Rev. ')} · Área: {AREA} · Contrato AMT
          </div>
          <div className={'ponte-resultado ' + c.resultado}>{c.resultado === 'bloqueada' ? '⛔ INTERDITADA' : '✓ LIBERADA para operar'}</div>
          {c.resultado === 'liberada' && criticosNC(c.itens, c.respostas).length > 0 && (
            <div className="small">
              ⚠ Liberada pelo operador com item crítico em N – Não conforme: {criticosNC(c.itens, c.respostas).map((i) => i.texto.split('.')[0]).join(', ')}.
            </div>
          )}
          <dl className="ponte-cab">
            <div>
              <dt>Data</dt>
              <dd>{dataBr(c.data)}</dd>
            </div>
            <div>
              <dt>Hora</dt>
              <dd>{horaDe(c.feitoEm)}</dd>
            </div>
            <div className="largo">
              <dt>Operador</dt>
              <dd>{c.nome}</dd>
            </div>
            <div>
              <dt>Matrícula</dt>
              <dd>{c.matricula}</dd>
            </div>
            <div>
              <dt>Recebido pela nuvem</dt>
              <dd>{c.recebidoEm ? c.recebidoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : 'aguardando envio do aparelho'}</dd>
            </div>
          </dl>
        </header>
        {grupos.map((g) => (
          <section key={g} className="stack">
            <h3>{g}</h3>
            <table className="ponte-itens">
              <tbody>
                {c.itens
                  .filter((i) => i.grupo === g)
                  .map((i) => {
                    const r = c.respostas[i.id];
                    const fs = fotos.filter((f) => f.itemId === i.id);
                    return (
                      <tr key={i.id} className={(r?.r === 'NC' ? 'nc' : '') + (i.bloqueia ? ' critico' : '')}>
                        <td>
                          {i.bloqueia && <span className="tag-critico">ITEM CRÍTICO</span>}
                          {i.texto}
                          {i.ajuda && <div className="small muted">{i.ajuda}</div>}
                          {r?.obs && <div className="small">Obs.: {r.obs}</div>}
                          {fs.map((f, k) => (
                            <img key={k} src={f.dataUrl} alt={`Foto do item ${i.texto}`} className="ponte-foto" />
                          ))}
                        </td>
                        <td className={'ponte-r r-' + (r?.r ?? 'vazio')}>{RESPOSTAS.find((x) => x.id === r?.r)?.nome ?? '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))}
        <p className="small muted">Legenda: S – Conforme · N – Não conforme{Object.values(c.respostas).some((r) => r.r === 'NA') ? ' · NA – Não aplicável' : ''}.</p>
        {c.apto !== null && (
          <table className="ponte-itens">
            <tbody>
              <tr className={c.apto ? '' : 'nc'}>
                <td>{PERGUNTA_FINAL}</td>
                <td className={'ponte-r ' + (c.apto ? 'r-C' : 'r-NC')}>{c.apto ? 'Sim' : 'Não — interditada'}</td>
              </tr>
            </tbody>
          </table>
        )}
        {c.observacao && (
          <p>
            {c.apto === false ? 'Relatório para a supervisão' : 'Observações'}: {c.observacao}
          </p>
        )}
        <p className="small muted">Modelo {c.modeloVersao} · registro {c.id} · assinado com o PIN pessoal do operador.</p>
      </article>
    </div>
  );
}

/** Administrador exclui o checklist (ex.: teste) informando o motivo; o registro continua guardado. */
function ExcluirDialog({ c, onClose }: { c: Checklist; onClose: () => void }) {
  const { api, email } = usePonte();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = motivo.trim().length >= MOTIVO_EXCLUSAO_MIN;
  const excluir = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await excluirChecklist(api, c.id, email, motivo.trim().slice(0, 500));
      toast('Checklist excluído (fica no histórico de exclusões)');
      onClose();
    } catch {
      toast('A nuvem recusou a exclusão. Confira a conexão, se você é administrador e se as regras do Firebase foram publicadas.', 'danger');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Excluir este checklist?"
      subtitle={`${dataBr(c.data)} às ${horaDe(c.feitoEm)} · ${c.nome} · ${c.resultado === 'bloqueada' ? 'interditada' : 'liberada'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn danger" disabled={!ok || busy} onClick={() => void excluir()}>
            {busy ? 'Excluindo…' : 'Excluir'}
          </button>
        </>
      }
    >
      <p className="small">
        Ele sai do painel, do histórico e das contagens, mas <b>não é apagado</b>: fica no histórico de exclusões (Gestão) com quem excluiu, quando e o
        motivo.
      </p>
      <label className="field">
        Motivo da exclusão (mín. {MOTIVO_EXCLUSAO_MIN} caracteres)
        <textarea className="input" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: checklist de teste do sistema" />
      </label>
    </Modal>
  );
}
