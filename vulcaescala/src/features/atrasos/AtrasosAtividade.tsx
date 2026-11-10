import { useState, type FormEvent } from 'react';
import { newId } from '../../domain/ids';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';
import {
  agoraHHMM,
  DESCRICAO_MAX,
  duracaoMin,
  excluirAtraso,
  fmtDuracao,
  horaValida,
  MOTIVO_MAX,
  normMotivo,
  salvarAtraso,
  salvarMotivos,
  type Atraso,
} from '../../cloud/atrasos';
import { podeAlterar, useAtrasosApi, useAtrasosDaAtividade, useMotivos } from './AtrasosCtx';

interface Props {
  weekKey: string;
  dayIndex: number;
  atividadeId: string;
  atividadeNome: string;
}

/** Atrasos de uma atividade: lista + "Registrar atraso". Qualquer pessoa com o link registra. */
export function AtrasosAtividade({ weekKey, dayIndex, atividadeId, atividadeNome }: Props) {
  const c = useAtrasosApi();
  const diaId = `${weekKey}_${dayIndex}`;
  const lista = useAtrasosDaAtividade(diaId, atividadeId);
  const [editando, setEditando] = useState<Atraso | 'novo' | null>(null);
  if (!c) return null; // modo local (sem nuvem): sem registro de atrasos

  return (
    <div className="atrasos">
      {lista.length > 0 && (
        <ul className="plain-list atraso-list">
          {lista.map((a) => {
            const d = duracaoMin(a.inicio, a.fim);
            return (
              <li key={a.id}>
                <button className="atraso-item" onClick={() => setEditando(a)} aria-label={`Atraso ${a.motivo} ${a.inicio}${a.fim ? ` a ${a.fim}` : ''}`}>
                  <span className="atraso-hora tabnum">
                    ⏱ {a.inicio}–{a.fim || '…'}
                  </span>
                  <b>{a.motivo}</b>
                  <span className={'atraso-dur tabnum' + (d === null ? ' andamento' : '')}>{d === null ? 'em andamento' : fmtDuracao(d)}</span>
                  {a.descricao && <span className="atraso-desc small muted">{a.descricao}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn small atraso-add" onClick={() => setEditando('novo')}>
        ⏱ Registrar atraso
      </button>
      {editando && (
        <AtrasoDialog
          atual={editando === 'novo' ? null : editando}
          base={{ weekKey, diaId, atividadeId, atividadeNome }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function AtrasoDialog({
  atual,
  base,
  onClose,
}: {
  atual: Atraso | null;
  base: { weekKey: string; diaId: string; atividadeId: string; atividadeNome: string };
  onClose: () => void;
}) {
  const c = useAtrasosApi()!;
  const toast = useToast();
  const confirm = useConfirm();
  const motivos = useMotivos();
  const pode = !atual || podeAlterar(c, atual);
  const [inicio, setInicio] = useState(atual?.inicio ?? '');
  const [fim, setFim] = useState(atual?.fim ?? '');
  const [motivo, setMotivo] = useState(atual?.motivo ?? '');
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [novoMotivo, setNovoMotivo] = useState('');
  const [criando, setCriando] = useState(false);

  // toque no campo vazio: entra o horário atual (dá para ajustar depois)
  const agoraSeVazio = (v: string, set: (s: string) => void) => () => {
    if (pode && !v) set(agoraHHMM());
  };

  const opcoes = motivo && !motivos.includes(motivo) ? [...motivos, motivo] : motivos;

  const adicionarMotivo = async (e: FormEvent) => {
    e.preventDefault();
    const m = normMotivo(novoMotivo);
    if (!m) return;
    const existe = motivos.find((x) => x.toLowerCase() === m.toLowerCase());
    if (!existe) {
      try {
        await salvarMotivos(c.api, [...motivos, m]);
      } catch {
        return toast('Não foi possível salvar o motivo.', 'danger');
      }
    }
    setMotivo(existe ?? m);
    setNovoMotivo('');
    setCriando(false);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!horaValida(inicio)) return toast('Informe o horário de início.', 'warn');
    if (fim && !horaValida(fim)) return toast('Horário de fim inválido.', 'warn');
    if (!motivo) return toast('Escolha o motivo do atraso.', 'warn');
    const agora = new Date().toISOString();
    const a: Atraso = {
      id: atual?.id ?? newId(),
      semana: base.weekKey,
      diaId: base.diaId,
      atividadeId: base.atividadeId,
      atividadeNome: atual?.atividadeNome ?? base.atividadeNome,
      inicio,
      fim,
      motivo,
      descricao: descricao.trim().slice(0, DESCRICAO_MAX),
      criadoUid: atual?.criadoUid ?? c.uid,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
      por: c.por,
    };
    // sem internet o Firestore guarda no aparelho e envia depois
    salvarAtraso(c.api, a).catch(() => toast('A nuvem recusou o registro do atraso.', 'danger'));
    toast(atual ? 'Atraso atualizado' : 'Atraso registrado');
    onClose();
  };

  const excluir = async () => {
    if (!atual) return;
    const ok = await confirm({
      title: 'Excluir este atraso?',
      message: (
        <p>
          {atual.motivo} · {atual.inicio}–{atual.fim || '…'}
        </p>
      ),
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    excluirAtraso(c.api, atual.id).catch(() => toast('Não foi possível excluir.', 'danger'));
    toast('Atraso excluído');
    onClose();
  };

  const d = duracaoMin(inicio, fim);
  return (
    <Modal
      title={atual ? 'Atraso' : 'Registrar atraso'}
      subtitle={base.atividadeNome}
      onClose={onClose}
      footer={
        pode ? (
          <>
            {atual && (
              <button className="btn ghost-danger" type="button" onClick={() => void excluir()}>
                Excluir
              </button>
            )}
            <button className="btn" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" form="form-atraso">
              Salvar
            </button>
          </>
        ) : (
          <button className="btn primary" type="button" onClick={onClose}>
            Fechar
          </button>
        )
      }
    >
      <form id="form-atraso" className="stack" onSubmit={(e) => void salvar(e)}>
        {!pode && <p className="small muted">Só quem registrou este atraso (no mesmo aparelho) ou um administrador pode alterar.</p>}
        <div className="g2-atraso">
          <label className="field">
            Início
            <input
              className="input"
              type="time"
              value={inicio}
              disabled={!pode}
              onFocus={agoraSeVazio(inicio, setInicio)}
              onClick={agoraSeVazio(inicio, setInicio)}
              onChange={(e) => setInicio(e.target.value)}
              aria-label="Horário de início do atraso"
            />
          </label>
          <label className="field">
            Fim
            <input
              className="input"
              type="time"
              value={fim}
              disabled={!pode}
              onFocus={agoraSeVazio(fim, setFim)}
              onClick={agoraSeVazio(fim, setFim)}
              onChange={(e) => setFim(e.target.value)}
              aria-label="Horário de fim do atraso"
            />
          </label>
        </div>
        <p className="small muted">
          {d !== null ? (
            <>
              Duração: <b>{fmtDuracao(d)}</b>
            </>
          ) : (
            'Toque no campo para preencher com o horário atual. O fim pode ficar em branco e ser preenchido quando o atraso acabar.'
          )}
        </p>

        <span className="field">Motivo</span>
        <div className="opts" role="radiogroup" aria-label="Motivo do atraso">
          {opcoes.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={motivo === m} className={'opt' + (motivo === m ? ' on' : '')} disabled={!pode} onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
          {pode && !criando && (
            <button type="button" className="opt" onClick={() => setCriando(true)}>
              + Novo motivo
            </button>
          )}
        </div>
        {criando && (
          <div className="row nowrap">
            <input
              className="input grow"
              value={novoMotivo}
              maxLength={MOTIVO_MAX}
              autoFocus
              placeholder="Novo motivo"
              aria-label="Novo motivo de atraso"
              onChange={(e) => setNovoMotivo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void adicionarMotivo(e)}
            />
            <button className="btn primary" type="button" disabled={!novoMotivo.trim()} onClick={(e) => void adicionarMotivo(e)}>
              Adicionar
            </button>
          </div>
        )}

        <label className="field">
          Descrição (opcional)
          <textarea
            className="input"
            rows={3}
            maxLength={DESCRICAO_MAX}
            value={descricao}
            disabled={!pode}
            placeholder="Detalhes do atraso, se quiser"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        {atual && (
          <p className="small muted">
            Registrado {atual.por && atual.por !== 'anônimo' ? `por ${atual.por}` : 'sem login'} em {new Date(atual.criadoEm).toLocaleString('pt-BR')}
          </p>
        )}
      </form>
    </Modal>
  );
}
