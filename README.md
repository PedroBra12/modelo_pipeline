# modelo_pipeline

Modelo de repositório para desenvolvimento de software com múltiplos agentes no Claude Code. Traz um pipeline estruturado, agentes especializados com governança de modelos (para economizar tokens sem perder qualidade) e hooks determinísticos em Node.js e Git (sem dependências externas).

---

## Como funciona

Toda alteração no repositório passa pelas mesmas etapas, na mesma ordem:

**`classificar → playbook → portões → revisão e QA → commit → relatório`**

### 1. Estrutura do modelo

| Caminho | Papel |
|---|---|
| [`.claude/skills/pipeline/SKILL.md`](.claude/skills/pipeline/SKILL.md) | O fluxo central e os playbooks ([`decisao.md`](.claude/skills/pipeline/decisao.md), [`feature.md`](.claude/skills/pipeline/feature.md), [`bug.md`](.claude/skills/pipeline/bug.md), [`refactor.md`](.claude/skills/pipeline/refactor.md), [`fase.md`](.claude/skills/pipeline/fase.md)) |
| [`.claude/skills/ORIGEM.md`](.claude/skills/ORIGEM.md) | Skills de apoio para design, TDD, diagnóstico e revisão (origem e licenças MIT) |
| [`.claude/agents/`](.claude/agents/orquestrador.md) | Agentes fixos com papel, ferramentas, modelo e esforço travados |
| [`.claude/hooks/AGENTS.md`](.claude/hooks/AGENTS.md) | Guardas e portões determinísticos (Node 24 + Git, sem pacotes externos) |
| [`.claude/pipeline.json`](.claude/pipeline.json) | Configuração única lida pelos hooks (`repositorio`, `portaoRapido`, `pastasDeTrabalho`) |
| [`.claude/settings.json`](.claude/settings.json) | Liga os hooks do Claude Code (`PreToolUse`, `PostToolUse`, `Stop`) e o plugin `frontend-design` |
| [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`PRODUCT.md`](PRODUCT.md), [`docs/`](docs/arquitetura.md) | Modelos de documentação e regras do projeto com marcadores `<...>` para preencher |

### 2. Agentes e economia de tokens

O modelo separa quem **planeja e julga** (`opus`) de quem **localiza documentação** (`haiku`) e de quem **escreve código e testa** (`sonnet`), mantendo o contexto do chat principal enxuto:

| Agente | Modelo | Esforço | Papel |
|---|---|---|---|
| [`orquestrador`](.claude/agents/orquestrador.md) | `opus` | `xhigh` | Agente do chat principal (`claude --agent orquestrador`): planeja pelos `AGENTS.md`, divide tarefas por pasta/worktree, delega código ao `sonnet`, aciona revisores/QA e conduz PRs. Nunca roda como subagente |
| [`leitor-docs`](.claude/agents/leitor-docs.md) | `haiku` | `low` | Batedor de leitura: usa `Grep`/`Glob` em `docs/` e nos `AGENTS.md` e devolve apenas os arquivos e linhas exatas onde o orquestrador deve focar |
| `general-purpose` (código) | `sonnet` | `low` / `medium` / `high` | Escreve código, testes e migrações em worktree isolado (`isolation: "worktree"`), apenas na sua pasta |
| [`qa`](.claude/agents/qa.md) | `sonnet` | `high` | Roda o projeto localmente depois dos portões verdes, testa casos de borda e devolve cada defeito com o comando que o reproduz |
| [`revisor-arquitetura`](.claude/agents/revisor-arquitetura.md) | `opus` | `high` | Confere fronteiras entre pastas, contratos públicos, tipagem, `AGENTS.md` e decisões em [`docs/decisoes.md`](docs/decisoes.md) |
| [`revisor-seguranca`](.claude/agents/revisor-seguranca.md) | `opus` | `xhigh` | Confere isolamento entre donos de dado, autenticação/permissão, superfície de rede, injeção e segredos |
| [`revisor-lgpd`](.claude/agents/revisor-lgpd.md) | `opus` | `high` | Confere finalidade, base legal, direitos do titular, retenção e supressões `lgpd-ignora` |

