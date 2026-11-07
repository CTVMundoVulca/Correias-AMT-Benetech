# VulcaEscala — contrato AMT

Escala semanal das equipes de vulcanização (contrato **AMT**). Substitui a planilha de 52 abas.
Segue as mesmas configurações do App de Registro de Horários (contrato Suzano), **mas com
projeto Firebase próprio**: dados e contas do AMT não se misturam com os do Suzano.

- **Endereço (após o merge na `main`)**: `https://ctvmundovulca.github.io/Correias-AMT-Benetech/escala/`
- Arquivo único em `../escala/index.html` (gerado), com service worker e atualização automática.
- Login por e-mail e senha (Firebase Auth); dados no Firestore; funciona offline.

## Ligar a nuvem (uma vez)

Enquanto `src/cloud/config.ts` tiver `COLE_AQUI`, o app roda em **modo local** (só no aparelho).

1. Em <https://console.firebase.google.com> crie um projeto **novo** (ex.: `vulcaescala-amt`).
   Não use o `rdo-benetech` (é do contrato Suzano).
2. **Authentication → Sign-in method → E-mail/senha → Ativar.**
3. **Authentication → Settings → Domínios autorizados → adicionar** `ctvmundovulca.github.io`.
4. **Firestore Database → Criar banco** (modo de produção; região sugerida `southamerica-east1`, São Paulo).
5. **Firestore → Regras**: cole o conteúdo de `firebase/firestore.rules` e **Publicar**.
6. **Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie os 6 valores do
   `firebaseConfig` para `src/cloud/config.ts`.
7. `npm run build:pages` e faça commit da pasta `../escala`.

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
npm run build:pages     # gera ../escala (arquivo único + service worker com versão automática)
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
