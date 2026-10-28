# Guia Prático: Como Usar o `modelo_pipeline` (`how_to_use.md`)

Este guia foi feito para quem **nunca abriu este repositório** e quer entender, do zero, como instalar o pipeline em um projeto e como trabalhar com ele no dia a dia usando o Claude Code.

---

## 1. O que é isto (em 30 segundos)

Em vez de pedir código em um chat solto onde um único modelo faz tudo, esquece regras e commita direto na `main`, este modelo transforma o Claude Code em uma **equipe com travas mecânicas (hooks)**:

- **Chat principal ([`orquestrador`](.claude/agents/orquestrador.md)):** planeja lendo os mapas das pastas (`AGENTS.md`), divide a tarefa, delega e revisa. Ele **não** escreve código direto.
- **Agentes de código (`sonnet` em worktree isolado):** escrevem o código e os testes apenas na pasta que receberam.
- **Portões e Guardas (`.claude/hooks/`):** scripts em Node.js + Git que bloqueiam commit na `main`, vazamento de dados pessoais (LGPD), falta de documentação (`AGENTS.md`), `git push --force`, merge de PR pela IA ou fim de turno com testes quebrados.
- **Revisores e QA (`.claude/agents/`):** agentes especializados (`revisor-seguranca`, `revisor-tela`, `revisor-arquitetura`, `revisor-lgpd`, `ponytail-review` e `qa`) escolhidos mecanicamente pelo diff da mudança.

---

## 2. Pré-requisitos na sua máquina

Antes de começar, confira se você tem instalados:

1. **Node.js 24+** (`node -v`)
2. **Git** (`git --version`)
3. **GitHub CLI** (`gh --version`) autenticado com `gh auth login`
4. **Claude Code CLI** (`claude --version`)

---

## 3. Passo a passo: criando um projeto novo com este modelo

### Passo 1 — Crie o repositório no GitHub e clone
Crie o repositório no GitHub **marcando a opção de criar com um `README.md` inicial** (para que a branch `main` já nasça lá) e clone para a sua máquina:

```bash
git clone https://github.com/<seu-usuario-ou-org>/<seu-repo>.git
cd <seu-repo>
```

### Passo 2 — Copie os arquivos do `modelo_pipeline` (sem a pasta `.git`)
De dentro da pasta do seu projeto recém-clonado, copie o conteúdo do `modelo_pipeline`:

```bash
git -C /caminho/para/modelo_pipeline archive HEAD | tar -x
```

### Passo 3 — Ative os hooks do Git e crie o primeiro branch
Os hooks do Git impedem commits diretos na `main`. Ative-os (uma vez por clone) e já saia da `main`:

```bash
git config core.hooksPath .claude/hooks/git
git switch -c pr/configuracao-inicial
```

### Passo 4 — Configure o [`.claude/pipeline.json`](.claude/pipeline.json)
Abra o arquivo `.claude/pipeline.json` e ajuste os 3 campos principais do seu projeto:

1. **`"repositorio"`**: coloque `"<seu-usuario-ou-org>/<seu-repo>"` (ex.: `"minha-empresa/meu-sistema"`). Enquanto não for o repositório real do projeto, a guarda bloqueia `git push` e criação de PR.
2. **`"portaoRapido"`**: o nome do script no seu `package.json` que roda lint/tipos/testes rápidos (padrão: `"checar:rapido"`).
3. **`"pastasDeTrabalho"`**: lista de expressões regulares das pastas onde mora o código do projeto e que devem ter um arquivo `AGENTS.md` próprio (por exemplo, `"^src/(?:api|web|db)(?=/)"`).

### Passo 5 — Preencha os documentos base do projeto
Substitua os trechos entre `<...>` nos arquivos abaixo com as informações reais do seu projeto:

