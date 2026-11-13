import { useState } from 'react';
import { newId } from '../domain/ids';
import { addDays, fromIsoDate, toIsoDate } from '../domain/isoWeek';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { gravarAtividade } from './data';
import { rotuloDia } from './Painel';
import { AREA_INTERNA, MOTIVOS_NAO_EXECUCAO, classificar, type Atividade, type Execucao } from './model';

/**
 * Apontamento do dia (programação): cada atividade programada foi executada, não executada
 * (com motivo) ou reprogramada (vai para outro dia e conta a reprogramação). É a base da
 * ADERÊNCIA À PROGRAMAÇÃO.
 */
export function ApontarDialog({ data, atividades, onClose }: { data: string; atividades: Atividade[]; onClose: () => void }) {
  const { api, por, feriados } = useProg();
  const toast = useToast();
  const lista = atividades.filter((a) => a.classe !== 'cancelada');
  const [aberta, setAberta] = useState<{ id: string; tipo: 'nao' | 'reprog' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [novaData, setNovaData] = useState(() => toIsoDate(addDays(fromIsoDate(data)!, 1)));

  const marcar = (a: Atividade, execucao: Execucao, execMotivo = '') => {
    const agora = new Date().toISOString();
    gravarAtividade(api, { ...a, execucao, execMotivo, execEm: execucao ? agora : '', execPor: execucao ? por : '' }, por).catch(() =>
      toast('A nuvem recusou o apontamento.', 'danger'),
    );
  };
  const reprogramar = (a: Atividade) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData) || novaData === a.data) return toast('Escolha o novo dia.', 'warn');
    if (!motivo) return toast('Escolha o motivo da reprogramação.', 'warn');
    marcar(a, 'reprogramada', motivo);
    // nova atividade no novo dia: mesma comunicação; a classificação segue a regra para o novo dia
    const auto = a.comunicadoEm ? classificar(novaData, new Date(a.comunicadoEm), feriados) : null;
    const agora = new Date().toISOString();
    gravarAtividade(
      api,
      {
        ...a,
        id: newId(),
        data: novaData,
        classe: a.classeManual || !auto ? a.classe : auto.classe,
        execucao: '',
        execMotivo: '',
        execEm: '',
        execPor: '',
        dataOriginal: a.dataOriginal || a.data,
        reprogramacoes: a.reprogramacoes + 1,
        solicitacaoId: '',
        ordem: Date.now(),
        criadoEm: agora,
        criadoPor: por,
      },
      por,
    ).catch(() => toast('A nuvem recusou a reprogramação.', 'danger'));
    toast(`Reprogramada para ${novaData.split('-').reverse().join('/')}`);
    setAberta(null);
    setMotivo('');
  };

  const feitas = lista.filter((a) => a.execucao).length;
  return (
    <Modal
      title="Apontar execução"
      subtitle={`${rotuloDia(data)} · ${feitas} de ${lista.length} apontadas`}
      onClose={onClose}
      footer={
        <>
          {lista.some((a) => !a.execucao) && (
            <button
              className="btn"
              onClick={() => {
                lista.filter((a) => !a.execucao).forEach((a) => marcar(a, 'executada'));
                toast('Restantes marcadas como executadas');
              }}
            >
              ✓ Restantes executadas
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            Concluir
          </button>
        </>
      }
    >
      {lista.length === 0 ? (
        <p className="muted">Nenhuma atividade programada neste dia.</p>
      ) : (
        <ul className="plain-list apontar-lista">
          {lista.map((a) => (
            <li key={a.id} className={'apontar ' + (a.execucao || 'pendente')}>
              <div className="small ativ-area">{a.area || AREA_INTERNA}</div>
              <div>
                <b>{a.equipamento || '—'}</b> {a.descricao}
              </div>
              {a.execucao && (
                <div className="small">
                  {a.execucao === 'executada' ? '✓ Executada' : a.execucao === 'nao_executada' ? '✕ Não executada' : '↷ Reprogramada'}
                  {a.execMotivo && ` — ${a.execMotivo}`}
                </div>
              )}
              <div className="row">
                <button className={'btn small' + (a.execucao === 'executada' ? ' primary' : '')} onClick={() => marcar(a, a.execucao === 'executada' ? '' : 'executada')}>
                  ✓ Executada
                </button>
                <button className="btn small" onClick={() => (setAberta({ id: a.id, tipo: 'nao' }), setMotivo(''))}>
                  ✕ Não executada
                </button>
                <button className="btn small" onClick={() => (setAberta({ id: a.id, tipo: 'reprog' }), setMotivo(''))}>
                  ↷ Reprogramar
                </button>
              </div>
              {aberta?.id === a.id && (
                <div className="stack apontar-motivo">
                  <span className="field">Motivo</span>
                  <div className="opts">
                    {MOTIVOS_NAO_EXECUCAO.map((m) => (
                      <button key={m} type="button" className={'opt' + (motivo === m ? ' on' : '')} onClick={() => setMotivo(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {aberta.tipo === 'reprog' && (
                    <label className="field">
                      Novo dia
                      <input className="input" type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                    </label>
                  )}
                  <div className="row">
                    <button className="btn small" onClick={() => setAberta(null)}>
                      Voltar
                    </button>
                    <button
                      className="btn small primary"
                      disabled={!motivo}
                      onClick={() => {
                        if (aberta.tipo === 'reprog') return reprogramar(a);
                        marcar(a, 'nao_executada', motivo);
                        setAberta(null);
                      }}
                    >
                      {aberta.tipo === 'reprog' ? 'Reprogramar' : 'Registrar'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