### 3. Hooks (Claude Code + Git)

As regras inegociáveis não dependem só da memória do LLM; elas são fiscalizadas em duas camadas:

- **No Claude Code ([`.claude/settings.json`](.claude/settings.json)):**
  - [`guarda-git.mjs`](.claude/hooks/guarda-git.mjs) (`PreToolUse` em `Bash`/`PowerShell`): bloqueia `push --force`, exclusão de branch remoto, `commit --no-verify`, `gh pr merge` (o merge é sempre humano), PR que não nasça como rascunho (`--draft`), leitura de tokens e envio para fora do repositório configurado. Pede confirmação explícita do usuário em todo `git push` e escrita em PR.
  - [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) (`PreToolUse` em `Agent`): impede `fork` (que herdaria o `opus` do chat principal), exige `model` e `effort` explícitos em subagentes comuns, garante que os agentes fixos rodem com o cabeçalho íntegro e pede confirmação se um subagente fora dos fixos pedir `opus`.
  - [`confere-lgpd.mjs`](.claude/hooks/confere-lgpd.mjs) (`PreToolUse` em edições de arquivo e `pre-commit` no Git): barra dado pessoal literal (CPF válido, cartão com Luhn, telefone com DDD real, e-mail fora de domínios de teste), chaves/segredos, `select *` em tabela pessoal, SQL concatenado e PII em logs/URLs (regras em [`lgpd-regras.mjs`](.claude/hooks/lgpd-regras.mjs)).
  - [`marca-alterado.mjs`](.claude/hooks/marca-alterado.mjs) (`PostToolUse`) + [`portao.mjs`](.claude/hooks/portao.mjs) (`Stop`): quando código é editado no turno, roda automaticamente `npm run <portaoRapido>` antes de a IA encerrar. Se falhar, bloqueia a parada com as últimas 60 linhas do erro; quando passa, lembra uma vez de disparar a revisão do pipeline.
- **No Git (`.claude/hooks/git/`):**
  - [`confere-ramo.mjs`](.claude/hooks/confere-ramo.mjs) (`pre-commit` e `pre-merge-commit`) e [`confere-main.mjs`](.claude/hooks/confere-main.mjs) (`reference-transaction`): impedem commits, merges ou reescritas locais direto na `main` (todo trabalho vai num branch `pr/<assunto-em-kebab>`; a `main` só avança por `git pull --ff-only`).
  - [`confere-docs.mjs`](.claude/hooks/confere-docs.mjs) (`commit-msg`): recusa o commit se uma pasta de trabalho não tiver `AGENTS.md` com `Faz:`, `Não faz:` e `Como testar:`, se citar arquivo inexistente, se houver link relativo quebrado em `.md` ou se o código da pasta mudou sem atualizar o `AGENTS.md` (ou declarar `Docs-conferidos: <pasta>/AGENTS.md` na mensagem).
  - [`confere-push.mjs`](.claude/hooks/confere-push.mjs) (`pre-push`): trava push direto na `main`, push forçado ou push para URL diferente de [`.claude/pipeline.json`](.claude/pipeline.json).

---

## Como usar

### 1. Iniciar um projeto novo com este modelo

1. Copie os arquivos para a raiz do seu projeto (no Git Bash: `cp -r modelo_pipeline/. <projeto>/`) e substitua este `README.md` pelo do seu projeto (o [`confere-docs.mjs`](.claude/hooks/confere-docs.mjs) exige um `README.md` na raiz). Se o projeto já tiver `.gitignore`, junte as linhas.
2. Configure [`.claude/pipeline.json`](.claude/pipeline.json):
   - `repositorio`: `dono/repo` no GitHub (enquanto estiver `<dono>/<repo>`, todo push e PR é bloqueado por segurança);
   - `portaoRapido`: nome do script no `package.json` que roda checagem de tipos, lint e testes rápidos no fim de cada turno (padrão: `checar:rapido`);
   - `pastasDeTrabalho`: lista de regex das pastas que exigem `AGENTS.md` próprio.
