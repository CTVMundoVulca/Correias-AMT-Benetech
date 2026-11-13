import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AreasDialog } from './AreasDialog';
import { useProg } from './context';

/**
 * Lista suspensa de áreas com o atalho "✏️ Editar lista" para quem programa
 * (abre o cadastro de áreas e contatos sem sair da tela).
 */
export function CampoArea({
  rotulo = 'Área',
  value,
  onChange,
  opcoes,
  vazio = 'Escolha…',
}: {
  rotulo?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  /** padrão: as áreas cadastradas */
  opcoes?: string[];
  vazio?: string;
}) {
  const { areas, pode } = useProg();
  const id = useId();
  const [editar, setEditar] = useState(false);
  const lista = opcoes ?? areas.map((a) => a.nome);
  return (
    <div className="field">
      <div className="field-cab">
        <label htmlFor={id}>{rotulo}</label>
        {pode.programar && (
          <button type="button" className="link-btn" onClick={() => setEditar(true)}>
            ✏️ Editar lista
          </button>
        )}
      </div>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{vazio}</option>
        {lista.map((n) => (
          <option key={n}>{n}</option>
        ))}
        {value && !lista.includes(value) && <option>{value}</option>}
      </select>
      {/* fora do <form> da tela: Enter/botões do cadastro não enviam o formulário de baixo */}
      {editar && createPortal(<AreasDialog onClose={() => setEditar(false)} />, document.body)}
    </div>
  );
}
