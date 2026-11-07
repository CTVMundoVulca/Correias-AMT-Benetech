# Apps Benetech — Contrato AMT

Portal com os apps de campo do contrato **AMT** (separado do contrato Suzano), no mesmo padrão
do App de Registro de Horários: mesmo visual, login único e projeto Firebase próprio do AMT.

| Endereço | App | Acesso |
|---|---|---|
| `/` | Portal (cartões dos apps) | livre |
| `/escala/` | Escala de Vulcanização | liderança (login) |
| `/emenda/` | Registro de Emenda | qualquer pessoa com o link (sessão anônima automática) |
| `/medidas/` | Medidas de Correias | livre (app anterior, sem alteração) |

Código-fonte de `escala/` e `emenda/` nesta pasta (`vulcaescala/`); `npm run build:pages` gera os dois.

- **Endereço**: `https://ctvmundovulca.github.io/Correias-AMT-Benetech/`
- Cada app é um arquivo único com service worker, manifest e atualização automática.

## Registro de Emenda

Mesmo formulário do app do contrato Suzano, **sem a seção “Liberação do cliente/fiscal”**:
identificação, efetivo (do cadastro da escala, com matrícula), materiais da emenda e da manta,
equipamentos de medição, dados da emenda, check list da vulcanização, prensa, problemas,
liberações do técnico e do supervisor (assinatura no dedo), fotos e relatório para imprimir/PDF.

- Cálculos automáticos iguais aos do Suzano (viés, passes, estágios, demãos, prensa) — `src/emenda/model.ts`.
- **Organizado por mês**: a lista mostra só o mês escolhido (e só ele é baixado da nuvem);
  busca por TAG/nº/OM no mês e busca da TAG em todos os meses.
- Gravação automática por campo; sem internet o Firestore guarda no aparelho e envia depois.
- Fotos comprimidas no aparelho (máx. 1280 px, JPEG) e gravadas uma por documento.
- Excluir relatório: só administradores.

### Acesso sem login

Não há tela de login: ao abrir, o Firebase cria uma **sessão anônima** automática (ative em
Authentication → Sign-in method → **Anônimo**). As regras aceitam gravações só de sessões do app.
O que a sessão anônima pode: ler/gravar emendas, fotos e listas de materiais; **ler** nomes e
matrículas do efetivo. O que não pode: ver a escala (ausências, atestados), alterar o efetivo,
excluir relatórios.

## Ligar a nuvem (uma vez)

Enquanto `src/cloud/config.ts` tiver `COLE_AQUI`, o app roda em **modo local** (só no aparelho).

1. Em <https://console.firebase.google.com> crie um projeto **novo** (ex.: `vulcaescala-amt`).
   Não use o `rdo-benetech` (é do contrato Suzano).
2. **Authentication → Sign-in method → E-mail/senha → Ativar.**
3. **Authentication → Settings → Domínios autorizados → adicionar** `ctvmundovulca.github.io`.
4. **Authentication → Sign-in method → Anônimo → Ativar** (Registro de Emenda sem login).
5. **Firestore Database → Criar banco** (modo de produção; região sugerida `southamerica-east1`, São Paulo).
6. **Firestore → Regras**: cole o conteúdo de `firebase/firestore.rules` e **Publicar**.
7. **Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie os 6 valores do
   `firebaseConfig` para `src/cloud/config.ts`.
8. `npm run build:pages` e faça commit das pastas `../escala` e `../emenda`.

Primeiro acesso: um administrador abre o app, toca em **Criar conta** e já entra. A nuvem vazia
recebe o efetivo inicial (ou os dados que estavam neste aparelho no modo local). Depois, em
**Dados → Acesso da liderança**, ele libera os e-mails da liderança; cada pessoa toca em
**Criar conta** com o e-mail liberado e já entra (sem confirmação de e-mail).

### Administradores

Ficam **só nas regras do Firestore** (função `isAdmin()` em `firebase/firestore.rules`).
Para incluir ou retirar: Console Firebase → Firestore Database → **Regras** → edite a lista →
**Publicar**. O app descobre sozinho quem é administrador; não precisa gerar versão nova.
(Atualize também o arquivo `firebase/firestore.rules` no repositório para manter a cópia em dia.)

