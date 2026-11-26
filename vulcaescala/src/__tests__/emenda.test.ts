import { describe, expect, it } from 'vitest';
import { completarEmenda, intervaloMes, nomeMes, novaEmenda, ordenar, recalcular, somaHora, somaMes, type Emenda } from '../emenda/model';

const base = () => novaEmenda('e1', '2026-11-07', 'teste');
const com = (p: Partial<Emenda>, alterados: (keyof Emenda)[]) => {
  const e = { ...base(), ...p };
  return { ...e, ...recalcular(e, alterados) };
};

describe('cálculos automáticos (regras do app do Suzano)', () => {
  it('viés: frio = largura/2; quente = largura × 0,364', () => {
    expect(com({ largura: '1200' }, ['largura']).vies).toBe('600');
    expect(com({ largura: '1200', tipoEmenda: 'Quente' }, ['largura']).vies).toBe('437');
  });

  it('lona: passes = lonas − 1 e compr. passe = total / passes', () => {
    const e = com({ qtdLona: '4', comprTotal: '1500' }, ['qtdLona']);
    expect(e.qtdPasses).toBe('3');
    expect(e.comprPasse).toBe('500');
    expect(e.chanfro).toBe('N/A');
  });

  it('cabo de aço a quente: estágios e chanfro', () => {
    const e = com({ tipoCorreia: 'Cabo Aço', tipoEmenda: 'Quente', comprTotal: '2000' }, ['comprTotal']);
    expect(e.estagio1).toBe('1820');
    expect(e.estagio2).toBe('930');
    expect(e.chanfro).toBe('60');
    expect(e.pressaoVulc).toBe('10');
  });

  it('demãos e fechamento: frio +10min, quente +30min, cabo de aço +3h', () => {
    expect(com({ demao1: '08:00' }, ['demao1'])).toMatchObject({ demao2: '09:00', horaFechada: '09:10', rodilhada: 'Sim' });
    expect(com({ demao1: '08:40', tipoEmenda: 'Quente' }, ['demao1'])).toMatchObject({ demao2: '09:40', horaFechada: '10:10', horaAbertura: '14:10' });
    expect(com({ demao1: '22:30', tipoCorreia: 'Cabo Aço' }, ['demao1'])).toMatchObject({ demao2: '23:30', horaFechada: '02:30' });
  });

  it('quente: parâmetros padrão da prensa e data do teste', () => {
    const e = com({ tipoEmenda: 'Quente' }, ['tipoEmenda']);
    expect(e).toMatchObject({ tempVulc: '150°', tempoVulc: '45', pressaoVulc: '8', tempAbertura: '60°', dataTeste: '2026-11-07', rodilhada: 'N/A' });
    const frio = com({ tipoEmenda: 'Frio' }, ['tipoEmenda']);
    expect(frio).toMatchObject({ tempVulc: 'N/A', pressaoVulc: 'N/A', horaAbertura: 'N/A', dataTeste: '' });
    // data da vistoria já escolhida não é trocada quando outro campo muda
    expect(com({ tipoEmenda: 'Quente', dataTeste: '2026-11-05' }, ['comprTotal']).dataTeste).toBe('2026-11-05');
  });

  it('alterar campo que não é gatilho não recalcula (respeita edição manual)', () => {
    expect(recalcular({ ...base(), vies: '999' }, ['tag'])).toEqual({});
  });

  it('somaHora passa da meia-noite', () => {
    expect(somaHora('23:50', 20)).toBe('00:10');
    expect(somaHora('', 20)).toBe('');
  });
});

