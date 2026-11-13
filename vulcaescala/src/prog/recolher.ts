import { useState } from 'react';

/**
 * Seções recolhíveis (como os dias da Escala): guarda no aparelho o que a pessoa abriu ou
 * fechou. `padrao` diz se uma chave sem escolha começa aberta.
 */
export function useRecolhiveis(chave: string, padrao: (k: string) => boolean) {
  const [m, setM] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(chave) ?? '{}') ?? {};
    } catch {
      return {};
    }
  });
  const guardar = (n: Record<string, boolean>) => {
    // limita o tamanho guardado (as escolhas mais antigas saem)
    const ent = Object.entries(n);
    const limpo = Object.fromEntries(ent.slice(Math.max(0, ent.length - 200)));
    setM(limpo);
    try {
      localStorage.setItem(chave, JSON.stringify(limpo));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  };
  const aberto = (k: string) => m[k] ?? padrao(k);
  return {
    aberto,
    alternar: (k: string) => guardar({ ...m, [k]: !aberto(k) }),
    todos: (ks: string[], v: boolean) => guardar({ ...m, ...Object.fromEntries(ks.map((k) => [k, v])) }),
  };
}
