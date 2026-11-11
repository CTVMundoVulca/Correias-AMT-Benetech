import { useMemo, useState } from 'react';
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, formatDate, fromIsoDate, locateDay, toIsoDate } from '../domain/isoWeek';
import { useAtividades, useProg } from './context';
import { AREA_INTERNA, alocacaoDoDia, hojeIso, mesesEntre, nomeClasse, type Atividade } from './model';

/** Segunda-feira (AAAA-MM-DD) da semana da data. */
export function segundaDe(data: string): string {
  const d = fromIsoDate(data)!;
  return toIsoDate(addDays(d, -locateDay(d).dayIndex));
}
export const diasDaSemana = (segunda: string) => Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(fromIsoDate(segunda)!, i)));
export const rotuloDia = (data: string) => {
  const d = fromIsoDate(data)!;
  return `${WEEKDAYS[locateDay(d).dayIndex]}, ${formatDate(d)}`;
};
export const curtoDia = (data: string) => {
  const d = fromIsoDate(data)!;
  return `${WEEKDAYS_SHORT[locateDay(d).dayIndex]} ${formatDate(d).slice(0, 5)}`;
};

/**
 * "Onde está a vulcanização": para qualquer área consultar, dia a dia, em quais áreas o
 * efetivo está programado — e com quem falar para pedir a liberação de pessoas.
 */
export function Painel() {
  const { areas } = useProg();
  const [dia, setDia] = useState(hojeIso);
  const segunda = segundaDe(dia);
  const semana = diasDaSemana(segunda);
  const lista = useAtividades(mesesEntre(semana[0], semana[6]));
  const contato = useMemo(() => new Map(areas.map((a) => [a.nome, a.contato])), [areas]);
  const r = useMemo(() => alocacaoDoDia(lista ?? [], dia), [lista, dia]);
  const mudar = (n: number) => setDia(toIsoDate(addDays(fromIsoDate(dia)!, n)));

  // grade da semana: área × dia (pessoas)
  const grade = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const a of lista ?? []) {
      const i = semana.indexOf(a.data);
      if (i < 0 || a.classe === 'cancelada') continue;
      const k = a.area || AREA_INTERNA;
      const linha = m.get(k) ?? Array(7).fill(0);
      linha[i] += a.pessoas || 0;
      m.set(k, linha);
    }
    return [...m.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, segunda]);

  return (
    <div className="stack prog">
      <section className="card pad">
        <div className="row between nowrap">
          <button className="btn" onClick={() => mudar(-1)} aria-label="Dia anterior">
            ‹
          </button>
          <label className="grow center">
            <span className="sr-only">Dia</span>
            <input className="input center" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
          </label>
          <button className="btn" onClick={() => mudar(1)} aria-label="Próximo dia">
            ›
          </button>
        </div>
        <h2 className="painel-dia">
          {rotuloDia(dia)} {dia === hojeIso() && <span className="badge today">Hoje</span>}
        </h2>
        {lista === null ? (
          <p className="muted">Carregando…</p>
        ) : r.areas.length === 0 ? (
          <p className="muted">Nenhuma atividade programada para este dia: o efetivo da vulcanização não está comprometido com nenhuma área.</p>
        ) : (
          <p>
            Efetivo programado: <b className="num">{r.pessoas}</b> pessoa{r.pessoas === 1 ? '' : 's'} em{' '}
            <b className="num">{r.areas.length}</b> área{r.areas.length === 1 ? '' : 's'}.
          </p>
        )}
      </section>

      {r.areas.length > 0 && (
        <div className="banner info small">
          Precisa da vulcanização neste dia? O efetivo já está com as áreas abaixo: combine a liberação de pessoas com elas e
          depois registre o pedido em <a href="#/solicitar">Solicitar</a>.
        </div>
      )}

      {r.areas.map((g) => (
        <section key={g.area} className="card pad area-card">
          <div className="row between">
            <h3>{g.area}</h3>
            {g.pessoas > 0 ? (
              <span className="badge pessoas">
                👷 <span className="num">{g.pessoas}</span> pessoa{g.pessoas === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="badge neutral">nº de pessoas não informado</span>
            )}
          </div>
          {contato.get(g.area) && <p className="small muted">Contato para liberação: {contato.get(g.area)}</p>}
          <ul className="plain-list ativ-list">
            {g.atividades.map((a) => (
              <LinhaAtividade key={a.id} a={a} />
            ))}
          </ul>
        </section>
      ))}

      {r.canceladas.length > 0 && (
        <section className="card pad">
          <h3 className="muted">Canceladas neste dia</h3>
          <ul className="plain-list ativ-list">
            {r.canceladas.map((a) => (
              <LinhaAtividade key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}

      <section className="card pad">
        <h3>Semana — pessoas por área</h3>
        {grade.length === 0 ? (
          <p className="muted small">Nada programado nesta semana.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid-table semana-grade">
              <thead>
                <tr>
                  <th className="name-col">Área</th>
                  {semana.map((d) => (
                    <th key={d} className={d === dia ? 'sel' : ''}>
                      <button className="link" onClick={() => setDia(d)}>
                        {curtoDia(d)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grade.map(([area, l]) => (
                  <tr key={area}>
                    <td className="name-col" title={area}>
                      {area}
                    </td>
                    {l.map((n, i) => (
                      <td key={i} className={'cell' + (n ? ' on' : ' none') + (semana[i] === dia ? ' sel' : '')}>
                        {n || '·'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function LinhaAtividade({ a, onClick, mostrarArea }: { a: Atividade; onClick?: () => void; mostrarArea?: boolean }) {
  const corpo = (
    <>
      {mostrarArea && <div className="ativ-area small">{a.area || AREA_INTERNA}</div>}
      <div className="ativ-top">
        <b>{a.equipamento || '—'}</b>
        <span className="ativ-desc">{a.descricao}</span>
      </div>
      <div className="ativ-meta small muted">
        {a.pessoas > 0 && (
          <span>
            👷 {a.pessoas}
            {a.equipe === 'turno' ? ' (turno)' : ''}
          </span>
        )}
        {a.horario && <span>🕐 {a.horario}</span>}
        {a.om && <span className="num">OM {a.om}</span>}
        <span className={'classe ' + (a.classe || 'sem')}>{nomeClasse(a.classe)}</span>
        {a.retrabalho && <span className="classe retra">Retrabalho</span>}
        {a.classe === 'cancelada' && a.motivo && <span>Motivo: {a.motivo}</span>}
      </div>
      {a.recursos && <div className="small muted">Recursos: {a.recursos}</div>}
    </>
  );
  return (
    <li className={'ativ' + (a.classe === 'cancelada' ? ' cancelada' : '')}>
      {onClick ? (
        <button className="ativ-btn" onClick={onClick}>
          {corpo}
        </button>
      ) : (
        corpo
      )}
    </li>
  );
}
