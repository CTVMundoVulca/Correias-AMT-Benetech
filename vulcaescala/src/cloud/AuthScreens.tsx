import { useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
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
export function AuthScreen({ api }: { api: FirebaseApi }) {
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
      await authMod.sendEmailVerification(cred.user);
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
    </Shell>
  );
}

/** E-mail precisa ser confirmado: impede alguém de criar conta com o e-mail de um líder. */
export function VerifyScreen({
  api,
  user,
  onVerified,
  onLogout,
}: {
  api: FirebaseApi;
  user: User;
  onVerified: () => void;
  onLogout: () => void;
}) {
  const [msg, setMsg] = useState<{ kind: 'erro' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true); // atualiza a credencial para as regras do Firestore
        onVerified();
      } else setMsg({ kind: 'erro', text: 'Ainda não consta como confirmado. Abra o link do e-mail e tente de novo.' });
    } catch (e) {
      setMsg({ kind: 'erro', text: authErrorMsg(e) });
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    try {
      await api.authMod.sendEmailVerification(user);
      setMsg({ kind: 'ok', text: 'E-mail reenviado. Confira também a caixa de spam.' });
    } catch (e) {
      setMsg({ kind: 'erro', text: authErrorMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Title />
      <p className="small">
        Enviamos um link de confirmação para <b>{user.email}</b>. Abra o e-mail, toque no link e depois em “Já
        confirmei”.
      </p>
      {msg && (
        <p className={'small ' + (msg.kind === 'erro' ? 'text-danger' : 'text-ok')} role="alert">
          {msg.text}
        </p>
      )}
      <button className="btn primary" onClick={check} disabled={busy}>
        Já confirmei
      </button>
      <button className="btn" onClick={resend} disabled={busy}>
        Reenviar e-mail
      </button>
      <button className="link small" onClick={onLogout}>
        Sair
      </button>
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
