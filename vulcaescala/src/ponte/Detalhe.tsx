import { useEffect, useState } from 'react';
import { PdfBotao } from '../ui/PdfBotao';
import { irPara, usePonte } from './context';
import { ouvirChecklist, ouvirFotos, type FotoItem } from './data';
import { AREA, PERGUNTA_FINAL, RESPOSTAS, dataBr, horaDe, type Checklist } from './model';

/** Um checklist completo (consulta e PDF para auditoria). */
export function Detalhe({ id }: { id: string }) {
  const { api } = usePonte();
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
    </div>
  );
  if (c === undefined) return <div className="container">{topo}<p className="muted">Carregando…</p></div>;
  if (!c) return <div className="container">{topo}<p className="muted">Checklist não encontrado.</p></div>;

  const grupos = [...new Set(c.itens.map((i) => i.grupo))];
  return (
    <div className="container">
      {topo}
      <article id="ponte-rel" className="card pad stack ponte-rel">
        <header className="stack">
          <img src="logo-benetech.png" alt="Benetech" className="ponte-rel-logo" />
          <h2>Check list para operação de ponte rolante</h2>
          <div className="small muted">
            {c.modeloVersao.replace(' rev.', ' · Rev. ')} · Área: {AREA} · Contrato AMT
          </div>
          <div className={'ponte-resultado ' + c.resultado}>{c.resultado === 'bloqueada' ? '⛔ INTERDITADA' : '✓ LIBERADA para operar'}</div>
          <table className="ponte-cab">
            <tbody>
              <tr>
                <th>Data</th>
                <td>{dataBr(c.data)}</td>
                <th>Hora</th>
                <td>{horaDe(c.feitoEm)}</td>
              </tr>
              <tr>
                <th>Operador</th>
                <td>{c.nome}</td>
                <th>Matrícula</th>
                <td>{c.matricula}</td>
              </tr>
              <tr>
                <th>Recebido pela nuvem</th>
                <td colSpan={3}>{c.recebidoEm ? c.recebidoEm.toLocaleString('pt-BR') : 'aguardando envio do aparelho'}</td>
              </tr>
            </tbody>
          </table>
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
                      <tr key={i.id} className={r?.r === 'NC' ? 'nc' : ''}>
                        <td>
                          {i.texto}
                          {i.bloqueia && <span className="small muted"> · item crítico</span>}
                          {i.ajuda && <div className="small muted">{i.ajuda}</div>}
                          {r?.obs && <div className="small">Obs.: {r.obs}</div>}
                          {fs.map((f, k) => (
                            <img key={k} src={f.dataUrl} alt={`Foto do item ${i.texto}`} className="ponte-foto" />
                          ))}
                        </td>
                        <td className="ponte-r">{RESPOSTAS.find((x) => x.id === r?.r)?.nome ?? '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        ))}
        <p className="small muted">Legenda: S – Atende ao item · N – Não atende ao item · NA – Não aplicável.</p>
        {c.apto !== null && (
          <table className="ponte-itens">
            <tbody>
              <tr className={c.apto ? '' : 'nc'}>
                <td>{PERGUNTA_FINAL}</td>
                <td className="ponte-r">{c.apto ? 'Sim' : 'Não — interditada'}</td>
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
