import { useState, type FormEvent } from 'react';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { useEmenda } from './context';
import { gravarAparelhos } from './data';
import { aparelhoCompleto, calibracaoVencida, fmtData, hojeIso, mesmoTipo, normCodigo, tiposDeAparelho, validadeSugerida, type EquipItem } from './model';

const VAZIO: EquipItem = { equip: '', marca: '', codigo: '', certificado: '', dataCal: '', validadeCal: '' };

/**
 * Aparelhos de medição cadastrados (aba "Aparelhos de medição" de Gerenciar listas): cada
 * aparelho físico pelo patrimônio, com marca, certificado e calibração. No relatório, escolher
 * o patrimônio preenche o resto da linha da seção 4. Relatórios já feitos não mudam.
 */
export function AparelhosCadastro() {
  const { api, listas, aparelhos } = useEmenda();
  const toast = useToast();
  const confirm = useConfirm();
  // null = formulário fechado; '' = aparelho novo; código = editando esse aparelho
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState<EquipItem>(VAZIO);
  const hoje = hojeIso();
  const tipos = tiposDeAparelho(aparelhos, listas.equipamentos);

  const abrir = (a?: EquipItem) => {
    setEditando(a ? a.codigo : '');
    setF(a ? { ...a } : { ...VAZIO });
  };
  const set = (p: Partial<EquipItem>) => setF((x) => ({ ...x, ...p }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const codigo = normCodigo(f.codigo);
    // tipo: o mesmo nome já usado (mesma grafia), ou um tipo novo em maiúsculas
    const digitado = f.equip.replace(/\s+/g, ' ').trim().toUpperCase();
    const equip = tipos.find((t) => mesmoTipo(t, digitado)) ?? digitado;
    if (!equip) return toast('Informe o equipamento (ex.: TERMÔMETRO INFRAVERMELHO).', 'warn');
    if (!codigo) return toast('Informe o patrimônio/identificação.', 'warn');
    if (codigo !== editando && aparelhos.some((a) => a.codigo === codigo)) return toast(`O patrimônio ${codigo} já está cadastrado.`, 'warn');
    if (!f.dataCal || !f.validadeCal) return toast('Informe a data e a validade da calibração.', 'warn');
    if (f.validadeCal < f.dataCal) return toast('A validade não pode ser antes da calibração.', 'warn');
    const item = { ...f, equip, codigo, marca: f.marca.trim(), certificado: f.certificado.trim() };
    const lista = editando ? aparelhos.map((a) => (a.codigo === editando ? item : a)) : [...aparelhos, item];
    try {
      await gravarAparelhos(api, lista);
      toast(editando ? 'Aparelho atualizado' : 'Aparelho cadastrado');
      setEditando(null);
    } catch {
      toast('Não foi possível salvar o cadastro.', 'danger');
    }
  };

  const remover = async (a: EquipItem) => {
    const ok = await confirm({ title: `Remover ${a.codigo}?`, message: <p>O aparelho sai do cadastro. Relatórios já feitos não mudam.</p>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    gravarAparelhos(api, aparelhos.filter((x) => x.codigo !== a.codigo))
      .then(() => toast('Removido'))
      .catch(() => toast('Não foi possível salvar o cadastro.', 'danger'));
  };

  return (
    <section className="aparelhos-cad">
      <h3 className="sub">Aparelhos de medição cadastrados</h3>
      <p className="small muted">
        Cadastre cada aparelho uma vez. No relatório, ao escolher o aparelho (no campo Equipamento ou Patrimônio), marca, certificado e datas da
        calibração são preenchidos sozinhos. Só aparecem no relatório os aparelhos com data e validade da calibração.
      </p>
      {editando === null ? (
        <button className="btn small primary" onClick={() => abrir()}>
          + Cadastrar aparelho
        </button>
      ) : (
        <form className="item-card" onSubmit={(e) => void salvar(e)}>
          <div className="g2">
            <label className="field linha-inteira">
              Equipamento
              <input
                className="input"
                list="tipos-aparelho"
                value={f.equip}
                onChange={(e) => set({ equip: e.target.value })}
                placeholder="Escolha ou digite (ex.: TERMÔMETRO INFRAVERMELHO)"
                style={{ textTransform: 'uppercase' }}
              />
              <datalist id="tipos-aparelho">
                {tipos.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="field">
              Marca / modelo
              <input className="input" value={f.marca} onChange={(e) => set({ marca: e.target.value })} />
            </label>
            <label className="field">
              Patrimônio/Identificação
              <input className="input" value={f.codigo} onChange={(e) => set({ codigo: e.target.value })} style={{ textTransform: 'uppercase' }} />
            </label>
            <label className="field">
              Certificado
              <input className="input" value={f.certificado} onChange={(e) => set({ certificado: e.target.value })} />
            </label>
            <label className="field">
              Data calibração
              <input className="input" type="date" value={f.dataCal} onChange={(e) => set({ dataCal: e.target.value, validadeCal: validadeSugerida(e.target.value) || f.validadeCal })} />
            </label>
            <label className="field">
              Validade calibração
              <input className="input" type="date" value={f.validadeCal} onChange={(e) => set({ validadeCal: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <button className="btn small" type="button" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn small primary" type="submit" disabled={!f.codigo.trim()}>
              Salvar aparelho
            </button>
          </div>
        </form>
      )}
      <ul className="plain-list funcao-list">
        {aparelhos.map((a) => (
          <li key={a.codigo}>
            <span className="grow">
              <b>{a.codigo}</b> · {a.equip}
              {a.marca && ` · ${a.marca}`}
              <br />
              <span className="small muted tabnum">
                {a.certificado ? `Cert. ${a.certificado} · ` : ''}cal. {fmtData(a.dataCal) || '—'} · val. {fmtData(a.validadeCal) || '—'}
                {calibracaoVencida(a, hoje) && <b className="text-danger"> · calibração vencida</b>}
                {!aparelhoCompleto(a) && <b className="text-danger"> · incompleto: não aparece no relatório (edite e informe a calibração)</b>}
              </span>
            </span>
            <button className="btn small" onClick={() => abrir(a)} aria-label={`Editar ${a.codigo}`}>
              Editar
            </button>
            <button className="btn small ghost-danger" onClick={() => void remover(a)} aria-label={`Remover ${a.codigo}`}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      {aparelhos.length === 0 && editando === null && <p className="small muted">Nenhum aparelho cadastrado ainda.</p>}
    </section>
  );
}
