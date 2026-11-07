# VulcaEscala

Escala semanal das equipes de vulcanização. Substitui a planilha de 52 abas.
Vite + React + TypeScript, sem backend (dados no `localStorage` do navegador).

## Rodar

```bash
cd vulcaescala
npm install
npm run dev      # desenvolvimento
npm test         # testes (Vitest)
npm run build    # gera dist/ (base relativa, funciona em qualquer subpasta)
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/domain` | Tipos, semana ISO 8601, regras de escala/pendência, normalização de nomes. Sem React. |
| `src/storage` | `StorageRepository` (interface assíncrona), `LocalStorageRepository`, validação e migrações por `version`. |
| `src/state` | Reducer com todas as ações e o `StoreProvider` que carrega/salva pelo repositório. |
| `src/components` | Telas: Escala, Efetivo, Consultas, Dados. |

### Trocar o backend (ex.: Supabase)

Implemente `StorageRepository` (`load`, `save`, `clear`) e troque a instância em `src/main.tsx`.
Os componentes não acessam o armazenamento diretamente.

### Nova versão do formato de dados

Suba `CURRENT_VERSION` em `src/domain/types.ts` e adicione a função de migração em
`src/storage/migrations.ts`. Backups antigos passam pela mesma migração ao serem importados.

## Regras implementadas

- **Datas**: geradas pela semana ISO (segunda a domingo); a chave é `AAAA-Www`.
- **Pendente**: colaborador **ativo** sem atividade e sem ausência no dia. Sábado/domingo sem
  nada lançado mostram “Sem escala” e não contam como pendência.
- **Ausente** não pode ser alocado; registrar ausência retira a pessoa das atividades do dia.
  Uma ausência por pessoa por dia.
- **Mesma pessoa em duas atividades no mesmo dia** é permitido, com aviso “em ATIVIDADE”.
- **Nomes** são gravados em MAIÚSCULAS e sem espaços extras. O cadastro bloqueia nome idêntico
  (ignorando acentos) e alerta nomes parecidos (ex.: JHENIFERSON × JHENIFFERSON).
- **Excluir** colaborador só sem histórico; com histórico, use “Inativar”.
