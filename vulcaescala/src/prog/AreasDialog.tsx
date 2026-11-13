import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { gravarAreas } from './data';
import { AREA_MAX, CONTATO_MAX, limparTexto, maiusculas, type Area } from './model';

/**
 * Lista de áreas solicitantes (as listas suspensas do app) e com quem falar em cada uma.
 * Quem programa edita: renomear, incluir, remover, reordenar e o contato.
 */
export function AreasDialog({ onClose }: { onClose: () => void }) {
  const { api, areas } = useProg();
  const toast = useToast();
  const [l, setL] = useState<Area[]>(areas.map((a) => ({ ...a })));
  const [nova, setNova] = useState('');
  const [salvando, setSalvando] = useState(false);

  const alterar = (i: number, campo: keyof Area, v: string) => setL((x) => x.map((y, j) => (j === i ? { ...y, [campo]: v } : y)));
  const mover = (i: number, d: -1 | 1) =>
    setL((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const c = [...x];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const incluir = () => {
    const n = maiusculas(nova, AREA_MAX);
    if (!n) return;
    if (l.some((a) => maiusculas(a.nome, AREA_MAX) === n)) return toast('Esta área já está na lista.', 'warn');
    setL((x) => [...x, { nome: n, contato: '' }]);
    setNova('');
  };

  const salvar = async () => {
    const vistos = new Set<string>();
    const lista = l
      .map((a) => ({ nome: maiusculas(a.nome, AREA_MAX), contato: limparTexto(a.contato, CONTATO_MAX) }))
      .filter((a) => a.nome && !vistos.has(a.nome) && vistos.add(a.nome));
    if (!lista.length) return toast('Mantenha ao menos uma área.', 'warn');
    setSalvando(true);
    const envio = gravarAreas(api, lista);
    try {
      // sinal fraco: o Firestore guarda a alteração no aparelho e envia quando a conexão voltar;
      // não prende a tela esperando o servidor
      const r = await Promise.race([envio.then(() => 'ok' as const), new Promise<'pendente'>((ok) => setTimeout(() => ok('pendente'), 5000))]);
      if (r === 'pendente') envio.catch(() => toast('A nuvem recusou a lista de áreas. Confira se você tem o papel de programador.', 'danger'));
      toast(r === 'ok' ? 'Lista de áreas salva' : 'Lista salva no aparelho: será enviada quando a conexão voltar');
      onClose();
    } catch {
      toast('Não foi possível salvar. Confira a conexão e se você tem o papel de programador.', 'danger');
      setSalvando(false);
    }
  };

  return (
    <Modal
      title="Áreas e contatos"
      subtitle="Esta lista alimenta as listas suspensas de área do app. O contato aparece no painel para quem precisa pedir a liberação do efetivo."
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
      <div className="row between nowrap">
        <span className="small muted">{l.length} área(s)</span>
        <button type="button" className="btn small" onClick={() => setL((x) => [...x].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))}>
          Ordenar A–Z
        </button>
      </div>
      <ul className="plain-list areas-ed">
        {l.map((a, i) => (
          <li key={i} className="area-ed">
            <div className="area-ed-campos">
              <input className="input" value={a.nome} maxLength={AREA_MAX} placeholder="Nome da área" aria-label="Nome da área" onChange={(e) => alterar(i, 'nome', e.target.value)} />
              <input
                className="input"
                value={a.contato}
                maxLength={CONTATO_MAX}
                placeholder="Contato (nome, ramal)"
                aria-label={`Contato da área ${a.nome}`}
                onChange={(e) => alterar(i, 'contato', e.target.value)}
              />
            </div>
            <div className="area-ed-acoes">
              <button type="button" className="icon-btn" aria-label={`Subir ${a.nome}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                ↑
              </button>
              <button type="button" className="icon-btn" aria-label={`Descer ${a.nome}`} disabled={i === l.length - 1} onClick={() => mover(i, 1)}>
                ↓
              </button>
              <button type="button" className="icon-btn" aria-label={`Remover ${a.nome}`} onClick={() => setL((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row nowrap section-gap">
        <input
          className="input grow"
          value={nova}
          maxLength={AREA_MAX}
          placeholder="Nova área"
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              incluir();
            }
          }}
        />
        <button type="button" className="btn" disabled={!nova.trim()} onClick={incluir}>
          Adicionar
        </button>
      </div>
      <p className="small muted">
        Renomear ou remover uma área não altera as atividades, solicitações e paradas já lançadas com o nome antigo (o histórico fica preservado).
      </p>
    </Modal>
  );
}
