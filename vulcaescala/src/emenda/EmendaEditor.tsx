import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { irPara, useEmenda } from './context';
import { excluirEmenda, gravarCampos, ouvirEmenda } from './data';
import {
  fmtData,
  liberacaoVazia,
  recalcular,
  type Emenda,
  type EquipItem,
  type Liberacao,
  type MaterialItem,
  type SimNao,
} from './model';
import { SignaturePad } from './SignaturePad';
import { FotosSection } from './FotosSection';

type SetFn = (campos: Partial<Emenda>) => void;

/** Edição de um relatório. Cada alteração é gravada sozinha (só o campo alterado). */
export function EmendaEditor({ id }: { id: string }) {
  const { api, por, isAdmin, setPendencia } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  const [remoto, setRemoto] = useState<Emenda | null | undefined>(undefined);
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

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const enviados = fila.current;
    if (!Object.keys(enviados).length) return;
    fila.current = {};
    // sem internet o Firestore guarda no aparelho e envia depois
    gravarCampos(api, id, enviados, por).catch(() => toast('A nuvem recusou a gravação desta emenda.', 'danger'));
    // a cópia local (draft) continua na tela até o retorno do Firestore (ver ouvirEmenda acima)
  }, [api, id, por, toast]);

  // grava ao sair da tela ou mandar o app para segundo plano
  useEffect(() => {
    const vis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      flush();
    };
  }, [flush]);

  if (remoto === undefined) return <p className="muted">Carregando…</p>;
  if (remoto === null)
    return (
      <div className="card pad stack">
        <p>Relatório não encontrado (pode ter sido excluído).</p>
        <button className="btn" onClick={() => irPara('#')}>
          Voltar à lista
        </button>
      </div>
    );

  const e: Emenda = { ...remoto, ...draft };
  const set: SetFn = (campos) => {
    const base = { ...e, ...campos };
    const patch = { ...campos, ...recalcular(base, Object.keys(campos) as (keyof Emenda)[]) };
    setDraft((d) => ({ ...d, ...patch }));
    fila.current = { ...fila.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  const excluir = async () => {
    const ok = await confirm({
      title: 'Excluir este relatório?',
      message: (
        <p>
          Emenda nº {e.numero || '?'} — TAG {e.tag || '?'} e todas as fotos serão apagadas para todos. Não há como desfazer.
        </p>
      ),
      confirmLabel: 'Excluir',
      danger: true,
      requireText: 'EXCLUIR',
    });
    if (!ok) return;
    try {
      await excluirEmenda(api, id);
      toast('Relatório excluído');
      irPara('#');
    } catch {
      toast('Não foi possível excluir (somente administradores, com internet).', 'danger');
    }
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
        <button className="btn small primary" onClick={() => (flush(), irPara(`#/r/${id}`))}>
          PDF
        </button>
      </div>

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
          <Txt e={e} set={set} c="orvalho" label="Temp. ponto de orvalho °C" mode="decimal" />
          <Txt e={e} set={set} c="tempSuperficie" label="Temp. superfície °C" mode="decimal" />
        </div>
        <Opts e={e} set={set} c="clima" label="Clima" op={['Seco', 'Chuva']} />
        <h3 className="sub">Aplicação da cola</h3>
        <div className="g2">
          <Txt e={e} set={set} c="demao1" label="1ª demão (hora)" type="time" />
          <Txt e={e} set={set} c="demao2" label="2ª demão (hora)" type="time" />
          <Txt e={e} set={set} c="demao3" label="3ª demão (hora)" placeholder="N/A" />
          <Txt e={e} set={set} c="horaFechada" label="Fechada (hora)" type="time" />
        </div>
        <Opts e={e} set={set} c="rodilhada" label="Rodilhada?" op={['Sim', 'Não', 'N/A']} />
        <h3 className="sub">Vulcanização</h3>
        <div className="g2">
          <Txt e={e} set={set} c="tempVulc" label="Temperatura vulc. °C" mode="decimal" />
          <Txt e={e} set={set} c="tempoVulc" label="Tempo vulc. (min)" mode="numeric" />
          <Txt e={e} set={set} c="pressaoVulc" label="Pressão [kg/cm²]" mode="decimal" />
          <Txt e={e} set={set} c="tempAbertura" label="Temp. abertura prensa °C" mode="decimal" />
          <Txt e={e} set={set} c="horaAbertura" label="Hora abertura prensa" />
        </div>
        <h3 className="sub">Inspeção pós-vulcanização</h3>
        <div className="g2">
          <Txt e={e} set={set} c="dureza" label="Menor valor dureza Shore A" mode="numeric" />
          <Opts e={e} set={set} c="ckBolha" label="Presença de bolha?" op={['Não', 'Sim']} />
          <Opts e={e} set={set} c="ckAcabamento" label="Feito acabamento?" op={['Sim', 'Não']} />
          <Opts e={e} set={set} c="ckFaltouMaterial" label="Faltou material?" op={['Não', 'Sim']} />
        </div>
        <Area e={e} set={set} c="obsVulc" label="Observações (justificar desvios)" />
      </Sec>

      <Sec n="7" t="Prensa">
        <div className="g2">
          <Opts e={e} set={set} c="seriePrensa" label="Série da prensa" op={['N/A', 'Nilos', 'Sampla']} />
          <Opts e={e} set={set} c="prensaTestada" label="Prensa testada antes?" op={['N/A', 'Sim', 'Não']} />
          <Txt e={e} set={set} c="paineis" label="Painéis utilizados" />
          <Txt e={e} set={set} c="bombas" label="Bombas utilizadas" />
          <Txt e={e} set={set} c="dataTeste" label="Data do teste" />
          <Txt e={e} set={set} c="assEletricista" label="Ass. técnico eletricista" />
        </div>
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

      <Sec n="📷" t="Etapas do processo (registro fotográfico)">
        <FotosSection emendaId={id} />
      </Sec>

      <div className="card pad stack">
        <button className="btn primary" onClick={() => (flush(), irPara(`#/r/${id}`))}>
          📄 Gerar relatório (PDF)
        </button>
        <button className="btn" onClick={() => (flush(), irPara('#'))}>
          Voltar à lista
        </button>
        {isAdmin && (
          <button className="btn ghost-danger" onClick={excluir}>
            Excluir relatório
          </button>
        )}
        <p className="small muted">
          Alterações são salvas automaticamente. Última: {fmtData(e.atualizadoEm.slice(0, 10))} {e.atualizadoEm.slice(11, 16)}
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

type StrKeys = { [K in keyof Emenda]: Emenda[K] extends string ? K : never }[keyof Emenda];

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
        className="input"
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
      <textarea className="input" rows={3} value={e[c] as string} onChange={(ev) => set({ [c]: ev.target.value } as Partial<Emenda>)} />
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

function EfetivoSection({ e, set }: { e: Emenda; set: SetFn }) {
  const { efetivo } = useEmenda();
  const usados = new Set(e.efetivo.map((x) => x.workerId));
  return (
    <>
      {e.efetivo.map((p, i) => (
        <div key={i} className="item-row">
          <label className="field grow">
            Nome
            <select
              className="input"
              value={p.workerId}
              onChange={(ev) => {
                const w = efetivo.find((x) => x.id === ev.target.value);
                const lista = [...e.efetivo];
                lista[i] = { workerId: w?.id ?? '', nome: w?.nome ?? '', matricula: w?.matricula ?? '' };
                set({ efetivo: lista });
              }}
            >
              <option value="">Selecione</option>
              {p.workerId && !efetivo.some((w) => w.id === p.workerId) && <option value={p.workerId}>{p.nome}</option>}
              {efetivo
                .filter((w) => w.id === p.workerId || !usados.has(w.id))
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="field mat">
            Matrícula
            <input className="input" value={p.matricula} readOnly />
          </label>
          <button className="icon-btn" aria-label={`Remover ${p.nome || 'pessoa'}`} onClick={() => set({ efetivo: e.efetivo.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button className="btn small" onClick={() => set({ efetivo: [...e.efetivo, { workerId: '', nome: '', matricula: '' }] })}>
        + Adicionar pessoa
      </button>
      {efetivo.length === 0 && <p className="small muted">O efetivo vem do cadastro da Escala de Vulcanização.</p>}
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
              <select className="input" value={m.material} onChange={(ev) => upd(i, { material: ev.target.value })}>
                <option value="">Selecione</option>
                {m.material && !opcoes.includes(m.material) && <option>{m.material}</option>}
                {opcoes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Fabricante
              <select className="input" value={m.fabricante} onChange={(ev) => upd(i, { fabricante: ev.target.value })}>
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
              <input className="input" value={m.lote} onChange={(ev) => upd(i, { lote: ev.target.value })} />
            </label>
            <label className="field">
              Qtd.
              <input className="input" inputMode="decimal" value={m.qtd} onChange={(ev) => upd(i, { qtd: ev.target.value })} />
            </label>
            <label className="field">
              Validade
              <input className="input" type="date" value={m.validade} onChange={(ev) => upd(i, { validade: ev.target.value })} />
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

function EquipSection({ e, set }: { e: Emenda; set: SetFn }) {
  const upd = (i: number, p: Partial<EquipItem>) => {
    const n = [...e.equipamentos];
    n[i] = { ...n[i], ...p };
    set({ equipamentos: n });
  };
  return (
    <>
      {e.equipamentos.map((q, i) => (
        <div key={i} className="item-card">
          <div className="g2">
            <label className="field">
              Equipamento
              <input className="input" value={q.equip} onChange={(ev) => upd(i, { equip: ev.target.value })} />
            </label>
            <label className="field">
              Marca / modelo
              <input className="input" value={q.marca} onChange={(ev) => upd(i, { marca: ev.target.value })} />
            </label>
            <label className="field">
              Código
              <input className="input" value={q.codigo} onChange={(ev) => upd(i, { codigo: ev.target.value })} />
            </label>
            <label className="field">
              Certificado
              <input className="input" value={q.certificado} onChange={(ev) => upd(i, { certificado: ev.target.value })} />
            </label>
            <label className="field">
              Data calibração
              <input
                className="input"
                type="date"
                value={q.dataCal}
                onChange={(ev) => {
                  const v = ev.target.value;
                  // validade sugerida: 1 ano após a calibração (como no app do Suzano)
                  const val = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${Number(v.slice(0, 4)) + 1}${v.slice(4)}` : q.validadeCal;
                  upd(i, { dataCal: v, validadeCal: val });
                }}
              />
            </label>
            <label className="field">
              Validade calibração
              <input className="input" type="date" value={q.validadeCal} onChange={(ev) => upd(i, { validadeCal: ev.target.value })} />
            </label>
          </div>
          <button className="btn small ghost-danger" onClick={() => set({ equipamentos: e.equipamentos.filter((_, j) => j !== i) })}>
            Remover equipamento
          </button>
        </div>
      ))}
      <button
        className="btn small"
        onClick={() => set({ equipamentos: [...e.equipamentos, { equip: '', marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' }] })}
      >
        + Adicionar equipamento
      </button>
    </>
  );
}

function LiberacaoSection({ e, set, c }: { e: Emenda; set: SetFn; c: 'libTecnico' | 'libSupervisor' }) {
  const { efetivo } = useEmenda();
  const lib = e[c];
  const upd = (p: Partial<Liberacao>) => set({ [c]: { ...liberacaoVazia(), ...lib, ...p } } as Partial<Emenda>);
  return (
    <>
      <div className="g2">
        <label className="field">
          Liberado por
          <select
            className="input"
            value={lib.workerId}
            onChange={(ev) => {
              const w = efetivo.find((x) => x.id === ev.target.value);
              upd({ workerId: w?.id ?? '', nome: w?.nome ?? '', matricula: w?.matricula ?? '' });
            }}
          >
            <option value="">Selecione</option>
            {lib.workerId && !efetivo.some((w) => w.id === lib.workerId) && <option value={lib.workerId}>{lib.nome}</option>}
            {efetivo.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Matrícula
          <input className="input" value={lib.matricula} readOnly />
        </label>
      </div>
      <label className="field">
        Data
        <input className="input" type="date" value={lib.data} onChange={(ev) => upd({ data: ev.target.value })} />
      </label>
      <span className="field">Assinatura</span>
      <SignaturePad value={lib.assinatura} label={c === 'libTecnico' ? 'técnico de área' : 'supervisor de área'} onChange={(assinatura) => upd({ assinatura })} />
    </>
  );
}
