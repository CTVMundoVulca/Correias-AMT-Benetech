import { AppState, CURRENT_VERSION, FUNCOES_PADRAO, Worker } from './types';
import { cleanName, nameKey } from './names';

/** Efetivo inicial, usado só na primeira abertura (quando não há dados salvos). */
export const INITIAL_WORKERS = [
  'Adilson', 'Alcemar', 'Allan', 'Bruno', 'Cícero', 'Cláudio', 'Douglas', 'Erick', 'Gabriel Vieira',
  'Gabriel Santiago', 'Glauber', 'Gustavo', 'Izaias', 'Jeferson', 'Jeremias', 'Jheniferson', 'João Victor',
  'Jorge', 'Klebson', 'Lucas Gonçalves', 'Lucas Jordão', 'Manoel', 'Mateus', 'Paulo', 'Reilton', 'Robert',
  'Sandro', 'Vinicius', 'Vicente', 'Wellington',
];

/** `makeId` recebe o nome: na nuvem os ids são derivados do nome, para que dois
 *  aparelhos abrindo ao mesmo tempo pela primeira vez não dupliquem o efetivo. */
export function seedState(makeId: (nome: string) => string): AppState {
  const workers: Worker[] = INITIAL_WORKERS.map((nome) => ({
    id: makeId(nome),
    nome: cleanName(nome),
    funcao: 'Vulcanizador',
    ativo: true,
  }));
  return { version: CURRENT_VERSION, workers, funcoes: [...FUNCOES_PADRAO], weeks: {} };
}

export const seedIdFromName = (nome: string) => 'inicial-' + nameKey(nome).toLowerCase().replace(/ /g, '-');
