import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { gravarMotivosCancelamento } from './data';
import { MOTIVO_MAX, limparTexto } from './model';

/**
 * Motivos de cancelamento (os botões do formulário da atividade). Quem programa edita:
 * renomear, incluir, remover e reordenar. As atividades já lançadas guardam o texto do
 * motivo, então mudar a lista não altera o histórico.
 */
export function MotivosDialog({ onClose }: { onClose: () => void }) {
  const { api, motivosCancelamento } = useProg();
  const toast = useToast();
  const [l, setL] = useState<string[]>([...motivosCancelamento]);
  const [novo, setNovo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mover = (i: number, d: -1 | 1) =>
    setL((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const c = [...x];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const chave = (m: string) => limparTexto(m, MOTIVO_MAX).toLocaleLowerCase('pt-BR');
  const incluir = () => {
    const n = limparTexto(novo, MOTIVO_MAX);
    if (!n) return;
    if (l.some((m) => chave(m) === chave(n))) return toast('Este motivo já está na lista.', 'warn');
    setL((x) => [...x, n]);
    setNovo('');
  };

  const salvar = async () => {
    const vistos = new Set<string>();
    const lista = l.map((m) => limparTexto(m, MOTIVO_MAX)).filter((m) => m && !vistos.has(chave(m)) && vistos.add(chave(m)));
    if (!lista.length) return toast('Mantenha ao menos um motivo.', 'warn');
    setSalvando(true);
    const envio = gravarMotivosCancelamento(api, lista);
    try {
      // sinal fraco: o Firestore guarda no aparelho e envia quando a conexão voltar
      const r = await Promise.race([envio.then(() => 'ok' as const), new Promise<'pendente'>((ok) => setTimeout(() => ok('pendente'), 5000))]);
      if (r === 'pendente') envio.catch(() => toast('A nuvem recusou a lista de motivos. Confira se você tem o papel de programador.', 'danger'));
      toast(r === 'ok' ? 'Motivos de cancelamento salvos' : 'Lista salva no aparelho: será enviada quando a conexão voltar');
      onClose();
    } catch {
      toast('Não foi possível salvar. Confira a conexão e se você tem o papel de programador.', 'danger');
      setSalvando(false);
    }
  };

  return (
    <Modal
      title="Motivos de cancelamento"
      subtitle="Os botões de motivo no formulário da atividade. As atividades já canceladas mantêm o motivo que foi gravado."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <span className="small muted">{l.length} motivo(s)</span>
      <ul className="plain-list areas-ed">
        {l.map((m, i) => (
          <li key={i} className="area-ed">
            <div className="area-ed-campos motivo-ed">
              <input
                className="input"
                value={m}
                maxLength={MOTIVO_MAX}
                placeholder="Motivo"
                aria-label={`Motivo ${i + 1}`}
                onChange={(e) => setL((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
              />
            </div>
            <div className="area-ed-acoes">
              <button type="button" className="icon-btn" aria-label={`Subir ${m}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                ↑
              </button>
              <button type="button" className="icon-btn" aria-label={`Descer ${m}`} disabled={i === l.length - 1} onClick={() => mover(i, 1)}>
                ↓
              </button>
              <button type="button" className="icon-btn" aria-label={`Remover ${m}`} onClick={() => setL((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row nowrap section-gap">
        <input
          className="input grow"
          value={novo}
          maxLength={MOTIVO_MAX}
          placeholder="Novo motivo"
          aria-label="Novo motivo"
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              incluir();
            }
          }}
        />
        <button type="button" className="btn" onClick={incluir}>
          Incluir
        </button>
      </div>
    </Modal>
  );
}
