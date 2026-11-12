import { Fragment, useMemo, useState } from 'react';
import { MONTHS, WEEKDAYS, WEEKDAYS_SHORT, addDays, formatDate, fromIsoDate, isoWeekOf, locateDay, monthWeeks, toIsoDate } from '../domain/isoWeek';
import { feriadoEm } from '../domain/feriados';
import { useAtividades, useParadas, useProg } from './context';
import { AREA_INTERNA, TIPOS_PARADA, alocacaoDoDia, hojeIso, mesesEntre, nomeClasse, paradasNoDia, type Atividade, type Parada } from './model';

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

export interface Fatia {
  area: string;
  pessoas: number;
  ativs: number;
}
/** Áreas do dia (sem canceladas), mais pessoas primeiro. */
export function fatiasDoDia(lista: Atividade[]): Fatia[] {
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

/** Barra empilhada por área; sem nº de pessoas, cada atividade pesa metade (só para dar forma). */
export function BarraAreas({ fatias, alta }: { fatias: Fatia[]; alta?: boolean }) {
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

const porDiaDe = (lista: Atividade[] | null) => {
  const m = new Map<string, Atividade[]>();
  for (const a of lista ?? []) m.set(a.data, [...(m.get(a.data) ?? []), a]);
  return m;
};

const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
export type Mes = { y: number; m: number };
export const mesDeIso = (d: string): Mes => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 });
/** Dias (AAAA-MM-DD) que aparecem na grade do mês. */
export const gradeDoMes = (mes: Mes) => monthWeeks(mes.y, mes.m).flatMap((w) => w.days.map(toIsoDate));

