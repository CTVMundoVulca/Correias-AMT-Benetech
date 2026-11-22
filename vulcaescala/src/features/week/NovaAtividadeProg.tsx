import { useEffect, useMemo, useState } from 'react';
import { useAtrasosApi, type AtrasosApi } from '../atrasos/AtrasosCtx';
import { useStore } from '../../state/store';
import { useToast } from '../../ui/Toast';
import { newId } from '../../domain/ids';
import type { DayRef } from '../../state/reducer';
import { Ctx as ProgCtx, useOms, type ProgCtx as ProgCtxTipo } from '../../prog/context';
import { AtividadeDialog } from '../../prog/AtividadeDialog';
import { ouvirAreas, ouvirMotivosCancelamento } from '../../prog/data';
import { MOTIVOS_CANCELAMENTO, atividadeVazia, type Area, type Atividade } from '../../prog/model';
import { idNaEscala, nomeNaEscala } from './ProgDoDia';

/**
 * "+ Atividade" na Escala: abre o mesmo formulário da Programação (data, área, TAG, OM,
 * tipo, pessoas e classificação). A atividade é gravada na programação e entra no dia da
 * escala já ligada a ela (id "prog-…"), sem precisar revisar depois na Gestão.
 *
 * Só administradores editam a Escala, e pela regra do Firestore administrador da escala
 * também é administrador da programação: por isso o formulário vem completo.
 */
export function NovaAtividadeProg({ data, dia, onClose }: { data: string; dia: DayRef; onClose: () => void }) {
  const c = useAtrasosApi();
  if (!c) return null;
  return <Formulario c={c} data={data} dia={dia} onClose={onClose} />;
}

function Formulario({ c, data, dia, onClose }: { c: AtrasosApi; data: string; dia: DayRef; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [motivos, setMotivos] = useState<string[]>(MOTIVOS_CANCELAMENTO);
  useEffect(() => ouvirAreas(c.api, setAreas), [c.api]);
  useEffect(() => ouvirMotivosCancelamento(c.api, setMotivos), [c.api]);

  const ctx = useMemo<ProgCtxTipo>(
    () => ({
      api: c.api,
      por: c.por,
      uid: c.uid,
      pode: { programar: true, retorno: true, administrar: true },
      gestao: true,
      linkAreas: false,
      areas,
      motivosCancelamento: motivos,
      feriados: state.feriados,
      entrar: () => {},
      setPendencia: () => {},
    }),
    [c, areas, motivos, state.feriados],
  );

  const incluir = (a: Atividade) => {
    // a atividade nasce completa na programação; na escala entra ligada a ela
    if (a.data === data && a.classe !== 'cancelada') return dispatch({ type: 'activity/add', ...dia, id: idNaEscala(a), nome: nomeNaEscala(a) });
    if (a.classe === 'cancelada') return toast('Atividade cancelada: ela não entra na escala.', 'warn');
    toast(`Programada para ${a.data.split('-').reverse().join('/')}: inclua a atividade naquele dia.`);
  };

  return (
    <ProgCtx.Provider value={ctx}>
      <Dialogo data={data} por={c.por} onSalvo={incluir} onClose={onClose} />
    </ProgCtx.Provider>
  );
}

function Dialogo({ data, por, onSalvo, onClose }: { data: string; por: string; onSalvo: (a: Atividade) => void; onClose: () => void }) {
  // dentro do contexto: lê as OMs já cadastradas (para não sobrescrever retorno/baixa)
  const oms = useOms();
  const nova = useMemo(() => atividadeVazia(newId(), data, por), [data, por]);
  return <AtividadeDialog atual={nova} nova oms={oms} onSalvo={onSalvo} onClose={onClose} />;
}
