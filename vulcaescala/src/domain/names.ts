/** Padroniza um nome: sem espaços sobrando, em MAIÚSCULAS. */
export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
}

/** Chave de comparação: sem acentos, só letras/dígitos e espaço simples. */
export function nameKey(s: string): string {
  return cleanName(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Dois nomes são "parecidos" quando, sem acentos, um está contido no outro
 * (ex.: "JHENIFERSON" e "JHENIFERSON SILVA") ou a distância de edição é
 * pequena para o tamanho (ex.: "JHENIFERSON" e "JEFERSON", "JHENIFFERSON").
 * Serve para alertar duplicidade no cadastro — nunca bloqueia sozinho.
 */
export function similarNames(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const fa = ka.split(' ')[0];
  const fb = kb.split(' ')[0];
  if (fa.length >= 4 && fb.length >= 4 && (ka.startsWith(kb + ' ') || kb.startsWith(ka + ' '))) return true;
  const maxLen = Math.max(fa.length, fb.length);
  const tolerance = maxLen >= 9 ? 3 : maxLen >= 6 ? 2 : 1;
  // compara o primeiro nome (é como o efetivo costuma ser chamado na planilha)
  return levenshtein(fa, fb) <= tolerance;
}

/** Busca tolerante: ignora acentos e caixa. */
export function matchesSearch(nome: string, query: string): boolean {
  const q = nameKey(query);
  return !q || nameKey(nome).includes(q);
}
