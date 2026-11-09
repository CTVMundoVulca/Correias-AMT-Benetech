import { useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { entregarPdf, gerarPdf, nomeArquivo, podeCompartilhar } from './pdf';

interface Props {
  /** elemento da tela que vira o PDF */
  alvo: () => HTMLElement | null;
  /** título do arquivo (sem .pdf) */
  titulo: string;
  paisagem?: boolean;
  /** inclui o rodapé CTV no fim do PDF */
  rodape?: boolean;
  className?: string;
}

/**
 * "Gerar PDF": cria o arquivo no aparelho (funciona no iPhone pela tela inicial, onde
 * imprimir não funciona). Quando fica pronto, um toque em "Salvar / Compartilhar" abre a
 * folha do sistema (Arquivos, WhatsApp, e-mail…) — o sistema exige esse toque.
 */
export function PdfBotao({ alvo, titulo, paisagem, rodape = true, className = 'btn primary' }: Props) {
  const toast = useToast();
  const [gerando, setGerando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);

  const gerar = async () => {
    const el = alvo();
    if (!el) return;
    setGerando(true);
    try {
      const f = await gerarPdf(el, {
        nome: nomeArquivo(titulo),
        paisagem,
        extras: rodape ? [document.getElementById('ctv-copyright')] : [],
      });
      setArquivo(f);
    } catch (e) {
      toast(`Não foi possível gerar o PDF${e instanceof Error ? `: ${e.message}` : ''}.`, 'danger');
    } finally {
      setGerando(false);
    }
  };

  const tamanho = arquivo ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB` : '';
  return (
    <>
      <button className={className} onClick={() => void gerar()} disabled={gerando}>
        {gerando ? 'Gerando PDF…' : '📄 Gerar PDF'}
      </button>
      {arquivo && (
        <Modal
          title="PDF pronto"
          subtitle={`${arquivo.name} · ${tamanho}`}
          onClose={() => setArquivo(null)}
          footer={
            <>
              <button className="btn" onClick={() => setArquivo(null)}>
                Fechar
              </button>
              <button className="btn" onClick={() => void entregarPdf(arquivo, 'baixar')}>
                Baixar
              </button>
              {podeCompartilhar(arquivo) && (
                <button className="btn primary" onClick={() => void entregarPdf(arquivo, 'compartilhar')}>
                  Salvar / Compartilhar
                </button>
              )}
            </>
          }
        >
          <p className="small">
            {podeCompartilhar(arquivo)
              ? 'Toque em “Salvar / Compartilhar” para guardar em Arquivos, enviar por WhatsApp ou e-mail, ou imprimir.'
              : 'Toque em “Baixar” para salvar o arquivo.'}
          </p>
        </Modal>
      )}
    </>
  );
}
