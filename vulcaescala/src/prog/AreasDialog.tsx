import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { gravarAreas } from './data';
import { AREA_MAX, CONTATO_MAX, limparTexto, maiusculas, type Area } from './model';

/** Áreas solicitantes e com quem falar em cada uma (aparece no painel). Administradores. */
export function AreasDialog({ onClose }: { onClose: () => void }) {
  const { api, areas } = useProg();
  const toast = useToast();
  const [l, setL] = useState<Area[]>(areas.map((a) => ({ ...a })));
  const [nova, setNova] = useState('');

  const salvar = () => {
    const vistos = new Set<string>();
    const lista = l
      .map((a) => ({ nome: maiusculas(a.nome, AREA_MAX), contato: limparTexto(a.contato, CONTATO_MAX) }))
      .filter((a) => a.nome && !vistos.has(a.nome) && vistos.add(a.nome));
    if (!lista.length) return toast('Mantenha ao menos uma área.', 'warn');
    gravarAreas(api, lista).catch(() => toast('Não foi possível salvar as áreas.', 'danger'));
    toast('Áreas salvas');
    onClose();
  };

  return (
    <Modal
      title="Áreas e contatos"
      subtitle="O contato aparece no painel para quem precisa pedir a liberação do efetivo."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={salvar}>
            Salvar
          </button>
        </>
      }
    >
      <ul className="plain-list stack">
        {l.map((a, i) => (
          <li key={i} className="area-edit">
            <input
              className="input"
              value={a.nome}
              maxLength={AREA_MAX}
              aria-label="Nome da área"
              onChange={(e) => setL((x) => x.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))}
            />
            <input
              className="input"
              value={a.contato}
              maxLength={CONTATO_MAX}
              placeholder="Contato (nome, ramal)"
              aria-label={`Contato da área ${a.nome}`}
              onChange={(e) => setL((x) => x.map((y, j) => (j === i ? { ...y, contato: e.target.value } : y)))}
            />
            <button className="icon-btn" aria-label={`Remover ${a.nome}`} onClick={() => setL((x) => x.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row nowrap section-gap">
        <input className="input grow" value={nova} maxLength={AREA_MAX} placeholder="Nova área" onChange={(e) => setNova(e.target.value)} />
        <button
          className="btn"
          disabled={!nova.trim()}
          onClick={() => {
            setL((x) => [...x, { nome: maiusculas(nova, AREA_MAX), contato: '' }]);
            setNova('');
          }}
        >
          Adicionar
        </button>
      </div>
      <p className="small muted">Renomear uma área não altera as atividades já lançadas com o nome antigo.</p>
    </Modal>
  );
}
