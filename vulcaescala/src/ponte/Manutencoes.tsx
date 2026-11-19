import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../ui/Modal';
import { PdfBotao } from '../ui/PdfBotao';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { newId } from '../domain/ids';
import { irPara, usePonte } from './context';
import { Entrar } from './Inspecao';
import {
  DESCRICAO_MAX,
  EXECUTANTE_PADRAO,
  MAX_ANEXOS,
  TIPOS_MANUT,
  ehImagem,
  ehPdf,
  excluirManutencao,
  fmtTamanho,
  gravarManutencao,
  lerAnexo,
  prepararArquivo,
  type Anexo,
  type ArquivoNovo,
  type Manutencao,
  type TipoManut,
} from './manutencao';
import { AREA, MOTIVO_EXCLUSAO_MIN, dataBr } from './model';

const TIPO_CLS: Record<TipoManut, string> = { Preventiva: 'ok', Corretiva: 'danger', 'Inspeção/Laudo': 'info', Outro: 'neutral' };

/** Pode corrigir? administrador ou quem lançou (mesma conta). */
const podeCorrigir = (m: Manutencao, admin: boolean, uid: string) => admin || (!!uid && m.criadoUid === uid);

/** Resumo no painel do QR Code: última manutenção + acesso ao histórico. */
export function ResumoManutencoes() {
  const { manutencoes } = usePonte();
  const ultima = manutencoes?.[0] ?? null;
  return (
    <section className="card pad stack ponte-manut-resumo">
      <div className="row between">
        <h3>🛠 Manutenções da ponte</h3>
        <span className="small muted">executadas pela {EXECUTANTE_PADRAO}</span>
      </div>
      {!manutencoes ? (
        <p className="muted small">Carregando…</p>
      ) : !ultima ? (
        <p className="small muted">Nenhuma manutenção registrada ainda.</p>
      ) : (
        <button className="ponte-dia-btn" onClick={() => irPara(`#/m/${ultima.id}`)}>
          <span className={'badge ' + TIPO_CLS[ultima.tipo]}>{ultima.tipo}</span>
          <span className="small">
            Última: <b>{dataBr(ultima.data)}</b>
            {ultima.om && ` · OM ${ultima.om}`} · {ultima.descricao.slice(0, 80)}
            {ultima.descricao.length > 80 ? '…' : ''}
            {ultima.anexos.length > 0 && ` · 📎 ${ultima.anexos.length}`}
          </span>
        </button>
      )}
      <div className="row">
        <button className="btn grow" onClick={() => irPara('#/manutencoes')}>
          Histórico de manutenções{manutencoes ? ` (${manutencoes.length})` : ''}
        </button>
        <button className="btn" onClick={() => irPara('#/manutencoes/nova')}>
          + Registrar
        </button>
      </div>
    </section>
  );
}

