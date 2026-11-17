import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { authErrorMsg } from '../cloud/authErrors';
import { newId } from '../domain/ids';
import { comprimirFoto } from '../emenda/data';
import { irPara, usePonte } from './context';
import { SituacaoLista } from './Painel';
import { gravarChecklist, type FotoItem } from './data';
import {
  AREA,
  MODELO,
  OBS_MAX,
  PERGUNTA_FINAL,
  criticosNC,
  PIN_TAM,
  RESPOSTAS,
  faltando,
  ordenarOperadores,
  pinValido,
  resultadoDe,
  situacaoTreinamento,
  textoTreinamento,
  type Operador,
  type RespostaItem,
} from './model';

const MAX_FOTOS = 6;

/** "Fazer inspeção": operador habilitado escolhe o nome, digita o PIN e preenche o checklist. */
export function Inspecao() {
  const { operador, email } = usePonte();
  const [enviado, setEnviado] = useState<'ok' | 'pendente' | null>(null);
  if (enviado) return <Enviado estado={enviado} />;
  if (operador) return <Formulario operador={operador} onEnviado={setEnviado} />;
  return <Entrar logadoComo={email} />;
}

function Entrar({ logadoComo }: { logadoComo: string }) {
  const { api, operadores, operadoresFonte, operadoresErro, hoje } = usePonte();
  const [sel, setSel] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const lista = useMemo(() => ordenarOperadores(operadores.filter((o) => o.ativo)), [operadores]);
  const op = lista.find((o) => o.id === sel);
  const sit = op ? situacaoTreinamento(op, hoje) : null;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!op) return setErro('Escolha o seu nome.');
    if (sit?.s === 'vencido') return setErro(textoTreinamento(op, hoje) + '.');
    if (!pinValido(pin)) return setErro(`Digite o PIN de ${PIN_TAM} números.`);
    setBusy(true);
    try {
      await api.authMod.signInWithEmailAndPassword(api.auth, op.authEmail, pin);
    } catch (x) {
      const code = (x as { code?: string })?.code ?? '';
      setErro(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code) ? 'PIN incorreto.' : authErrorMsg(x));
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="link small" onClick={() => irPara('#/')}>
        ‹ Painel
      </button>
      <section className="card pad stack">
        <h2>Fazer inspeção</h2>
        <p className="small muted">Só operadores habilitados, com o treinamento válido. Escolha o seu nome e digite o seu PIN pessoal.</p>
        {logadoComo && <p className="banner info small">Este aparelho está com outra sessão ({logadoComo}). Ao entrar com o PIN, ela é encerrada.</p>}
        <SituacaoLista fonte={operadoresFonte} erro={operadoresErro} vazia={!lista.length} />
        {!lista.length ? (
          operadoresFonte === 'nuvem' && <p className="banner warn">Nenhum operador cadastrado. Um administrador cadastra em Gestão.</p>
        ) : (
          <form className="stack" onSubmit={(e) => void entrar(e)}>
            <ul className="plain-list ponte-escolha" role="radiogroup" aria-label="Operador">
              {lista.map((o) => {
                const s = situacaoTreinamento(o, hoje).s;
                return (
                  <li key={o.id}>
                    <button type="button" role="radio" aria-checked={sel === o.id} className={'ponte-op-btn ' + s + (sel === o.id ? ' on' : '')} onClick={() => setSel(o.id)}>
                      <b>{o.nome}</b>
                      <span className="small">Matrícula {o.matricula}</span>
                      <span className={'small ' + (s === 'vencido' ? 'text-danger' : s === 'vence' ? 'text-pend' : 'muted')}>{textoTreinamento(o, hoje)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {op && sit?.s === 'vencido' ? (
              <p className="banner danger" role="alert">
                ⛔ <b>{op.nome}</b>: {textoTreinamento(op, hoje)}. Procure a liderança para renovar o treinamento.
              </p>
            ) : (
              op && (
                <>
                  {sit?.s === 'vence' && <p className="banner warn small">⚠ {textoTreinamento(op, hoje)}.</p>}
                  <label className="field">
                    PIN de {op.nome.split(' ')[0]}
                    <input
                      className="input ponte-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={PIN_TAM}
                      value={pin}
                      aria-label="PIN"
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    />
                  </label>
                  <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? 'Entrando…' : 'Entrar e começar o checklist'}
                  </button>
                </>
              )
            )}
            {erro && (
              <p className="text-danger small" role="alert">
                {erro}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function Formulario({ operador, onEnviado }: { operador: Operador; onEnviado: (e: 'ok' | 'pendente') => void }) {
  const { api, uid, hoje, pendente } = usePonte();
  const toast = useToast();
  const confirm = useConfirm();
  const [resp, setResp] = useState<Record<string, RespostaItem>>({});
  const [obsGeral, setObsGeral] = useState('');
  const [apto, setApto] = useState<boolean | null>(null);
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const sit = situacaoTreinamento(operador, hoje);
  const grupos = useMemo(() => [...new Set(MODELO.itens.map((i) => i.grupo))], []);
  const resultado = resultadoDe(MODELO.itens, resp, apto);
  const criticos = criticosNC(MODELO.itens, resp);
  const falta = faltando(MODELO.itens, resp);

  const marcar = (id: string, r: RespostaItem['r']) => setResp((x) => ({ ...x, [id]: { r, obs: x[id]?.obs ?? '' } }));
  const obs = (id: string, v: string) => setResp((x) => ({ ...x, [id]: { r: x[id]?.r ?? 'NC', obs: v.slice(0, OBS_MAX) } }));
  const anexar = async (itemId: string, f: File | undefined) => {
    if (!f) return;
    if (fotos.length >= MAX_FOTOS) return toast(`No máximo ${MAX_FOTOS} fotos por checklist.`, 'warn');
    try {
      const dataUrl = await comprimirFoto(f, 1280, 500_000);
      setFotos((l) => [...l, { itemId, dataUrl }]);
    } catch {
      toast('Não foi possível ler a foto.', 'danger');
    }
  };

  const sair = async () => {
    if (pendente) return toast('Há um checklist aguardando envio: mantenha a sessão até ele chegar à nuvem.', 'warn');
    await api.authMod.signOut(api.auth);
    irPara('#/');
  };

  const enviar = async () => {
    if (sit.s === 'vencido') return toast(textoTreinamento(operador, hoje) + '.', 'danger');
    if (falta.length) return toast(`Responda todos os itens (faltam ${falta.length}).`, 'warn');
    const semObs = MODELO.itens.filter((i) => resp[i.id]?.r === 'NC' && !resp[i.id]?.obs.trim());
    if (semObs.length) return toast('Descreva o problema nos itens marcados "N – Não atende".', 'warn');
    if (apto === null) return toast('Responda a pergunta final: a ponte está em condições de operar?', 'warn');
    if (apto === true && criticos.length) return toast('Há item crítico marcado "N – Não atende": a ponte não pode operar. Responda "Não" na pergunta final.', 'warn');
    if (apto === false && !obsGeral.trim()) return toast('Ponte interditada: descreva no relatório o que foi encontrado, para a supervisão.', 'warn');
    const ok = await confirm({
      title: resultado === 'bloqueada' ? 'Enviar: ponte INTERDITADA?' : 'Enviar checklist: ponte liberada?',
      message: (
        <p>
          Assinado por <b>{operador.nome}</b> (matrícula {operador.matricula}). Depois de enviado, o checklist não pode ser alterado.
        </p>
      ),
      confirmLabel: 'Enviar',
      danger: resultado === 'bloqueada',
    });
    if (!ok) return;
    setEnviando(true);
    const envio = gravarChecklist(
      api,
      {
        id: `${hoje}-${newId()}`,
        data: hoje,
        feitoEm: new Date().toISOString(),
        operadorId: operador.id,
        nome: operador.nome,
        matricula: operador.matricula,
        modeloVersao: MODELO.versao,
        itens: MODELO.itens,
        respostas: resp,
        resultado,
        apto,
        observacao: obsGeral.trim().slice(0, OBS_MAX),
        criadoUid: uid,
        fotos: fotos.length,
      },
      fotos,
    );
    // sem internet o lote fica guardado no aparelho; a sessão do operador só é encerrada
    // quando a nuvem recebe (senão o envio ficaria preso à conta dele)
    const r = await Promise.race([envio.then(() => 'ok' as const), new Promise<'pendente'>((ok) => setTimeout(() => ok('pendente'), 6000))]).catch(() => 'erro' as const);
    if (r === 'erro') {
      setEnviando(false);
      return toast('A nuvem recusou o checklist (operador inativo ou treinamento vencido?).', 'danger');
    }
    envio
      .then(() => api.authMod.signOut(api.auth))
      .catch(() => toast('A nuvem recusou o checklist enviado deste aparelho. Procure a liderança.', 'danger'));
    onEnviado(r);
  };

  return (
    <div className="stack">
      <section className="card pad stack">
        <div className="row between">
          <div>
            <div className="small muted">
              {MODELO.versao.replace(' rev.', ' · Rev. ')} · {AREA} · {hojeBr(hoje)}
            </div>
            <h2>{MODELO.titulo}</h2>
          </div>
          <button className="link small" onClick={() => void sair()}>
            Sair
          </button>
        </div>
        <p className="small">
          Operador: <b>{operador.nome}</b> · Matrícula {operador.matricula}
        </p>
        {sit.s !== 'ok' && <p className={'banner small ' + (sit.s === 'vencido' ? 'danger' : 'warn')}>{textoTreinamento(operador, hoje)}</p>}
      </section>

      {grupos.map((g) => (
        <section key={g} className="card pad stack">
          <h3>{g}</h3>
          {MODELO.itens
            .filter((i) => i.grupo === g)
            .map((i) => {
              const r = resp[i.id];
              return (
                <div key={i.id} className={'ponte-item' + (r?.r === 'NC' ? ' nc' : '')}>
                  <div>
                    {i.texto}
                    {i.bloqueia && <span className="badge danger ponte-crit">crítico</span>}
                    {i.ajuda && <div className="small muted">{i.ajuda}</div>}
                  </div>
                  <div className="segmented" role="radiogroup" aria-label={i.texto}>
                    {RESPOSTAS.map((x) => (
                      <button key={x.id} type="button" role="radio" aria-checked={r?.r === x.id} className={'seg' + (r?.r === x.id ? ' on' : '') + ' r-' + x.id} onClick={() => marcar(i.id, x.id)}>
                        {x.nome}
                      </button>
                    ))}
                  </div>
                  {r?.r === 'NC' && (
                    <div className="stack">
                      <input className="input" placeholder="Descreva o que não atende" aria-label={`Problema: ${i.texto}`} maxLength={OBS_MAX} value={r.obs} onChange={(e) => obs(i.id, e.target.value)} />
                      <label className="btn small ponte-foto-btn">
                        📷 Foto ({fotos.filter((f) => f.itemId === i.id).length})
                        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void anexar(i.id, e.target.files?.[0])} />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
        </section>
      ))}

      <section className="card pad stack">
        <p className="small muted">Legenda: S – Atende ao item · N – Não atende ao item · NA – Não aplicável. Itens “crítico” com N interditam a ponte.</p>
        <div className="ponte-item">
          <b>{PERGUNTA_FINAL}</b>
          <div className="segmented" role="radiogroup" aria-label="Pergunta final">
            <button type="button" role="radio" aria-checked={apto === true} className={'seg r-C' + (apto === true ? ' on' : '')} onClick={() => setApto(true)}>
              Sim, pode operar
            </button>
            <button type="button" role="radio" aria-checked={apto === false} className={'seg r-NC' + (apto === false ? ' on' : '')} onClick={() => setApto(false)}>
              Não — interditar
            </button>
          </div>
          {criticos.length > 0 && apto !== false && <p className="banner danger small">Item crítico com N: {criticos.map((i) => i.texto.split('.')[0]).join(', ')}. A ponte não pode operar.</p>}
        </div>
        <label className="field">
          {apto === false ? 'Relatório para a supervisão (obrigatório)' : 'Observações (opcional)'}
          <textarea className="input" rows={3} maxLength={OBS_MAX} value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} />
        </label>
        <div className={'ponte-resultado ' + resultado}>
          {falta.length ? `Faltam ${falta.length} item(ns)` : apto === null && resultado === 'liberada' ? 'Responda a pergunta final' : resultado === 'bloqueada' ? '⛔ Resultado: ponte INTERDITADA' : '✓ Resultado: ponte liberada'}
        </div>
        <button className="btn primary" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar checklist'}
        </button>
      </section>
    </div>
  );
}

const hojeBr = (iso: string) => iso.split('-').reverse().join('/');

function Enviado({ estado }: { estado: 'ok' | 'pendente' }) {
  const { pendente } = usePonte();
  useEffect(() => {
    if (estado === 'ok') {
      const t = setTimeout(() => irPara('#/'), 2500);
      return () => clearTimeout(t);
    }
  }, [estado]);
  return (
    <section className="card pad stack">
      {estado === 'ok' || !pendente ? (
        <h2>✓ Checklist enviado</h2>
      ) : (
        <>
          <h2>Checklist salvo no aparelho</h2>
          <p>Sem conexão agora: ele será enviado automaticamente quando a internet voltar. Não feche a sessão até aparecer no painel.</p>
        </>
      )}
      <button className="btn" onClick={() => irPara('#/')}>
        Ir para o painel
      </button>
    </section>
  );
}
