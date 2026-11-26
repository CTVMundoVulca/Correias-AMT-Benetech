import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { irPara, podeExcluir, podeReabrir, useEmenda } from './context';
import { useExcluirEmenda } from './EmendaLista';
import { criarEmenda, gravarCampos, ouvirEmenda } from './data';
import { newId } from '../domain/ids';
import { emendaComBase, fmtData, hojeIso, durezaObrigatoria, juntarItens, separarItens, codigoDaEntrada, descricaoItemPrensa, seriePeloFabricante, type ItemPrensa, LEGENDA_FOTO_VISTORIA, FORM_VISTORIA, GRUPOS_VISTORIA, RESPOSTAS_VISTORIA, itensNC, pendenciasVistoria, vistoriaIniciada, vistoriaObrigatoria, type ItemVistoriaId, type RespVistoria } from './model';
import { useConfirm } from '../ui/ConfirmDialog';
import {
  aparelhoPorCodigo,
  aparelhosDoTipo,
  aparelhoCompleto,
  aparelhosPorTipo,
  linhasIniciais,
  calibracaoVencida,
  validadeSugerida,
  concluido,
  foraDoControle,
  pendenciasConclusao,
  liberacaoVazia,
  margemOrvalho,
  MARGEM_ORVALHO,
  novaEmenda,
  recalcular,
  type Emenda,
  mascararDoc,
  type EquipItem,
  type Funcionario,
  type Liberacao,
  type MaterialItem,
  type SimNao,
} from './model';
import { SignaturePad } from './SignaturePad';
import { FotosSection } from './FotosSection';
import { EfetivoDialog } from './EfetivoDialog';
import { ListasDialog } from './ListasDialog';
import { PrensaDialog } from './PrensaDialog';

type SetFn = (campos: Partial<Emenda>) => void;

/** Campo preenchido fica em destaque (negrito, fundo e borda na cor do app). "N/A" padrão não conta. */
const inp = (v: unknown) => 'input' + (typeof v === 'string' && v.trim() && v !== 'N/A' ? ' cheio' : '');

/**
 * Edição de um relatório. Cada alteração é gravada sozinha (só o campo alterado).
 * Relatório novo (`novo` = data inicial): fica só na tela até a primeira alteração —
 * abrir e sair sem preencher nada não cria relatório vazio na nuvem.
 */