3. Preencha os marcadores `<...>` em [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`PRODUCT.md`](PRODUCT.md), [`docs/plano.md`](docs/plano.md), [`docs/arquitetura.md`](docs/arquitetura.md) e [`docs/decisoes.md`](docs/decisoes.md).
4. Ative os hooks do Git no repositório (uma vez por clone):
   ```bash
   git config core.hooksPath .claude/hooks/git
   ```
5. Valide a suíte de testes dos hooks (317 testes):
   ```bash
   node --test ".claude/hooks/*.test.mjs"
   ```

### 2. Abrir o terminal com o agente Orquestrador (e criar alias)

Para rodar o chat principal como [`orquestrador`](.claude/agents/orquestrador.md) em modo `bypassPermissions` (as guardas de `PreToolUse` continuam ativas: bloqueiam o que é proibido e pedem confirmação para `push`, escrita em PR e subagente `opus`):

```bash
claude --agent orquestrador --permission-mode bypassPermissions
```

Para abrir direto com um alias (`nome_alias`), adicione ao seu terminal:

- **Bash / Zsh (Git Bash, Linux, macOS)** — adicione ao `~/.bashrc` ou `~/.zshrc`:
  ```bash
  alias nome_alias='claude --agent orquestrador --permission-mode bypassPermissions'
  ```
  Recarregue com `source ~/.bashrc` (ou `source ~/.zshrc`) e execute `nome_alias`.

- **PowerShell (Windows)** — adicione ao perfil do PowerShell (`notepad $PROFILE`):
  ```powershell
  function nome_alias { claude --agent orquestrador --permission-mode bypassPermissions @args }
  ```
  Recarregue com `. $PROFILE` e execute `nome_alias`.

---

## O que adaptar

- **Projeto sem dados pessoais (sem LGPD):**
  1. Remova o bloco do matcher `Edit|Write|MultiEdit|NotebookEdit` em `PreToolUse` no [`.claude/settings.json`](.claude/settings.json);
  2. Remova a chamada do `confere-lgpd.mjs` em [`.claude/hooks/git/pre-commit`](.claude/hooks/git/pre-commit);
  3. Remova o `revisor-lgpd` da seção 4 de [`.claude/skills/pipeline/SKILL.md`](.claude/skills/pipeline/SKILL.md), da tabela `AGENTES_FIXOS` em [`.claude/hooks/guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) e apague `.claude/agents/revisor-lgpd.md`.
- **Criar ou alterar um agente fixo:**
  Todo arquivo `.md` em `.claude/agents/` precisa estar registrado em `AGENTES_FIXOS` (ou `SO_NO_CHAT`) dentro de [`.claude/hooks/guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) com o mesmo `name`, `model`, `effort` e `tools`. Caso contrário, a guarda bloqueia a execução e `guarda-agentes.test.mjs` falha.
- **Regras específicas do domínio do projeto:**
  Escreva as invariantes de negócio, isolamento de dados, autenticação e integrações no item 8 de [`CLAUDE.md`](CLAUDE.md) e detalhe em [`docs/arquitetura.md`](docs/arquitetura.md). Os agentes [`revisor-arquitetura`](.claude/agents/revisor-arquitetura.md), [`revisor-seguranca`](.claude/agents/revisor-seguranca.md) e [`revisor-lgpd`](.claude/agents/revisor-lgpd.md) leem diretamente desses dois arquivos.
- **Layout de pastas (`monorepo` ou pacote único):**
  Ajuste o array `pastasDeTrabalho` em [`.claude/pipeline.json`](.claude/pipeline.json) (mantendo o sufixo `(?=/)` nas regex para que pastas agrupadoras como `apps/` ou `src/` não sejam cobradas como pastas de trabalho folha).
