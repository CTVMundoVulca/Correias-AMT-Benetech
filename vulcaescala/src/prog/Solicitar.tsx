import { useEffect, useState, type FormEvent } from 'react';
import { newId } from '../domain/ids';
import { addDays, formatDate, fromIsoDate, toIsoDate } from '../domain/isoWeek';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useProg } from './context';
import { CampoArea } from './CampoArea';
import { gravarSolicitacao, ouvirSolicitacoes } from './data';
import {
  AREA_MAX,
  CONTATO_MAX,
  DESCRICAO_SOLIC_MAX,
  EQUIP_MAX,
  SOLICITANTE_MAX,
  URGENCIAS,
  hojeIso,
  limparOm,
  limparTexto,
  maiusculas,
  omPadrao,
  type Solicitacao,
  type StatusSolicitacao,
  formatarTelefone,
  telefoneValido,
} from './model';

const LEMBRAR = 'prog:solicitante';
const STATUS: Record<StatusSolicitacao, { nome: string; cls: string }> = {
  aberta: { nome: 'Aguardando programação', cls: 'pend' },
  programada: { nome: 'Programada', cls: 'ok' },
  recusada: { nome: 'Recusada', cls: 'danger' },
  cancelada: { nome: 'Cancelada', cls: 'neutral' },
};

/** Nome, contato e área de quem pede (lembrados no aparelho). */
export function lembrarSolicitante(): { solicitante: string; contato: string; area: string } {
  try {
    const v = JSON.parse(localStorage.getItem(LEMBRAR) ?? '{}');
    return { solicitante: String(v.solicitante ?? ''), contato: String(v.contato ?? ''), area: String(v.area ?? '') };
  } catch {
    return { solicitante: '', contato: '', area: '' };
  }
}

export function guardarSolicitante(solicitante: string, contato: string, area: string) {
  try {
    localStorage.setItem(LEMBRAR, JSON.stringify({ solicitante, contato, area }));
  } catch {
    /* sem armazenamento */
  }
}

export const dataBr = (iso: string) => (fromIsoDate(iso) ? formatDate(fromIsoDate(iso)!) : iso);