/** Histórico completo (qualquer pessoa com o QR Code vê). */
export function ListaManutencoes() {
  const { manutencoes, manutExcluidas, admin } = usePonte();
  const [tipo, setTipo] = useState<TipoManut | ''>('');
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (manutencoes ?? []).filter((m) => (!tipo || m.tipo === tipo) && (!b || `${m.om} ${m.descricao} ${m.executante} ${dataBr(m.data)}`.toLowerCase().includes(b)));
  }, [manutencoes, tipo, busca]);
  return (
    <div className="stack">
      <div className="row between">
        <button className="link small" onClick={() => irPara('#/')}>
          ‹ Painel
        </button>
        <button className="btn primary" onClick={() => irPara('#/manutencoes/nova')}>
          + Registrar manutenção
        </button>
      </div>
      <section className="card pad stack">
        <h2>Histórico de manutenções</h2>
        <p className="small muted">
          Ponte rolante da {AREA.toLowerCase()} · manutenções executadas pela {EXECUTANTE_PADRAO}, com a OM, laudos, fotos e PDFs. Toque num registro para ver os
          documentos.
        </p>
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          {(['', ...TIPOS_MANUT] as const).map((t) => (
            <button key={t || 'todos'} type="button" role="radio" aria-checked={tipo === t} className={'seg' + (tipo === t ? ' on' : '')} onClick={() => setTipo(t)}>
              {t || 'Todas'}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Buscar OM, descrição, data…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar manutenção" />
        {!manutencoes ? (
          <p className="muted">Carregando…</p>
        ) : !lista.length ? (
          <p className="muted small">{manutencoes.length ? 'Nenhuma manutenção com esse filtro.' : 'Nenhuma manutenção registrada ainda.'}</p>
        ) : (
          <ul className="plain-list ponte-hist">
            {lista.map((m) => (
              <li key={m.id} className="ponte-dia">
                <button className="ponte-dia-btn ponte-manut-item" onClick={() => irPara(`#/m/${m.id}`)}>
                  <span className="ponte-manut-data num">{dataBr(m.data)}</span>
                  <span className={'badge ' + TIPO_CLS[m.tipo]}>{m.tipo}</span>
                  <span className="small grow">
                    {m.om ? <b>OM {m.om}</b> : <span className="muted">sem OM</span>} · {m.executante || '—'}
                    <br />
                    {m.descricao}
                  </span>
                  {m.anexos.length > 0 && <span className="small muted nowrap">📎 {m.anexos.length}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {admin && manutExcluidas.length > 0 && (
        <section className="card pad stack">
          <h3>Manutenções excluídas ({manutExcluidas.length})</h3>
          <ul className="plain-list ponte-hist">
            {manutExcluidas.map((m) => (
              <li key={m.id}>
                <button className="ponte-dia-btn" onClick={() => irPara(`#/m/${m.id}`)}>
                  <span className="badge neutral">Excluída</span>
                  <span className="small">
                    {dataBr(m.data)} · {m.om ? `OM ${m.om}` : 'sem OM'} · excluída por {m.excluidoPor} — {m.excluidoMotivo}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Um registro de manutenção, com os anexos (abrir/baixar) e o PDF para auditoria. */
export function DetalheManutencao({ id }: { id: string }) {
  const { manutencoes, manutExcluidas, admin, uid } = usePonte();
  const m = manutencoes?.find((x) => x.id === id) ?? manutExcluidas.find((x) => x.id === id) ?? null;
  const [excluindo, setExcluindo] = useState(false);
  if (!manutencoes) return <p className="muted">Carregando…</p>;
  const topo = (
    <div className="row no-print relatorio-acoes">
      <button className="btn" onClick={() => irPara('#/manutencoes')}>
        ‹ Histórico
      </button>
      {m && <PdfBotao alvo={() => document.getElementById('ponte-manut')} titulo={`Manutenção ponte rolante ${dataBr(m.data).replace(/\//g, '-')}${m.om ? ` OM ${m.om}` : ''}`} />}
      {m && !m.excluidoEm && (
        <button className="btn" onClick={() => irPara(`#/m/${m.id}/editar`)} title={podeCorrigir(m, admin, uid) ? undefined : 'Pede o PIN de quem registrou ou login de administrador'}>
          Corrigir / anexar
        </button>
      )}
      {m && admin && !m.excluidoEm && (
        <button className="btn ghost-danger" onClick={() => setExcluindo(true)}>
          Excluir
        </button>
      )}
    </div>
  );
  if (!m)
    return (
      <div className="stack">
        {topo}
        <p className="muted">Manutenção não encontrada.</p>
      </div>
    );
  return (
    <div className="stack">
      {topo}
      <article id="ponte-manut" className="card pad stack ponte-rel">
        {m.excluidoEm && (
          <div className="ponte-excluido" role="alert">
            <b>REGISTRO EXCLUÍDO</b> em {new Date(m.excluidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por {m.excluidoPor}
            <div>Motivo: {m.excluidoMotivo}</div>
          </div>
        )}
        <header className="stack">
          <img src="logo-benetech.png" alt="Benetech" className="ponte-rel-logo" />
          <h2>Registro de manutenção — ponte rolante</h2>
          <div className="small muted">
            {AREA} · Contrato AMT · manutenção executada pela {m.executante || EXECUTANTE_PADRAO}
          </div>
          <dl className="ponte-cab">
            <div>
              <dt>Data da manutenção</dt>
              <dd>{dataBr(m.data)}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{m.tipo}</dd>
            </div>
            <div>
              <dt>OM</dt>
              <dd>{m.om || 'sem OM'}</dd>
            </div>
            <div>
              <dt>Executante</dt>
              <dd>{m.executante || '—'}</dd>
            </div>
            <div className="largo">
              <dt>Descrição</dt>
              <dd className="ponte-manut-desc">{m.descricao}</dd>
            </div>
          </dl>
        </header>
        <section className="stack">
          <h3>Documentos e fotos ({m.anexos.length})</h3>
          {m.anexos.length === 0 ? <p className="small muted">Nenhum anexo.</p> : <Anexos m={m} />}
        </section>
        <p className="small muted">
          Registrado por {m.criadoNome || m.criadoPor} em {m.criadoEm ? new Date(m.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          {m.atualizadoEm && m.atualizadoEm !== m.criadoEm && ` · corrigido por ${m.atualizadoPor} em ${new Date(m.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`} ·
          registro {m.id}
        </p>
      </article>
      {excluindo && createPortal(<ExcluirManutDialog m={m} onClose={() => setExcluindo(false)} />, document.body)}
    </div>
  );
}

/** Anexos: fotos aparecem na tela (e no PDF); PDFs e outros arquivos abrem ou baixam. */
function Anexos({ m }: { m: Manutencao }) {
  const { api } = usePonte();
  const [urls, setUrls] = useState<Record<string, string | { erro: string }>>({});
  useEffect(() => {
    let vivo = true;
    const criadas: string[] = [];
    for (const a of m.anexos)
      lerAnexo(api, m.id, a)
        .then((b) => {
          const u = URL.createObjectURL(b);
          criadas.push(u);
          if (vivo) setUrls((x) => ({ ...x, [a.id]: u }));
        })
        .catch((e: Error) => vivo && setUrls((x) => ({ ...x, [a.id]: { erro: e.message || 'não foi possível abrir' } })));
    return () => {
      vivo = false;
      criadas.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [api, m.id, m.anexos]);
  return (
    <ul className="plain-list ponte-anexos">
      {m.anexos.map((a) => {
        const u = urls[a.id];
        return (
          <li key={a.id} className="ponte-anexo">
            <div className="row between nowrap">
              <span className="small">
                {ehPdf(a) ? '📄' : ehImagem(a) ? '🖼' : '📎'} <b>{a.nome}</b> <span className="muted">· {fmtTamanho(a.tamanho)}</span>
              </span>
              {typeof u === 'string' && (
                <span className="row nowrap no-print">
                  <a className="btn small" href={u} target="_blank" rel="noopener">
                    Abrir
                  </a>
                  <a className="btn small" href={u} download={a.nome}>
                    Baixar
                  </a>
                </span>
              )}
            </div>
            {u === undefined && <p className="small muted">Carregando arquivo…</p>}
            {u && typeof u !== 'string' && <p className="small text-danger">{u.erro}</p>}
            {typeof u === 'string' && ehImagem(a) && <img src={u} alt={a.nome} className="ponte-foto ponte-anexo-img" />}
          </li>
        );
      })}
    </ul>
  );
}

function ExcluirManutDialog({ m, onClose }: { m: Manutencao; onClose: () => void }) {
  const { api, email } = usePonte();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = motivo.trim().length >= MOTIVO_EXCLUSAO_MIN;
  const excluir = async () => {
    setBusy(true);
    try {
      await excluirManutencao(api, m.id, email, motivo.trim().slice(0, 500));
      toast('Manutenção excluída (fica no histórico de exclusões)');
      onClose();
      irPara('#/manutencoes');
    } catch {
      toast('A nuvem recusou a exclusão. Confira a conexão, se você é administrador e se as regras do Firebase foram publicadas.', 'danger');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Excluir esta manutenção?"
      subtitle={`${dataBr(m.data)} · ${m.tipo}${m.om ? ` · OM ${m.om}` : ''}`}
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
        Sai do histórico, mas <b>não é apagada</b>: fica em "Manutenções excluídas" com quem excluiu, quando e o motivo.
      </p>
      <label className="field">
        Motivo da exclusão (mín. {MOTIVO_EXCLUSAO_MIN} caracteres)
        <textarea className="input" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: registro duplicado" />
      </label>
    </Modal>
  );
}

/** Registrar (ou corrigir) uma manutenção. Pede o PIN do operador, ou login de administrador. */
export function FormManutencao({ id }: { id: string | null }) {
  const { manutencoes, admin, operador, email, uid } = usePonte();
  const atual = id ? (manutencoes?.find((m) => m.id === id) ?? null) : null;
  const voltar = id ? `#/m/${id}` : '#/manutencoes';
  if (id && !manutencoes) return <p className="muted">Carregando…</p>;
  if (id && !atual) return <p className="muted">Manutenção não encontrada.</p>;
  if (!admin && !operador)
    return (
      <Entrar
        logadoComo={email}
        titulo={id ? 'Corrigir manutenção' : 'Registrar manutenção'}
        texto="Operador habilitado: escolha o seu nome e digite o seu PIN. O registro fica assinado com o seu nome."
        botao={id ? 'Entrar e corrigir' : 'Entrar e registrar'}
        voltar={voltar}
        extra={
          <p className="small">
            Administrador?{' '}
            <button type="button" className="link small" onClick={() => irPara(`#/gestao?volta=${encodeURIComponent(id ? `#/m/${id}/editar` : '#/manutencoes/nova')}`)}>
              Entrar com e-mail e senha
            </button>
          </p>
        }
      />
    );
  if (atual && !podeCorrigir(atual, admin, uid))
    return (
      <section className="card pad stack">
        <h2>Corrigir manutenção</h2>
        <p>Só quem registrou ou um administrador corrige este registro. Ele foi registrado por {atual.criadoNome || atual.criadoPor}.</p>
        <button className="btn" onClick={() => irPara(voltar)}>
          ‹ Voltar
        </button>
      </section>
    );
  return <Formulario atual={atual} voltar={voltar} />;
}

function Formulario({ atual, voltar }: { atual: Manutencao | null; voltar: string }) {
  const { api, admin, operador, email, uid, hoje } = usePonte();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(atual?.data ?? hoje);
  const [tipo, setTipo] = useState<TipoManut>(atual?.tipo ?? 'Corretiva');
  const [om, setOm] = useState(atual?.om ?? '');
  const [executante, setExecutante] = useState(atual?.executante ?? EXECUTANTE_PADRAO);
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [anexos, setAnexos] = useState<Anexo[]>(atual?.anexos ?? []);
  const [novos, setNovos] = useState<ArquivoNovo[]>([]);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const total = anexos.length + novos.length;
  const escolher = async (files: FileList | null) => {
    if (!files?.length) return;
    setErro('');
    setLendo(true);
    const lidos: ArquivoNovo[] = [];
    for (const f of Array.from(files)) {
      if (total + lidos.length >= MAX_ANEXOS) {
        setErro(`Até ${MAX_ANEXOS} anexos por registro.`);
        break;
      }
      try {
        lidos.push(await prepararArquivo(f));
      } catch (e) {
        setErro((e as Error).message || `Não foi possível ler "${f.name}".`);
      }
    }
    setNovos((x) => [...x, ...lidos]);
    setLendo(false);
  };
  const sairSeOperador = () => {
    if (!admin && operador) void api.authMod.signOut(api.auth);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro('Informe a data da manutenção.');
    if (data > hoje) return setErro('A data da manutenção não pode ser no futuro.');
    if (!descricao.trim()) return setErro('Descreva o que foi feito.');
    if (!om.trim() && total === 0) {
      const ok = await confirm({ title: 'Registrar sem OM e sem anexo?', message: <p>Para auditoria, o ideal é ter o número da OM ou o documento da manutenção.</p>, confirmLabel: 'Registrar assim mesmo' });
      if (!ok) return;
    }
    const agora = new Date().toISOString();
    const m: Manutencao = {
      id: atual?.id ?? newId(),
      data,
      tipo,
      om: om.replace(/\D+/g, '').slice(0, 20),
      executante: executante.trim().slice(0, 80),
      descricao: descricao.trim().slice(0, DESCRICAO_MAX),
      anexos: [...anexos, ...novos.map((n) => n.anexo)],
      operadorId: atual ? atual.operadorId : admin ? '' : (operador?.id ?? ''),
      criadoNome: atual ? atual.criadoNome : admin ? email : (operador?.nome ?? email),
      criadoPor: atual?.criadoPor ?? email,
      criadoUid: atual?.criadoUid ?? uid,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
      atualizadoPor: email,
      excluidoEm: '',
      excluidoPor: '',
      excluidoMotivo: '',
    };
    // operador corrigindo o próprio registro: a regra confere o operador habilitado da sessão
    if (atual && !admin && operador) m.operadorId = operador.id;
    setSalvando(true);
    const envio = gravarManutencao(api, m, novos);
    const r = await Promise.race([envio.then(() => 'ok' as const), new Promise<'pendente'>((ok) => setTimeout(() => ok('pendente'), 8000))]).catch(() => 'erro' as const);
    if (r === 'erro') {
      setSalvando(false);
      return setErro('A nuvem recusou o registro (operador inativo, treinamento vencido ou regras do Firebase não publicadas?).');
    }
    if (r === 'pendente') {
      envio.then(sairSeOperador).catch(() => toast('A nuvem recusou a manutenção enviada deste aparelho. Procure a liderança.', 'danger'));
      toast('Salvo no aparelho: será enviado quando a conexão voltar. Mantenha o app aberto até lá.');
    } else {
      sairSeOperador();
      toast(atual ? 'Manutenção corrigida' : 'Manutenção registrada');
    }
    irPara(`#/m/${m.id}`);
  };

  return (
    <div className="stack">
      <button className="link small" onClick={() => irPara(voltar)}>
        ‹ Voltar
      </button>
      <form className="card pad stack" onSubmit={(e) => void salvar(e)}>
        <h2>{atual ? 'Corrigir manutenção' : 'Registrar manutenção'}</h2>
        <p className="small muted">
          Lançado por <b>{admin ? email : operador?.nome}</b>. Anexe a OM, laudos, relatórios e fotos recebidos da {EXECUTANTE_PADRAO}.
        </p>
        <div className="two-cols">
          <label className="field">
            Data da manutenção
            <input className="input" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="field">
            Número da OM
            <input className="input" inputMode="numeric" maxLength={20} value={om} onChange={(e) => setOm(e.target.value.replace(/\D+/g, ''))} placeholder="Ex.: 900012345678" />
          </label>
        </div>
        <span className="field">Tipo</span>
        <div className="segmented" role="radiogroup" aria-label="Tipo de manutenção">
          {TIPOS_MANUT.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} className={'seg' + (tipo === t ? ' on' : '')} onClick={() => setTipo(t)}>
              {t}
            </button>
          ))}
        </div>
        <label className="field">
          Executante
          <input className="input" maxLength={80} value={executante} onChange={(e) => setExecutante(e.target.value)} />
        </label>
        <label className="field">
          O que foi feito
          <textarea className="input" rows={4} maxLength={DESCRICAO_MAX} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Troca do cabo de aço do içamento principal e ajuste dos freios" />
        </label>

        <span className="field">
          Documentos e fotos ({total}/{MAX_ANEXOS})
        </span>
        <ul className="plain-list ponte-anexos">
          {anexos.map((a) => (
            <li key={a.id} className="ponte-anexo row between nowrap">
              <span className="small">
                {ehPdf(a) ? '📄' : ehImagem(a) ? '🖼' : '📎'} {a.nome} <span className="muted">· {fmtTamanho(a.tamanho)}</span>
              </span>
              <button type="button" className="link small" onClick={() => setAnexos((x) => x.filter((y) => y.id !== a.id))}>
                Remover
              </button>
            </li>
          ))}
          {novos.map((n) => (
            <li key={n.anexo.id} className="ponte-anexo row between nowrap">
              <span className="small">
                {ehPdf(n.anexo) ? '📄' : ehImagem(n.anexo) ? '🖼' : '📎'} {n.anexo.nome} <span className="muted">· {fmtTamanho(n.anexo.tamanho)} · novo</span>
              </span>
              <button type="button" className="link small" onClick={() => setNovos((x) => x.filter((y) => y.anexo.id !== n.anexo.id))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
        {total < MAX_ANEXOS && (
          <div className="row">
            <label className="btn">
              📄 Anexar PDF / arquivo
              <input type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => void escolher(e.target.files).then(() => (e.target.value = ''))} />
            </label>
            <label className="btn">
              📷 Tirar foto
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void escolher(e.target.files).then(() => (e.target.value = ''))} />
            </label>
          </div>
        )}
        <p className="small muted">PDF até {fmtTamanho(10 * 1024 * 1024)} por arquivo. Fotos são reduzidas automaticamente.</p>
        {lendo && <p className="small muted">Preparando arquivo…</p>}
        {erro && (
          <p className="text-danger small" role="alert">
            {erro}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={salvando || lendo}>
          {salvando ? 'Enviando…' : atual ? 'Salvar correção' : 'Registrar manutenção'}
        </button>
      </form>
    </div>
  );
}
