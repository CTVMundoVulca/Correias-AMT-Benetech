import { partesDoNome } from '../integracao/progEscala';

/** Nome da atividade em duas linhas: "M-11 - PÁTIO DE MINÉRIO" em cima, a descrição embaixo. */
export function NomeAtividade({ nome }: { nome: string }) {
  const { cabecalho, descricao } = partesDoNome(nome);
  if (!cabecalho) return <>{nome}</>;
  return (
    <>
      <span className="activity-equip">{cabecalho}</span>
      <span className="activity-desc">{descricao}</span>
    </>
  );
}
