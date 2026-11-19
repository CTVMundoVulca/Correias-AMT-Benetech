import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MotivosDialog } from './MotivosDialog';
import { newId } from '../domain/ids';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useProg } from './context';
import { TIPOS_COM_RELATORIO, TIPOS_SINALIZAVEIS } from './relEmenda';
import { CampoArea } from './CampoArea';
import { excluirAtividade, gravarAtividade, gravarOms, gravarSolicitacao, omDaAtividade } from './data';
import {
  AREA_INTERNA,
  CLASSES,
  DESCRICAO_MAX,
  EQUIP_MAX,
  HORARIO_MAX,
  MOTIVO_MAX,
  duracaoHoras,
  fmtDuracao,
  horasDosPeriodos,
  limparPeriodos,
  periodosDaMob,
  MOB_PERIODOS_MAX,
  fmtHH,
  horasValidas,
  PESSOAS_MAX,
  RECURSOS_MAX,
  TIPOS,
  classificar,
  ANTECEDENCIA_HORAS,
  limparOm,
  limparTexto,
  maiusculas,
  mesDe,
  omPadrao,
  tipoPelaDescricao,
  type Atividade,
  type Classe,
  type OmInfo,
  type Solicitacao,
} from './model';

interface Props {
  atual: Atividade;
  /** atividade ainda não gravada (nova ou vinda de uma solicitação) */
  nova: boolean;
  oms: Map<string, OmInfo> | null;
  solicitacao?: Solicitacao;
  onClose: () => void;
}

