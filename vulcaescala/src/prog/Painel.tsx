import { Fragment, useMemo, useState } from 'react';
import { MONTHS, WEEKDAYS, WEEKDAYS_SHORT, addDays, formatDate, fromIsoDate, isoWeekOf, locateDay, monthWeeks, toIsoDate } from '../domain/isoWeek';
import { feriadoEm } from '../domain/feriados';
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

/** Cor fixa de cada área (a mesma no calendário, na barra do dia e nos cartões). */
const CORES_AREA: [RegExp, string][] = [
  [/^P[AÁ]TIO DE MIN/, 'a1'],
  [/^COQUERIA/, 'a2'],
  [/^SINTER/, 'a3'],
  [/^URCP/, 'a4'],
  [/^P[AÁ]TIO DE CARV/, 'a5'],
  [/^ACIARIA/, 'a6'],
  [/^ALTO FORNO/, 'a7'],
  [/^INTERNO/, 'a8'],
];
export const corDaArea = (area: string) => CORES_AREA.find(([r]) => r.test(area))?.[1] ?? 'a0';

interface Fatia {
  area: string;
  pessoas: number;
  ativs: number;
}
/** Áreas do dia (sem canceladas), mais pessoas primeiro. */
function fatiasDoDia(lista: Atividade[]): Fatia[] {
  const m = new Map<string, Fatia>();
  for (const a of lista) {
    if (a.classe === 'cancelada') continue;
    const k = a.area || AREA_INTERNA;
    const f = m.get(k) ?? { area: k, pessoas: 0, ativs: 0 };
    f.pessoas += a.pessoas;
    f.ativs++;
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b.pessoas - a.pessoas || b.ativs - a.ativs);
}

/** Barra empilhada por área; sem nº de pessoas, cada atividade vale 1 (só para dar forma). */
function BarraAreas({ fatias, alta }: { fatias: Fatia[]; alta?: boolean }) {
  if (!fatias.length) return <span className={'barra-areas vazia' + (alta ? ' alta' : '')} />;
  const peso = (f: Fatia) => f.pessoas || f.ativs * 0.5;
  return (
    <span className={'barra-areas' + (alta ? ' alta' : '')} aria-hidden>
      {fatias.map((f) => (
        <span key={f.area} className={'seg-area ' + corDaArea(f.area)} style={{ flexGrow: peso(f) }} />
      ))}
    </span>
  );
}

const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/**
 * "Onde está a vulcanização": calendário do mês com as áreas de cada dia em cores; tocar no
 * dia mostra onde o efetivo está e com quem falar para pedir liberação de pessoas.
 */