/** Pedido de serviço feito pela área (qualquer pessoa com o link). */
export function Solicitar() {
  const { api, uid } = useProg();
  const toast = useToast();
  const confirm = useConfirm();
  const salvo = lembrarSolicitante();
  const [area, setArea] = useState(salvo.area);
  const [equipamento, setEquipamento] = useState('');
  const [om, setOm] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState<Solicitacao['urgencia']>('normal');
  const [dataDesejada, setDataDesejada] = useState(() => toIsoDate(addDays(fromIsoDate(hojeIso())!, 7)));
  const [estPessoas, setEstPessoas] = useState('');
  const [estDias, setEstDias] = useState('');
  const [solicitante, setSolicitante] = useState(salvo.solicitante);
  const [contato, setContato] = useState(() => (telefoneValido(salvo.contato) ? formatarTelefone(salvo.contato) : ''));
  const [lista, setLista] = useState<Solicitacao[] | null>(null);
  const [filtro, setFiltro] = useState<'minhas' | 'todas'>('minhas');

  useEffect(() => {
    const desde = toIsoDate(addDays(fromIsoDate(hojeIso())!, -60));
    return ouvirSolicitacoes(api, (l) => setLista(l), desde, () => setLista([]));
  }, [api]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const s: Solicitacao = {
      id: newId(),
      area: limparTexto(area, AREA_MAX),
      equipamento: maiusculas(equipamento, EQUIP_MAX),
      om: limparOm(om),
      descricao: maiusculas(descricao, DESCRICAO_SOLIC_MAX),
      urgencia,
      dataDesejada,
      estimativa: Math.max(0, Math.min(500, (Number(estPessoas) || 0) * (Number(estDias) || 0))),
      solicitante: limparTexto(solicitante, SOLICITANTE_MAX),
      contato: limparTexto(contato, CONTATO_MAX),
      criadoUid: uid,
      criadoEm: new Date().toISOString(),
      status: 'aberta',
      resposta: '',
      atividadeId: '',
      dataProgramada: '',
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: 'anônimo',
    };
    // campos obrigatórios, na ordem do formulário (leva o cursor ao primeiro que falta)
    const falta = (id: string, msg: string) => {
      document.getElementById(id)?.focus();
      toast(msg, 'warn');
    };
    if (!s.area) return toast('Escolha a área.', 'warn');
    if (!s.equipamento) return falta('sol-equip', 'Informe o equipamento / TAG.');
    if (s.om && s.om.length < 6) return falta('sol-om', 'Número da OM incompleto.');
    if (!s.descricao) return falta('sol-desc', 'Descreva o serviço.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.dataDesejada)) return falta('sol-data', 'Informe a data desejada.');
    if (!s.solicitante) return falta('sol-nome', 'Informe seu nome.');
    if (!telefoneValido(s.contato)) return falta('sol-tel', 'Informe o telefone de contato com DDD, ex.: (27) 99999-0000.');
    guardarSolicitante(s.solicitante, s.contato, s.area);
    gravarSolicitacao(api, s).catch(() => toast('A nuvem recusou a solicitação. Confira os campos.', 'danger'));
    toast('Solicitação enviada à programação');
    setEquipamento('');
    setOm('');
    setDescricao('');
    setUrgencia('normal');
    setEstPessoas('');
    setEstDias('');
    setFiltro('minhas');
  };

  const cancelar = async (s: Solicitacao) => {
    const ok = await confirm({ title: 'Cancelar esta solicitação?', message: <p>{s.descricao}</p>, confirmLabel: 'Cancelar solicitação', danger: true });
    if (!ok) return;
    gravarSolicitacao(api, { ...s, status: 'cancelada', atualizadoEm: new Date().toISOString(), atualizadoPor: 'anônimo' }).catch(() =>
      toast('Não foi possível cancelar.', 'danger'),
    );
  };

  const omLimpa = limparOm(om);
  const visiveis = (lista ?? []).filter((s) => filtro === 'todas' || s.criadoUid === uid);

  return (
    <div className="stack prog">
      <form className="card pad stack" onSubmit={(e) => void enviar(e)}>
        <h2>Solicitar serviço à vulcanização</h2>
        <p className="small muted">
          Antes de pedir para um dia específico, veja no <a href="#/painel">Painel</a> em quais áreas o efetivo já está.
        </p>
        <CampoArea
          rotulo={
            <>
              Área solicitante <span className="obrig" aria-hidden>*</span>
            </>
          }
          value={area}
          onChange={setArea}
        />
        <div className="two-cols">
          <label className="field">
            <span>Equipamento / TAG <span className="obrig" aria-hidden>*</span></span>
            <input id="sol-equip" aria-required="true" className="input" value={equipamento} maxLength={EQUIP_MAX} placeholder="Ex.: C-3" onChange={(e) => setEquipamento(e.target.value)} />
          </label>
          <label className="field">
            Nº da OM (se houver)
            <input id="sol-om" className="input num" inputMode="numeric" value={om} placeholder="9000…" onChange={(e) => setOm(e.target.value)} />
          </label>
        </div>
        {omLimpa && !omPadrao(omLimpa) && <p className="small text-pend">A OM costuma ter 12 dígitos começando por 9 (ex.: 900033269317). Confira.</p>}
        <label className="field">
          <span>Serviço <span className="obrig" aria-hidden>*</span></span>
          <textarea
            id="sol-desc"
            aria-required="true"
            className="input"
            rows={3}
            maxLength={DESCRICAO_SOLIC_MAX}
            value={descricao}
            placeholder="Ex.: Trocar correia C-3 / reparo na emenda"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <span className="field">Urgência</span>
        <div className="segmented" role="radiogroup" aria-label="Urgência">
          {URGENCIAS.map((u) => (
            <button key={u.id} type="button" role="radio" aria-checked={urgencia === u.id} className={'seg' + (urgencia === u.id ? ' on' : '')} onClick={() => setUrgencia(u.id)}>
              {u.nome}
            </button>
          ))}
        </div>
        <p className="small muted">{URGENCIAS.find((u) => u.id === urgencia)?.dica}</p>
        <label className="field">
          <span>Data desejada <span className="obrig" aria-hidden>*</span></span>
          <input id="sol-data" aria-required="true" className="input" type="date" value={dataDesejada} onChange={(e) => setDataDesejada(e.target.value)} />
        </label>
        <span className="field">Estimativa (opcional): quantas pessoas da vulcanização e por quantos dias</span>
        <div className="two-cols">
          <label className="field">
            Pessoas
            <input className="input num" type="number" min={0} max={40} inputMode="numeric" value={estPessoas} placeholder="Ex.: 4" onChange={(e) => setEstPessoas(e.target.value)} />
          </label>
          <label className="field">
            Dias
            <input className="input num" type="number" min={0} max={30} step="0.5" inputMode="decimal" value={estDias} placeholder="Ex.: 2" onChange={(e) => setEstDias(e.target.value)} />
          </label>
        </div>
        <div className="two-cols">
          <label className="field">
            <span>Seu nome <span className="obrig" aria-hidden>*</span></span>
            <input id="sol-nome" aria-required="true" className="input" value={solicitante} maxLength={SOLICITANTE_MAX} autoComplete="name" onChange={(e) => setSolicitante(e.target.value)} />
          </label>
          <label className="field">
            <span>Telefone de contato <span className="obrig" aria-hidden>*</span></span>
            <input
              id="sol-tel"
              aria-required="true"
              className="input num"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={contato}
              maxLength={16}
              placeholder="(27) 99999-0000"
              onChange={(e) => setContato(formatarTelefone(e.target.value))}
            />
          </label>
        </div>
        <p className="small muted">
          <span className="obrig">*</span> Campos obrigatórios. As solicitações ficam visíveis para todos que usam o app (nome e contato incluídos).
        </p>
        <button className="btn primary" type="submit">
          Enviar solicitação
        </button>
      </form>

      <section className="card pad stack">
        <div className="row between">
          <h3>Solicitações (últimos 60 dias)</h3>
          <div className="segmented">
            <button className={'seg' + (filtro === 'minhas' ? ' on' : '')} onClick={() => setFiltro('minhas')}>
              Deste aparelho
            </button>
            <button className={'seg' + (filtro === 'todas' ? ' on' : '')} onClick={() => setFiltro('todas')}>
              Todas
            </button>
          </div>
        </div>
        {lista === null ? (
          <p className="muted">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="muted small">Nenhuma solicitação.</p>
        ) : (
          <ul className="plain-list solic-list">
            {visiveis.map((s) => (
              <li key={s.id} className="solic">
                <div className="row between">
                  <b>
                    {s.area}
                    {s.equipamento ? ` · ${s.equipamento}` : ''}
                  </b>
                  <span className={'badge ' + STATUS[s.status].cls}>{STATUS[s.status].nome}</span>
                </div>
                <div>{s.descricao}</div>
                <div className="small muted">
                  {s.urgencia !== 'normal' && <b className="text-danger">{URGENCIAS.find((u) => u.id === s.urgencia)?.nome} · </b>}
                  Para {dataBr(s.dataDesejada)} · {s.om && `OM ${s.om} · `}
                  {s.solicitante}
                  {s.contato && ` (${s.contato})`} · pedido em {new Date(s.criadoEm).toLocaleDateString('pt-BR')}
                </div>
                {s.status === 'programada' && s.dataProgramada && <div className="small text-ok">Programada para {dataBr(s.dataProgramada)}.</div>}
                {s.resposta && <div className="small">Resposta da programação: {s.resposta}</div>}
                {s.status === 'aberta' && s.criadoUid === uid && (
                  <button className="link small" onClick={() => void cancelar(s)}>
                    Cancelar solicitação
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
