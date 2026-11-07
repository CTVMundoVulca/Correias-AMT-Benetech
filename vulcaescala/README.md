# VulcaEscala

Escala semanal das equipes de vulcanização. Substitui a planilha de 52 abas.
Vite + React + TypeScript, sem backend (dados no `localStorage` do navegador).

## Rodar

```bash
cd vulcaescala
npm install
npm run dev        # desenvolvimento
npm test           # testes (Vitest)
npm run build      # checa tipos e gera dist/ (base relativa: funciona em qualquer subpasta)
```

## Estrutura

```
src/
├── main.tsx              cria o repositório e monta o app
├── App.tsx               abas: Escala | Resumo | Efetivo | Consultas | Dados
├── styles/               tokens.css (cores claro/escuro, fontes) e app.css
├── domain/               regras puras, sem React
│   ├── types.ts          modelo de dados + version
│   ├── isoWeek.ts        semana ISO 8601, datas, navegação
│   ├── names.ts          padronização e comparação de nomes
│   ├── schedule.ts       pendência, status de alocação, consultas
│   ├── summary.ts        indicadores e tabelas do resumo
│   └── seed.ts           efetivo inicial
├── storage/              StorageRepository, LocalStorage, Memory, migrações
├── state/                reducer (todas as ações) e store
├── ui/                   Modal, ConfirmDialog (substitui confirm()), Toast
├── features/             week, summary, workers, reports, data
├── io/                   reservado: exportar .xlsx / importar a planilha antiga
└── __tests__/
```

### Trocar o backend (ex.: Supabase)

Implemente `StorageRepository` (`load`, `save`, `clear`, `persistent`) e troque a instância em
`src/main.tsx`. Os componentes não acessam o armazenamento diretamente.

### Nova versão do formato de dados

Suba `CURRENT_VERSION` em `src/domain/types.ts` e adicione a migração em
`src/storage/migrations.ts`. Backups antigos passam pela mesma migração ao serem importados.

## Regras

- **Datas** geradas pela semana ISO 8601 (semana 1 contém 4 de janeiro; anos com 53 semanas suportados).
- **Pendente** num dia: ativo, o dia tem ao menos uma atividade, não está em nenhuma atividade e não tem
  ausência. Dia sem atividade não gera pendência.
- **Ausente** não pode ser alocado; registrar ausência retira a pessoa das atividades do dia.
- **Mesma pessoa em duas atividades** do dia é permitido (status “Outra ativ.”).
- **Nomes** gravados em MAIÚSCULAS. Duplicado é bloqueado sem diferenciar maiúsculas nem acentos;
  nome parecido pede confirmação.
- **Excluir colaborador** retira-o de todas as atividades e ausências de todas as semanas.
- **Armazenamento**: toda leitura/gravação em try/catch. Sem localStorage, o app abre em memória
  com aviso. Dados ilegíveis são copiados para outra chave antes de qualquer gravação.
- **Segurança**: todo texto é renderizado pelo React (escapado); não há `innerHTML`.
- Sem `alert()`/`confirm()`/`prompt()`: confirmações e avisos usam modais e toasts próprios.

## Abreviações do resumo

F = Folga · A = Atestado · E = Exame · FÉ = Férias · FT = Falta