- [`CLAUDE.md`](CLAUDE.md) — regras inegociáveis do projeto e comandos de "Como rodar".
- [`AGENTS.md`](AGENTS.md) — mapa das pastas da raiz.
- [`PRODUCT.md`](PRODUCT.md) — quem usa o produto e para quê.
- [`docs/arquitetura.md`](docs/arquitetura.md), [`docs/plano.md`](docs/plano.md) e [`docs/decisoes.md`](docs/decisoes.md).

> **Importante:** cada pasta listada em `pastasDeTrabalho` precisa ter um arquivo `AGENTS.md` contendo as seções `Faz:`, `Não faz:` e `Como testar:` (há um modelo comentado no final do [`AGENTS.md`](AGENTS.md) da raiz).

### Passo 6 — Rode os testes do pipeline para validar a instalação
```bash
node --test ".claude/hooks/*.test.mjs"
```
Todos os testes devem passar verdes.

### Passo 7 — Faça o primeiro commit e abra o PR
```bash
git add .
git commit -m "Configura pipeline inicial do projeto"
git push -u origin pr/configuracao-inicial
gh pr create --draft --fill
```
Depois, marque o PR como pronto e faça o merge pelo GitHub (o merge é sempre humano).

---

## 4. Como abrir o Claude Code no dia a dia

Na pasta do projeto, você pode abrir o Claude Code de duas formas:

### Forma normal
```bash
claude
```
O arquivo [`.claude/settings.json`](.claude/settings.json) já abre a sessão automaticamente com o agente [`orquestrador`](.claude/agents/orquestrador.md) no modelo e esforço corretos.

### Forma recomendada (sem perguntas repetitivas de permissão, mantendo todas as travas de segurança)
```bash
claude --agent orquestrador --permission-mode bypassPermissions
```
Mesmo em `bypassPermissions`, os hooks de `PreToolUse` continuam ativos: eles bloqueiam comandos proibidos (`push --force`, `gh pr merge`, edição com CPF/dado pessoal) e **pedem sua confirmação na tela (`ask`)** antes de qualquer `git push`, escrita em PR ou ativação do modo rápido (`/rapido`).

Você pode criar um atalho (`alias`) no seu `~/.zshrc` ou `~/.bashrc`:
```bash
alias c='claude --agent orquestrador --permission-mode bypassPermissions'
```

---

## 5. Como pedir tarefas (os 3 níveis de esforço)

O pipeline tem **3 níveis de esforço** (`rapido`, `medio` e `alto`) controlados por travas mecânicas nos hooks:

| Como chamar no chat | Esforço | O que roda | Quando usar |
|---|---|---|---|
| Apenas digite a tarefa (ou `/medio <tarefa>`) | **`medio` (padrão)** | Código + portões + `revisor-seguranca`, `ponytail-review` (se mudança grande), `revisor-tela` (se mudou layout), `qa` e autoanálise _(sem `revisor-arquitetura` e `revisor-lgpd`)_ | **Dia a dia (90% das tarefas):** features comuns, correções de bug, refatorações normais |
| `/rapido <tarefa>` | **`rapido`** | Código + portões mecânicos (`portaoRapido`, `confere-lgpd`, `confere-docs`) _(sem revisores, sem `qa` e sem autoanálise)_ | Ajustes pontuais em partes não essenciais (textos, estilos simples, scripts internos sem risco) |
| `/alto <tarefa>` | **`alto`** | Código + portões + **todos** os revisores acionados (`revisor-arquitetura` e `revisor-lgpd` inclusive) + `qa` + autoanálise | Mudanças críticas de arquitetura, banco de dados/migrations, permissões, autenticação ou LGPD |

### Exemplos práticos no prompt do Claude Code:

- **Usando o padrão (`medio`):**
  > `Crie o filtro por período na listagem de pedidos e adicione os testes.`
- **Usando o modo rápido (`rapido`):**
  > `/rapido Ajuste o texto do botão de exportação na tela de relatórios.`
  *(O Claude Code vai exibir um pedido de confirmação na tela para você autorizar o esforço `rapido`, e o script `escolhe-revisores.mjs` vai recusar automaticamente caso o código toque banco, permissão, dado pessoal ou configuração do pipeline).*
