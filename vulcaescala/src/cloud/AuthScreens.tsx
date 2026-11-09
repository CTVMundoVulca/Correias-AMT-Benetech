import { getLocalStorage } from '../storage/LocalStorageRepository';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { FirebaseApi } from './firebase';
import { authErrorMsg } from './authErrors';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-overlay">
      <div className="auth-wrap">
        <div className="auth-card">
          <img src="logo-benetech.png" alt="Benetech" className="logo-img" />
          {children}
        </div>
        <div className="auth-foot">
          <img src="logo-ctv.webp" alt="CTV — Confiabilidade não é acaso. É método." className="ctv-logo" width={640} height={220} />
          <br />
          Desenvolvido por CTV Consultoria Técnica em Vulcanização · CNPJ 65.601.481/0001-36 · © 2024-2026 — Todos os
          direitos reservados
          <br />
          Software protegido pela Lei nº 9.609/98 e Lei nº 9.610/98 · Autor: Glauber Dutra
        </div>
      </div>
    </div>
  );
}

function Title() {
  return (
    <>
      <div className="contract">Contrato AMT</div>
      <h1>Escala de Vulcanização</h1>
    </>
  );
}

/** Login por e-mail e senha — mesmo fluxo do Registro de Horários. */
export function AuthScreen({ api, onVoltar }: { api: FirebaseApi; onVoltar?: () => void }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ kind: 'erro' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { authMod, auth } = api;

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ kind: 'ok', text: okText });
    } catch (e) {
      setMsg({ kind: 'erro', text: authErrorMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const login = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pass) return setMsg({ kind: 'erro', text: 'Preencha e-mail e senha.' });
    void run(() => authMod.signInWithEmailAndPassword(auth, email.trim(), pass));
  };
  const register = () => {
    if (!email.trim() || pass.length < 6) return setMsg({ kind: 'erro', text: 'Informe e-mail e uma senha com pelo menos 6 caracteres.' });
    void run(async () => {
      const cred = await authMod.createUserWithEmailAndPassword(auth, email.trim(), pass);
      // a liderança só edita depois de confirmar o e-mail (link enviado agora)
      await authMod
        .sendEmailVerification(cred.user)
        .then(() => {
          // registra o envio: a tela de aviso não manda outro em seguida
          try {
            getLocalStorage()?.setItem(`vulcaescala:confirmacao:${cred.user.email}`, String(Date.now()));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    });
  };
  const reset = () => {
    if (!email.trim()) return setMsg({ kind: 'erro', text: 'Digite seu e-mail no campo acima para receber o link.' });
    void run(() => authMod.sendPasswordResetEmail(auth, email.trim()), 'Enviamos um link para redefinir a senha. Confira o e-mail (e a caixa de spam).');
  };

  return (
    <Shell>
      <Title />
      <p className="small muted">Entre com seu e-mail e senha. Acesso restrito à liderança.</p>
      <form className="stack" onSubmit={login}>
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="E-mail"
        />
        <input
          className="input"
          type="password"
          placeholder="Senha (mín. 6 caracteres)"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          aria-label="Senha"
        />
        {msg && (
          <p className={'small ' + (msg.kind === 'erro' ? 'text-danger' : 'text-ok')} role="alert">
            {msg.text}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          Entrar
        </button>
      </form>
      <button className="btn" onClick={register} disabled={busy}>
        Criar conta
      </button>
      <button className="link small" onClick={reset} disabled={busy}>
        Esqueci minha senha
      </button>
      {onVoltar && (
        <button className="link small" onClick={onVoltar} disabled={busy}>
          ‹ Só visualizar a escala
        </button>
      )}
    </Shell>
  );
}

interface Act {
  label: string;
  onClick: () => void;
}

export function Splash({ title, text, action, secondary }: { title?: string; text: string; action?: Act; secondary?: Act }) {
  return (
    <Shell>
      {title ? <h1>{title}</h1> : <Title />}
      <p className="small" role="status">
        {text}
      </p>
      {action && (
        <button className="btn primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {secondary && (
        <button className="link small" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      )}
    </Shell>
  );
}