### Funções do cadastro

A lista de funções é editável em **Efetivo → Funções** (qualquer pessoa da liderança): adicionar,
renomear (atualiza todos os colaboradores que têm a função) e remover (só se ninguém usa).
Na nuvem fica em `escala_config/funcoes`.

### Tipos de ausência

Editáveis em **Efetivo → Ausências** (ou "Editar tipos de ausência…" na janela de registrar
ausência): nome, sigla (letra da tabela do resumo) e cor. Os registros guardam o id do tipo, então
editar vale também para o histórico. Tipo já usado não pode ser removido — use **Ocultar** (sai das
opções, o histórico continua com o nome). Na nuvem: `escala_config/ausencias`.

### Feriados e fins de semana (folga automática)

Feriados nacionais calculados como no Registro de Horários (fixos + Carnaval, Sexta-feira Santa e
Corpus Christi pela Páscoa); municipais de **Vitória** cadastrados em **Dados → Feriados**
(`escala_config/feriados`). Num feriado **ou no sábado/domingo**, quem não está em nenhuma atividade aparece como
**folga automática** (não gravada, não conta como pendência). Alocar a pessoa ou registrar outra
ausência muda o status na hora.

### Dias recolhidos

O dia recolhido fica recolhido (escolha guardada no aparelho, por dia da semana) ao trocar de
semana, de aba ou recarregar. O botão de pendência ("Seg: 3") abre só o dia escolhido.

### Segurança

- Só e-mails **liberados** (ou administradores) leem ou gravam — as regras do Firestore valem no
  servidor. Qualquer pessoa pode criar conta, mas sem liberação não vê nada.
- Sem confirmação de e-mail, quem criar a conta primeiro com um e-mail liberado fica com ela.
  Por isso: libere e já crie a conta da pessoa (ou crie pelo console em Authentication →
  Adicionar usuário e passe a senha a ela).
- Os valores do `firebaseConfig` são públicos por natureza (ficam no app); quem protege são as regras.
- Ao sair da conta, a cópia local da escala é apagada do aparelho.

## Rodar

```bash
cd vulcaescala
npm install
npm run dev             # desenvolvimento (modo local)
npm test                # testes unitários (Vitest)
npm run test:firebase   # regras + sincronização no emulador do Firebase (precisa de Java e firebase-tools)
npm run build:pages     # gera ../escala e ../emenda (arquivo único + service worker com versão automática)
```

Teste manual com o emulador: `firebase emulators:start --config firebase/firebase.json --project demo-vulcaescala`
e, no navegador, `localStorage.setItem('vulcaescala:emulador', '127.0.0.1')`.

## Estrutura

```
vulcaescala/
├── firebase/             firestore.rules, firebase.json (emulador) e testes no emulador
├── public/               service-worker.js, app-update.js, manifest, ícones, logo (copiados para ../escala)
├── scripts/stamp-sw.mjs  grava CACHE_VERSION a cada build (força atualização nos aparelhos)
└── src/
    ├── cloud/            config do Firebase AMT, carregador do SDK, sincronização, login
    ├── domain/           regras puras (semana ISO, pendência, resumo, nomes)
    ├── storage/          modo local (StorageRepository, localStorage, migrações)
    ├── state/            reducer (ações idempotentes) e store (local ou nuvem)
    ├── ui/               cabeçalho, modal, confirmação, toast
    ├── features/         escala, resumo, efetivo, consultas, dados
    └── io/               reservado: exportar .xlsx / importar a planilha antiga
```

### Como a sincronização funciona (`src/cloud/sync.ts`)

Mesmo padrão dos apps CTV: abre na hora com a cópia do aparelho; a nuvem conecta em segundo plano.
Cada alteração entra numa fila salva no aparelho e é enviada por **transação** no documento do dia
(`escala_dias/AAAA-Www_D`) ou do colaborador (`escala_efetivo/{id}`). Duas pessoas editando o mesmo
dia não se sobrescrevem: cada uma aplica só a própria alteração sobre a versão mais nova.
Sem internet (ou sinal fraco, com tempo-limite de 15 s), a fila espera e é reenviada depois — as
ações são idempotentes, então reenviar nunca duplica. O que chega da nuvem nunca apaga alterações
ainda não enviadas.

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