- **Usando o modo alto (`alto`):**
  > `/alto Adicione a migration de permissões por filial e aplique a validação na rota de faturamento.`

---

## 6. O que acontece passo a passo durante uma tarefa

Quando você envia um pedido, o `orquestrador` segue este roteiro:

1. **Classificação e trava de esforço:** ele lê os `AGENTS.md`, classifica o caminho (`feature`, `bug`, `refactor`, `decisao`, `fase` ou `trivial`), grava o esforço em `.claude/estado/esforco` (sem esse arquivo, a [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) bloqueia qualquer delegação) e abre a resposta com:
   `Pipeline: feature · esforço: medio`
2. **Se exigir decisão de arquitetura:** antes de escrever qualquer código, ele para, apresenta as opções com prós e contras e aguarda sua escolha para registrar em [`docs/decisoes.md`](docs/decisoes.md).
3. **Delegação por pasta:** ele cria um pacote de contexto enxuto (máximo de 50 mil tokens) e chama um subagente `sonnet` por pasta (em worktree isolado se houver mais de um em paralelo).
4. **Portões automáticos:**
   - Ao final do turno em que houve edição de código, o hook [`portao.mjs`](.claude/hooks/portao.mjs) roda `npm run <portaoRapido>` sozinho.
   - O hook [`confere-lgpd.mjs`](.claude/hooks/confere-lgpd.mjs) confere se não entrou dado pessoal nem segredo.
5. **Revisão mecânica e QA:** o orquestrador roda `node .claude/hooks/escolhe-revisores.mjs main HEAD`:
   - No `rapido`, o script apenas valida que nenhum gatilho de risco foi tocado e dispensa revisores e `qa`.
   - No `medio` e no `alto`, o script lista quais revisores e `qa` são obrigatórios para aquele diff, e o orquestrador os dispara em paralelo.
6. **Commit, Push e PR:**
   - Se o código de uma pasta mudou mas o contrato público no `AGENTS.md` dela continua igual, o commit inclui no rodapé: `Docs-conferidos: <pasta>/AGENTS.md`.
   - O `git push` e o `gh pr create --draft` pedem sua confirmação na tela.
7. **Autoanálise (no `medio` e no `alto`):** antes de encerrar, um subagente grava o resumo de tokens e achados da sessão em `docs/pipeline/sessoes/` e roda [`ajusta-pipeline.mjs`](.claude/hooks/ajusta-pipeline.mjs) para ajustar o esforço dos revisores ao longo do tempo.

---

## 7. Comandos úteis e resolução de dúvidas rápidas

- **Ver quais revisores um branch exige:**
  ```bash
  node .claude/hooks/escolhe-revisores.mjs main HEAD
  ```
- **Testar mudanças ainda não commitadas na árvore de trabalho:**
  ```bash
  node .claude/hooks/escolhe-revisores.mjs --trabalho
  ```
- **Rodar a varredura de LGPD manualmente numa pasta:**
  ```bash
  node .claude/hooks/confere-lgpd.mjs src
  ```
- **Ver o relatório de eficiência dos agentes (autoajuste):**
  ```bash
  node .claude/hooks/ajusta-pipeline.mjs --relatorio
  ```
- **Rodar todos os testes das guardas do pipeline:**
  ```bash
  node --test ".claude/hooks/*.test.mjs"
  ```
- **"O commit foi recusado pelo `confere-docs`":**
  Verifique a mensagem de erro: ou faltou atualizar o `AGENTS.md` da pasta alterada, ou — se o `AGENTS.md` já estava atualizado — faltou incluir a linha `Docs-conferidos: <pasta>/AGENTS.md` no final da mensagem de commit.
- **"Quero rodar um comando Git que a guarda bloqueia para a IA":**
  Dentro do Claude Code, comece a linha com `!` (ex.: `!git branch -D meu-branch-antigo`) para executar diretamente no seu shell humano, ou rode em outro terminal.
