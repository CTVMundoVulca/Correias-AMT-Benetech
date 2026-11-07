# io/ — reservado

Fora do escopo da primeira versão. Aqui entrarão:

- `exportXlsx.ts`: semana → .xlsx no layout da planilha antiga (lê só `AppState` + `domain/`).
- `importSheet.ts`: planilha antiga → `AppState`, usando `domain/names.ts` (`nameKey`, `similarNames`)
  para unificar as grafias dos nomes antes de gravar.
