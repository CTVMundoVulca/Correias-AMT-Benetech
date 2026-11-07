import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { migrate } from '../../storage/migrations';
import { emptyState, type AppState } from '../../domain/types';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';
import { syncLabel } from '../../ui/Header';
import { markLegacyDone, readLegacy } from '../../cloud/legacy';
import { FeriadosCard } from './FeriadosCard';

export function DataView() {
  const { state, replaceAll, persistent, cloud } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const size = new Blob([JSON.stringify(state)]).size;
  const weeks = Object.keys(state.weeks).length;
  const canReplace = !cloud || cloud.isAdmin;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulcaescala-amt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup gerado');
  };

  const importJson = async (file: File) => {
    try {
      const data = migrate(JSON.parse(await file.text()));
      const ok = await confirm({
        title: 'Importar backup?',
        message: (
          <p>
            O arquivo tem <b className="num">{data.workers.length}</b> colaborador(es) e{' '}
            <b className="num">{Object.keys(data.weeks).length}</b> semana(s). Isso <b>substitui</b> todos os dados
            {cloud ? ' da nuvem, para todos os aparelhos' : ' deste aparelho'}.
          </p>
        ),
        confirmLabel: 'Importar',
        danger: true,
      });
      if (!ok) return;
      await replaceAll(data);
      toast('Backup importado');
    } catch (e) {
      toast(`Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`, 'danger');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: 'Apagar todos os dados?',
      message: <p>Isso apaga todo o efetivo e todas as escalas deste aparelho. Não há como desfazer.</p>,
      confirmLabel: 'Apagar tudo',
      danger: true,
      requireText: 'APAGAR',
    });
    if (!ok) return;
    await replaceAll(emptyState());
    toast('Dados apagados');
  };

  return (
    <section>
      {cloud && <AccountCard />}
      {cloud?.isAdmin && <MembersCard />}
      {cloud && <LegacyCard />}
      {(!cloud || cloud.info.status !== 'denied') && <FeriadosCard />}

      <div className="card pad stack">
        <h1>Dados</h1>
        {cloud ? (
          <p className="small muted">
            A escala fica na nuvem do contrato AMT e é compartilhada por todos os aparelhos da liderança. Este aparelho
            guarda uma cópia para funcionar sem internet.
          </p>
        ) : (
          <p className="small muted">
            {persistent ? (
              <>
                📴 <b>Modo local</b>: os dados ficam somente neste navegador, neste aparelho. Faça backup com
                frequência.
              </>
            ) : (
              <>Este navegador não está salvando os dados. Baixe um backup antes de fechar a página.</>
            )}
          </p>
        )}
        <p className="small tabnum">
          {state.workers.length} colaborador(es) · {weeks} semana(s) com dados · {(size / 1024).toFixed(1)} KB
        </p>
        <button className="btn primary" onClick={exportJson}>
          Baixar backup (.json)
        </button>
        {canReplace && (
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Importar backup…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
          </>
        )}
        {!cloud && (
          <button className="btn ghost-danger" onClick={clearAll}>
            Apagar todos os dados
          </button>
        )}
        {cloud && !cloud.isAdmin && <p className="small muted">Importar backup é restrito aos administradores.</p>}
      </div>
    </section>
  );
}

function AccountCard() {
  const { cloud } = useStore();
  if (!cloud) return null;
  const s = syncLabel(cloud.info);
  return (
    <div className="card pad stack">
      <h2>Conta</h2>
      <p className="small">
        <b>{cloud.email}</b>
        {cloud.isAdmin && <span className="badge neutral"> administrador</span>}
      </p>
      <p className="small row">
        <span className={`sync-dot ${s.cls}`} aria-hidden /> {s.long}
      </p>
      {cloud.info.pending > 0 && (
        <button className="btn" onClick={cloud.retry}>
          Enviar agora
        </button>
      )}
      <button className="btn ghost-danger" onClick={cloud.logout}>
        Sair da conta
      </button>
    </div>
  );
}