export function EmendaEditor({ id, novo }: { id: string; novo?: string }) {
  const ctx = useEmenda();
  const { api, por, uid, setPendencia } = ctx;
  const toast = useToast();
  const confirm = useConfirm();
  const excluirEmenda = useExcluirEmenda();
  const [remoto, setRemoto] = useState<Emenda | null | undefined>(undefined);
  // relatório novo ainda não gravado: modelo local (com a data escolhida)
  // (as linhas da seção 4 vêm do cadastro de aparelhos; recalculadas se o cadastro carregar depois)
  const modelo = useMemo(
    () => (novo ? { ...novaEmenda(id, novo, por), equipamentos: linhasIniciais(ctx.aparelhos) } : null),
    [novo, id, por, ctx.aparelhos],
  );
  const criado = useRef(!novo);
  const [draft, setDraft] = useState<Partial<Emenda>>({});
  const fila = useRef<Partial<Emenda>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () =>
      ouvirEmenda(
        api,
        id,
        (e, p) => {
          setRemoto(e);
          // A cópia local de um campo só sai quando a nuvem/cache já mostra o mesmo valor
          // (ou quando tudo foi confirmado). Antes, ela saía no momento de gravar e, por um
          // instante, a tela voltava ao valor antigo — o texto "sumia e voltava".
          if (e)
            setDraft((d) => {
              let mudou = false;
              const n: Record<string, unknown> = { ...d };
              for (const k of Object.keys(d)) {
                if (k in fila.current) continue; // ainda não enviado
                const igual = JSON.stringify((e as unknown as Record<string, unknown>)[k]) === JSON.stringify(n[k]);
                if (igual || !p.pendente) {
                  delete n[k];
                  mudou = true;
                }
              }
              return mudou ? (n as Partial<Emenda>) : d;
            });
          setPendencia(p.pendente, p.offline);
        },
        () => setRemoto(null),
      ),
    [api, id, setPendencia],
  );

  /** Primeira gravação de um relatório novo: grava o relatório inteiro, com quem criou. */
  const garantirCriado = useCallback(
    (campos: Partial<Emenda> = {}) => {
      if (criado.current || !modelo) return false;
      criado.current = true;
      const agora = new Date().toISOString();
      void gravarCampos(api, id, { ...modelo, criadoEm: agora, ...campos, criadoUid: uid }, por).catch(() =>
        toast('A nuvem recusou a gravação desta emenda.', 'danger'),
      );
      // a partir daqui o endereço é o de um relatório que existe (recarregar abre ele)
      try {
        history.replaceState(null, '', `#/e/${id}`);
      } catch {
        /* ignore */
      }
      return true;
    },
    [api, id, modelo, por, toast, uid],
  );

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const enviados = fila.current;
    if (!Object.keys(enviados).length) return;
    fila.current = {};
    if (garantirCriado(enviados)) return;
    // sem internet o Firestore guarda no aparelho e envia depois
    gravarCampos(api, id, enviados, por).catch(() => toast('A nuvem recusou a gravação desta emenda.', 'danger'));
    // a cópia local (draft) continua na tela até o retorno do Firestore (ver ouvirEmenda acima)
  }, [api, id, por, toast, garantirCriado]);

  // grava ao sair da tela ou mandar o app para segundo plano
  useEffect(() => {
    const vis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      flush();
    };
  }, [flush]);

  if (remoto === undefined && !modelo) return <p className="muted">Carregando…</p>;
  const atual = remoto ?? (criado.current && !modelo ? null : modelo);
  if (!atual)
    return (
      <div className="card pad stack">
        <p>Relatório não encontrado (pode ter sido excluído).</p>
        <button className="btn" onClick={() => irPara('#')}>
          Voltar à lista
        </button>
      </div>
    );

  const e: Emenda = { ...atual, ...draft };
  const vazio = !criado.current;
  const travado = concluido(e);
  const set: SetFn = (campos) => {
    if (travado) return; // concluído: somente leitura (a nuvem também recusa)
    const base = { ...e, ...campos };
    const patch = { ...campos, ...recalcular(base, Object.keys(campos) as (keyof Emenda)[]) };
    setDraft((d) => ({ ...d, ...patch }));
    fila.current = { ...fila.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  const excluir = async () => {
    if (await excluirEmenda(e)) irPara('#');
  };
  // "Nova com base nesta": copia o que se repete (TAG, OM, efetivo, materiais, dados da
  // emenda, prensa) e deixa em branco o que é da execução (data, horários, checklists, fotos, assinaturas)
  const novaComBase = () => {
    flush();
    const nova = { ...emendaComBase(e, newId(), hojeIso(), por), criadoUid: uid };
    criarEmenda(api, nova).catch(() => toast('A nuvem recusou a cópia.', 'danger'));
    try {
      sessionStorage.setItem(`emenda:copia:${nova.id}`, `${e.numero ? `nº ${e.numero}` : 'anterior'} — ${e.tag || 'sem TAG'}`);
    } catch {
      /* sem armazenamento: só não mostra o aviso */
    }
    toast('Nova emenda criada com base nesta');
    irPara(`#/e/${nova.id}`);
  };
  let copiaDe: string | null = null;
  try {
    copiaDe = sessionStorage.getItem(`emenda:copia:${id}`);
  } catch {
    /* sem armazenamento */
  }
  // PDF de um relatório que ainda não tem nada não faz sentido (e ele nem existe na nuvem)
  const abrirPdf = () => {
    if (vazio) return toast('Preencha o relatório antes de gerar o PDF.', 'warn');
    flush();
    irPara(`#/r/${id}`);
  };

  return (
    <section className="emenda-form">
      <div className="card pad row between">
        <button className="btn small" onClick={() => (flush(), irPara('#'))}>
          ‹ Lista
        </button>
        <strong className="grow ellipsis" style={{ textAlign: 'center' }}>
          Emenda nº {e.numero || '?'} — {e.tag || 'sem TAG'}
        </strong>
        {!vazio && (
          <button className="btn small" onClick={novaComBase} title="Criar nova emenda com base nesta" aria-label="Criar nova emenda com base nesta">
            ⧉ Copiar
          </button>
        )}
        <button className="btn small primary" onClick={abrirPdf}>
          PDF
        </button>
      </div>
      {copiaDe && (
        <div className="banner warn small">
          <b>Criada com base na emenda {copiaDe}.</b> Foram copiados TAG, OM, efetivo, materiais, aparelhos, dados da emenda e da prensa. Confira o{' '}
          <b>número</b> e a <b>data</b> e preencha o que é desta execução: horários, temperaturas, clima, demãos, checklists, dureza, fotos e assinaturas.
        </div>
      )}

      {travado && (
        <SituacaoConcluido
          e={e}
          podeReabrir={podeReabrir(ctx, e)}
          onReabrir={async () => {
            const ok = await confirm({
              title: 'Reabrir este relatório?',
              message: <p>Ele volta para “em preenchimento” e pode ser alterado. Fica registrado quem reabriu e quando.</p>,
              confirmLabel: 'Reabrir',
            });
            if (!ok) return;
            gravarCampos(api, id, { concluidoEm: '', concluidoPor: '', concluidoUid: '', reabertoEm: new Date().toISOString(), reabertoPor: por && por !== 'anônimo' ? por : `aparelho de quem concluiu (${e.concluidoPor || '?'})` }, por)
              .then(() => toast('Relatório reaberto'))
              .catch(() => toast('Não foi possível reabrir: só quem concluiu (mesmo aparelho) ou a liderança.', 'danger'));
          }}
        />
      )}
      <fieldset className="emenda-trava" disabled={travado}>
      <Sec n="1" t="Identificação">
        <div className="g2">
          <Txt e={e} set={set} c="tag" label="Equipamento (TAG)" upper />
          <Txt e={e} set={set} c="data" label="Data" type="date" />
          <Txt e={e} set={set} c="numero" label="Número da emenda" mode="numeric" />
          <Txt e={e} set={set} c="om" label="OM" />
        </div>
      </Sec>

      <Sec n="2" t="Efetivo">
        <EfetivoSection e={e} set={set} />
      </Sec>

      <Sec n="3" t="Materiais da emenda">
        <MateriaisSection lista="materiaisEmenda" e={e} set={set} />
        <h3 className="sub">3.1 Materiais da manta</h3>
        <MateriaisSection lista="materiaisManta" e={e} set={set} />
      </Sec>

      <Sec n="4" t="Equipamentos de medição utilizados">
        <EquipSection e={e} set={set} />
      </Sec>

      <Sec n="5" t="Dados da emenda">
        <div className="g2">
          <Opts e={e} set={set} c="tipoCorreia" label="Tipo de correia" op={['Lona', 'Cabo Aço']} />
          <Opts e={e} set={set} c="tipoEmenda" label="Tipo de emenda" op={['Frio', 'Quente']} />
        </div>
        <Txt e={e} set={set} c="especificacao" label="Especificação da correia (fab./modelo)" />
        <div className="g2">
          <Txt e={e} set={set} c="largura" label="Largura da correia [mm]" mode="decimal" />
          <Txt e={e} set={set} c="trecho" label="Tamanho / trecho [m]" mode="decimal" />
        </div>
        {e.tipoCorreia === 'Cabo Aço' ? (
          <>
            <h3 className="sub">Cabo de aço</h3>
            <div className="g2">
              <Txt e={e} set={set} c="estagio1" label="1º estágio [mm]" mode="decimal" />
              <Txt e={e} set={set} c="estagio2" label="2º estágio [mm]" mode="decimal" />
              <Txt e={e} set={set} c="estagio3" label="3º estágio [mm]" mode="decimal" />
              <Txt e={e} set={set} c="chanfro" label="Chanfro [mm]" mode="decimal" />
            </div>
          </>
        ) : (
          <>
            <h3 className="sub">Lona</h3>
            <div className="g2">
              <Txt e={e} set={set} c="qtdLona" label="Quant. lonas" mode="numeric" />
              <Txt e={e} set={set} c="qtdPasses" label="Quant. passes" mode="numeric" />
              <Txt e={e} set={set} c="comprPasse" label="Compr. passe [mm]" mode="decimal" />
              <Txt e={e} set={set} c="fechamento" label="Fechamento [mm]" mode="decimal" />
            </div>
          </>
        )}
        <h3 className="sub">Dimensões da emenda</h3>
        <div className="g2">
          <Txt e={e} set={set} c="vies" label="Viés [mm]" mode="decimal" />
          <Txt e={e} set={set} c="comprTotal" label="Compr. total da emenda [mm]" mode="decimal" />
          <Txt e={e} set={set} c="mantaInf" label="Manta inferior [mm]" mode="decimal" />
          <Txt e={e} set={set} c="mantaSup" label="Manta superior [mm]" mode="decimal" />
        </div>
        <h3 className="sub">Check list</h3>
        <div className="g2">
          <Opts e={e} set={set} c="ckLixada" label="Emenda lixada?" op={['Sim', 'Não', 'N/A']} />
          <Opts e={e} set={set} c="ckLimpa" label="Emenda limpa?" op={['Sim', 'Não', 'N/A']} />
          <Opts e={e} set={set} c="ckUmidadeOleo" label="Umidade / óleo?" op={['Não', 'Sim', 'N/A']} />
          <Opts e={e} set={set} c="ckAlinhada" label="Alinhada?" op={['Sim', 'Não', 'N/A']} />
        </div>
      </Sec>

      <Sec n="6" t="Check list da vulcanização">
        <h3 className="sub">Ambiente</h3>
        <div className="g2">
          <Txt e={e} set={set} c="tempAmbiente" label="Temp. ambiente °C" mode="decimal" />
          <Txt e={e} set={set} c="umidade" label="Umidade relativa %" mode="decimal" />
          <label className="field">
            Ponto de orvalho °C (automático)
            <input
              className={inp(e.orvalho)}
              value={e.orvalho}
              readOnly
              placeholder="preencha temp. e umidade"
              title="Calculado pela fórmula de Magnus (OMM) a partir da temperatura ambiente e da umidade relativa"
              aria-label="Ponto de orvalho calculado"
            />
          </label>
          <Txt e={e} set={set} c="tempSuperficie" label="Temp. superfície °C" mode="decimal" />
        </div>
        <AvisoOrvalho e={e} />
        <Opts e={e} set={set} c="clima" label="Clima" op={['Seco', 'Chuva']} />
        <h3 className="sub">Aplicação da cola</h3>
        <div className="g2">
          <Txt e={e} set={set} c="demao1" label="1ª demão (hora)" type="time" />
          <Txt e={e} set={set} c="demao2" label="2ª demão (hora)" type="time" />
          <Txt e={e} set={set} c="demao3" label="3ª demão (hora)" placeholder="N/A" />
          <Txt e={e} set={set} c="horaFechada" label="Fechada (hora)" type="time" />
        </div>
        <Area e={e} set={set} c="contamAntes" label="Contaminantes antes da aplicação da cola (ex.: poeira, água, óleo)" />
        <Area e={e} set={set} c="contamDepois" label="Contaminantes depois da aplicação da cola" />
        <Opts e={e} set={set} c="rodilhada" label="Rodilhada?" op={['Sim', 'Não', 'N/A']} />
        <h3 className="sub">Vulcanização</h3>
        {e.tipoEmenda !== 'Quente' && <p className="small muted">Emenda a frio: parâmetros de vulcanização não se aplicam (obrigatórios só na emenda a quente).</p>}
        <div className="g2">
          <Txt e={e} set={set} c="tempVulc" label="Temperatura vulc. °C" mode="decimal" />
          <Txt e={e} set={set} c="tempoVulc" label="Tempo vulc. (min)" mode="numeric" />
          <Txt e={e} set={set} c="pressaoVulc" label="Pressão [kg/cm²]" mode="decimal" />
          <Txt e={e} set={set} c="tempAbertura" label="Temp. abertura prensa °C" mode="decimal" />
          <Txt e={e} set={set} c="horaAbertura" label="Hora abertura prensa" />
        </div>
        <h3 className="sub">Inspeção pós-vulcanização</h3>
        <div className="g2">
          <Txt e={e} set={set} c="dureza" label={durezaObrigatoria(e) ? 'Menor valor dureza Shore A' : 'Menor valor dureza Shore A (opcional na lona a frio)'} mode="numeric" />
          <Opts e={e} set={set} c="ckBolha" label="Presença de bolha?" op={['Não', 'Sim']} />
          <Opts e={e} set={set} c="ckAcabamento" label="Feito acabamento?" op={['Sim', 'Não']} />
          <Opts e={e} set={set} c="ckFaltouMaterial" label="Faltou material?" op={['Não', 'Sim']} />
        </div>
        <Area e={e} set={set} c="obsVulc" label="Observações (justificar desvios)" />
      </Sec>

      <Sec n="7" t="Prensa">
        {/* ordem de preenchimento: equipamentos → vistoria (FOR GTO 062) → observações */}
        <h3 className="sub">Equipamentos utilizados</h3>
        <EquipPrensaSection e={e} set={set} />
        <h3 className="sub">Vistoria da prensa ({FORM_VISTORIA.codigo})</h3>
        <VistoriaResumo e={e} set={set} emendaId={id} antesDeGravar={() => void garantirCriado()} travado={travado} />
        <Area e={e} set={set} c="obsPrensa" label="Observações (justificar desvios)" />
      </Sec>

      <Sec n="8" t="Problemas durante a vulcanização">
        <Txt e={e} set={set} c="problemaTipo" label="Tipo de problema" />
        <p className="small muted">Parâmetros encontrados no momento do problema</p>
        <div className="g3">
          <Txt e={e} set={set} c="problemaTemp" label="Temperatura" mode="decimal" />
          <Txt e={e} set={set} c="problemaPressao" label="Pressão" mode="decimal" />
          <Txt e={e} set={set} c="problemaTempo" label="Tempo" mode="numeric" />
        </div>
        <Area e={e} set={set} c="retomada" label="Procedimento de retomada" />
      </Sec>

      <Sec n="9" t="Liberação do técnico de área">
        <LiberacaoSection e={e} set={set} c="libTecnico" />
      </Sec>
      <Sec n="10" t="Liberação do supervisor de área">
        <LiberacaoSection e={e} set={set} c="libSupervisor" />
      </Sec>

      </fieldset>
      {/* fora do bloqueio geral: no concluído as fotos ainda abrem (ampliar/baixar) */}
      <Sec n="📷" t="Etapas do processo (registro fotográfico)">
        <FotosSection emendaId={id} antesDeGravar={() => void garantirCriado()} travado={travado} />
      </Sec>

      {!travado && !vazio && foraDoControle(e) && (
        <p className="banner info small">Relatório anterior a 02/11/2026: fora do controle de conclusão (continua editável como antes).</p>
      )}
      {!travado && !vazio && !foraDoControle(e) && (
        <Concluir
          e={e}
          onConcluir={(nome) => {
            flush(); // o que ainda estava na fila vai antes (o Firestore mantém a ordem)
            const quem = por && por !== 'anônimo' ? `${nome} (${por})` : nome;
            gravarCampos(api, id, { concluidoEm: new Date().toISOString(), concluidoPor: quem, concluidoUid: uid }, por)
              .then(() => toast('Relatório concluído'))
              .finally(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
              .catch(() => toast('A nuvem recusou a conclusão.', 'danger'));
          }}
        />
      )}

      <div className="card pad stack">
        <button className="btn primary" onClick={abrirPdf}>
          📄 Gerar relatório (PDF)
        </button>
        {!vazio && (
          <button className="btn" onClick={novaComBase}>
            ⧉ Nova emenda com base nesta
          </button>
        )}
        <button className="btn" onClick={() => (flush(), irPara('#'))}>
          Voltar à lista
        </button>
        {vazio && <p className="small muted">Relatório novo: ele só é salvo quando você preencher alguma informação.</p>}
        {!vazio && podeExcluir(ctx, e) && (
          <button className="btn ghost-danger" onClick={excluir}>
            Excluir relatório
          </button>
        )}
        <p className="small muted">
          {travado ? 'Relatório concluído: somente leitura.' : 'Alterações são salvas automaticamente.'} Última:{' '}
          {e.atualizadoEm ? new Date(e.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          {e.atualizadoPor && e.atualizadoPor !== 'anônimo' ? ` por ${e.atualizadoPor}` : ''}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- peças do formulário

function Sec({ n, t, children }: { n: string; t: string; children: ReactNode }) {
  return (
    <div className="card pad stack">
      <h2 className="sec-title">
        <span className="sec-n">{n}</span> {t}
      </h2>
      {children}
    </div>
  );
}

type StrKeys = { [K in keyof Emenda]-?: Emenda[K] extends string ? K : never }[keyof Emenda];

function Txt({
  e,
  set,
  c,
  label,
  type = 'text',
  mode,
  placeholder,
  upper,
}: {
  e: Emenda;
  set: SetFn;
  c: StrKeys;
  label: string;
  type?: 'text' | 'date' | 'time';
  mode?: 'numeric' | 'decimal';
  placeholder?: string;
  upper?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        className={inp(e[c] as string)}
        type={type}
        inputMode={mode}
        placeholder={placeholder}
        value={e[c] as string}
        onChange={(ev) => set({ [c]: upper ? ev.target.value.toUpperCase() : ev.target.value } as Partial<Emenda>)}
      />
    </label>
  );
}

function Area({ e, set, c, label }: { e: Emenda; set: SetFn; c: StrKeys; label: string }) {
  return (
    <label className="field">
      {label}
      <textarea className={inp(e[c] as string)} rows={3} value={e[c] as string} onChange={(ev) => set({ [c]: ev.target.value } as Partial<Emenda>)} />
    </label>
  );
}

function Opts({ e, set, c, label, op }: { e: Emenda; set: SetFn; c: StrKeys; label: string; op: string[] }) {
  const v = e[c] as string;
  return (
    <div className="field">
      <span>{label}</span>
      <div className="opts" role="radiogroup" aria-label={label}>
        {op.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={v === o}
            className={'opt' + (v === o ? ' on' : '')}
            onClick={() => set({ [c]: v === o && c.startsWith('ck') ? ('' as SimNao) : o } as Partial<Emenda>)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seleção de colaborador pelo nome (lista própria da emenda), como no app do Suzano. */
function SelectColaborador({ nome, onPick, excluir = [], lista }: { nome: string; onPick: (f: Funcionario | null) => void; excluir?: string[]; lista?: Funcionario[] }) {
  const { efetivo: todos } = useEmenda();
  const efetivo = lista ?? todos;
  return (
    <select className={inp(nome)} value={nome} onChange={(ev) => onPick(efetivo.find((f) => f.nome === ev.target.value) ?? null)}>
      <option value="">Selecione</option>
      {nome && !efetivo.some((f) => f.nome === nome) && <option value={nome}>{nome}</option>}
      {efetivo
        .filter((f) => f.nome === nome || !excluir.includes(f.nome))
        .map((f) => (
          <option key={f.nome} value={f.nome}>
            {f.nome}
          </option>
        ))}
    </select>
  );
}

/**
 * Efetivo em dois grupos (contrato ArcelorMittal: a correia é preparada antes e nem sempre
 * pela mesma equipe que faz a troca): Efetivo Preparação (abertura das emendas) e
 * Efetivo Troca (execução da emenda). A mesma pessoa pode estar nos dois.
 */
function EfetivoSection({ e, set }: { e: Emenda; set: SetFn }) {
  const { efetivo } = useEmenda();
  const [gerenciar, setGerenciar] = useState(false);
  return (
    <>
      <h3 className="sub">Efetivo Preparação</h3>
      <ListaEfetivo e={e} set={set} campo="efetivoPreparo" />
      <h3 className="sub">Efetivo Troca</h3>
      <ListaEfetivo e={e} set={set} campo="efetivo" />
      <button className="btn small" onClick={() => setGerenciar(true)}>
        Gerenciar efetivo
      </button>
      {efetivo.length === 0 && <p className="small muted">A lista de colaboradores está vazia. Toque em “Gerenciar efetivo” para cadastrar.</p>}
      {gerenciar && <EfetivoDialog onClose={() => setGerenciar(false)} />}
    </>
  );
}

function ListaEfetivo({ e, set, campo }: { e: Emenda; set: SetFn; campo: 'efetivo' | 'efetivoPreparo' }) {
  const itens = e[campo] ?? [];
  const usados = itens.map((x) => x.nome).filter(Boolean);
  const grupo = campo === 'efetivo' ? 'troca' : 'preparação';
  return (
    <>
      {itens.map((p, i) => (
        <div key={i} className="item-row">
          <label className="field grow">
            Nome
            <SelectColaborador
              nome={p.nome}
              excluir={usados}
              onPick={(f) => {
                const lista = [...itens];
                lista[i] = { workerId: '', nome: f?.nome ?? '', matricula: f?.doc ?? '' };
                set({ [campo]: lista } as Partial<Emenda>);
              }}
            />
          </label>
          <label className="field mat">
            Matrícula/CPF
            <input className={inp(mascararDoc(p.matricula))} value={mascararDoc(p.matricula)} readOnly />
          </label>
          <button
            className="icon-btn"
            aria-label={`Remover ${p.nome || 'pessoa'} da ${grupo}`}
            onClick={() => set({ [campo]: itens.filter((_, j) => j !== i) } as Partial<Emenda>)}
          >
            ×
          </button>
        </div>
      ))}
      <button className="btn small" onClick={() => set({ [campo]: [...itens, { workerId: '', nome: '', matricula: '' }] } as Partial<Emenda>)}>
        + Adicionar pessoa
      </button>
    </>
  );
}

function MateriaisSection({ lista, e, set }: { lista: 'materiaisEmenda' | 'materiaisManta'; e: Emenda; set: SetFn }) {
  const { listas } = useEmenda();
  const itens = e[lista];
  const opcoes = listas[lista];
  const upd = (i: number, p: Partial<MaterialItem>) => {
    const n = [...itens];
    n[i] = { ...n[i], ...p };
    set({ [lista]: n } as Partial<Emenda>);
  };
  return (
    <>
      {itens.map((m, i) => (
        <div key={i} className="item-card">
          <div className="g2">
            <label className="field">
              Material
              <select className={inp(m.material)} value={m.material} onChange={(ev) => upd(i, { material: ev.target.value })}>
                <option value="">Selecione</option>
                {m.material && !opcoes.includes(m.material) && <option>{m.material}</option>}
                {opcoes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Fabricante
              <select className={inp(m.fabricante)} value={m.fabricante} onChange={(ev) => upd(i, { fabricante: ev.target.value })}>
                {m.fabricante && !listas.fabricantes.includes(m.fabricante) && <option>{m.fabricante}</option>}
                {listas.fabricantes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="g3">
            <label className="field">
              Lote
              <input className={inp(m.lote)} value={m.lote} onChange={(ev) => upd(i, { lote: ev.target.value })} />
            </label>
            <label className="field">
              Qtd.
              <input className={inp(m.qtd)} inputMode="decimal" value={m.qtd} onChange={(ev) => upd(i, { qtd: ev.target.value })} />
            </label>
            <label className="field">
              Validade
              <input className={inp(m.validade)} type="date" value={m.validade} onChange={(ev) => upd(i, { validade: ev.target.value })} />
            </label>
          </div>
          <button className="btn small ghost-danger" onClick={() => set({ [lista]: itens.filter((_, j) => j !== i) } as Partial<Emenda>)}>
            Remover material
          </button>
        </div>
      ))}
      <button
        className="btn small"
        onClick={() =>
          set({
            [lista]: [
              ...itens,
              // fabricante sugerido: quente = BENETECH, frio = VIPAFIX (como no app do Suzano)
              { material: '', fabricante: e.tipoEmenda === 'Quente' ? 'BENETECH' : 'VIPAFIX', lote: '', qtd: '', validade: '' },
            ],
          } as Partial<Emenda>)
        }
      >
        + Adicionar material
      </button>
    </>
  );
}

function EquipSection({ e, set, campo = 'equipamentos' }: { e: Emenda; set: SetFn; campo?: 'equipamentos' | 'vistoriaAparelhos' }) {
  const { aparelhos } = useEmenda();
  const linhas = e[campo];
  // só aparelhos com patrimônio e calibração (data e validade) entram na lista
  const grupos = aparelhosPorTipo(aparelhos);
  const completos = aparelhos.filter(aparelhoCompleto);
  const [gerenciar, setGerenciar] = useState(false);
  const upd = (i: number, p: Partial<EquipItem>) => {
    const n = [...linhas];
    n[i] = { ...n[i], ...p };
    set({ [campo]: n });
  };
  return (
    <>
      {completos.length === 0 && <p className="small muted">Nenhum aparelho com calibração cadastrada. Cadastre em “Gerenciar aparelhos”.</p>}
      {linhas.map((q, i) => {
        const escolhido = q.codigo ? aparelhoPorCodigo(completos, q.codigo) : undefined;
        // linha que não é um aparelho do cadastro (relatório antigo ou tipo ainda sem aparelho escolhido): o valor continua visível
        const avulso = !escolhido && (q.equip || q.codigo) ? [q.equip, q.codigo].filter(Boolean).join(' · ') : '';
        return (
        <div key={i} className="item-card">
          <div className="g2">
            <label className="field linha-inteira">
              Equipamento
              <select
                className={inp(q.equip)}
                value={escolhido ? AP + escolhido.codigo : avulso ? ATUAL : ''}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === ATUAL) return;
                  // aparelho cadastrado: preenche a linha inteira
                  const a = v.startsWith(AP) ? aparelhoPorCodigo(completos, v.slice(AP.length)) : undefined;
                  upd(i, a ? { ...a } : { equip: '', marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' });
                }}
              >
                <option value="">Selecione</option>
                {avulso && <option value={ATUAL}>{!q.codigo && aparelhosDoTipo(completos, q.equip).length ? `${q.equip} — escolha o aparelho` : avulso}</option>}
                {grupos.map(([tipo, lista]) => (
                  <optgroup key={tipo} label={tipo}>
                    {lista.map((a) => (
                      <option key={a.codigo} value={AP + a.codigo}>
                        {a.equip} · {a.codigo}
                        {a.marca ? ` · ${a.marca}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              Marca / modelo
              <input className={inp(q.marca)} value={q.marca} onChange={(ev) => upd(i, { marca: ev.target.value })} />
            </label>
            <CampoPatrimonio q={q} upd={(p) => upd(i, p)} />
            <label className="field">
              Certificado
              <input className={inp(q.certificado)} value={q.certificado} onChange={(ev) => upd(i, { certificado: ev.target.value })} />
            </label>
            <label className="field">
              Data calibração
              <input
                className={inp(q.dataCal)}
                type="date"
                value={q.dataCal}
                onChange={(ev) => {
                  const v = ev.target.value;
                  // validade sugerida: 1 ano após a calibração (como no app do Suzano)
                  upd(i, { dataCal: v, validadeCal: validadeSugerida(v) || q.validadeCal });
                }}
              />
            </label>
            <label className="field">
              Validade calibração
              <input className={inp(q.validadeCal)} type="date" value={q.validadeCal} onChange={(ev) => upd(i, { validadeCal: ev.target.value })} />
            </label>
          </div>
          {calibracaoVencida(q, e.data) && <p className="text-danger small">Calibração vencida em {fmtData(q.validadeCal)} (antes da data da emenda).</p>}
          <button className="btn small ghost-danger" onClick={() => set({ [campo]: linhas.filter((_, j) => j !== i) })}>
            Remover equipamento
          </button>
        </div>
        );
      })}
      <button
        className="btn small"
        onClick={() => set({ [campo]: [...linhas, { equip: '', marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' }] })}
      >
        + Adicionar equipamento
      </button>
      <button className="btn small" onClick={() => setGerenciar(true)}>
        Gerenciar aparelhos
      </button>
      {gerenciar && <ListasDialog inicial="equipamentos" onClose={() => setGerenciar(false)} />}
    </>
  );
}

const OUTRO = '__outro';
/** prefixo do valor de um aparelho cadastrado na lista do Equipamento */
const AP = 'ap:';
/** valor atual da linha que não é um aparelho do cadastro (só exibição) */
const ATUAL = '__atual';

/**
 * Patrimônio da seção 4: com aparelhos cadastrados, escolhe-se o patrimônio na lista (do tipo
 * escolhido) e marca, certificado e calibração vêm do cadastro; "Outro" volta a digitar.
 * Relatórios antigos com patrimônio digitado continuam como estão.
 */
function CampoPatrimonio({ q, upd }: { q: EquipItem; upd: (p: Partial<EquipItem>) => void }) {
  const aparelhos = useEmenda().aparelhos.filter(aparelhoCompleto);
  const atual = q.codigo ? aparelhoPorCodigo(aparelhos, q.codigo) : undefined;
  const [manual, setManual] = useState(() => !!q.codigo && !atual);
  if (!aparelhos.length || manual)
    return (
      <label className="field">
        Patrimônio/Identificação
        <input className={inp(q.codigo)} value={q.codigo} onChange={(ev) => upd({ codigo: ev.target.value })} />
        {aparelhos.length > 0 && (
          <button type="button" className="link small" onClick={() => setManual(false)}>
            Escolher do cadastro
          </button>
        )}
      </label>
    );
  const opcoes = aparelhosDoTipo(aparelhos, q.equip);
  if (atual && !opcoes.includes(atual)) opcoes.unshift(atual);
  return (
    <label className="field">
      Patrimônio/Identificação
      <select
        className={inp(q.codigo)}
        value={atual?.codigo ?? ''}
        onChange={(ev) => {
          if (ev.target.value === OUTRO) return setManual(true);
          const a = aparelhoPorCodigo(aparelhos, ev.target.value);
          upd(a ? { ...a } : { codigo: '' });
        }}
      >
        <option value="">Selecione</option>
        {opcoes.map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.codigo}
            {a.marca ? ` · ${a.marca}` : ''}
          </option>
        ))}
        <option value={OUTRO}>Outro (digitar)…</option>
      </select>
    </label>
  );
}

const LIBERACAO_LABEL = {
  libTecnico: 'técnico de área',
  libSupervisor: 'supervisor de área',
  libEletricista: 'técnico em elétrica',
  libSupervisorPrensa: 'supervisor (liberação da vistoria da prensa)',
  libEncarregadoPrensa: 'encarregado (visto da vistoria da prensa)',
} as const;

/**
 * Equipamentos da prensa (seção 7), do cadastro único, em listas suspensas com "N/A": a prensa
 * (preenche a série Nilos/Sampla) e os painéis e bombas (pode mais de um: "+ outro" abre mais
 * uma lista). O relatório grava a descrição ("P-01 · SAMPLA"); textos antigos continuam aparecendo.
 */
const ANTIGO = '__antigo';
const NA = 'N/A';
const ehNA = (v: string) => v.trim().toUpperCase() === 'N/A' || v.trim().toUpperCase() === 'NA';
const rotuloItem = (it: ItemPrensa) => descricaoItemPrensa(it);

/** Painéis ou bombas da prensa: uma lista suspensa por item (a primeira com "N/A"), do cadastro único. */
function CampoItensPrensa({ e, set, c, label, tipo }: { e: Emenda; set: SetFn; c: 'paineis' | 'bombas'; label: string; tipo: 'Painel' | 'Bomba' }) {
  const { prensa } = useEmenda();
  const cad = prensa.filter((x) => x.tipo === tipo);
  const marcados = separarItens(e[c]);
  const gravar = (l: string[]) => set({ [c]: juntarItens(l) } as Partial<Emenda>);
  const doCad = (m: string) => cad.find((it) => it.codigo === codigoDaEntrada(m));
  // uma lista por item marcado; a primeira tem "N/A" (limpa tudo)
  const linha = (m: string | null, idx: number) => {
    const it = m ? doCad(m) : undefined;
    const outros = marcados.filter((_, j) => j !== idx).map(codigoDaEntrada);
    const livres = cad.filter((x) => !outros.includes(x.codigo));
    return (
      <div key={idx} className="prensa-linha">
        <select
          className={inp(m ?? '')}
          aria-label={idx === 0 ? label : `${label} (${idx + 1})`}
          value={m === null ? NA : it ? it.codigo : ANTIGO}
          onChange={(ev) => {
            const v = ev.target.value;
            if (v === ANTIGO) return;
            if (v === NA) return gravar([]);
            const novo = cad.find((x) => x.codigo === v);
            if (!novo) return;
            const l = [...marcados];
            if (m === null) l.push(descricaoItemPrensa(novo));
            else l[idx] = descricaoItemPrensa(novo);
            gravar(l);
          }}
        >
          {idx === 0 && <option value={NA}>N/A</option>}
          {m !== null && !it && <option value={ANTIGO}>{m} (registro anterior)</option>}
          {livres.map((x) => (
            <option key={x.codigo} value={x.codigo}>
              {rotuloItem(x)}
            </option>
          ))}
        </select>
        {idx > 0 && m !== null && (
          <button type="button" className="btn small ghost-danger" aria-label={`Remover ${m}`} onClick={() => gravar(marcados.filter((_, j) => j !== idx))}>
            ✕
          </button>
        )}
      </div>
    );
  };
  const sobra = cad.filter((x) => !marcados.some((m) => codigoDaEntrada(m) === x.codigo));
  return (
    <div className="field">
      <span>{label}</span>
      {marcados.length ? marcados.map((m, i) => linha(m, i)) : linha(null, 0)}
      {marcados.length > 0 && sobra.length > 0 && (
        <select
          className="input"
          aria-label={`Adicionar ${tipo === 'Painel' ? 'outro painel' : 'outra bomba'}`}
          value=""
          onChange={(ev) => {
            const novo = cad.find((x) => x.codigo === ev.target.value);
            if (novo) gravar([...marcados, descricaoItemPrensa(novo)]);
          }}
        >
          <option value="">{tipo === 'Painel' ? '+ outro painel…' : '+ outra bomba…'}</option>
          {sobra.map((x) => (
            <option key={x.codigo} value={x.codigo}>
              {rotuloItem(x)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function EquipPrensaSection({ e, set }: { e: Emenda; set: SetFn }) {
  const { prensa } = useEmenda();
  const [gerenciar, setGerenciar] = useState(false);
  const prensas = prensa.filter((x) => x.tipo === 'Prensa');
  const prensaNA = ehNA(e.prensaEquip);
  const atual = prensaNA ? undefined : prensas.find((x) => x.codigo === codigoDaEntrada(e.prensaEquip));
  // série (Nilos/Sampla) saiu da tela: vem da prensa escolhida; relatório antigo só com a série continua mostrando
  const serieAntiga = !e.prensaEquip && e.seriePrensa && e.seriePrensa !== 'N/A' ? e.seriePrensa : '';
  return (
    <>
      {prensa.length === 0 && <p className="small muted">Nenhum equipamento da prensa cadastrado. Toque em “Gerenciar equipamentos da prensa” para cadastrar.</p>}
      {serieAntiga && <p className="small muted">Registro anterior: série da prensa {serieAntiga}</p>}
      <label className="field">
        Prensa utilizada
        <select
          className={inp(e.prensaEquip)}
          value={prensaNA ? NA : atual?.codigo ?? (e.prensaEquip ? ANTIGO : '')}
          onChange={(ev) => {
            const v = ev.target.value;
            if (v === ANTIGO) return;
            if (v === NA) return set({ prensaEquip: NA });
            const it = prensas.find((x) => x.codigo === v);
            if (!it) return set({ prensaEquip: '' });
            const serie = seriePeloFabricante(it.fabricante);
            set({ prensaEquip: descricaoItemPrensa(it), ...(serie ? { seriePrensa: serie } : {}) });
          }}
        >
          <option value="">Selecione</option>
          <option value={NA}>N/A</option>
          {e.prensaEquip && !prensaNA && !atual && <option value={ANTIGO}>{e.prensaEquip} (registro anterior)</option>}
          {prensas.map((it) => (
            <option key={it.codigo} value={it.codigo}>
              {rotuloItem(it)}
            </option>
          ))}
        </select>
      </label>
      <CampoItensPrensa e={e} set={set} c="paineis" label="Painéis utilizados" tipo="Painel" />
      <CampoItensPrensa e={e} set={set} c="bombas" label="Bombas utilizadas" tipo="Bomba" />
      <button className="btn small" onClick={() => setGerenciar(true)}>
        Gerenciar equipamentos da prensa
      </button>
      {gerenciar && <PrensaDialog onClose={() => setGerenciar(false)} />}
    </>
  );
}

/**
 * Resumo da vistoria da prensa (FOR GTO 062) na seção 7 e o botão que abre o formulário.
 * Obrigatória na emenda a quente; item "NC" impede a conclusão do relatório.
 */
function VistoriaResumo({ e, set, emendaId, antesDeGravar, travado }: { e: Emenda; set: SetFn; emendaId: string; antesDeGravar: () => void; travado: boolean }) {
  const [aberta, setAberta] = useState(false);
  const iniciada = vistoriaIniciada(e);
  const faltam = pendenciasVistoria({ ...e, tipoEmenda: 'Quente' }).filter((x) => !x.includes('não conforme'));
  const nc = itensNC(e);
  const situacao = !iniciada ? 'Pendente' : faltam.length ? 'Em preenchimento' : 'Preenchida';
  return (
    <div className="vistoria-resumo">
      <p className="small">
        <b className={nc.length ? 'text-danger' : !iniciada || faltam.length ? '' : 'text-ok'}>
          {situacao}
          {nc.length > 0 && ` · ${nc.length} NC`}
        </b>
        {' — '}
        {vistoriaObrigatoria(e) ? 'obrigatória na emenda a quente.' : 'opcional na emenda a frio.'}
      </p>
      {nc.length > 0 && <p className="small text-danger">Item não conforme impede a conclusão do relatório: {nc.map(([, n]) => n).join(', ')}.</p>}
      {e.assEletricista && e.assEletricista.trim().toUpperCase() !== 'N/A' && !e.libEletricista.nome && (
        <p className="small muted">Registro anterior (técnico em elétrica): {e.assEletricista}</p>
      )}
      {travado ? (
        <p className="small muted">Relatório concluído: a vistoria completa aparece no relatório (PDF).</p>
      ) : (
        <button type="button" className="btn primary" onClick={() => setAberta(true)}>
          {iniciada ? 'Abrir vistoria da prensa' : 'Preencher vistoria da prensa'}
        </button>
      )}
      {aberta && <VistoriaDialog e={e} set={set} emendaId={emendaId} antesDeGravar={antesDeGravar} travado={travado} onClose={() => setAberta(false)} />}
    </div>
  );
}

/** Formulário FOR GTO 062 — Vistoria de prensas e equipamentos (dentro do relatório de emenda). */
function VistoriaDialog({
  e,
  set,
  emendaId,
  antesDeGravar,
  travado,
  onClose,
}: {
  e: Emenda;
  set: SetFn;
  emendaId: string;
  antesDeGravar: () => void;
  travado: boolean;
  onClose: () => void;
}) {
  const resp = (k: ItemVistoriaId, v: RespVistoria) => set({ vistoriaItens: { ...e.vistoriaItens, [k]: e.vistoriaItens[k] === v ? '' : v } });
  const dataAntiga = e.dataTeste && e.dataTeste !== 'N/A' && !/^\d{4}-\d{2}-\d{2}$/.test(e.dataTeste) ? e.dataTeste : '';
  const nc = itensNC(e);
  return (
    <Modal
      title={`Vistoria de prensas e equipamentos`}
      subtitle={`${FORM_VISTORIA.codigo} · Rev. ${FORM_VISTORIA.revisao}${vistoriaObrigatoria(e) ? ' · obrigatória na emenda a quente' : ' · opcional na emenda a frio'}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <fieldset className="emenda-trava vistoria" disabled={travado}>
        <p className="small muted">Legenda: C - Conforme · NC - Não conforme · NA - Não se aplica. Item NC impede a conclusão do relatório.</p>
        <label className="field">
          Data da vistoria
          <input className={inp(e.dataTeste)} type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(e.dataTeste) ? e.dataTeste : ''} onChange={(ev) => set({ dataTeste: ev.target.value })} />
          {dataAntiga && <span className="small muted">Registro anterior: {dataAntiga}</span>}
        </label>

        {GRUPOS_VISTORIA.map((g, gi) => (
          <section key={g.titulo} className="vistoria-grupo">
            <h3 className="sub">{g.titulo}</h3>
            {gi === 0 && <CampoItensPrensa e={e} set={set} c="paineis" label="Número do painel elétrico" tipo="Painel" />}
            {gi === 1 && <CampoItensPrensa e={e} set={set} c="bombas" label="Número do conjunto de bomba" tipo="Bomba" />}
            {g.itens.map(([k, nome]) => (
              <div key={k} className="vistoria-item">
                <span className="vistoria-nome">{nome}</span>
                <div className="opts" role="radiogroup" aria-label={nome}>
                  {RESPOSTAS_VISTORIA.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={e.vistoriaItens[k] === r}
                      className={'opt' + (e.vistoriaItens[k] === r ? ' on' + (r === 'NC' ? ' nc' : '') : '')}
                      onClick={() => resp(k, r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        {nc.length > 0 && <p className="small text-danger">Não conforme: {nc.map(([, n]) => n).join(', ')}. Corrija e marque “C” (ou “NA”) para poder concluir o relatório.</p>}

        <h3 className="sub">Aparelhos utilizados nos testes</h3>
        <EquipSection e={e} set={set} campo="vistoriaAparelhos" />

        <h3 className="sub">Anotações</h3>
        <Area e={e} set={set} c="vistoriaAnotacoes" label="Anotações da vistoria" />

        <h3 className="sub">Registro fotográfico da inspeção</h3>
        <FotosSection emendaId={emendaId} antesDeGravar={antesDeGravar} travado={travado} vistoria={{ legenda: LEGENDA_FOTO_VISTORIA }} />

        <h3 className="sub">Responsável pela inspeção (técnico em elétrica)</h3>
        <EletricistaSection e={e} set={set} />
        <h3 className="sub">Liberado por (supervisor)</h3>
        <LiberacaoSection e={e} set={set} c="libSupervisorPrensa" rotulo="Supervisor" />
        <h3 className="sub">Visto (encarregado)</h3>
        <LiberacaoSection e={e} set={set} c="libEncarregadoPrensa" rotulo="Encarregado" />
      </fieldset>
    </Modal>
  );
}

/** Técnico em elétrica: a lista mostra só quem está marcado como eletricista em "Gerenciar efetivo". */
function EletricistaSection({ e, set }: { e: Emenda; set: SetFn }) {
  const { efetivo } = useEmenda();
  const [gerenciar, setGerenciar] = useState(false);
  const eletricistas = efetivo.filter((f) => f.eletricista);
  return (
    <>
      <LiberacaoSection e={e} set={set} c="libEletricista" lista={eletricistas} rotulo="Responsável pela inspeção" />
      {eletricistas.length === 0 && (
        <p className="small muted">
          Nenhum técnico em elétrica marcado. Em “Gerenciar efetivo”, marque “Técnico em elétrica” em quem faz o teste da prensa.
        </p>
      )}
      <button className="btn small" onClick={() => setGerenciar(true)}>
        Gerenciar efetivo
      </button>
      {gerenciar && <EfetivoDialog onClose={() => setGerenciar(false)} />}
    </>
  );
}

function LiberacaoSection({ e, set, c, lista, rotulo = 'Liberado por' }: { e: Emenda; set: SetFn; c: keyof typeof LIBERACAO_LABEL; lista?: Funcionario[]; rotulo?: string }) {
  const lib = e[c];
  const upd = (p: Partial<Liberacao>) => set({ [c]: { ...liberacaoVazia(), ...lib, ...p } } as Partial<Emenda>);
  return (
    <>
      <div className="g2">
        <label className="field">
          {rotulo}
          <SelectColaborador nome={lib.nome} lista={lista} onPick={(f) => upd({ workerId: '', nome: f?.nome ?? '', matricula: f?.doc ?? '' })} />
        </label>
        <label className="field">
          Matrícula/CPF
          <input className={inp(mascararDoc(lib.matricula))} value={mascararDoc(lib.matricula)} readOnly />
        </label>
      </div>
      <label className="field">
        Data
        <input className={inp(lib.data)} type="date" value={lib.data} onChange={(ev) => upd({ data: ev.target.value })} />
      </label>
      <span className="field">Assinatura</span>
      <SignaturePad value={lib.assinatura} label={LIBERACAO_LABEL[c]} onChange={(assinatura) => upd({ assinatura })} />
    </>
  );
}

/** Aviso: superfície precisa estar pelo menos 3 °C acima do ponto de orvalho (risco de condensação). */
function AvisoOrvalho({ e }: { e: Emenda }) {
  const m = margemOrvalho(e.tempSuperficie, e.orvalho);
  if (!m) return null;
  return m.ok ? (
    <div className="banner ok small" role="status">
      ✓ Superfície {m.texto.replace(' ✓', '')} (mínimo {MARGEM_ORVALHO} °C).
    </div>
  ) : (
    <div className="banner danger small" role="alert">
      <b>⚠ Risco de condensação:</b> a superfície está só {m.diff.toFixed(1).replace('.', ',')} °C acima do ponto de orvalho
      (mínimo {MARGEM_ORVALHO} °C). Umidade pode condensar na emenda e prejudicar a aderência da cola. Registre a
      justificativa nas observações.
    </div>
  );
}

// ---------------------------------------------------------------- conclusão

function SituacaoConcluido({ e, podeReabrir, onReabrir }: { e: Emenda; podeReabrir: boolean; onReabrir: () => void }) {
  return (
    <div className="banner ok row between">
      <span>
        <b>✓ Relatório concluído</b> em {new Date(e.concluidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
        {e.concluidoPor ? ` por ${e.concluidoPor}` : ''}. Somente leitura.
      </span>
      {podeReabrir && (
        <button className="btn small" onClick={onReabrir}>
          Reabrir
        </button>
      )}
    </div>
  );
}

/** Concluir: só com tudo o que é obrigatório preenchido; pede o nome de quem conclui. */
function Concluir({ e, onConcluir }: { e: Emenda; onConcluir: (nome: string) => void }) {
  const falta = pendenciasConclusao(e);
  const [abrir, setAbrir] = useState(false);
  const [nome, setNome] = useState('');
  return (
    <div className="card pad stack emenda-concluir">
      <h2 className="sec-title">
        <span className="sec-n">✓</span> Concluir relatório
      </h2>
      {falta.length ? (
        <>
          <p className="small">
            Faltam <b>{falta.length}</b> item(ns) obrigatório(s) para concluir:
          </p>
          <ul className="small falta-lista">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      ) : !abrir ? (
        <>
          <p className="small">Tudo o que é obrigatório está preenchido. Depois de concluído, o relatório fica somente leitura.</p>
          <button className="btn primary" onClick={() => setAbrir(true)}>
            ✓ Concluir relatório
          </button>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(ev) => {
            ev.preventDefault();
            const n = nome.replace(/\s+/g, ' ').trim().toUpperCase();
            if (n.length < 3) return;
            onConcluir(n);
          }}
        >
          <label className="field">
            Quem está concluindo (nome)
            <input className="input" value={nome} maxLength={80} onChange={(ev) => setNome(ev.target.value)} aria-label="Nome de quem conclui" autoFocus />
          </label>
          <div className="row">
            <button type="button" className="btn" onClick={() => setAbrir(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={nome.trim().length < 3}>
              Confirmar conclusão
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
