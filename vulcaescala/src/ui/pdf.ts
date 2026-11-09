/**
 * PDF gerado no próprio aparelho — mesmo esquema dos Apps CTV Campo (pdf-export.js).
 *
 * window.print() é ignorado no iPhone quando o app roda pela tela inicial (PWA), então o
 * relatório é copiado para uma área fora da tela, convertido em imagens (html2canvas) e
 * montado em um .pdf (jsPDF). As bibliotecas ficam em /vendor do portal (cacheadas pelo
 * service worker: funciona sem internet) e só são carregadas quando alguém gera um PDF.
 *
 * Na cópia, a classe `modo-pdf` aplica o mesmo visual da impressão (tema claro, sem botões).
 */

declare global {
  interface Window {
    html2canvas?: (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    jspdf?: { jsPDF: new (opts: Record<string, unknown>) => JsPdf };
  }
}
interface JsPdf {
  addPage(): void;
  addImage(data: string, fmt: string, x: number, y: number, w: number, h: number): void;
  setProperties(p: Record<string, string>): void;
  output(t: 'blob'): Blob;
}

const VENDOR = '../vendor/';
let libs: Promise<void> | null = null;

function script(src: string): Promise<void> {
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => erro(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

function carregarLibs(): Promise<void> {
  if (window.html2canvas && window.jspdf) return Promise.resolve();
  libs ??= Promise.all([
    window.html2canvas ? null : script(VENDOR + 'html2canvas.min.js'),
    window.jspdf ? null : script(VENDOR + 'jspdf.umd.min.js'),
  ])
    .then(() => undefined)
    .catch((e) => {
      libs = null;
      throw e;
    });
  return libs;
}

function esperarImagens(root: HTMLElement): Promise<unknown> {
  return Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)),
    ),
  );
}

/** Quebras de página sem cortar linhas de tabela, imagens e blocos pequenos (respeita quebra forçada). */
function quebras(host: HTMLElement, pageH: number): number[] {
  const base = host.getBoundingClientRect().top;
  const total = host.scrollHeight;
  const atomos: [number, number][] = [];
  const forcadas: number[] = [];
  host.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.tagName === 'STYLE') return;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    const top = r.top - base;
    const bottom = r.bottom - base;
    const cs = getComputedStyle(el);
    if ((cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') && top > 1) forcadas.push(top);
    if (r.height <= pageH * 0.35) atomos.push([top, bottom]);
  });
  forcadas.sort((a, b) => a - b);
  const br = [0];
  let y0 = 0;
  while (y0 < total - 1) {
    const limite = y0 + pageH;
    const f = forcadas.find((v) => v > y0 + 20 && v < limite);
    if (f !== undefined) {
      br.push(f);
      y0 = f;
      continue;
    }
    if (limite >= total) {
      br.push(total);
      break;
    }
    let y = limite;
    let mudou = true;
    for (let g = 0; mudou && g < 50; g++) {
      mudou = false;
      for (const [a, b] of atomos)
        if (a < y - 1 && b > y + 1 && a > y0) {
          y = a;
          mudou = true;
        }
    }
    if (y < y0 + pageH * 0.5) y = limite;
    br.push(y);
    y0 = y;
  }
  return br;
}

export interface OpcoesPdf {
  nome: string;
  paisagem?: boolean;
  /** elementos extras copiados no fim (ex.: rodapé CTV) */
  extras?: (HTMLElement | null)[];
}

/** Gera o arquivo .pdf a partir de um elemento da tela. */
export async function gerarPdf(fonte: HTMLElement, { nome, paisagem = false, extras = [] }: OpcoesPdf): Promise<File> {
  await carregarLibs();
  const html2canvas = window.html2canvas!;
  const { jsPDF } = window.jspdf!;
  const pageW = paisagem ? 297 : 210;
  const pageH = paisagem ? 210 : 297;
  const margem = 8;
  const largura = paisagem ? 1100 : 760; // largura de layout (px)

  // o PDF sai sempre no tema claro (papel branco), mesmo com o app no tema escuro
  const raiz = document.documentElement;
  const temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');

  const host = document.createElement('div');
  host.className = 'modo-pdf' + (paisagem ? ' modo-pdf-paisagem' : '');
  host.style.cssText = `position:absolute;left:0;top:0;width:${largura}px;background:#fff;color:#111;z-index:-1;pointer-events:none`;
  host.appendChild(fonte.cloneNode(true));
  for (const x of extras) if (x) host.appendChild(x.cloneNode(true));
  document.body.appendChild(host);
  try {
    await esperarImagens(host);
    const contentW = pageW - 2 * margem;
    const pxPorMm = largura / contentW;
    const pagPx = Math.floor((pageH - 2 * margem) * pxPorMm);
    const br = quebras(host, pagPx);
    const rect = host.getBoundingClientRect();
    const topo = rect.top + window.pageYOffset;
    const esq = rect.left + window.pageXOffset;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: paisagem ? 'landscape' : 'portrait', compress: true });
    pdf.setProperties({ title: nome.replace(/\.pdf$/, ''), author: 'CTV Consultoria Técnica em Vulcanização', creator: 'Apps Benetech AMT' });
    for (let i = 0; i < br.length - 1; i++) {
      const h = Math.ceil(br[i + 1] - br[i]);
      const canvas = await html2canvas(host, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        x: esq,
        y: topo + br[i],
        width: largura,
        height: h,
        scrollX: -window.pageXOffset,
        scrollY: -window.pageYOffset,
        windowWidth: largura,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margem, margem, contentW, h / pxPorMm);
      canvas.width = canvas.height = 0;
    }
    return new File([pdf.output('blob')], nome.endsWith('.pdf') ? nome : nome + '.pdf', { type: 'application/pdf' });
  } finally {
    host.remove();
    if (temaAntes === null) raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', temaAntes);
  }
}

/** Nome de arquivo seguro: "Escala AMT - Semana 46-2026" → "Escala_AMT_-_Semana_46-2026.pdf" */
export function nomeArquivo(t: string): string {
  return (t.replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_') || 'Relatorio').slice(0, 80) + '.pdf';
}

function baixar(f: File) {
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Pode compartilhar arquivo (iPhone/Android: Salvar em Arquivos, WhatsApp, e-mail…)? */
export const podeCompartilhar = (f: File) => !!navigator.canShare?.({ files: [f] });

/** Entrega o PDF. Deve ser chamado direto de um toque (exigência do navigator.share). */
export async function entregarPdf(f: File, modo: 'compartilhar' | 'baixar' = 'compartilhar'): Promise<void> {
  if (modo === 'compartilhar' && podeCompartilhar(f)) {
    try {
      await navigator.share({ files: [f], title: f.name.replace(/\.pdf$/, '') });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // a pessoa fechou a folha de compartilhar
    }
  }
  baixar(f);
}