/** Calendário do mês: barrinha colorida das áreas em cada dia, paradas e feriados. */
export function CalendarioMes({
  mes,
  setMes,
  dia,
  onDia,
  lista,
  paradas,
  semana,
}: {
  mes: Mes;
  setMes: (m: Mes) => void;
  dia: string;
  onDia: (d: string) => void;
  lista: Atividade[] | null;
  paradas: Parada[];
  /** segunda-feira da semana em destaque */
  semana?: string;
}) {
  const { feriados } = useProg();
  const porDia = useMemo(() => porDiaDe(lista), [lista]);
  const semanas = monthWeeks(mes.y, mes.m);
  const hoje = hojeIso();
  const mudar = (n: number) => setMes({ y: mes.y + Math.floor((mes.m + n) / 12), m: (((mes.m + n) % 12) + 12) % 12 });

  const legenda = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const w of semanas)
      for (const dd of w.days)
        for (const f of fatiasDoDia(porDia.get(toIsoDate(dd)) ?? [])) {
          const c = corDaArea(f.area);
          if (!vistas.has(c)) vistas.set(c, c === 'a0' ? 'Outras áreas' : f.area.replace(/ \d$/, ''));
        }
    return [...vistas.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porDia, mes.y, mes.m]);
  const paradasDoMes = useMemo(() => {
    const g = gradeDoMes(mes);
    return paradas.filter((p) => p.fim >= g[0] && p.inicio <= g[g.length - 1]);
  }, [paradas, mes]);
  const tiposNoMes = new Set(paradasDoMes.map((p) => p.tipo));

  return (
    <div className="cal-prog">
      <div className="row between nowrap">
        <button className="btn small" onClick={() => mudar(-1)} aria-label="Mês anterior">
          ‹
        </button>
        <h2 className="center">
          {MONTHS[mes.m]} <span className="num muted">{mes.y}</span>
        </h2>
        <button className="btn small" onClick={() => mudar(1)} aria-label="Próximo mês">
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
            <button className={'calp-wk' + (semana === toIsoDate(w.days[0]) ? ' on' : '')} onClick={() => onDia(toIsoDate(w.days[0]))} aria-label={`Semana ${w.week}`}>
              {w.week}
            </button>
            {w.days.map((dd, i) => {
              const d = toIsoDate(dd);
              const fer = feriadoEm(feriados, d);
              const fs = fatiasDoDia(porDia.get(d) ?? []);
              const pes = fs.reduce((s, f) => s + f.pessoas, 0);
              const par = paradasNoDia(paradasDoMes, d)[0];
              return (
                <button
                  key={d}
                  className={
                    'calp-dia' +
                    (dd.getUTCMonth() !== mes.m ? ' fora' : '') +
                    (i >= 5 || fer ? ' fds' : '') +
                    (par ? ' parada-' + par.tipo : '') +
                    (d === dia ? ' sel' : '') +
                    (d === hoje ? ' hoje' : '')
                  }
                  onClick={() => onDia(d)}
                  title={`${rotuloDia(d)}${fer ? ` · ${fer}` : ''}${par ? ` · ${TIPOS_PARADA.find((t) => t.id === par.tipo)?.nome}: ${par.area}` : ''}${fs.length ? ` · ${fs.map((f) => `${f.area} ${f.pessoas}`).join(', ')}` : ''}`}
                  aria-label={`${rotuloDia(d)}${fer ? `, feriado ${fer}` : ''}${par ? `, ${TIPOS_PARADA.find((t) => t.id === par.tipo)?.nome}` : ''}, ${pes} pessoas em ${fs.length} áreas`}
                >
                  <span className="calp-num">{dd.getUTCDate()}</span>
                  {fer && <span className="calp-fer" aria-hidden />}
                  {par && (
                    <span className="calp-par" aria-hidden>
                      {TIPOS_PARADA.find((t) => t.id === par.tipo)?.icone}
                    </span>
                  )}
                  <BarraAreas fatias={fs} />
                  <span className="calp-pes num">{pes || (fs.length ? '·' : '')}</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <ul className="legenda-areas calp-rodape">
        {legenda.map(([c, nome]) => (
          <li key={c}>
            <span className={'sw-area ' + c} /> {nome}
          </li>
        ))}
        {TIPOS_PARADA.filter((t) => tiposNoMes.has(t.id)).map((t) => (
          <li key={t.id}>
            <span className={'sw-parada parada-' + t.id}>{t.icone}</span> {t.nome}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mapa de calor da semana: área × dia, cor mais forte = mais pessoas. */
export function MapaSemana({ segunda, dia, onDia, lista }: { segunda: string; dia?: string; onDia: (d: string) => void; lista: Atividade[] | null }) {
  const semana = diasDaSemana(segunda);
  const porDia = useMemo(() => porDiaDe(lista), [lista]);
  const calor = useMemo(() => {
    const m = new Map<string, number[]>();
    semana.forEach((d, i) => {
      for (const f of fatiasDoDia(porDia.get(d) ?? [])) {
        const l = m.get(f.area) ?? Array(7).fill(0);
        l[i] += f.pessoas || 0;
        m.set(f.area, l);
      }
    });
    return [...m.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porDia, segunda]);
  const max = Math.max(1, ...calor.flatMap(([, l]) => l));
  const ativas = (area: string, d: string) => (porDia.get(d) ?? []).some((a) => a.classe !== 'cancelada' && (a.area || AREA_INTERNA) === area);

  return (
    <>
      <h3>
        Semana {isoWeekOf(fromIsoDate(segunda)!).week} <span className="muted small">— pessoas por área</span>
      </h3>
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
                    <button className="link" onClick={() => onDia(d)}>
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
                  {l.map((n, i) => {
                    const tem = n > 0 || ativas(area, semana[i]);
                    return (
                      <td key={i} className={corDaArea(area) + (semana[i] === dia ? ' sel' : '')} title={tem ? `${area}: ${n || 'nº não informado'}` : undefined}>
                        <span className="calor-cel" style={{ opacity: tem ? 0.25 + 0.75 * ((n || max * 0.2) / max) : 0 }} />
                        <span className="calor-n num">{n || (tem ? '·' : '')}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * "Dia a dia": calendário do mês com as áreas de cada dia em cores; tocar no dia mostra onde
 * o efetivo está, as paradas e com quem falar para pedir liberação de pessoas.
 */
export function Painel() {
  const { areas, feriados } = useProg();
  const [dia, setDia] = useState(hojeIso);
  const [mes, setMes] = useState<Mes>(() => mesDeIso(hojeIso()));
  const grade = gradeDoMes(mes);
  const segunda = segundaDe(dia);
  const semana = diasDaSemana(segunda);
  const lista = useAtividades(mesesEntre([grade[0], semana[0]].sort()[0], [grade[grade.length - 1], semana[6]].sort()[1]));
  const paradas = useParadas();
  const contato = useMemo(() => new Map(areas.map((a) => [a.nome, a.contato])), [areas]);
  const r = useMemo(() => alocacaoDoDia(lista ?? [], dia), [lista, dia]);
  const doDia = fatiasDoDia((lista ?? []).filter((a) => a.data === dia));
  const parDia = paradasNoDia(paradas, dia);
  const hoje = hojeIso();
  const escolher = (d: string) => {
    setDia(d);
    setMes(mesDeIso(d));
  };

  return (
    <div className="stack prog">
      <section className="card pad">
        <CalendarioMes mes={mes} setMes={setMes} dia={dia} onDia={escolher} lista={lista} paradas={paradas} semana={segunda} />
        {dia !== hoje && (
          <div className="row center-row">
            <button className="btn small" onClick={() => escolher(hoje)}>
              Voltar para hoje
            </button>
          </div>
        )}
      </section>

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
        {parDia.map((p) => (
          <div key={p.id} className={'parada-faixa parada-' + p.tipo}>
            <b>
              {TIPOS_PARADA.find((t) => t.id === p.tipo)?.icone} {TIPOS_PARADA.find((t) => t.id === p.tipo)?.nome}
            </b>{' '}
            · {p.area}
            {p.equipamento && ` · ${p.equipamento}`}
            {p.descricao && <span className="small"> — {p.descricao}</span>}
          </div>
        ))}
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
        <CartaoArea key={g.area} area={g.area} pessoas={g.pessoas} atividades={g.atividades} contato={contato.get(g.area)} />
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
        <p className="small muted center">
          Precisa da vulcanização neste dia? Combine a liberação com as áreas acima e registre em <a href="#/solicitar">Solicitar</a>.
        </p>
      )}

      <section className="card pad">
        <MapaSemana segunda={segunda} dia={dia} onDia={escolher} lista={lista} />
      </section>
    </div>
  );
}

export function CartaoArea({ area, pessoas, atividades, contato }: { area: string; pessoas: number; atividades: Atividade[]; contato?: string }) {
  return (
    <section className={'card area-cartao ' + corDaArea(area)}>
      <div className="row between nowrap area-topo">
        <h3>{area}</h3>
        <span className="area-pes" title="pessoas da vulcanização">
          👷 <b className="num">{pessoas || '—'}</b>
        </span>
      </div>
      {contato && <p className="small area-contato">📞 Liberação: {contato}</p>}
      <ul className="plain-list cartao-ativs">
        {atividades.map((a) => (
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
        {a.execucao === 'executada' && <span className="exec ok">✓ Executada</span>}
        {a.execucao === 'nao_executada' && <span className="exec nao">✕ Não executada{a.execMotivo ? ` — ${a.execMotivo}` : ''}</span>}
        {a.execucao === 'reprogramada' && <span className="exec reprog">↷ Reprogramada{a.execMotivo ? ` — ${a.execMotivo}` : ''}</span>}
        {a.reprogramacoes > 0 && a.execucao !== 'reprogramada' && <span className="exec reprog">↷ veio de {a.dataOriginal.split('-').reverse().join('/')}</span>}
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
