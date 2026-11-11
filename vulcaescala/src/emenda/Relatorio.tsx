import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PdfBotao } from '../ui/PdfBotao';
import { irPara, useEmenda } from './context';
import { ouvirEmenda, ouvirFotos } from './data';
import { fmtData, margemOrvalho, type Emenda, type Foto, type Liberacao } from './model';

/**
 * Relatório da emenda em PDF, gerado no próprio aparelho (funciona também no iPhone pela
 * tela inicial, onde imprimir não funciona). Depois: salvar, compartilhar ou imprimir.
 */
export function Relatorio({ id }: { id: string }) {
  const { api } = useEmenda();
  const [e, setE] = useState<Emenda | null | undefined>(undefined);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => ouvirEmenda(api, id, (x) => setE(x), () => setE(null)), [api, id]);
  useEffect(() => ouvirFotos(api, id, setFotos, () => setFotos([])), [api, id]);
  useEffect(() => {
    if (e) document.title = `Emenda nº ${e.numero || '?'} — TAG ${e.tag || '?'}`;
    return () => {
      document.title = 'Registro de Emenda — AMT';
    };
  }, [e]);

  if (e === undefined) return <p className="muted pad">Carregando…</p>;
  if (e === null) return <p className="pad">Relatório não encontrado.</p>;

  const aco = e.tipoCorreia === 'Cabo Aço';
  return (
    <article className="rel" ref={ref}>
      <div className="rel-toolbar no-print">
        <button className="btn" onClick={() => irPara(`#/e/${id}`)}>
          ‹ Voltar
        </button>
        <PdfBotao alvo={() => ref.current} titulo={`Emenda ${e.numero || 'sem numero'} - TAG ${e.tag || 'sem TAG'} - ${fmtData(e.data)}`} />
      </div>

      <header className="rel-head">
        <img src="logo-benetech.png" alt="Benetech" />
        <div>
          <div className="rel-kicker">Contrato AMT</div>
          <h1>Relatório de Emenda</h1>
        </div>
      </header>

      <Bloco t="1. Identificação">
        <KV k="Equipamento (TAG)" v={e.tag} />
        <KV k="Data" v={fmtData(e.data)} />
        <KV k="Número da emenda" v={e.numero} />
        <KV k="OM" v={e.om} />
      </Bloco>

      <Bloco t="2. Efetivo" full>
        <h3 className="rel-sub">
          2.1 Preparação da correia (abertura das emendas){e.dataPreparo ? ` — ${fmtData(e.dataPreparo)}` : ''}
        </h3>
        <Tabela cab={['Nome', 'Matrícula/CPF']} linhas={(e.efetivoPreparo ?? []).map((p) => [p.nome, p.matricula])} />
        <h3 className="rel-sub">2.2 Troca da correia (execução da emenda)</h3>
        <Tabela cab={['Nome', 'Matrícula/CPF']} linhas={e.efetivo.map((p) => [p.nome, p.matricula])} />
      </Bloco>

      <Bloco t="3. Materiais da emenda" full>
        <Tabela cab={['Material', 'Fabricante', 'Lote', 'Qtd.', 'Validade']} linhas={e.materiaisEmenda.map((m) => [m.material, m.fabricante, m.lote, m.qtd, fmtData(m.validade)])} />
      </Bloco>
      <Bloco t="3.1 Materiais da manta" full>
        <Tabela cab={['Material', 'Fabricante', 'Lote', 'Qtd.', 'Validade']} linhas={e.materiaisManta.map((m) => [m.material, m.fabricante, m.lote, m.qtd, fmtData(m.validade)])} />
      </Bloco>

      <Bloco t="4. Equipamentos de medição" full>
        <Tabela
          cab={['Equipamento', 'Marca/modelo', 'Código', 'Certificado', 'Calibração', 'Validade']}
          linhas={e.equipamentos.map((q) => [q.equip, q.marca, q.codigo, q.certificado, fmtData(q.dataCal), fmtData(q.validadeCal)])}
        />
      </Bloco>

      <Bloco t="5. Dados da emenda">
        <KV k="Tipo de correia" v={e.tipoCorreia} />
        <KV k="Tipo de emenda" v={e.tipoEmenda} />
        <KV k="Especificação" v={e.especificacao} />
        <KV k="Largura [mm]" v={e.largura} />
        <KV k="Tamanho / trecho [m]" v={e.trecho} />
        {aco ? (
          <>
            <KV k="1º estágio [mm]" v={e.estagio1} />
            <KV k="2º estágio [mm]" v={e.estagio2} />
            <KV k="3º estágio [mm]" v={e.estagio3} />
            <KV k="Chanfro [mm]" v={e.chanfro} />
          </>
        ) : (
          <>
            <KV k="Quant. lonas" v={e.qtdLona} />
            <KV k="Quant. passes" v={e.qtdPasses} />
            <KV k="Compr. passe [mm]" v={e.comprPasse} />
            <KV k="Fechamento [mm]" v={e.fechamento} />
          </>
        )}
        <KV k="Viés [mm]" v={e.vies} />
        <KV k="Compr. total [mm]" v={e.comprTotal} />
        <KV k="Manta inferior [mm]" v={e.mantaInf} />
        <KV k="Manta superior [mm]" v={e.mantaSup} />
        <KV k="Emenda lixada?" v={e.ckLixada} />
        <KV k="Emenda limpa?" v={e.ckLimpa} />
        <KV k="Umidade / óleo?" v={e.ckUmidadeOleo} />
        <KV k="Alinhada?" v={e.ckAlinhada} />
      </Bloco>

      <Bloco t="6. Check list da vulcanização">
        <KV k="Temp. ambiente °C" v={e.tempAmbiente} />
        <KV k="Umidade relativa %" v={e.umidade} />
        <KV k="Ponto de orvalho °C" v={e.orvalho} />
        <KV k="Temp. superfície °C" v={e.tempSuperficie} />
        <KV k="Superfície × orvalho (mín. 3 °C)" v={margemOrvalho(e.tempSuperficie, e.orvalho)?.texto ?? ''} />
        <KV k="Clima" v={e.clima} />
        <KV k="1ª demão" v={e.demao1} />
        <KV k="2ª demão" v={e.demao2} />
        <KV k="3ª demão" v={e.demao3} />
        <KV k="Fechada" v={e.horaFechada} />
        <KV k="Contaminantes antes da cola" v={e.contamAntes} full />
        <KV k="Contaminantes depois da cola" v={e.contamDepois} full />
        <KV k="Rodilhada?" v={e.rodilhada} />
        <KV k="Temperatura vulc. °C" v={e.tempVulc} />
        <KV k="Tempo vulc. (min)" v={e.tempoVulc} />
        <KV k="Pressão [kg/cm²]" v={e.pressaoVulc} />
        <KV k="Temp. abertura prensa" v={e.tempAbertura} />
        <KV k="Hora abertura prensa" v={e.horaAbertura} />
        <KV k="Dureza Shore A (menor)" v={e.dureza} />
        <KV k="Presença de bolha?" v={e.ckBolha} />
        <KV k="Feito acabamento?" v={e.ckAcabamento} />
        <KV k="Faltou material?" v={e.ckFaltouMaterial} />
        <KV k="Observações" v={e.obsVulc} full />
      </Bloco>

      <Bloco t="7. Prensa">
        <KV k="Série" v={e.seriePrensa} />
        <KV k="Testada antes?" v={e.prensaTestada} />
        <KV k="Painéis" v={e.paineis} />
        <KV k="Bombas" v={e.bombas} />
        <KV k="Data do teste" v={fmtData(e.dataTeste)} />
        <KV k="Ass. técnico eletricista" v={e.assEletricista} />
        <KV k="Observações" v={e.obsPrensa} full />
      </Bloco>

      <Bloco t="8. Problemas durante a vulcanização">
        <KV k="Tipo de problema" v={e.problemaTipo} />
        <KV k="Temperatura" v={e.problemaTemp} />
        <KV k="Pressão" v={e.problemaPressao} />
        <KV k="Tempo" v={e.problemaTempo} />
        <KV k="Procedimento de retomada" v={e.retomada} full />
      </Bloco>

      <div className="rel-libs">
        <Lib t="9. Liberação do técnico de área" l={e.libTecnico} />
        <Lib t="10. Liberação do supervisor de área" l={e.libSupervisor} />
      </div>

      {fotos.length > 0 && (
        <section className="rel-fotos">
          <h2>Etapas do processo (registro fotográfico)</h2>
          <div className="rel-foto-grid">
            {fotos.map((f) => (
              <figure key={f.id}>
                <img src={f.data} alt={f.legenda} />
                <figcaption>{f.legenda}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Bloco({ t, children, full }: { t: string; children: ReactNode; full?: boolean }) {
  return (
    <section className="rel-bloco">
      <h2>{t}</h2>
      <div className={full ? '' : 'rel-kv'}>{children}</div>
    </section>
  );
}

function KV({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={'kv' + (full ? ' full' : '')}>
      <span>{k}</span>
      <b>{v || '—'}</b>
    </div>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: string[][] }) {
  if (!linhas.length) return <p className="small">—</p>;
  return (
    <table className="rel-tab">
      <thead>
        <tr>
          {cab.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i}>
            {l.map((c, j) => (
              <td key={j}>{c || '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Lib({ t, l }: { t: string; l: Liberacao }) {
  return (
    <section className="rel-bloco rel-lib">
      <h2>{t}</h2>
      <div className="kv">
        <span>Liberado por</span>
        <b>{l.nome || '—'}</b>
      </div>
      <div className="kv">
        <span>Matrícula/CPF</span>
        <b>{l.matricula || '—'}</b>
      </div>
      <div className="kv">
        <span>Data</span>
        <b>{fmtData(l.data)}</b>
      </div>
      <div className="rel-sig">{l.assinatura ? <img src={l.assinatura} alt={`Assinatura — ${l.nome}`} /> : <span>sem assinatura</span>}</div>
    </section>
  );
}