describe('meses', () => {
  it('navegação e nome', () => {
    expect(somaMes('2026-11', 1)).toBe('2026-12');
    expect(somaMes('2026-12', 1)).toBe('2027-01');
    expect(somaMes('2026-01', -1)).toBe('2025-12');
    expect(nomeMes('2026-07')).toBe('Julho de 2026');
    expect(intervaloMes('2026-02')).toEqual(['2026-02-01', '2026-02-31']);
  });

  it('ordena por data (mais recente) e número', () => {
    const a = { ...base(), id: 'a', data: '2026-11-03', numero: '2' };
    const b = { ...base(), id: 'b', data: '2026-11-05', numero: '1' };
    const c = { ...base(), id: 'c', data: '2026-11-03', numero: '10' };
    expect(ordenar([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('registro incompleto', () => {
  it('completa campos que faltam sem perder os existentes', () => {
    const e = completarEmenda({ id: 'x', tag: 'TR-05', libTecnico: { nome: 'ANA' } as never });
    expect(e.tag).toBe('TR-05');
    expect(e.libTecnico).toMatchObject({ nome: 'ANA', assinatura: '' });
    expect(e.efetivo).toEqual([]);
  });
});

import { emendaComBase, proximoNumero } from '../emenda/model';

describe('nova emenda com base em outra', () => {
  const orig = {
    ...novaEmenda('a', '2026-11-10', 'x', ['Termômetro']),
    tag: 'L-21',
    om: '900012345678',
    numero: '1',
    especificacao: 'EP 1000/4',
    largura: '1200',
    efetivo: [{ workerId: '', nome: 'FULANO', matricula: '' }],
    materiaisEmenda: [{ nome: 'Cola', lote: 'L1', validade: '2027-01' }] as never,
    tempAmbiente: '30',
    umidade: '70',
    horaFechada: '10:00',
    dureza: '60',
    ckLixada: 'Sim' as const,
    libTecnico: { nome: 'T', data: '2026-11-10', assinatura: 'data:image/png;base64,AAA' } as never,
  };
  const n = emendaComBase(orig, 'b', '2026-11-12', 'y');
  it('copia identificação, efetivo, materiais e dados da emenda', () => {
    expect([n.tag, n.om, n.especificacao, n.largura]).toEqual(['L-21', '900012345678', 'EP 1000/4', '1200']);
    expect(n.efetivo).toEqual(orig.efetivo);
    expect(n.materiaisEmenda).toEqual(orig.materiaisEmenda);
    expect(n.efetivo).not.toBe(orig.efetivo); // cópia, não o mesmo objeto
  });
  it('id, data e número novos; dados da execução e assinaturas em branco', () => {
    expect([n.id, n.data, n.numero]).toEqual(['b', '2026-11-12', '2']);
    expect([n.tempAmbiente, n.umidade, n.horaFechada, n.dureza, n.ckLixada]).toEqual(['', '', '', '', '']);
    expect(JSON.stringify(n.libTecnico)).not.toContain('base64');
  });
  it('próximo número', () => {
    expect(proximoNumero('9')).toBe('10');
    expect(proximoNumero('1A')).toBe('');
    expect(proximoNumero('')).toBe('');
  });
});

describe('conclusão do relatório de emenda', () => {
  it('lista o que falta e libera quando tudo está preenchido', async () => {
    const { novaEmenda, pendenciasConclusao, concluido, ITENS_VISTORIA } = await import('../emenda/model');
    const e = novaEmenda('x', '2026-11-16', 'p', []);
    const falta = pendenciasConclusao(e);
    expect(falta).toContain('TAG');
    expect(falta).toContain('Efetivo da troca');
    expect(falta).toContain('Liberação do supervisor de área: assinatura');
    const lib = { workerId: '', nome: 'ANA', matricula: '1', data: '2026-11-16', assinatura: 'data:image/jpeg;base64,A' };
    const ok = {
      ...e, tag: 'L-21', numero: '3', om: '9000', efetivo: [{ workerId: '', nome: 'JOÃO', matricula: '1' }],
      especificacao: 'EP 1000', largura: '1200', qtdLona: '4', qtdPasses: '3', comprPasse: '300', fechamento: '50', comprTotal: '1500',
      ckLixada: 'Sim' as const, ckLimpa: 'Sim' as const, ckUmidadeOleo: 'Não' as const, ckAlinhada: 'N/A' as const,
      tempAmbiente: '30', umidade: '70', tempSuperficie: '35', clima: 'Seco' as const, rodilhada: 'Sim' as const,
      tempVulc: '145', tempoVulc: '40', pressaoVulc: '8', dureza: '60', ckBolha: 'Não' as const, ckAcabamento: 'Sim' as const, ckFaltouMaterial: 'Não' as const,
      libTecnico: lib, libSupervisor: lib,
    };
    expect(pendenciasConclusao(ok)).toEqual([]);
    // cabo de aço exige os estágios
    expect(pendenciasConclusao({ ...ok, tipoCorreia: 'Cabo Aço', estagio1: '', estagio2: '', estagio3: '', chanfro: '' })).toEqual(['1º estágio', '2º estágio', '3º estágio', 'Chanfro']);
    // vulcanização: na fria não é exigida; na quente é, e "N/A" não vale
    expect(pendenciasConclusao({ ...ok, tipoEmenda: 'Frio', tempVulc: '', tempoVulc: '', pressaoVulc: '' })).toEqual([]);
    // vistoria da prensa completa (exigida na quente)
    const todosC = Object.fromEntries(ITENS_VISTORIA.map(([k]) => [k, 'C' as const]));
    const ap = { equip: 'MULTÍMETRO', marca: 'M', codigo: 'MT-1', certificado: 'C', dataCal: '2026-01-01', validadeCal: '2027-01-01' };
    const vist = { vistoriaItens: todosC, dataTeste: '2026-11-16', paineis: 'P-01 · SAMPLA', bombas: 'B-01 · SAMPLA', vistoriaAparelhos: [ap], libEletricista: lib, libPrensa: lib };
    const quente = pendenciasConclusao({ ...ok, ...vist, tipoEmenda: 'Quente', tempVulc: 'N/A', tempoVulc: '45', pressaoVulc: '8', tempAbertura: '', horaAbertura: '11:00' });
    // na quente a inspeção pós-vulcanização também exige as observações
    expect(quente).toEqual(['Temperatura de vulcanização', 'Temp. abertura da prensa', 'Observações da inspeção pós-vulcanização']);
    // dureza: obrigatória no cabo de aço e na emenda a quente (lona a frio: opcional)
    expect(pendenciasConclusao({ ...ok, dureza: '' })).toEqual([]);
    expect(pendenciasConclusao({ ...ok, tipoCorreia: 'Cabo Aço', dureza: '' })).toContain('Dureza Shore A');
    expect(concluido(ok)).toBe(false);
    expect(concluido({ ...ok, concluidoEm: '2026-11-16T10:00:00Z' })).toBe(true);
  });
});

describe('corte do controle de conclusão (02/11/2026)', () => {
  it('relatório anterior fica fora do controle; concluído nunca fica', async () => {
    const { foraDoControle } = await import('../emenda/model');
    expect(foraDoControle({ data: '2026-11-01', concluidoEm: '' })).toBe(true);
    expect(foraDoControle({ data: '2026-11-02', concluidoEm: '' })).toBe(false);
    expect(foraDoControle({ data: '2026-10-20', concluidoEm: '2026-11-16T10:00:00Z' })).toBe(false);
  });
});

describe('cadastro de aparelhos de medição (por patrimônio)', () => {
  it('limpa o que vem da nuvem: sem patrimônio sai, repetido vale o primeiro, patrimônio padronizado', async () => {
    const { cleanAparelhos } = await import('../emenda/model');
    const l = cleanAparelhos([
      { equip: 'TERMO-HIGRÔMETRO', marca: 'Marca A', codigo: ' pat-2448 ', certificado: 'S-1', dataCal: '2026-10-21', validadeCal: '2027-10-21' },
      { equip: 'DURÔMETRO', codigo: '' },
      { equip: 'DURÔMETRO', codigo: 'PAT-2448', marca: 'repetido' },
      'lixo',
      { equip: 'DURÔMETRO', codigo: 'PAT-0007', marca: 7 },
    ]);
    expect(l.map((a) => [a.equip, a.codigo, a.marca])).toEqual([
      ['DURÔMETRO', 'PAT-0007', ''],
      ['TERMO-HIGRÔMETRO', 'PAT-2448', 'Marca A'],
    ]);
    expect(cleanAparelhos(undefined)).toEqual([]);
  });

  it('acha pelo patrimônio (sem diferenciar maiúsculas/espaços) e sugere validade de 1 ano', async () => {
    const { aparelhoPorCodigo, cleanAparelhos, validadeSugerida, calibracaoVencida } = await import('../emenda/model');
    const l = cleanAparelhos([{ equip: 'TERMO-HIGRÔMETRO', marca: 'Marca A', codigo: 'PAT-2448', certificado: 'S-1', dataCal: '2026-10-21', validadeCal: '2027-10-21' }]);
    expect(aparelhoPorCodigo(l, ' pat-2448')?.certificado).toBe('S-1');
    expect(aparelhoPorCodigo(l, 'PAT-9999')).toBeUndefined();
    expect(validadeSugerida('2026-10-21')).toBe('2027-10-21');
    expect(validadeSugerida('')).toBe('');
    expect(calibracaoVencida(l[0], '2027-10-21')).toBe(false);
    expect(calibracaoVencida(l[0], '2027-10-22')).toBe(true);
    expect(calibracaoVencida({ validadeCal: '' }, '2027-10-22')).toBe(false);
  });
});

describe('seção 7 (prensa) e inspeção pós-vulcanização', () => {
  it('relatório antigo: abre com a assinatura do técnico em elétrica vazia e mantém o texto antigo', () => {
    const e = completarEmenda({ id: 'x', assEletricista: 'FULANO TESTE' } as never);
    expect(e.assEletricista).toBe('FULANO TESTE');
    expect(e.libEletricista).toEqual({ workerId: '', nome: '', matricula: '', data: '', assinatura: '' });
  });

  it('painéis/bombas: texto "A, B" ⇄ lista; N/A = nenhum', async () => {
    const { juntarItens, separarItens } = await import('../emenda/model');
    expect(separarItens('PAINEL 1, PAINEL 2')).toEqual(['PAINEL 1', 'PAINEL 2']);
    expect(separarItens('N/A')).toEqual([]);
    expect(separarItens('NA')).toEqual([]);
    expect(separarItens('Sampla')).toEqual(['Sampla']); // texto antigo digitado continua
    expect(juntarItens(['PAINEL 1', 'PAINEL 2'])).toBe('PAINEL 1, PAINEL 2');
    expect(juntarItens([])).toBe('N/A');
  });

  it('emenda a quente: dureza, bolha, acabamento, faltou material e observações obrigatórios para concluir', async () => {
    const { pendenciasConclusao } = await import('../emenda/model');
    const quente = { ...novaEmenda('q', '2026-11-25', 'x'), tipoEmenda: 'Quente' as const, tipoCorreia: 'Lona' as const };
    const p = pendenciasConclusao(quente);
    for (const item of ['Dureza Shore A', 'Presença de bolha?', 'Feito acabamento?', 'Faltou material?', 'Observações da inspeção pós-vulcanização']) expect(p).toContain(item);
    const ok = pendenciasConclusao({ ...quente, dureza: '58', ckBolha: 'Não', ckAcabamento: 'Sim', ckFaltouMaterial: 'Não', obsVulc: 'Sem desvios' });
    expect(ok.some((s) => /Dureza|bolha|acabamento|Faltou|Observações da inspeção/.test(s))).toBe(false);
  });

  it('emenda a frio em lona: dureza e observações continuam opcionais', async () => {
    const { pendenciasConclusao } = await import('../emenda/model');
    const p = pendenciasConclusao({ ...novaEmenda('f', '2026-11-25', 'x'), tipoEmenda: 'Frio', tipoCorreia: 'Lona' });
    expect(p).not.toContain('Dureza Shore A');
    expect(p).not.toContain('Observações da inspeção pós-vulcanização');
  });
});

describe('aparelhos: um cadastro só', () => {
  const ap = (equip: string, codigo: string, marca = '') => ({ equip, marca, codigo, certificado: 'C', dataCal: '2026-07-28', validadeCal: '2027-07-28' });
  const PADRAO = ['TERMÔMETRO INFRAVERMELHO', 'TERMO-HIGRÔMETRO', 'DURÔMETRO'];

  it('mesmo tipo mesmo com acento gravado de outra forma, espaços ou minúsculas', async () => {
    const { mesmoTipo, aparelhosDoTipo } = await import('../emenda/model');
    const nfd = 'TERMÔMETRO INFRAVERMELHO'.normalize('NFD');
    expect(nfd).not.toBe('TERMÔMETRO INFRAVERMELHO'); // visualmente igual, bytes diferentes
    expect(mesmoTipo(nfd, 'termômetro  infravermelho ')).toBe(true);
    expect(aparelhosDoTipo([ap(nfd, 'PAT-2450')], 'TERMÔMETRO INFRAVERMELHO')).toHaveLength(1);
  });

  it('tipos = lista padrão + tipos novos do cadastro (sem repetir)', async () => {
    const { tiposDeAparelho } = await import('../emenda/model');
    expect(tiposDeAparelho([ap('TERMÔMETRO INFRAVERMELHO', 'PAT-2450'), ap('PAQUÍMETRO', 'PAT-9')], PADRAO)).toEqual([...PADRAO, 'PAQUÍMETRO']);
  });

  it('relatório novo: só tipos com aparelho completo; um aparelho = linha preenchida, dois = só o tipo', async () => {
    const { linhasIniciais } = await import('../emenda/model');
    const semCal = { ...ap('TERMO-HIGRÔMETRO', 'TH-1'), dataCal: '', validadeCal: '' };
    const l = linhasIniciais([ap('TERMÔMETRO INFRAVERMELHO', 'PAT-2450', 'Nol'), ap('DURÔMETRO', 'D1'), ap('DURÔMETRO'.normalize('NFD'), 'D2'), semCal]);
    expect(l.map((x) => [x.equip, x.codigo, x.marca])).toEqual([
      ['TERMÔMETRO INFRAVERMELHO', 'PAT-2450', 'Nol'],
      ['DURÔMETRO', '', ''],
    ]);
    expect(linhasIniciais([])).toEqual([]); // sem cadastro: nenhuma linha "só com o nome"
  });

  it('lista do relatório: só aparelhos com patrimônio, data e validade da calibração', async () => {
    const { aparelhoCompleto, aparelhosPorTipo } = await import('../emenda/model');
    expect(aparelhoCompleto(ap('DURÔMETRO', 'D1'))).toBe(true);
    expect(aparelhoCompleto({ ...ap('DURÔMETRO', 'D1'), validadeCal: '' })).toBe(false);
    expect(aparelhoCompleto({ ...ap('DURÔMETRO', 'D1'), dataCal: '' })).toBe(false);
    const g = aparelhosPorTipo([ap('DURÔMETRO', 'D1'), { ...ap('PAQUÍMETRO', 'P9'), dataCal: '' }, ap('DURÔMETRO', 'D2')]);
    expect(g.map(([t, l]) => [t, l.map((a) => a.codigo)])).toEqual([['DURÔMETRO', ['D1', 'D2']]]);
  });
});

describe('prensa: cadastro único (prensas, painéis e bombas)', () => {
  it('painéis/bombas cadastrados antes só com o nome entram no cadastro novo (nada se perde)', async () => {
    const { cleanItensPrensa } = await import('../emenda/model');
    const l = cleanItensPrensa({
      itens: [{ tipo: 'Prensa', fabricante: 'sampla', modelo: 'M1', codigo: 'pr-01', serie: 'NS, 1' }],
      paineis: ['PAINEL SAMPLA 01'],
      bombas: ['BOMBA SAMPLA 01', 'PR-01'],
    });
    expect(l.map((x) => [x.tipo, x.codigo, x.fabricante, x.serie])).toEqual([
      ['Prensa', 'PR-01', 'SAMPLA', 'NS 1'], // vírgula sai (separa itens no relatório)
      ['Painel', 'PAINEL SAMPLA 01', '', ''],
      ['Bomba', 'BOMBA SAMPLA 01', '', ''],
    ]);
  });

  it('descrição gravada no relatório e patrimônio de volta; série pelo fabricante', async () => {
    const { descricaoItemPrensa, codigoDaEntrada, seriePeloFabricante } = await import('../emenda/model');
    const d = descricaoItemPrensa({ fabricante: 'SAMPLA', codigo: 'P-01' });
    expect(d).toBe('P-01 · SAMPLA'); // modelo e nº de série saíram do relatório
    expect(codigoDaEntrada('P-01 · SAMPLA · MOD X · Nº série 123')).toBe('P-01'); // relatório gravado antes continua reconhecido
    expect(codigoDaEntrada(d)).toBe('P-01');
    expect(codigoDaEntrada('Sampla')).toBe('SAMPLA'); // texto antigo digitado
    expect(seriePeloFabricante('nilos')).toBe('Nilos');
    expect(seriePeloFabricante('SAMPLA')).toBe('Sampla');
    expect(seriePeloFabricante('OUTRA')).toBeNull();
  });

  it('relatório antigo abre com a prensa utilizada vazia', () => {
    expect(completarEmenda({ id: 'x' }).prensaEquip).toBe('');
  });
});

describe('vistoria da prensa (FOR GTO 062)', () => {
  const lib = { workerId: '', nome: 'ANA', matricula: '1', data: '2026-11-16', assinatura: 'data:image/jpeg;base64,A' };
  const ap = { equip: 'MULTÍMETRO', marca: 'M', codigo: 'MT-1', certificado: 'C', dataCal: '2026-01-01', validadeCal: '2027-01-01' };

  it('12 itens em 3 grupos, como no formulário', async () => {
    const { GRUPOS_VISTORIA, ITENS_VISTORIA } = await import('../emenda/model');
    expect(GRUPOS_VISTORIA.map((g) => g.itens.length)).toEqual([4, 5, 3]);
    expect(ITENS_VISTORIA).toHaveLength(12);
  });

  it('quente: exige itens, data, painel, bomba, aparelhos e as duas assinaturas (responsável e liberação)', async () => {
    const { novaEmenda, pendenciasVistoria } = await import('../emenda/model');
    const e = { ...novaEmenda('x', '2026-11-16', 'p', []), tipoEmenda: 'Quente' as const };
    const p = pendenciasVistoria(e);
    expect(p).toContain('Vistoria da prensa: 12 itens sem resposta (C/NC/NA)');
    expect(p).toContain('Vistoria da prensa: data');
    expect(p).toContain('Vistoria da prensa: nº do painel elétrico');
    expect(p).toContain('Vistoria da prensa: nº do conjunto de bomba');
    expect(p).toContain('Vistoria da prensa: aparelhos utilizados nos testes');
    expect(p).toContain('Vistoria da prensa: responsável pela inspeção (técnico em elétrica) — assinatura');
    expect(p).toContain('Vistoria da prensa: liberado por (supervisor ou encarregado) — nome');
    expect(p).toContain('Vistoria da prensa: liberado por (supervisor ou encarregado) — assinatura');
    expect(p.filter((x) => x.includes('encarregado'))).toHaveLength(2); // uma só liberação (não duas)
  });

  it('frio: opcional; NC impede a conclusão em qualquer tipo', async () => {
    const { novaEmenda, pendenciasVistoria } = await import('../emenda/model');
    const frio = novaEmenda('x', '2026-11-16', 'p', []);
    expect(pendenciasVistoria(frio)).toEqual([]);
    expect(pendenciasVistoria({ ...frio, vistoriaItens: { manometro: 'NC', tomadas: 'C' } })).toEqual(['Vistoria da prensa: “Manômetro” não conforme (NC) — corrigir antes de concluir']);
  });

  it('quente completa e sem NC: nada falta', async () => {
    const { novaEmenda, pendenciasVistoria, ITENS_VISTORIA } = await import('../emenda/model');
    const itens = Object.fromEntries(ITENS_VISTORIA.map(([k], i) => [k, i % 2 ? ('NA' as const) : ('C' as const)]));
    const e = { ...novaEmenda('x', '2026-11-16', 'p', []), tipoEmenda: 'Quente' as const, vistoriaItens: itens, dataTeste: '2026-11-16', paineis: 'P-01', bombas: 'B-01', vistoriaAparelhos: [ap], libEletricista: lib, libPrensa: lib };
    expect(pendenciasVistoria(e)).toEqual([]);
  });

  it('relatório antigo (só técnico em elétrica e foto do check list) não conta como vistoria iniciada', async () => {
    const { completarEmenda, vistoriaIniciada, fotoDaVistoria } = await import('../emenda/model');
    const antigo = completarEmenda({ id: 'a', libEletricista: lib, dataTeste: '2026-11-10' } as never);
    expect(vistoriaIniciada(antigo)).toBe(false);
    expect(antigo.vistoriaItens).toEqual({});
    expect(antigo.libPrensa.nome).toBe('');
    expect(vistoriaIniciada({ ...antigo, vistoriaItens: { cabos: 'C' } })).toBe(true);
    // a foto antiga do check list (posição −1) passa a ser a 1ª foto da vistoria
    expect(fotoDaVistoria({ ordem: -1 })).toBe(true);
    expect(fotoDaVistoria({ ordem: 0 })).toBe(false);
  });
});
