import { useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { criarContaSeparada } from '../cloud/firebase';
import { authErrorMsg } from '../cloud/authErrors';
import { newId } from '../domain/ids';
import { irPara, usePonte } from './context';
import { gravarOperador } from './data';
import {
  AVISO_DIAS,
  MATRICULA_MAX,
  NOME_MAX,
  PIN_TAM,
  dataBr,
  doDia,
  emailOperador,
  fimDoDiaBrasilia,
  limpar,
  nomeMaiusculo,
  ordenarOperadores,
  pinValido,
  situacaoTreinamento,
  somaDias,
  textoTreinamento,
  type Operador,
} from './model';

type Edicao = { op: Operador | null; pin: boolean };

/** Gestão (administradores): operadores habilitados, validade do treinamento e PIN. */
export function Gestao() {
  const { api, admin, email, operadores, checklists, hoje } = usePonte();
  const [ed, setEd] = useState<Edicao | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const lista = useMemo(() => ordenarOperadores(operadores), [operadores]);
  const avisos = lista.filter((o) => o.ativo && situacaoTreinamento(o, hoje).s !== 'ok');
  const semChecklist = useMemo(() => (checklists ? Array.from({ length: 30 }, (_, i) => somaDias(hoje, -i - 1)).filter((d) => !doDia(checklists, d)) : []), [checklists, hoje]);

  const sair = () => void api.authMod.signOut(api.auth).then(() => irPara('#/'));
  if (!admin)
    return (
      <section className="card pad stack">
        <h2>Gestão da ponte rolante</h2>
        <p>
          A conta <b>{email}</b> não é de administrador. Só administradores cadastram operadores.
        </p>
        <div className="row">
          <button className="btn" onClick={() => irPara('#/')}>
            ‹ Painel
          </button>
          <button className="btn" onClick={sair}>
            Sair
          </button>
        </div>
      </section>
    );

  const ativar = async (o: Operador, ativo: boolean) => {
    if (!ativo) {
      const ok = await confirm({
        title: `Desativar ${o.nome}?`,
        message: <p>Ele deixa de aparecer em "Fazer inspeção". Os checklists já feitos continuam no histórico.</p>,
        confirmLabel: 'Desativar',
        danger: true,
      });
      if (!ok) return;
    }
    gravarOperador(api, { ...o, ativo, atualizadoEm: new Date().toISOString() }, email).catch(() => toast('A nuvem recusou a alteração.', 'danger'));
  };

  return (
    <div className="stack">
      <div className="row between">
        <button className="link small" onClick={() => irPara('#/')}>
          ‹ Painel
        </button>
        <button className="link small" onClick={sair}>
          Sair ({email})
        </button>
      </div>
      <section className="card pad stack">
        <div className="row between">
          <h2>Operadores habilitados</h2>
          <button className="btn primary" onClick={() => setEd({ op: null, pin: true })}>
            + Operador
          </button>
        </div>
        {avisos.length > 0 && (
          <div className="banner warn small">
            {avisos.map((o) => (
              <div key={o.id}>
                {situacaoTreinamento(o, hoje).s === 'vencido' ? '⛔' : '⚠'} <b>{o.nome}</b>: {textoTreinamento(o, hoje)}
              </div>
            ))}
          </div>
        )}
        <p className="small muted">Aviso começa {AVISO_DIAS} dias antes do vencimento. Com o treinamento vencido, o operador fica bloqueado (no app e na nuvem).</p>
        <ul className="plain-list ponte-ops">
          {lista.map((o) => {
            const s = situacaoTreinamento(o, hoje).s;
            return (
              <li key={o.id} className={'ponte-op ' + (o.ativo ? s : 'inativo')}>
                <div>
                  <b>{o.nome}</b> <span className="small muted">· Matrícula {o.matricula}</span>
                  {!o.ativo && <span className="badge neutral"> desativado</span>}
                </div>
                <div className={'small ' + (s === 'vencido' ? 'text-danger' : s === 'vence' ? 'text-pend' : 'muted')}>{textoTreinamento(o, hoje)}</div>
                <div className="row">
                  <button className="link small" onClick={() => setEd({ op: o, pin: false })}>
                    Editar / validade
                  </button>
                  <button className="link small" onClick={() => setEd({ op: o, pin: true })}>
                    Redefinir PIN
                  </button>
                  <button className="link small" onClick={() => void ativar(o, !o.ativo)}>
                    {o.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card pad stack">
        <h3>Dias sem checklist (últimos 30)</h3>
        <p className="small">{semChecklist.length ? semChecklist.map((d) => dataBr(d).slice(0, 5)).join(', ') : 'Nenhum: todos os dias têm checklist.'}</p>
        <p className="small muted">Dias sem uso da ponte também aparecem aqui.</p>
      </section>
      {ed && createPortal(<OperadorDialog ed={ed} onClose={() => setEd(null)} />, document.body)}
    </div>
  );
}

function OperadorDialog({ ed, onClose }: { ed: Edicao; onClose: () => void }) {
  const { api, email, operadores } = usePonte();
  const toast = useToast();
  const novo = !ed.op;
  const [nome, setNome] = useState(ed.op?.nome ?? '');
  const [matricula, setMatricula] = useState(ed.op?.matricula ?? '');
  const [validade, setValidade] = useState(ed.op?.validade ?? '');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    const n = nomeMaiusculo(nome);
    const m = limpar(matricula, MATRICULA_MAX);
    if (!ed.pin || novo) {
      if (!n) return setErro('Informe o nome completo.');
      if (!m) return setErro('Informe a matrícula.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validade)) return setErro('Informe a validade do treinamento.');
      if (operadores.some((o) => o.id !== ed.op?.id && o.matricula === m)) return setErro('Já existe um operador com esta matrícula.');
    }
    if (ed.pin) {
      if (!pinValido(pin)) return setErro(`O PIN precisa ter ${PIN_TAM} números.`);
      if (pin !== pin2) return setErro('Os dois PINs não conferem.');
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return setErro('PIN fácil demais (repetido ou em sequência). Escolha outro.');
    }
    setBusy(true);
    try {
      const base: Operador = ed.op ?? { id: newId(), nome: n, matricula: m, validade, validadeAte: 0, authEmail: '', ativo: true, atualizadoEm: '' };
      const op: Operador = ed.pin && !novo ? { ...base } : { ...base, nome: n, matricula: m, validade, validadeAte: fimDoDiaBrasilia(validade) };
      if (ed.pin) {
        // conta nova a cada PIN: o administrador não consegue trocar a senha de outra conta pelo app
        const em = emailOperador();
        await criarContaSeparada(em, pin);
        op.authEmail = em;
      }
      op.atualizadoEm = new Date().toISOString();
      await gravarOperador(api, op, email);
      toast(novo ? 'Operador cadastrado' : ed.pin ? 'PIN redefinido' : 'Operador atualizado');
      onClose();
    } catch (x) {
      setErro((x as { code?: string })?.code?.startsWith('auth/') ? authErrorMsg(x) : 'Não foi possível salvar. Confira a conexão e se você é administrador.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={novo ? 'Novo operador' : ed.pin ? `Redefinir PIN — ${ed.op?.nome}` : `Editar — ${ed.op?.nome}`}
      subtitle={ed.pin ? `O PIN (${PIN_TAM} números) é pessoal: o operador digita para assinar o checklist. Combine com ele; não fica visível depois.` : undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="ponte-op-form" className="btn primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="ponte-op-form" className="stack" onSubmit={(e) => void salvar(e)}>
        {(!ed.pin || novo) && (
          <>
            <label className="field">
              Nome completo
              <input className="input" maxLength={NOME_MAX} value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label className="field">
              Matrícula
              <input className="input" maxLength={MATRICULA_MAX} value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </label>
            <label className="field">
              Validade do treinamento
              <input className="input" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </label>
          </>
        )}
        {ed.pin && (
          <div className="row nowrap">
            <label className="field grow">
              PIN ({PIN_TAM} números)
              <input className="input ponte-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_TAM} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field grow">
              Repita o PIN
              <input className="input ponte-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={PIN_TAM} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
        )}
        {erro && (
          <p className="text-danger small" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
