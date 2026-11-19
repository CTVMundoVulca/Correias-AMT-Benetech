import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { duracaoMin, fmtDuracao, type Atraso } from '../cloud/atrasos';
import { AtrasoDialog } from '../features/atrasos/AtrasosAtividade';
import { AtrasosProvider } from '../features/atrasos/AtrasosCtx';
import { useProg } from './context';
import { dataBr } from './Solicitar';
import { diaIdDe, idEscalaDaAtividade, novoAtrasoDaAtividade, semanaDe } from './atrasosProg';
import { fmtHH, type Atividade } from './model';

/** Atrasos de uma atividade da programação (os registrados na escala e os lançados pela gestão). */
export const atrasosDaAtividade = (a: Atividade, atrasos: Atraso[]) => atrasos.filter((x) => x.atividadeId === idEscalaDaAtividade(a) && x.diaId === diaIdDe(a.data));

/**
 * Atrasos de uma OM, dia a dia. A equipe registra no app da Escala; aqui a gestão confere e
 * lança o que faltou (vai para o mesmo registro: aparece também na Escala).
 */
export function AtrasosOmDialog({
  om,
  atividades,
  atrasos,
  pessoasDe,
  onClose,
}: {
  om: string;
  atividades: Atividade[];
  atrasos: Atraso[];
  /** pessoas na atividade (escala; sem escala, as da programação) */
  pessoasDe: (a: Atividade) => number;
  onClose: () => void;
}) {
  const { api, uid, por, pode } = useProg();
  const [editando, setEditando] = useState<{ a: Atividade; atraso: Atraso | null } | null>(null);
  const dias = [...atividades].filter((a) => a.classe !== 'cancelada').sort((x, y) => x.data.localeCompare(y.data));
  let totMin = 0;
  let totHH = 0;
  for (const a of dias)
    for (const x of atrasosDaAtividade(a, atrasos)) {
      const d = duracaoMin(x.inicio, x.fim);
      if (d === null) continue;
      totMin += d;
      totHH += (d / 60) * pessoasDe(a);
    }
  const ctx = { api, uid, isAdmin: pode.programar, por: por || 'gestão' };
  return (
    <AtrasosProvider value={ctx}>
      <Modal
        title={`Atrasos — OM ${om}`}
        subtitle={`${dias[0]?.equipamento ?? ''} · ${totMin ? `${fmtDuracao(totMin)} de equipamento parado · ${fmtHH(totHH)}` : 'nenhum atraso registrado'}`}
        onClose={onClose}
        footer={
          <button className="btn primary" type="button" onClick={onClose}>
            Fechar
          </button>
        }
      >
        <p className="small muted">
          Os atrasos que a equipe registra na Escala aparecem aqui. Se alguém esqueceu, registre no dia certo: o atraso vai também para a Escala. HH = horas paradas × pessoas
          na atividade.
        </p>
        {dias.length === 0 && <p className="muted small">Nenhuma atividade desta OM (só canceladas).</p>}
        <ul className="plain-list stack atrasos-om">
          {dias.map((a) => {
            const l = atrasosDaAtividade(a, atrasos);
            const p = pessoasDe(a);
            return (
              <li key={a.id} className="atrasos-om-dia">
                <div className="row between">
                  <b>
                    {dataBr(a.data)} <span className="small muted">· {p} pessoa{p === 1 ? '' : 's'}</span>
                  </b>
                  <button className="btn small" type="button" onClick={() => setEditando({ a, atraso: null })}>
                    ⏱ Registrar atraso
                  </button>
                </div>
                {l.length === 0 ? (
                  <p className="small muted">Sem atraso registrado.</p>
                ) : (
                  <ul className="plain-list atraso-list">
                    {l.map((x) => {
                      const d = duracaoMin(x.inicio, x.fim);
                      return (
                        <li key={x.id}>
                          <button className="atraso-item" type="button" onClick={() => setEditando({ a, atraso: x })}>
                            <span className="atraso-hora tabnum">
                              ⏱ {x.inicio}–{x.fim || '…'}
                            </span>
                            <b>{x.motivo}</b>
                            <span className={'atraso-dur tabnum' + (d === null ? ' andamento' : '')}>
                              {d === null ? 'em andamento' : `${fmtDuracao(d)} · ${fmtHH((d / 60) * p)}`}
                            </span>
                            {x.descricao && <span className="atraso-desc small muted">{x.descricao}</span>}
                            <span className="atraso-desc small muted">registrado por {x.por || 'anônimo'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
      {editando && (
        <AtrasoDialog
          atual={editando.atraso}
          base={(() => {
            const n = novoAtrasoDaAtividade(editando.a, uid, por);
            return { weekKey: semanaDe(editando.a.data), diaId: n.diaId, atividadeId: n.atividadeId, atividadeNome: n.atividadeNome };
          })()}
          onClose={() => setEditando(null)}
        />
      )}
    </AtrasosProvider>
  );
}
