import { useState, type FormEvent } from 'react';
import { useStore } from '../../state/store';
import { useToast } from '../../ui/Toast';
import { useConfirm } from '../../ui/ConfirmDialog';
import { FERIADO_NOME_MAX, feriadosNacionais, isoValido } from '../../domain/feriados';
import { WEEKDAYS_SHORT, fromIsoDate } from '../../domain/isoWeek';

const fmt = (iso: string) => {
  const d = fromIsoDate(iso);
  return d ? `${WEEKDAYS_SHORT[(d.getUTCDay() + 6) % 7]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
};

/**
 * Feriados: nacionais calculados (como no Registro de Horários) e municipais de
 * Vitória cadastrados aqui. Nos feriados, quem não estiver em atividade fica de
 * folga automaticamente na escala.
 */
export function FeriadosCard() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const ano = new Date().getFullYear();
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  const [verNacionais, setVerNacionais] = useState(false);

  const municipais = Object.entries(state.feriados).sort(([a], [b]) => a.localeCompare(b));
  const nacionais = Object.entries({ ...feriadosNacionais(ano), ...feriadosNacionais(ano + 1) }).sort(([a], [b]) => a.localeCompare(b));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!isoValido(data) || !nome.trim()) return toast('Informe a data e o nome do feriado.', 'warn');
    dispatch({ type: 'feriado/set', data, nome });
    setData('');
    setNome('');
    toast('Feriado municipal cadastrado');
  };

  const remover = async (iso: string, n: string) => {
    const ok = await confirm({ title: 'Remover feriado?', message: <p>{`${n} — ${fmt(iso)}`}</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    dispatch({ type: 'feriado/set', data: iso, nome: null });
    toast('Feriado removido');
  };

  return (
    <div className="card pad stack">
      <h2>Feriados</h2>
      <p className="small muted">
        Nos feriados, quem não estiver em nenhuma atividade fica de <b>folga automaticamente</b> na escala (dá para alocar ou
        trocar por outra ausência). Os feriados nacionais já vêm marcados; cadastre aqui os municipais de Vitória.
      </p>
      <form className="stack" onSubmit={add}>
        <div className="two-cols">
          <label className="field">
            Data
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="field">
            Nome
            <input
              className="input"
              value={nome}
              maxLength={FERIADO_NOME_MAX}
              placeholder="Ex.: Aniversário de Vitória"
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={!data || !nome.trim()}>
          Cadastrar feriado municipal
        </button>
      </form>
      <h3>Municipais (Vitória)</h3>
      {municipais.length === 0 ? (
        <p className="small muted">Nenhum feriado municipal cadastrado.</p>
      ) : (
        <ul className="plain-list funcao-list">
          {municipais.map(([iso, n]) => (
            <li key={iso}>
              <span>
                <span className="num small">{fmt(iso)}</span> — {n}
              </span>
              <button className="btn small ghost-danger" onClick={() => remover(iso, n)} aria-label={`Remover ${n}`}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link small" onClick={() => setVerNacionais((v) => !v)} aria-expanded={verNacionais}>
        {verNacionais ? 'Ocultar' : 'Ver'} feriados nacionais de {ano} e {ano + 1}
      </button>
      {verNacionais && (
        <ul className="plain-list funcao-list">
          {nacionais.map(([iso, n]) => (
            <li key={iso}>
              <span>
                <span className="num small">{fmt(iso)}</span> — {n}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
