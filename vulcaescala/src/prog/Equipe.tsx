import { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useProg } from './context';
import { gravarPapeis, ouvirPapeis } from './data';
import { PAPEIS_VAZIOS, completarPapeis, type Papeis } from './model';

const GRUPOS: { k: keyof Papeis; nome: string; faz: string }[] = [
  { k: 'programadores', nome: 'Programadores', faz: 'Montam e alteram a programação, respondem solicitações, confirmam paradas e dão a baixa das OMs no SAP.' },
  { k: 'supervisores', nome: 'Supervisores', faz: 'Marcam o retorno das OMs: realizada ou pendente.' },
  { k: 'admins', nome: 'Administradores', faz: 'Tudo, mais o cadastro desta tela.' },
];

/** Cadastro da equipe da Gestão (só administradores). As regras do Firestore usam esta lista. */
export function Equipe() {
  const { api, pode } = useProg();
  const toast = useToast();
  const [p, setP] = useState<Papeis | null>(null);
  const [novo, setNovo] = useState<Record<keyof Papeis, string>>({ admins: '', programadores: '', supervisores: '' });
  useEffect(() => ouvirPapeis(api, setP), [api]);
  if (!pode.administrar) return <p className="muted">Só administradores cadastram a equipe.</p>;
  const atual = p ?? PAPEIS_VAZIOS;

  const salvar = (x: Papeis) => {
    const limpo = completarPapeis(x);
    setP(limpo);
    gravarPapeis(api, limpo).catch(() => toast('A nuvem recusou. Confira se as regras do Firestore foram publicadas.', 'danger'));
    toast('Equipe atualizada');
  };
  const incluir = (k: keyof Papeis) => {
    const e = novo[k].trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast('Digite um e-mail válido.', 'warn');
    if (atual[k].includes(e)) return toast('Este e-mail já está na lista.', 'warn');
    salvar({ ...atual, [k]: [...atual[k], e] });
    setNovo((n) => ({ ...n, [k]: '' }));
  };

  return (
    <div className="stack prog">
      <section className="card pad stack">
        <h2>Equipe e papéis</h2>
        <div className="banner info small">
          <b>Como incluir uma pessoa:</b> 1) crie a conta dela no Console do Firebase (Authentication → Usuários → Adicionar usuário, com e-mail e
          senha); 2) inclua o e-mail aqui no papel certo. Os administradores da Escala já são administradores aqui. Uma pessoa pode ter mais de um
          papel.
        </div>
      </section>
      {GRUPOS.map((g) => (
        <section key={g.k} className="card pad stack">
          <h3>{g.nome}</h3>
          <p className="small muted">{g.faz}</p>
          {atual[g.k].length === 0 ? (
            <p className="small muted">Ninguém cadastrado.</p>
          ) : (
            <ul className="plain-list equipe-lista">
              {atual[g.k].map((e) => (
                <li key={e} className="row between nowrap">
                  <span className="equipe-email">{e}</span>
                  <button className="icon-btn" aria-label={`Remover ${e} de ${g.nome}`} onClick={() => salvar({ ...atual, [g.k]: atual[g.k].filter((x) => x !== e) })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row nowrap">
            <input
              className="input grow"
              type="email"
              placeholder="e-mail@benetechbrasil.com.br"
              value={novo[g.k]}
              onChange={(ev) => setNovo((n) => ({ ...n, [g.k]: ev.target.value }))}
              onKeyDown={(ev) => ev.key === 'Enter' && incluir(g.k)}
              aria-label={`Novo e-mail em ${g.nome}`}
            />
            <button className="btn" onClick={() => incluir(g.k)} disabled={!novo[g.k].trim()}>
              Incluir
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
