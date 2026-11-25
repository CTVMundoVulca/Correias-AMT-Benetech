import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useEmenda } from './context';
import { gravarPrensa } from './data';
import { FABRICANTES_PRENSA, normCodigo, TIPOS_PRENSA, type ItemPrensa, type TipoItemPrensa } from './model';

const VAZIO: ItemPrensa = { tipo: 'Prensa', fabricante: '', modelo: '', codigo: '', serie: '' };

/**
 * Cadastro único dos equipamentos da prensa (seção 7): prensas, painéis e bombas, cada um com
 * fabricante e patrimônio/identificação. No relatório, escolher o item grava a descrição;
 * escolher a prensa preenche a série (Nilos/Sampla). Modelo e nº de série saíram da tela, mas o
 * que já estava gravado neles é mantido no cadastro ao editar.
 */
export function PrensaDialog({ onClose }: { onClose: () => void }) {
  const { api, prensa } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  // null = formulário fechado; '' = item novo; patrimônio = editando esse item
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState<ItemPrensa>(VAZIO);
  const set = (p: Partial<ItemPrensa>) => setF((x) => ({ ...x, ...p }));

  const abrir = (it?: ItemPrensa, tipo: TipoItemPrensa = 'Prensa') => {
    setEditando(it ? it.codigo : '');
    setF(it ? { ...it } : { ...VAZIO, tipo });
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const codigo = normCodigo(f.codigo);
    if (!codigo) return toast('Informe o patrimônio/identificação.', 'warn');
    if (codigo !== editando && prensa.some((x) => x.codigo === codigo)) return toast(`O patrimônio ${codigo} já está cadastrado.`, 'warn');
    const item: ItemPrensa = { ...f, codigo, fabricante: f.fabricante.trim().toUpperCase() };
    const lista = editando ? prensa.map((x) => (x.codigo === editando ? item : x)) : [...prensa, item];
    try {
      await gravarPrensa(api, lista);
      toast(editando ? 'Item atualizado' : 'Item cadastrado');
      setEditando(null);
    } catch {
      toast('Não foi possível salvar o cadastro.', 'danger');
    }
  };

  const remover = async (it: ItemPrensa) => {
    const ok = await confirm({ title: `Remover ${it.codigo}?`, message: <p>O item sai do cadastro. Relatórios já feitos não mudam.</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    gravarPrensa(api, prensa.filter((x) => x.codigo !== it.codigo))
      .then(() => toast('Removido'))
      .catch(() => toast('Não foi possível salvar o cadastro.', 'danger'));
  };

  return (
    <Modal
      title="Equipamentos da prensa"
      subtitle="Prensas, painéis e bombas — cadastre cada um uma vez"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Concluído
        </button>
      }
    >
      <p className="small muted">No relatório, escolha a prensa, os painéis e as bombas pelo patrimônio: os dados cadastrados vão junto.</p>
      {editando === null ? (
        <button className="btn small primary" onClick={() => abrir()}>
          + Cadastrar equipamento
        </button>
      ) : (
        <form className="item-card" onSubmit={(e) => void salvar(e)}>
          <div className="field">
            <span>Tipo</span>
            <div className="opts" role="radiogroup" aria-label="Tipo">
              {TIPOS_PRENSA.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={f.tipo === t} className={'opt' + (f.tipo === t ? ' on' : '')} onClick={() => set({ tipo: t })}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="g2">
            <label className="field">
              Fabricante
              <input className="input" list="fabricantes-prensa" value={f.fabricante} onChange={(e) => set({ fabricante: e.target.value })} style={{ textTransform: 'uppercase' }} />
              <datalist id="fabricantes-prensa">
                {FABRICANTES_PRENSA.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="field">
              Patrimônio/Identificação
              <input className="input" value={f.codigo} onChange={(e) => set({ codigo: e.target.value })} style={{ textTransform: 'uppercase' }} />
            </label>
          </div>
          <div className="row">
            <button className="btn small" type="button" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn small primary" type="submit" disabled={!f.codigo.trim()}>
              Salvar equipamento
            </button>
          </div>
        </form>
      )}
      {TIPOS_PRENSA.map((t) => {
        const doTipo = prensa.filter((x) => x.tipo === t);
        if (!doTipo.length) return null;
        return (
          <section key={t}>
            <h3 className="sub">{t === 'Prensa' ? 'Prensas' : t === 'Painel' ? 'Painéis' : 'Bombas'}</h3>
            <ul className="plain-list funcao-list">
              {doTipo.map((it) => (
                <li key={it.codigo}>
                  <span className="grow">
                    <b>{it.codigo}</b>
                    {it.fabricante && ` · ${it.fabricante}`}
                  </span>
                  <button className="btn small" onClick={() => abrir(it)} aria-label={`Editar ${it.codigo}`}>
                    Editar
                  </button>
                  <button className="btn small ghost-danger" onClick={() => void remover(it)} aria-label={`Remover ${it.codigo}`}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {prensa.length === 0 && editando === null && <p className="small muted">Nenhum equipamento cadastrado ainda.</p>}
    </Modal>
  );
}
