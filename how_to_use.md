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

## 5. Como escolher o esforço (`rapido`, `medio`, `alto`): Modo Hard vs. Modo Soft

O pipeline tem **3 níveis de esforço** (`rapido`, `medio` e `alto`):

| Esforço | O que roda | Quando usar |
|---|---|---|
| **`medio` (padrão)** | Código + portões + `revisor-seguranca`, `ponytail-review` (se mudança grande), `revisor-tela` (se mudou layout), `qa` e autoanálise _(sem `revisor-arquitetura` e `revisor-lgpd`)_ | **Dia a dia (90% das tarefas):** features comuns, correções de bug, refatorações normais |
| **`rapido`** | Código + portões mecânicos (`portaoRapido`, `confere-lgpd`, `confere-docs`) _(sem revisores, sem `qa` e sem autoanálise; trava se o diff tocar gatilho de risco)_ | Ajustes pontuais em partes não essenciais (textos, estilos simples, scripts internos sem risco) |
| **`alto`** | Código + portões + **todos** os revisores acionados (`revisor-arquitetura` e `revisor-lgpd` inclusive) + `qa` + autoanálise | Mudanças críticas de arquitetura, banco de dados/migrations, permissões, autenticação ou LGPD |

Você pode escolher o esforço de **duas formas**: **Hard** (100% travado por você no sistema operacional/disco, sem passar pela decisão da LLM) ou **Soft** (pedindo no chat com confirmação).

---

### A) Modo HARD (você trava mecanicamente antes ou fora da LLM)

Use quando quiser **garantia absoluta** de que a sessão ou tarefa vai rodar naquele esforço sem depender de a LLM interpretar seu texto:

#### Opção Hard 1 — Pela variável de ambiente `PIPELINE_ESFORCO` ao abrir o Claude Code (mais forte de todas)
Os 3 hooks ([`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs), [`escolhe-revisores.mjs`](.claude/hooks/escolhe-revisores.mjs) e [`portao.mjs`](.claude/hooks/portao.mjs)) leem `PIPELINE_ESFORCO` **antes** do arquivo `.claude/estado/esforco`. Mesmo que a LLM tente escrever outro valor no arquivo, a variável de ambiente vence durante toda a sessão:

```bash
# Abre o Claude Code travado em rápido para a sessão inteira:
PIPELINE_ESFORCO=rapido claude --agent orquestrador --permission-mode bypassPermissions

# Abre travado em médio (padrão):
PIPELINE_ESFORCO=medio claude --agent orquestrador --permission-mode bypassPermissions

# Abre travado em alto:
PIPELINE_ESFORCO=alto claude --agent orquestrador --permission-mode bypassPermissions
```

> **Dica:** adicione 3 aliases no seu `~/.zshrc` ou `~/.bashrc`:
> ```bash
> alias c-rapido='PIPELINE_ESFORCO=rapido claude --agent orquestrador --permission-mode bypassPermissions'
> alias c-medio='PIPELINE_ESFORCO=medio claude --agent orquestrador --permission-mode bypassPermissions'
> alias c-alto='PIPELINE_ESFORCO=alto claude --agent orquestrador --permission-mode bypassPermissions'
> ```

#### Opção Hard 2 — Gravando `.claude/estado/esforco` você mesmo com `!` dentro do Claude Code (para trocar no meio da sessão)
Dentro do prompt do Claude Code, qualquer linha que começa com `!` roda **direto no seu shell humano** (sem passar pela LLM e sem pedir confirmação):

```text
!mkdir -p .claude/estado && printf 'rapido\n' > .claude/estado/esforco
```
Pronto: o arquivo `.claude/estado/esforco` já está gravado no disco. Na sequência, basta mandar sua tarefa normal que a `guarda-agentes.mjs` já bloqueará qualquer tentativa da LLM de abrir revisores ou `qa`, e o `portao.mjs` já liberará no verde de primeira. Para voltar ao padrão depois:
```text
!printf 'medio\n' > .claude/estado/esforco
```

---

### B) Modo SOFT (pelo chat, com guardrails nos hooks)

Se você não travou por variável de ambiente nem pelo `!`, pode pedir direto na conversa usando os comandos `/rapido`, `/medio` ou `/alto`:

- **Usando o padrão (`medio`):**
  > `Crie o filtro por período na listagem de pedidos e adicione os testes.`
  *(Ou `/medio Crie o filtro...`)*
- **Usando o modo rápido (`/rapido`):**
  > `/rapido Ajuste o texto do botão de exportação na tela de relatórios.`
- **Usando o modo alto (`/alto`):**
  > `/alto Adicione a migration de permissões por filial e aplique a validação na rota de faturamento.`

**Por que mesmo no Modo Soft a LLM não consegue burlar para `rapido` sozinha?**
1. Enquanto `.claude/estado/esforco` não existir, a [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) bloqueia (`deny`) qualquer subagente de código, revisão ou QA.
2. Quando a LLM roda o comando para gravar `rapido` em `.claude/estado/esforco`, a [`guarda-git.mjs`](.claude/hooks/guarda-git.mjs) intercepta e **abre uma confirmação (`ask`) na sua tela** (*"confirme o esforço rapido em .claude/estado/esforco"*). Sem o seu "Allow", ela não entra no `rapido`.
3. Mesmo após aprovado o `rapido`, se o código alterado tocar qualquer gatilho de risco (`banco`, `permissao`, `dado_pessoal`, `config_pipeline`, `lgpd_ignora`, `lgpd_regras` ou `confere-lgpd`), o [`escolhe-revisores.mjs`](.claude/hooks/escolhe-revisores.mjs) falha com `exit 2` e obriga a subir para `medio` ou `alto`.

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
