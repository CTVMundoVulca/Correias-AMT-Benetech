import { useEffect, useRef, useState } from 'react';
import { newId } from '../domain/ids';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useEmenda } from './context';
import { comprimirFoto, excluirFoto, gravarFoto, legendaFoto, ouvirFotos } from './data';
import { FOTO_LEGENDAS, legendaSugerida, type Foto } from './model';

/** Registro fotográfico: cada foto é comprimida no aparelho e gravada à parte. */
export function FotosSection({ emendaId }: { emendaId: string }) {
  const { api } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [ver, setVer] = useState<Foto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => ouvirFotos(api, emendaId, setFotos, () => setFotos([])), [api, emendaId]);

  const adicionar = async (files: FileList | null) => {
    if (!files?.length) return;
    setOcupado(true);
    try {
      let ordem = fotos.reduce((m, f) => Math.max(m, f.ordem), -1) + 1;
      for (const file of Array.from(files)) {
        const data = await comprimirFoto(file);
        // sem internet a foto fica no aparelho e é enviada depois
        void gravarFoto(api, emendaId, { id: newId(), ordem, legenda: legendaSugerida(ordem), data, criadoEm: new Date().toISOString() }).catch(() =>
          toast('A nuvem recusou a foto.', 'danger'),
        );
        ordem++;
      }
      toast(files.length > 1 ? `${files.length} fotos adicionadas` : 'Foto adicionada');
    } catch {
      toast('Não foi possível ler a foto.', 'danger');
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  };

  const remover = async (f: Foto) => {
    const ok = await confirm({ title: 'Remover foto?', message: <p>{f.legenda}</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    void excluirFoto(api, emendaId, f.id).catch(() => toast('Não foi possível remover.', 'danger'));
    setVer(null);
  };

  return (
    <>
      <div className="foto-grid">
        {fotos.map((f) => (
          <figure key={f.id} className="foto">
            <button className="foto-img" onClick={() => setVer(f)} aria-label={`Ampliar foto: ${f.legenda}`}>
              <img src={f.data} alt={f.legenda} loading="lazy" />
            </button>
            <select
              className="input"
              value={f.legenda}
              aria-label="Legenda da foto"
              onChange={(e) => void legendaFoto(api, emendaId, f.id, e.target.value)}
            >
              {!FOTO_LEGENDAS.includes(f.legenda) && <option>{f.legenda}</option>}
              {FOTO_LEGENDAS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </figure>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void adicionar(e.target.files)} />
      <button className="btn" onClick={() => input.current?.click()} disabled={ocupado}>
        {ocupado ? 'Processando…' : '📷 Adicionar foto'}
      </button>
      {ver && (
        <Modal
          title={ver.legenda}
          onClose={() => setVer(null)}
          footer={
            <>
              <button className="btn ghost-danger" onClick={() => remover(ver)}>
                Remover
              </button>
              <a className="btn" href={ver.data} download={`emenda-foto-${ver.ordem + 1}.jpg`}>
                Baixar
              </a>
              <button className="btn primary" onClick={() => setVer(null)}>
                Fechar
              </button>
            </>
          }
        >
          <img src={ver.data} alt={ver.legenda} className="foto-grande" />
        </Modal>
      )}
    </>
  );
}