/** Lançar / editar uma atividade da programação (administradores). */
export function AtividadeDialog({ atual, nova, oms, solicitacao, onClose }: Props) {
  const { api, por, areas, feriados, motivosCancelamento, pode } = useProg();
  const [editarMotivos, setEditarMotivos] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [a, setA] = useState<Atividade>(() => ({ ...atual, area: atual.area || (nova ? '' : AREA_INTERNA) }));
  const [tipoManual, setTipoManual] = useState(!nova);
  const [copiarPara, setCopiarPara] = useState('');
  const set = <K extends keyof Atividade>(k: K, v: Atividade[K]) => setA((x) => ({ ...x, [k]: v }));

  const setDescricao = (v: string) => setA((x) => ({ ...x, descricao: v, tipo: tipoManual ? x.tipo : tipoPelaDescricao(v) }));
  const omInfo = a.om ? oms?.get(limparOm(a.om)) : undefined;
  // regra automática (fim de semana/feriado = emergência; 48 h de antecedência = programada)
  const auto = autoClasse(a.data, a.comunicadoEm, feriados);
  const efetiva: Classe = a.classeManual || a.classe === 'cancelada' || !auto ? a.classe : auto.classe;
  const escolher = (c: Classe) => setA((x) => ({ ...x, classe: c, classeManual: !auto || c !== auto.classe }));

  const montar = (base: Atividade): Atividade => ({
    ...base,
    classe: base === a ? efetiva : base.classe,
    classeManual: base === a ? efetiva !== auto?.classe : base.classeManual,
    area: base.area === AREA_INTERNA ? '' : limparTexto(base.area, 60),
    equipamento: maiusculas(base.equipamento, EQUIP_MAX),
    om: limparOm(base.om),
    descricao: maiusculas(base.descricao, DESCRICAO_MAX),
    recursos: limparTexto(base.recursos, RECURSOS_MAX),
    horario: limparTexto(base.horario, HORARIO_MAX),
    motivo: base.classe === 'cancelada' ? limparTexto(base.motivo, MOTIVO_MAX) : '',
    mobilizada: base.classe === 'cancelada' && base.mobilizada,
    // com os períodos (início e fim), as horas são a soma; sem eles, ficam as já registradas (lançamentos antigos)
    ...(() => {
      if (base.classe !== 'cancelada' || !base.mobilizada) return { horasMobilizadas: 0, mobInicio: '', mobFim: '', mobPeriodos: [] };
      const per = limparPeriodos(periodosDaMob(base));
      return {
        horasMobilizadas: horasValidas(per.length ? horasDosPeriodos(per) : base.horasMobilizadas),
        mobInicio: per[0]?.inicio ?? '',
        mobFim: per[per.length - 1]?.fim ?? '',
        mobPeriodos: per,
      };
    })(),
    pessoas: Math.max(0, Math.min(PESSOAS_MAX, Math.round(base.pessoas || 0))),
    // salvar pela programação conta como revisão da atividade lançada na escala
    revisarEscala: false,
  });

  /** grava a atividade e mantém o cadastro da OM (sem mudar a situação já registrada) */
  const gravar = (x: Atividade, mesAnterior?: string) => {
    gravarAtividade(api, x, por, mesAnterior).catch(() => toast('A nuvem recusou a gravação.', 'danger'));
    const o = omDaAtividade(x, x.om ? oms?.get(x.om) : undefined);
    if (o) gravarOms(api, [o], por).catch(() => toast('Não foi possível atualizar a OM.', 'danger'));
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!a.area) return toast(`Escolha a área (atividades da própria equipe: ${AREA_INTERNA}).`, 'warn');
    const x = montar(a);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data)) return toast('Informe a data.', 'warn');
    if (!x.descricao) return toast('Descreva a atividade.', 'warn');
    if (!x.classe) return toast('Informe quando a demanda foi comunicada ou escolha a classificação.', 'warn');
    if (x.classe === 'cancelada' && !x.motivo) return toast('Informe o motivo do cancelamento.', 'warn');
    if (x.om && x.om.length < 6) return toast('Número da OM incompleto.', 'warn');
    if (x.mobilizada && !x.om) return toast('Informe a OM em que as horas serão apropriadas.', 'warn');
    if (x.mobilizada && !x.pessoas) return toast('Informe quantas pessoas ficaram aguardando.', 'warn');
    if (x.mobilizada && x.mobPeriodos.some((p) => !p.inicio || !p.fim)) return toast('Complete o início e o fim de cada período de espera.', 'warn');
    if (x.mobilizada && !x.horasMobilizadas) return toast('Informe a hora de início e a hora do fim da espera.', 'warn');
    // mudou a data depois de programada = reprogramação (entra no KPI de estabilidade)
    const reprog = !nova && x.data !== atual.data;
    gravar(reprog ? { ...x, reprogramacoes: x.reprogramacoes + 1, dataOriginal: atual.dataOriginal || atual.data } : x, nova ? undefined : mesDe(atual.data));
    if (solicitacao && nova)
      gravarSolicitacao(api, {
        ...solicitacao,
        status: 'programada',
        atividadeId: x.id,
        dataProgramada: x.data,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: por,
      }).catch(() => toast('Não foi possível atualizar a solicitação.', 'danger'));
    toast(nova ? 'Atividade programada' : 'Atividade atualizada');
    onClose();
  };

  const copiar = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(copiarPara)) return toast('Escolha o dia.', 'warn');
    const x = montar(a);
    if (!x.descricao || !x.classe) return toast('Preencha descrição e classificação antes de copiar.', 'warn');
    const agora = new Date().toISOString();
    // continuação: mesma comunicação, classificação recalculada para o novo dia (salvo se foi trocada à mão)
    const ac = autoClasse(copiarPara, x.comunicadoEm, feriados);
    const classe = x.classeManual || x.classe === 'cancelada' || !ac ? x.classe : ac.classe;
    gravar({ ...x, classe, id: newId(), data: copiarPara, solicitacaoId: '', origem: 'app', ordem: Date.now(), criadoEm: agora, criadoPor: por });
    toast('Atividade copiada');
    setCopiarPara('');
  };

  const excluir = async () => {
    const ok = await confirm({
      title: 'Excluir esta atividade?',
      message: (
        <p>
          {atual.descricao}
          <br />
          <span className="small muted">Para manter o histórico do dashboard, prefira marcar como “Cancelada”.</span>
        </p>
      ),
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    excluirAtividade(api, atual, por).catch(() => toast('Não foi possível excluir.', 'danger'));
    toast('Atividade excluída');
    onClose();
  };

  const opcoesArea = [...areas.map((x) => x.nome), AREA_INTERNA];

  return (
    <Modal
      title={nova ? 'Programar atividade' : 'Atividade'}
      subtitle={solicitacao ? `Solicitação de ${solicitacao.solicitante} (${solicitacao.area})` : undefined}
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
          <button className="btn primary" type="submit" form="form-ativ">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-ativ" className="stack" onSubmit={(e) => void salvar(e)}>
        {a.revisarEscala && (
          <p className="banner warn small">
            📝 <b>Lançada direto na Escala</b> por {a.criadoPor || 'um administrador'}. Confira a área, a TAG, a OM e o tipo; ao salvar, ela deixa de
            aparecer como “a revisar”.
          </p>
        )}
        {a.foraDaEscala && (
          <p className="banner warn small">⚠ Esta atividade foi <b>removida da escala</b>. Se não vai mais acontecer, cancele (classificação “Cancelada”).</p>
        )}
        <div className="two-cols">
          <label className="field">
            Data
            <input className="input" type="date" value={a.data} onChange={(e) => set('data', e.target.value)} />
          </label>
          <CampoArea value={a.area} onChange={(v) => set('area', v)} opcoes={opcoesArea} />
        </div>
        <div className="two-cols">
          <label className="field">
            Equipamento / TAG
            <input className="input" value={a.equipamento} maxLength={EQUIP_MAX} onChange={(e) => set('equipamento', e.target.value)} />
          </label>
          <label className="field">
            Nº da OM
            <input className="input num" inputMode="numeric" value={a.om} onChange={(e) => set('om', limparOm(e.target.value))} />
          </label>
        </div>
        {a.om && !omPadrao(a.om) && <p className="small text-pend">A OM costuma ter 12 dígitos começando por 9. Confira.</p>}
        {omInfo && (
          <p className="small muted">
            OM já programada de {omInfo.primeiraData.split('-').reverse().join('/')} a {omInfo.ultimaData.split('-').reverse().join('/')} ·{' '}
            {omInfo.situacao === 'baixada' ? '✓ baixada' : omInfo.situacao === 'retornada' ? 'aguardando baixa' : 'aguardando retorno'}
          </p>
        )}
        <label className="field">
          Descrição
          <textarea className="input" rows={2} maxLength={DESCRICAO_MAX} value={a.descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <label className="field">
          Tipo de serviço
          <select
            className="input"
            value={a.tipo}
            onChange={(e) => {
              setTipoManual(true);
              set('tipo', e.target.value);
            }}
          >
            {TIPOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
            {!TIPOS.includes(a.tipo as (typeof TIPOS)[number]) && <option>{a.tipo}</option>}
          </select>
        </label>
        {TIPOS_COM_RELATORIO.includes(a.tipo) ? (
          <p className="small muted">📝 Este tipo exige relatório de emenda (controle na Gestão).</p>
        ) : (
          <label className="check">
            <input type="checkbox" checked={a.relExige} onChange={(e) => set('relExige', e.target.checked)} />
            📝 {TIPOS_SINALIZAVEIS.includes(a.tipo) ? 'Esta preparação' : 'Esta atividade'} exige relatório de emenda
          </label>
        )}
        <div className="two-cols">
          <label className="field">
            Pessoas
            <input
              className="input num"
              type="number"
              min={0}
              max={PESSOAS_MAX}
              inputMode="numeric"
              value={a.pessoas || ''}
              onChange={(e) => set('pessoas', Number(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            Equipe
            <select className="input" value={a.equipe} onChange={(e) => set('equipe', e.target.value as Atividade['equipe'])}>
              <option value="dia">Horário administrativo</option>
              <option value="turno">Turno</option>
            </select>
          </label>
        </div>
        <label className="field">
          Horário combinado (opcional)
          <input className="input" value={a.horario} maxLength={HORARIO_MAX} placeholder="Ex.: 13h - 15h" onChange={(e) => set('horario', e.target.value)} />
        </label>
        <label className="field">
          Recursos (opcional)
          <input
            className="input"
            value={a.recursos}
            maxLength={RECURSOS_MAX}
            placeholder="Ex.: Caminhão munck, GH70T, gerador 220V"
            onChange={(e) => set('recursos', e.target.value)}
          />
        </label>

        <label className="field">
          Demanda comunicada em
          <input
            className="input"
            type="datetime-local"
            value={paraLocal(a.comunicadoEm)}
            onChange={(e) => set('comunicadoEm', deLocal(e.target.value))}
          />
        </label>
        <span className="field">Classificação</span>
        <div className="segmented" role="radiogroup" aria-label="Classificação">
          {CLASSES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={efetiva === c.id}
              className={'seg' + (efetiva === c.id ? ' on' : '')}
              onClick={() => escolher(c.id as Classe)}
            >
              {c.nome}
            </button>
          ))}
        </div>
        {auto ? (
          <p className="small muted">
            Regra: <b>{CLASSES.find((c) => c.id === auto.classe)?.nome}</b> — {auto.motivo}.
            {efetiva !== auto.classe && efetiva !== 'cancelada' && (
              <>
                {' '}
                <b className="text-pend">Alterada à mão.</b>{' '}
                <button type="button" className="link small" onClick={() => escolher(auto.classe)}>
                  Voltar à regra
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="small muted">Sem a data de comunicação (veio da planilha): escolha a classificação.</p>
        )}
        <p className="small muted">
          Emergência: fim de semana ou feriado · Programada: pedido recebido {ANTECEDENCIA_HORAS} h ou mais antes das 07:15 do dia · Não programada:
          menos de {ANTECEDENCIA_HORAS} h. Pedidos fora da jornada (07:15–17:15, dias úteis) contam a partir das 07:15 do próximo dia útil.
        </p>
        {a.classe === 'cancelada' && (
          <div className="stack">
            <div className="field-cab">
              <span className="field">Motivo do cancelamento</span>
              {pode.programar && (
                <button type="button" className="link-btn" onClick={() => setEditarMotivos(true)}>
                  ✏️ Editar lista
                </button>
              )}
            </div>
            <div className="opts">
              {motivosCancelamento.map((m) => (
                <button key={m} type="button" className={'opt' + (a.motivo === m ? ' on' : '')} onClick={() => set('motivo', m)}>
                  {m}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={motivosCancelamento.includes(a.motivo) ? '' : a.motivo}
              maxLength={MOTIVO_MAX}
              placeholder="Outro motivo (escreva)"
              onChange={(e) => set('motivo', e.target.value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={a.mobilizada}
                onChange={(e) => {
                  const on = e.target.checked;
                  setA((x) => ({ ...x, mobilizada: on, mobPeriodos: on && !periodosDaMob(x).length ? [{ inicio: '', fim: '' }] : periodosDaMob(x) }));
                }}
              />{' '}
              Equipe mobilizada — apropriar horas na OM
            </label>
            {a.mobilizada && (
              <div className="stack mobilizada">
                <div className="row nowrap">
                  <label className="field grow">
                    Pessoas
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={PESSOAS_MAX}
                      value={a.pessoas || ''}
                      onChange={(e) => set('pessoas', Number(e.target.value) || 0)}
                    />
                  </label>
                </div>
                {(() => {
                  const per = periodosDaMob(a);
                  const linhas = per.length ? per : [{ inicio: '', fim: '' }];
                  const mudar = (i: number, campo: 'inicio' | 'fim', v: string) =>
                    setA((x) => ({ ...x, mobPeriodos: linhas.map((p, j) => (j === i ? { ...p, [campo]: v } : p)) }));
                  const h = per.length ? horasDosPeriodos(per) : a.horasMobilizadas;
                  const meiaNoite = per.some((p) => p.inicio && p.fim && p.fim < p.inicio);
                  return (
                    <>
                      <div className="mob-periodos">
                        {linhas.map((p, i) => (
                          <div key={i} className="row nowrap mob-periodo">
                            <label className="field grow">
                              {linhas.length > 1 ? `Espera ${i + 1}: início` : 'Início da espera'}
                              <input className="input" type="time" aria-label={`Início da espera ${i + 1}`} value={p.inicio} onChange={(e) => mudar(i, 'inicio', e.target.value)} />
                            </label>
                            <label className="field grow">
                              Fim
                              <input className="input" type="time" aria-label={`Fim da espera ${i + 1}`} value={p.fim} onChange={(e) => mudar(i, 'fim', e.target.value)} />
                            </label>
                            <span className="small muted mob-dur num">{p.inicio && p.fim ? fmtDuracao(duracaoHoras(p.inicio, p.fim)) : ''}</span>
                            {linhas.length > 1 && (
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Remover espera ${i + 1}`}
                                onClick={() => setA((x) => ({ ...x, mobPeriodos: linhas.filter((_, j) => j !== i) }))}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        {linhas.length < MOB_PERIODOS_MAX && (
                          <button type="button" className="btn small" onClick={() => setA((x) => ({ ...x, mobPeriodos: [...linhas, { inicio: '', fim: '' }] }))}>
                            + Outro período de espera
                          </button>
                        )}
                      </div>
                      <p className="small muted">
                        {h > 0 ? (
                          <>
                            Equipe parada: <b>{fmtDuracao(h)}</b>
                            {linhas.length > 1 ? ` em ${linhas.length} períodos` : ''}
                            {meiaNoite ? ' (passou da meia-noite)' : ''}
                            {!per.length ? ' (registrado sem horário)' : ''} · Total:{' '}
                            {a.pessoas ? <b>{fmtHH(a.pessoas * h)}</b> : 'informe as pessoas'} a apropriar{a.om ? ` na OM ${a.om}` : ' (informe a OM acima)'}.
                          </>
                        ) : (
                          'Informe o início e o fim da espera: o tempo parado é calculado.'
                        )}{' '}
                        A atividade continua cancelada nos indicadores; a OM segue para retorno do supervisor e baixa.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={a.retrabalho} onChange={(e) => set('retrabalho', e.target.checked)} /> Retrabalho (serviço refeito)
        </label>

        {!nova && (
          <div className="row nowrap copiar">
            <label className="field grow">
              Copiar para outro dia (continuação)
              <input className="input" type="date" value={copiarPara} onChange={(e) => setCopiarPara(e.target.value)} />
            </label>
            <button className="btn" type="button" onClick={copiar} disabled={!copiarPara}>
              Copiar
            </button>
          </div>
        )}
        {!nova && (
          <p className="small muted">
            {atual.origem === 'planilha' ? 'Importada da planilha' : `Lançada por ${atual.criadoPor}`}
            {atual.atualizadoEm && ` · alterada em ${new Date(atual.atualizadoEm).toLocaleString('pt-BR')}`}
          </p>
        )}
      </form>
      {/* fora do <form>: Enter/botões da lista não enviam o formulário da atividade */}
      {editarMotivos && createPortal(<MotivosDialog onClose={() => setEditarMotivos(false)} />, document.body)}
    </Modal>
  );
}

/** Classificação pela regra; sem data de comunicação só vale a regra do fim de semana/feriado. */
function autoClasse(data: string, comunicadoEm: string, feriados: Record<string, string>) {
  if (comunicadoEm) return classificar(data, new Date(comunicadoEm), feriados);
  const r = classificar(data, new Date(0), feriados);
  return r?.classe === 'emergencia' ? r : null;
}

/** ISO → valor de <input type="datetime-local"> no horário do aparelho */
function paraLocal(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const deLocal = (v: string) => (v ? new Date(v).toISOString() : '');
