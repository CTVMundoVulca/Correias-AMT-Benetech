import { useEffect, useRef, useState } from "react";
import {
  MONTHS,
  MONTHS_SHORT,
  addDays,
  fromIsoDate,
  isoWeekOf,
  toIsoDate,
} from "../domain/isoWeek";
import { segundaDe } from "./Painel";
import { hojeIso } from "./model";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Segundas-feiras das semanas que tocam o mês (AAAA-MM). */
export function semanasDoMes(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const ultimo = toIsoDate(new Date(Date.UTC(y, m, 0)));
  const out: string[] = [];
  for (
    let s = segundaDe(`${ym}-01`);
    s <= ultimo;
    s = toIsoDate(addDays(fromIsoDate(s)!, 7))
  )
    out.push(s);
  return out;
}

/**
 * Título da semana que abre um calendário: barra de meses (rolagem lateral) e as semanas do
 * mês escolhido. Um toque leva direto para a semana, sem passar uma a uma.
 */
export function SeletorSemana({
  segunda,
  onEscolher,
}: {
  segunda: string;
  onEscolher: (segunda: string) => void;
}) {
  const passo = (n: number) =>
    onEscolher(toIsoDate(addDays(fromIsoDate(segunda)!, 7 * n)));
  const [aberto, setAberto] = useState(false);
  const fim = toIsoDate(addDays(fromIsoDate(segunda)!, 6));
  const semana = isoWeekOf(fromIsoDate(segunda)!).week;
  // mês mostrado: o da quinta-feira da semana (regra ISO)
  const quinta = toIsoDate(addDays(fromIsoDate(segunda)!, 3));
  const [ano, setAno] = useState(Number(quinta.slice(0, 4)));
  const [mes, setMes] = useState(quinta.slice(0, 7));
  const barra = useRef<HTMLDivElement>(null);
  const hojeSeg = segundaDe(hojeIso());

  useEffect(() => {
    if (!aberto) return;
    setAno(Number(quinta.slice(0, 4)));
    setMes(quinta.slice(0, 7));
  }, [aberto, quinta]);
  useEffect(() => {
    // deixa o mês escolhido visível na barra
    barra.current
      ?.querySelector<HTMLElement>(".sel-mes.on")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [mes, aberto]);

  return (
    <div className="sel-semana">
      <div className="sel-linha">
        <button
          type="button"
          className="btn"
          onClick={() => passo(-1)}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <button
          type="button"
          className="sel-semana-tit"
          aria-expanded={aberto}
          onClick={() => setAberto((x) => !x)}
        >
          <b>
            Semana {semana} <span aria-hidden>{aberto ? "▴" : "▾"}</span>
          </b>
          <span className="small muted">
            {dm(segunda)} a {dm(fim)}/{fim.slice(0, 4)} · toque para escolher
          </span>
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => passo(1)}
          aria-label="Próxima semana"
        >
          ›
        </button>
      </div>
      {aberto && (
        <div className="sel-painel">
          <div className="sel-ano">
            <button
              type="button"
              className="btn small"
              aria-label="Ano anterior"
              onClick={() => {
                setAno(ano - 1);
                setMes(`${ano - 1}${mes.slice(4)}`);
              }}
            >
              ‹
            </button>
            <b className="num">{ano}</b>
            <button
              type="button"
              className="btn small"
              aria-label="Próximo ano"
              onClick={() => {
                setAno(ano + 1);
                setMes(`${ano + 1}${mes.slice(4)}`);
              }}
            >
              ›
            </button>
          </div>
          <div
            className="sel-meses"
            ref={barra}
            role="tablist"
            aria-label="Mês"
          >
            {MONTHS_SHORT.map((n, i) => {
              const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={ym}
                  type="button"
                  role="tab"
                  aria-selected={mes === ym}
                  className={
                    "sel-mes" +
                    (mes === ym ? " on" : "") +
                    (ym === hojeIso().slice(0, 7) ? " atual" : "")
                  }
                  onClick={() => setMes(ym)}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="small muted sel-mes-nome">
            {MONTHS[Number(mes.slice(5, 7)) - 1]} de {ano}
          </div>
          <div className="sel-semanas">
            {semanasDoMes(mes).map((s) => {
              const f = toIsoDate(addDays(fromIsoDate(s)!, 6));
              return (
                <button
                  key={s}
                  type="button"
                  className={
                    "sel-sem" +
                    (s === segunda ? " on" : "") +
                    (s === hojeSeg ? " atual" : "")
                  }
                  onClick={() => {
                    onEscolher(s);
                    setAberto(false);
                  }}
                >
                  <b>Sem {isoWeekOf(fromIsoDate(s)!).week}</b>
                  <span className="num">
                    {dm(s)} – {dm(f)}
                  </span>
                  {s === hojeSeg && <span className="sel-hoje">atual</span>}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              onEscolher(hojeSeg);
              setAberto(false);
            }}
          >
            Ir para a semana atual
          </button>
        </div>
      )}
    </div>
  );
}