/** Lista de e-mails da liderança com acesso (somente administradores editam). */
function MembersCard() {
  const { cloud } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [novo, setNovo] = useState('');
  const [busy, setBusy] = useState(false);
  if (!cloud) return null;
  const membros = cloud.info.membros ?? [];

  const save = async (emails: string[], ok: string) => {
    setBusy(true);
    try {
      await cloud.setMembros(emails);
      toast(ok);
      return true;
    } catch (e) {
      toast(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`, 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const em = novo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast('E-mail inválido', 'warn');
    if (membros.includes(em)) return toast('E-mail já liberado', 'warn');
    if (await save([...membros, em], 'Acesso liberado')) setNovo('');
  };

  const remove = async (em: string) => {
    const ok = await confirm({
      title: 'Retirar acesso?',
      message: (
        <p>
          <b>{em}</b> deixará de ver e lançar a escala.
        </p>
      ),
      confirmLabel: 'Retirar',
      danger: true,
    });
    if (ok) await save(membros.filter((m) => m !== em), 'Acesso retirado');
  };

  return (
    <div className="card pad stack">
      <h2>Acesso da liderança</h2>
      <p className="small muted">
        Só os e-mails abaixo (e os administradores) veem e lançam a escala. Depois de liberar, a pessoa toca em “Criar
        conta” na tela de entrada com o mesmo e-mail — faça isso logo, para ninguém criar a conta antes dela.
        Administradores são definidos nas regras do Firestore (console do Firebase).
      </p>
      <form className="row nowrap" onSubmit={add}>
        <input
          className="input grow"
          type="email"
          placeholder="email@empresa.com"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          aria-label="E-mail para liberar"
        />
        <button className="btn primary" type="submit" disabled={busy || !novo.trim()}>
          Liberar
        </button>
      </form>
      <ul className="plain-list member-list">
        {membros.map((em) => (
          <li key={em}>
            <span className="small">{em}</span>
            <button className="btn small ghost-danger" onClick={() => remove(em)} disabled={busy}>
              Retirar
            </button>
          </li>
        ))}
      </ul>
      {cloud.info.membros === null && <p className="small muted">Carregando lista…</p>}
    </div>
  );
}

/** Dados do modo local (antes da nuvem) que ainda não foram enviados. */
function LegacyCard() {
  const { cloud, replaceAll } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [legacy, setLegacy] = useState<AppState | null>(null);
  useEffect(() => {
    void readLegacy().then(setLegacy);
  }, []);
  if (!cloud || !legacy) return null;

  const send = async () => {
    const ok = await confirm({
      title: 'Enviar dados deste aparelho?',
      message: <p>Os dados da nuvem serão substituídos pelos deste aparelho, para todos.</p>,
      confirmLabel: 'Enviar e substituir',
      danger: true,
    });
    if (!ok) return;
    try {
      await replaceAll(legacy);
      markLegacyDone();
      setLegacy(null);
      toast('Dados enviados para a nuvem');
    } catch (e) {
      toast(`Falha ao enviar: ${e instanceof Error ? e.message : String(e)}`, 'danger');
    }
  };
  const discard = async () => {
    const ok = await confirm({
      title: 'Ignorar dados antigos?',
      message: <p>O aviso some. Os dados continuam guardados neste navegador, mas não serão enviados.</p>,
      confirmLabel: 'Ignorar',
    });
    if (!ok) return;
    markLegacyDone();
    setLegacy(null);
  };

  return (
    <div className="banner warn stack">
      <b>Dados antigos neste aparelho</b>
      <span className="small">
        Este aparelho tem uma escala feita no modo local ({legacy.workers.length} colaborador(es),{' '}
        {Object.keys(legacy.weeks).length} semana(s)) que não está na nuvem.
      </span>
      {cloud.isAdmin ? (
        <div className="row">
          <button className="btn small primary" onClick={send}>
            Enviar e substituir a nuvem
          </button>
          <button className="btn small" onClick={discard}>
            Ignorar
          </button>
        </div>
      ) : (
        <span className="small">Peça a um administrador para decidir. Baixe um backup para não perder.</span>
      )}
    </div>
  );
}
