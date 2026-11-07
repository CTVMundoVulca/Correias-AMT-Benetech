import { useRef } from 'react';
import { useStore } from '../../state/store';
import { migrate } from '../../storage/migrations';
import { emptyState } from '../../domain/types';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';

export function DataView() {
  const { state, replaceAll, persistent } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const size = new Blob([JSON.stringify(state)]).size;
  const weeks = Object.keys(state.weeks).length;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulcaescala-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
            <b className="num">{Object.keys(data.weeks).length}</b> semana(s). Isso <b>substitui</b> todos os dados atuais
            deste aparelho.
          </p>
        ),
        confirmLabel: 'Importar',
        danger: true,
      });
      if (!ok) return;
      replaceAll(data);
      toast('Backup importado');
    } catch (e) {
      toast(`Arquivo inválido: ${e instanceof Error ? e.message : String(e)}`, 'danger');
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
    replaceAll(emptyState());
    toast('Dados apagados');
  };

  return (
    <section className="card pad stack">
      <h1>Dados</h1>
      <p className="small muted">
        {persistent ? (
          <>
            Os dados ficam salvos <b>somente neste navegador, neste aparelho</b>. Limpar os dados do navegador apaga a
            escala. Faça backup com frequência e use-o para levar a escala para outro aparelho.
          </>
        ) : (
          <>Este navegador não está salvando os dados. Baixe um backup antes de fechar a página.</>
        )}
      </p>
      <p className="small tabnum">
        {state.workers.length} colaborador(es) · {weeks} semana(s) com dados · {(size / 1024).toFixed(1)} KB
      </p>
      <button className="btn primary" onClick={exportJson}>
        Baixar backup (.json)
      </button>
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
      <button className="btn ghost-danger" onClick={clearAll}>
        Apagar todos os dados
      </button>
    </section>
  );
}
