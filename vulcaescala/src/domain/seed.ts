import { AppState, CURRENT_VERSION, Worker } from './types';
import { cleanName } from './names';

/** Efetivo inicial, usado só na primeira abertura (quando não há dados salvos). */
export const INITIAL_WORKERS = [
  'Adilson', 'Alcemar', 'Allan', 'Bruno', 'Cícero', 'Cláudio', 'Douglas', 'Erick', 'Gabriel Vieira',
  'Gabriel Santiago', 'Glauber', 'Gustavo', 'Izaias', 'Jeferson', 'Jeremias', 'Jheniferson', 'João Victor',
  'Jorge', 'Klebson', 'Lucas Gonçalves', 'Lucas Jordão', 'Manoel', 'Mateus', 'Paulo', 'Reilton', 'Robert',
  'Sandro', 'Vinicius', 'Vicente', 'Wellington',
];

export function seedState(makeId: () => string): AppState {
  const workers: Worker[] = INITIAL_WORKERS.map((nome) => ({
    id: makeId(),
    nome: cleanName(nome),
    funcao: 'Vulcanizador',
    ativo: true,
  }));
  return { version: CURRENT_VERSION, workers, weeks: {} };
}
