import { useEffect, useRef, useState } from 'react';
import { newId } from '../domain/ids';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useEmenda } from './context';
import { comprimirFoto, excluirFoto, gravarFoto, legendaFoto, ouvirFotos } from './data';
import { FOTO_CAMPOS, legendaSugerida, type Foto } from './model';

/**
 * Registro fotográfico no formato do app do Suzano: campos numerados com a descrição
 * embaixo, para guiar qual foto vai em cada um. O campo vazio abre a câmera/galeria; com
 * foto, a descrição embaixo pode ser editada. "+ Adicionar mais fotos" cria campos extras.
 * Cada campo é a posição (ordem) da foto; cada foto é comprimida e gravada à parte.
 */
export function FotosSection({ emendaId, antesDeGravar }: { emendaId: string; antesDeGravar?: () => void }) {
  const { api } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [ver, setVer] = useState<Foto | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [extras, setExtras] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const alvo = useRef(0);

  useEffect(() => ouvirFotos(api, emendaId, setFotos, () => setFotos([])), [api, emendaId]);

  const porCampo = new Map(fotos.map((f) => [f.ordem, f]));
  const maior = fotos.reduce((m, f) => Math.max(m, f.ordem), -1);
  const total = Math.max(FOTO_CAMPOS.length, maior + 1) + extras;
  const campos = Array.from({ length: total }, (_, i) => i);

  const escolher = (i: number) => {
    alvo.current = i;
    input.current?.click();
  };

  const adicionar = async (file: File | undefined) => {
    if (!file) return;
    const ordem = alvo.current;
    setOcupado(ordem);
    antesDeGravar?.();
    try {
      const data = await comprimirFoto(file);
      // sem internet a foto fica no aparelho e é enviada depois
      void gravarFoto(api, emendaId, { id: newId(), ordem, legenda: legendaSugerida(ordem), data, criadoEm: new Date().toISOString() }).catch(() =>
        toast('A nuvem recusou a foto.', 'danger'),
      );
      toast('Foto adicionada');
    } catch {
      toast('Não foi possível ler a foto.', 'danger');
    } finally {
      setOcupado(null);
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
        {campos.map((i) => {
          const f = porCampo.get(i);
          return (
            <figure key={i} className={'foto' + (f ? ' com-foto' : '')}>
              {f ? (
                <button className="foto-img" onClick={() => setVer(f)} aria-label={`Ampliar foto ${i + 1}: ${f.legenda}`}>
                  <img src={f.data} alt={f.legenda} loading="lazy" />
                </button>
              ) : (
                <button className="foto-slot" onClick={() => escolher(i)} disabled={ocupado !== null} aria-label={`Adicionar foto ${i + 1}: ${legendaSugerida(i)}`}>
                  <span className="foto-add" aria-hidden>
                    {ocupado === i ? '⏳' : '📷'}
                  </span>
                  <span className="small">Toque para adicionar</span>
                </button>
              )}
              {f ? (
                <LegendaEditavel
                  key={f.id + f.legenda}
                  numero={i + 1}
                  valor={f.legenda}
                  onSalvar={(v) => void legendaFoto(api, emendaId, f.id, v).catch(() => toast('Não foi possível salvar a descrição.', 'danger'))}
                />
              ) : (
                <figcaption className="foto-desc">
                  {i + 1}. {legendaSugerida(i)}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void adicionar(e.target.files?.[0])} />
      <button className="btn" onClick={() => setExtras((n) => n + 1)}>
        + Adicionar mais fotos
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

/** Descrição embaixo da foto: editável (grava ao sair do campo ou com Enter). */
function LegendaEditavel({ numero, valor, onSalvar }: { numero: number; valor: string; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const salvar = () => {
    const v = texto.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (v && v !== valor) onSalvar(v);
    else setTexto(valor);
  };
  return (
    <label className="foto-legenda">
      <span className="foto-num">{numero}.</span>
      <input
        className="input"
        value={texto}
        maxLength={60}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-label={`Descrição da foto ${numero}`}
      />
    </label>
  );
}