export function Painel() {
  const { areas, feriados } = useProg();
  const [dia, setDia] = useState(hojeIso);
  const [mes, setMes] = useState(() => ({ y: Number(hojeIso().slice(0, 4)), m: Number(hojeIso().slice(5, 7)) - 1 }));
  const semanas = monthWeeks(mes.y, mes.m);
  const grade = semanas.flatMap((w) => w.days.map(toIsoDate));
  const semana = diasDaSemana(segundaDe(dia));
  const ini = [grade[0], semana[0]].sort()[0];
  const fim = [grade[grade.length - 1], semana[6]].sort()[1];
  const lista = useAtividades(mesesEntre(ini, fim));
  const contato = useMemo(() => new Map(areas.map((a) => [a.nome, a.contato])), [areas]);

  const porDia = useMemo(() => {
    const m = new Map<string, Atividade[]>();
    for (const a of lista ?? []) m.set(a.data, [...(m.get(a.data) ?? []), a]);
    return m;
  }, [lista]);
  const fatias = (d: string) => fatiasDoDia(porDia.get(d) ?? []);
  const r = useMemo(() => alocacaoDoDia(lista ?? [], dia), [lista, dia]);
  const doDia = fatias(dia);
  const hoje = hojeIso();

  const escolher = (d: string) => {
    setDia(d);
    setMes({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 });
  };
  const mudarMes = (n: number) => setMes(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  // áreas que aparecem no mês (legenda)
  const legenda = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const d of grade) for (const f of fatias(d)) if (!vistas.has(corDaArea(f.area))) vistas.set(corDaArea(f.area), corDaArea(f.area) === 'a0' ? 'Outras áreas' : f.area.replace(/ \d$/, ''));
    return [...vistas.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porDia, mes.y, mes.m]);

  // mapa de calor da semana: área × dia
  const calor = useMemo(() => {
    const m = new Map<string, number[]>();
    semana.forEach((d, i) => {
      for (const f of fatias(d)) {
        const l = m.get(f.area) ?? Array(7).fill(0);
        l[i] += f.pessoas;
        m.set(f.area, l);
      }
    });
    return [...m.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porDia, semana[0]]);
  const maxCalor = Math.max(1, ...calor.flatMap(([, l]) => l));

  return (
    <div className="stack prog">
      {/* ---------- calendário ---------- */}
      <section className="card pad cal-prog">
        <div className="row between nowrap">
          <button className="btn small" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            ‹
          </button>
          <h2 className="center">
            {MONTHS[mes.m]} <span className="num muted">{mes.y}</span>
          </h2>
          <button className="btn small" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            ›
          </button>
        </div>
        <div className="calp-grid" role="grid" aria-label={`Calendário de ${MONTHS[mes.m]}`}>
          <span className="calp-head calp-wk">Sem</span>
          {DOW.map((d, i) => (
            <span key={i} className={'calp-head' + (i >= 5 ? ' fds' : '')}>
              {d}
            </span>
          ))}
          {semanas.map((w) => (
            <Fragment key={w.weekKey}>
              <button className={'calp-wk' + (semana[0] === toIsoDate(w.days[0]) ? ' on' : '')} onClick={() => escolher(toIsoDate(w.days[0]))} aria-label={`Semana ${w.week}`}>
                {w.week}
              </button>
              {w.days.map((dd, i) => {
                const d = toIsoDate(dd);
                const fer = feriadoEm(feriados, d);
                const fs = fatias(d);
                const pes = fs.reduce((s, f) => s + f.pessoas, 0);
                const fora = dd.getUTCMonth() !== mes.m;
                return (
                  <button
                    key={d}
                    className={
                      'calp-dia' +
                      (fora ? ' fora' : '') +
                      (i >= 5 || fer ? ' fds' : '') +
                      (d === dia ? ' sel' : '') +
                      (d === hoje ? ' hoje' : '')
                    }
                    onClick={() => escolher(d)}
                    title={`${rotuloDia(d)}${fer ? ` · ${fer}` : ''}${fs.length ? ` · ${fs.map((f) => `${f.area} ${f.pessoas}`).join(', ')}` : ''}`}
                    aria-label={`${rotuloDia(d)}${fer ? `, feriado ${fer}` : ''}, ${pes} pessoas em ${fs.length} áreas`}
                  >
                    <span className="calp-num">{dd.getUTCDate()}</span>
                    {fer && <span className="calp-fer" aria-hidden />}
                    <BarraAreas fatias={fs} />
                    <span className="calp-pes num">{pes || (fs.length ? '·' : '')}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="row between calp-rodape">
          <ul className="legenda-areas">
            {legenda.map(([c, nome]) => (
              <li key={c}>
                <span className={'sw-area ' + c} /> {nome}
              </li>
            ))}
          </ul>
          {dia !== hoje && (
            <button className="btn small" onClick={() => escolher(hoje)}>
              Hoje
            </button>
          )}
        </div>
      </section>

      {/* ---------- o dia ---------- */}
      <section className="card pad dia-resumo">
        <div className="row between nowrap">
          <div>
            <h2>
              {rotuloDia(dia)} {dia === hoje && <span className="badge today">Hoje</span>}
            </h2>
            {feriadoEm(feriados, dia) && <div className="small muted">🎌 {feriadoEm(feriados, dia)}</div>}
          </div>
          <div className="dia-total" aria-label={`${r.pessoas} pessoas programadas`}>
            <b className="num">{lista === null ? '…' : r.pessoas}</b>
            <span>pessoas</span>
          </div>
        </div>
        {lista !== null && doDia.length === 0 && <p className="livre">✓ Efetivo livre — nada programado para este dia.</p>}
        {doDia.length > 0 && (
          <>
            <BarraAreas fatias={doDia} alta />
            <ul className="legenda-areas grande">
              {doDia.map((f) => (
                <li key={f.area}>
                  <span className={'sw-area ' + corDaArea(f.area)} /> {f.area} <b className="num">{f.pessoas || '—'}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {r.areas.map((g) => (
        <section key={g.area} className={'card area-cartao ' + corDaArea(g.area)}>
          <div className="row between nowrap area-topo">
            <h3>{g.area}</h3>
            <span className="area-pes" title="pessoas da vulcanização">
              👷 <b className="num">{g.pessoas || '—'}</b>
            </span>
          </div>
          {contato.get(g.area) && <p className="small area-contato">📞 Liberação: {contato.get(g.area)}</p>}
          <ul className="plain-list cartao-ativs">
            {g.atividades.map((a) => (
              <li key={a.id} className="cartao-ativ">
                <span className="tag-equip">{a.equipamento || '—'}</span>
                <span className="cartao-desc">{a.descricao}</span>
                <span className="cartao-meta">
                  {a.pessoas > 0 && <span>👷{a.pessoas}</span>}
                  {a.equipe === 'turno' && <span title="Equipe de turno">🌙</span>}
                  {a.horario && <span>🕐 {a.horario}</span>}
                  {a.classe === 'emergencia' && <span className="pill emerg">⚡ Emergência</span>}
                  {a.classe === 'nao_programada' && <span className="pill naoprog">⏱ Não programada</span>}
                  {a.retrabalho && <span className="pill retra">↺ Retrabalho</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {r.canceladas.length > 0 && (
        <section className="card pad">
          <h3 className="muted">✕ Canceladas neste dia</h3>
          <ul className="plain-list cartao-ativs">
            {r.canceladas.map((a) => (
              <li key={a.id} className="cartao-ativ cancelada">
                <span className="tag-equip">{a.equipamento || '—'}</span>
                <span className="cartao-desc">{a.descricao}</span>
                {a.motivo && <span className="cartao-meta small muted">{a.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.areas.length > 0 && (
        <p className="small muted center">Precisa da vulcanização neste dia? Combine a liberação com as áreas acima e registre em <a href="#/solicitar">Solicitar</a>.</p>
      )}

      {/* ---------- semana (mapa de calor) ---------- */}
      <section className="card pad">
        <h3>Semana {isoWeekOf(fromIsoDate(semana[0])!).week} — pessoas por área</h3>
        {calor.length === 0 ? (
          <p className="muted small">Nada programado nesta semana.</p>
        ) : (
          <div className="table-wrap">
            <table className="calor">
              <thead>
                <tr>
                  <th />
                  {semana.map((d, i) => (
                    <th key={d} className={d === dia ? 'sel' : ''}>
                      <button className="link" onClick={() => escolher(d)}>
                        {WEEKDAYS_SHORT[i]}
                        <br />
                        <span className="num">{d.slice(8)}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calor.map(([area, l]) => (
                  <tr key={area}>
                    <th className="calor-area" title={area}>
                      <span className={'sw-area ' + corDaArea(area)} /> {area}
                    </th>
                    {l.map((n, i) => (
                      <td key={i} className={corDaArea(area) + (semana[i] === dia ? ' sel' : '')}>
                        <span className="calor-cel" style={{ opacity: n ? 0.25 + 0.75 * (n / maxCalor) : 0 }} />
                        <span className="calor-n num">{n || ''}</span>
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
