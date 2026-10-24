# modelo_pipeline

Modelo de repositório para desenvolvimento de software com múltiplos agentes no Claude Code. Traz um pipeline estruturado, agentes especializados com governança de modelos (para economizar tokens sem perder qualidade), hooks determinísticos em Node.js e Git (sem dependências externas) e um **autoajuste**: o pipeline mede cada sessão e ajusta sozinho o esforço dos revisores, dentro de pisos e tetos que moram no código.

---

## Como funciona

Toda alteração no repositório passa pelas mesmas etapas, na mesma ordem:

**`classificar → playbook → portões → revisão e QA → commit → relatório → autoanálise`**

### 1. Estrutura do modelo

| Caminho | Papel |
|---|---|
| [`.claude/skills/pipeline/SKILL.md`](.claude/skills/pipeline/SKILL.md) | O fluxo central e os playbooks ([`decisao.md`](.claude/skills/pipeline/decisao.md), [`feature.md`](.claude/skills/pipeline/feature.md), [`bug.md`](.claude/skills/pipeline/bug.md), [`refactor.md`](.claude/skills/pipeline/refactor.md), [`fase.md`](.claude/skills/pipeline/fase.md)) |
| [`.claude/skills/adjust-pipeline/SKILL.md`](.claude/skills/adjust-pipeline/SKILL.md) | O autoajuste: gravar a sessão, rodar a conta, aplicar o que desce e propor o que sobe (D2) |
| [`.claude/skills/ORIGEM.md`](.claude/skills/ORIGEM.md) | Skills de apoio para design, TDD, diagnóstico e revisão (origem e licenças MIT) |
| [`.claude/agents/`](.claude/agents/orquestrador.md) | Agentes fixos com papel, ferramentas, modelo e esforço travados |
| [`.claude/hooks/AGENTS.md`](.claude/hooks/AGENTS.md) | Guardas, portões e scripts do pipeline (Node 24 + Git, sem pacotes externos) |
| [`.claude/pipeline.json`](.claude/pipeline.json) | A configuração que os hooks leem: `repositorio`, `portaoRapido`, `pastasDeTrabalho`, e o par (modelo e esforço) de cada agente e nível, os gatilhos de revisão e a regra do ajuste |
| [`.claude/settings.json`](.claude/settings.json) | Abre toda sessão como o `orquestrador` em `opus` e `xhigh` (D3), liga os hooks do Claude Code (`PreToolUse`, `PostToolUse`, `Stop`) e o plugin `frontend-design` |
| [`docs/pipeline/sessoes/`](docs/pipeline/sessoes/MODELO.md) | A autoanálise de cada sessão (`MODELO.md` é o formato); os ajustes ficam em `docs/pipeline/ajustes/` |
| [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`PRODUCT.md`](PRODUCT.md), [`docs/`](docs/arquitetura.md) | Modelos de documentação e regras do projeto com marcadores `<...>` para preencher. [`docs/decisoes.md`](docs/decisoes.md) já traz D1 (o pipeline), D2 (o autoajuste) e D3 (a regra do par) |

### 2. Agentes e a regra do par

O modelo separa quem **planeja e julga** (`opus`) de quem **localiza documentação** (`haiku`) e de quem **escreve código e roda as coisas** (`sonnet`), mantendo o contexto do chat principal enxuto. A **regra do par** (D3) diz de onde vem cada escolha:

- **O papel dá o modelo, que não se ajusta:** quem julga lendo é `opus`; quem escreve ou roda é `sonnet`; quem só aponta é `haiku`.
- **O custo do erro dá o esforço de partida, em quatro faixas:**
  - a mais alta, para quem orquestra e para o revisor cujo erro vaza dado entre donos ou abre a guarda;
  - a segunda, para quem revisa ou testa e para o código que toca um gatilho de risco;
  - a terceira, para o resto do código;
  - a mais baixa, para o trivial.
- **Depois, só a conta do autoajuste mexe no esforço**, um degrau por vez e sem trocar o modelo (seção 4).
- **O orquestrador é `opus xhigh`, sempre.** O `settings.json` abre toda sessão assim e vence o `settings.json` do usuário. A `guarda-agentes` nega delegar se o chat for trocado para outro par.

| Agente | Modelo | Papel |
|---|---|---|
| [`orquestrador`](.claude/agents/orquestrador.md) | `opus` | Agente do chat principal: planeja pelos `AGENTS.md`, divide tarefas por pasta/worktree, delega código ao `sonnet`, roda os revisores que o `escolhe-revisores.mjs` manda, o QA, o PR e a autoanálise. Nunca roda como subagente |
| [`leitor-docs`](.claude/agents/leitor-docs.md) | `haiku` | Batedor de leitura: usa `Grep`/`Glob` em `docs/` e nos `AGENTS.md` e devolve só os arquivos e linhas onde o orquestrador deve focar |
| `general-purpose` (código) | `sonnet` | Escreve código, testes e migrações em worktree isolado (`isolation: "worktree"`), só na sua pasta, no nível `leve`, `medio` ou `codigo-seguranca` |
| `general-purpose` (`ponytail-review`) | `sonnet` | Revisão de qualidade com experimentos: roda o código para achar o defeito de comportamento que quem só lê não acha |
| [`qa`](.claude/agents/qa.md) | `sonnet` | Roda o projeto localmente depois dos portões verdes (sem repeti-los), testa casos de borda e devolve cada defeito com o comando que o reproduz |
| [`revisor-arquitetura`](.claude/agents/revisor-arquitetura.md) | `opus` | Confere fronteiras entre pastas, contratos públicos, tipagem, `AGENTS.md` e decisões em [`docs/decisoes.md`](docs/decisoes.md) |
| [`revisor-seguranca`](.claude/agents/revisor-seguranca.md) | `opus` | Confere isolamento entre donos de dado, autenticação/permissão, superfície de rede, injeção e segredos, inclusive no código do próprio pipeline |
| [`revisor-lgpd`](.claude/agents/revisor-lgpd.md) | `opus` | Confere finalidade, base legal, direitos do titular, retenção e supressões `lgpd-ignora` |
| [`revisor-tela`](.claude/agents/revisor-tela.md) | `sonnet` | Dono do portão 5: sobe o app local com dado inventado, vê cada tela tocada a 320 px e a 1280 px e confere com o `PRODUCT.md` |

O esforço de cada um mora em [`.claude/pipeline.json`](.claude/pipeline.json), e a tabela da [skill `pipeline`, seção 7](.claude/skills/pipeline/SKILL.md) é gerada dali. Ele não se repete em nenhum outro documento: um teste recusa a cópia, para que o ajuste nunca deixe texto desatualizado.

### 3. Hooks e scripts (Claude Code + Git)

As regras inegociáveis não dependem só da memória do LLM; elas são fiscalizadas em duas camadas.

- **No Claude Code ([`.claude/settings.json`](.claude/settings.json)):**
  - [`guarda-git.mjs`](.claude/hooks/guarda-git.mjs) (`PreToolUse` em `Bash`/`PowerShell`):
    - bloqueia `push --force`, exclusão de branch remoto, `commit --no-verify`, `gh pr merge` (o merge é sempre humano), PR que não nasça como rascunho (`--draft`), leitura de tokens e envio para fora do repositório configurado;
    - nega desligar os hooks do Git pelo ambiente (`GIT_CONFIG_*`, `NODE_OPTIONS`, `-c include.path`);
    - pede confirmação explícita do usuário em todo `git push` e escrita em PR.
  - [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) (`PreToolUse` em `Agent`):
    - nega delegar quando o chat principal não está em `opus xhigh`;
    - nega subagente que abre subagente e o `fork`, que herdaria o modelo do chat;
    - exige `model` e `effort` explícitos nos subagentes comuns;
    - garante que os agentes fixos rodem no par do `pipeline.json` com o cabeçalho íntegro;
    - pede confirmação acima do teto do código ou quando um subagente comum pede `opus`.
  - [`confere-lgpd.mjs`](.claude/hooks/confere-lgpd.mjs) (`PreToolUse` em edições de arquivo e `pre-commit` no Git):
    - barra dado pessoal literal (CPF válido, cartão com Luhn, telefone com DDD real, e-mail fora de domínios de teste), chaves e segredos, `select *` em tabela pessoal, SQL concatenado e PII em logs e URLs (regras em [`lgpd-regras.mjs`](.claude/hooks/lgpd-regras.mjs));
    - o "legado" é opcional, para o projeto que adota o modelo com dívida antiga: com `"lgpd": { "legadoAte": "<sha>" }` no `pipeline.json`, o achado que já estava igual naquele commit não bloqueia, só é contado (`--todos` o lista). O trecho achado que muda tem de sair limpo, e CPF, cartão e chave nunca viram legado. Sem a chave, não há legado.
  - [`marca-alterado.mjs`](.claude/hooks/marca-alterado.mjs) (`PostToolUse`) + [`portao.mjs`](.claude/hooks/portao.mjs) (`Stop`):
    - quando código é editado no turno, roda `npm run <portaoRapido>` antes de a IA encerrar;
    - se falhar, bloqueia a parada com as últimas 60 linhas do erro;
    - quando passa, lembra uma vez de disparar a revisão do pipeline.
- **No Git (`.claude/hooks/git/`):**
  - [`confere-ramo.mjs`](.claude/hooks/confere-ramo.mjs) (`pre-commit` e `pre-merge-commit`) e [`confere-main.mjs`](.claude/hooks/confere-main.mjs) (`reference-transaction`): impedem commits, merges ou reescritas locais direto na `main`. Todo trabalho vai num branch `pr/<assunto-em-kebab>`, e a `main` só avança por `git pull --ff-only`.
  - `pre-commit`: além do `confere-ramo` e do `confere-lgpd`, roda os testes do pipeline (`node --test`) quando o commit toca `.claude/`. Quem muda a regra tem de passar nos testes dela. O `pre-merge-commit` também roda o `confere-lgpd`.
  - [`confere-docs.mjs`](.claude/hooks/confere-docs.mjs) (`commit-msg`): recusa o commit se uma pasta de trabalho não tiver `AGENTS.md` com `Faz:`, `Não faz:` e `Como testar:`. Recusa também quando o `AGENTS.md` cita arquivo inexistente (o nome simples entre crases), quando há link relativo quebrado em `.md`, e quando o código da pasta mudou sem atualizar o `AGENTS.md` nem declarar `Docs-conferidos: <pasta>/AGENTS.md` na mensagem.
  - [`confere-push.mjs`](.claude/hooks/confere-push.mjs) (`pre-push`): trava push direto na `main`, push forçado ou push para URL diferente de [`.claude/pipeline.json`](.claude/pipeline.json), e roda o `confere-lgpd` sobre o que sobe, para pegar o commit que foi feito sem os hooks.
- **Scripts que o orquestrador roda:**
  - [`escolhe-revisores.mjs`](.claude/hooks/escolhe-revisores.mjs) `<base> <head>` (ou `--trabalho`, antes do commit): lê o diff e os gatilhos de `revisao` no `pipeline.json` e imprime o **mínimo obrigatório** de revisores, com modelo, esforço e o motivo de cada um (gatilho, arquivo e linha).
    - Conta como código todo arquivo com extensão de código, em qualquer pasta (a lista mora no `config.mjs`).
    - O aviso do `confere-lgpd` nas linhas novas também chama o `revisor-lgpd`.
    - O orquestrador soma um revisor por julgamento, com o motivo no relatório, mas nunca tira.
    - `--sem-comportamento "<motivo>"` dispensa o `qa` na troca de CSS, texto ou renome. `--sem-tela "<motivo>"` dispensa o `revisor-tela` só na troca de texto, cópia ou renome.
  - [`ajusta-pipeline.mjs`](.claude/hooks/ajusta-pipeline.mjs): a conta do autoajuste (seção 4).

### 4. O autoajuste (skill `adjust-pipeline`)

Sem medir, o custo e a cobertura da revisão só mudam por opinião, e o revisor esquecido só aparece quando o defeito já escapou. Por isso o pipeline mede a si mesmo (D2).

**1. Cada sessão deixa um registro.** Ao fim de toda sessão que mudou o repositório, o orquestrador copia [`docs/pipeline/sessoes/MODELO.md`](docs/pipeline/sessoes/MODELO.md) para `docs/pipeline/sessoes/<AAAA-MM-DD>-<assunto>.md` e preenche um bloco JSON:

- **o orquestrador:** o modelo e o esforço em que o chat rodou;
- **os agentes:** cada subagente, com o tipo, o par em que rodou, os tokens, os minutos e as rodadas de correção;
- **os achados:** a severidade, quem viu (`visto_por`), quem devia ter visto e não viu (`escapou_de`), se o revisor nem foi lançado (`nao_rodou`) e se foi falso positivo (`confirmado: false`);
- **os gatilhos** que dispararam à toa (`gatilho_falso`), as descidas adiadas (`adiar`), os erros do orquestrador e as lições.

O registro não leva dado pessoal (o script recusa o que o `confere-lgpd` acharia) nem nome que não existe no `pipeline.json` (pega o erro de digitação).

**2. A conta.** `node .claude/hooks/ajusta-pipeline.mjs --relatorio` mostra, para cada agente e nível, desde o último ajuste dele:
- as sessões em que rodou;
- os achados **únicos** de nível médio ou mais (os sem `visto_por`) e os graves;
- os tokens por achado único;
- os escapes, separados em "passou por ele" e "ele nem rodou";
- a média de rodadas de correção, no nível de código.

Não entram na conta:
- a sessão marcada `baseline` (só comparação);
- a sessão orquestrada fora de `opus xhigh` (D3): as escolhas dela foram de outro modelo, e o relatório a lista à parte.

**3. Para menos: sozinho.** Um revisor desce **um degrau de esforço, dentro do mesmo modelo**, quando a `janela` (3 sessões) se completa limpa. A escada é `sonnet:low → sonnet:medium → sonnet:high` e `opus:medium → opus:high → opus:xhigh`: o ajuste nunca troca o modelo, que vem do papel (D3). Limpa quer dizer:
- ele rodou no par atual, com código no diff;
- não achou nada de nível médio ou mais, nem sozinho nem junto com outro;
- nada escapou dele.

A sessão só conta como limpa se **alguém** achou nível médio ou mais nela: sessão vazia não prova que o revisor sobra. Mais três regras:
- um alvo por execução, o mais caro primeiro;
- `node .claude/hooks/ajusta-pipeline.mjs --aplicar-menos` edita a linha do alvo no `pipeline.json`, o cabeçalho do agente e a tabela da skill;
- cada ajuste grava `docs/pipeline/ajustes/<data>-<alvo>.md`, com as sessões já contadas (`vistas`), para que nenhuma conte duas vezes.

**4. Para mais: só com o "sim" do usuário.** O relatório propõe:
- **um degrau acima** quando um defeito de nível médio ou mais passou pelo revisor e foi pego depois, ou quando um nível de código teve média de rodadas de correção no limite (`rodadas_altas`). O comando é `--aplicar-mais <alvo>`;
- **um gatilho novo** quando o escape veio de um revisor que nem rodou, ou quando o achado grave único veio de um acionamento por julgamento. O gatilho entra por edição de `revisao.gatilhos` no `pipeline.json`, testada com o `escolhe-revisores.mjs` contra o diff da sessão;
- **estreitar um gatilho** quando a sessão o marcou como falso.

A subida não espera a janela: um escape vira proposta na hora.

**5. O que o ajuste nunca faz:**
- **Passar do piso ou do teto.** Os pisos moram no código ([`config.mjs`](.claude/hooks/config.mjs): `PISOS`, `FIXOS`, `PISO_GATILHOS`, `PISO_REVISAO`) e o teto na [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) (`TETO`). Um `pipeline.json` afrouxado não afrouxa a regra: abaixo do piso é erro, e acima do teto a guarda pede confirmação.
- **Mexer nos fixos:** o `revisor-lgpd`, o `leitor-docs`, o orquestrador, o nível `leve` e o `Plan` não se ajustam.
- **Pôr código no `opus`:** o código só sobe dentro do `sonnet`.
- **Encolher a cobertura:** os gatilhos só crescem, e os do piso e o `qa` por caminho ficam. Descer é o esforço do revisor, não a cobertura.
- **Pôr ou tirar agente sozinho.** Pela D3, um agente **entra** quando, em 2 sessões, um portão obrigatório fica sem dono ou o mesmo tipo de defeito escapa de todos. Ele **sai** quando, já no piso, roda a janela inteira sem achado único. O orquestrador propõe, e o usuário decide.

Risco aceito: o ciclo de subir e descer entre sessões. Cada degrau para baixo pede a janela inteira limpa, e cada degrau para cima pede um escape.

**Exemplo.** Um projeto roda três fases, e em nenhuma delas o `revisor-arquitetura` acha nada que o `ponytail-review` não tenha achado antes. O `--aplicar-menos` o desce um degrau na escada e grava o ajuste. Na fase seguinte, o `qa` pega um contrato quebrado entre pastas que passou pela arquitetura (`escapou_de`). O relatório propõe a volta ao degrau de antes, com a evidência à vista, e espera o "sim".

---

## Como usar

### 1. Iniciar um projeto novo com este modelo

**Antes:** Node 24, Git, o Claude Code (`claude`) e o GitHub CLI (`gh`).

1. **Crie o repositório no GitHub com um README inicial e clone-o.** É assim que a `main` nasce: as guardas não deixam criá-la nem commitar nela localmente, e ela só anda por `git pull --ff-only`.
2. **Copie o modelo sem o `.git` dele** (no Git Bash, de dentro do clone):
   ```bash
   git -C <caminho>/modelo_pipeline archive HEAD | tar -x
   ```
   Troque este `README.md` pelo do seu projeto (o [`confere-docs.mjs`](.claude/hooks/confere-docs.mjs) exige um `README.md` na raiz). Se o projeto já tiver `.gitignore`, junte as linhas.
3. **Ligue os hooks e abra o primeiro branch** (uma vez por clone):
   ```bash
   git config core.hooksPath .claude/hooks/git
   git switch -c pr/inicio
   ```
4. **Configure o [`.claude/pipeline.json`](.claude/pipeline.json):**
   - `repositorio`: `dono/repo` no GitHub (enquanto estiver `<dono>/<repo>`, todo push e PR é bloqueado por segurança);
   - `portaoRapido`: nome do script no `package.json` que roda checagem de tipos, lint e testes rápidos no fim de cada turno (padrão: `checar:rapido`);
   - `pastasDeTrabalho`: lista de regex das pastas que exigem `AGENTS.md` próprio;
   - `revisao`: os caminhos e conteúdos dos gatilhos do seu projeto (onde mora a permissão, o dado pessoal, o banco, a rede e a tela), somados aos do modelo (ver "O que adaptar").

   Mantenha um agente e um nível por linha em `agentes` e `niveis`: o `ajusta-pipeline.mjs` edita a linha do alvo, então não passe um formatador que reescreva o arquivo.
5. **Preencha os marcadores `<...>`** em [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`PRODUCT.md`](PRODUCT.md), [`docs/plano.md`](docs/plano.md), [`docs/arquitetura.md`](docs/arquitetura.md) e [`docs/decisoes.md`](docs/decisoes.md). As suas decisões começam na D4.
6. **Valide a suíte de testes dos hooks:**
   ```bash
   node --test ".claude/hooks/*.test.mjs"
   ```
7. **Faça o primeiro commit e o PR pelo próprio pipeline.** O `pre-commit` roda os testes, então dê tempo ao comando (de 1 a 2 min). Depois, `git push -u origin pr/inicio` e `gh pr create --draft --base main`. O merge é seu.

### 2. Abrir o terminal com o agente Orquestrador (e criar alias)

O [`.claude/settings.json`](.claude/settings.json) já abre toda sessão do projeto como o [`orquestrador`](.claude/agents/orquestrador.md), em `opus` e `xhigh`: basta `claude`. Se você trocar o modelo ou o esforço no meio da sessão (`/model`, `/effort`), a `guarda-agentes` nega delegar até você voltar.

Para rodar em modo `bypassPermissions` (as guardas de `PreToolUse` continuam ativas: bloqueiam o que é proibido e pedem confirmação para `push`, escrita em PR e subagente `opus`):

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

- **Caminhos dos gatilhos e o que é código:**
  - `pastasDeTrabalho` decide onde se exige um `AGENTS.md`. Para a revisão, código é todo arquivo com extensão de código, em qualquer pasta.
  - Os gatilhos do modelo usam caminhos genéricos (`apps/`, `packages/`, `src/`, `api/`, `route.*`, `migrations/`, `*.sql`) e conteúdos fortes (`security definer`, `grant`, `where:`, `cpf`, `e_mail`, `fetch(`, `use server`).
  - Some as pastas do seu projeto em `revisao.gatilhos`, em `comportamento_caminhos` (o `qa`) e no gatilho `tela` do `pipeline.json`. Para que não possam ser tirados sem revisão, some-os também no `PISO_GATILHOS` e no `PISO_REVISAO` do [`config.mjs`](.claude/hooks/config.mjs).
  - O modelo já traz alguns padrões de provedor comum (`service_role`, `Deno.env`, `auth.admin`, `.rpc(`, o `where: {` do Prisma). Eles não casam onde o provedor não existe e não custam nada. Para Supabase, some ao gatilho `permissao` os conteúdos `\bauth\.(uid|jwt|role|users)` e `\bauthenticated\b`.
  - Rode `node .claude/hooks/escolhe-revisores.mjs main HEAD` num diff real que toque cada pasta: o gatilho escrito de memória costuma não casar com nenhum arquivo.
- **Projeto que já tem dado pessoal no histórico:** ponha `"lgpd": { "legadoAte": "<sha do commit em que adotou o modelo>" }` no `pipeline.json`. Faça isso num PR só com a chave, e junte-o antes dos outros: o push confere com a chave que já está na `main`. O que já estava naquele commit fica como dívida contada (`node .claude/hooks/confere-lgpd.mjs --todos <pastas>`). Ela sai quando alguém muda o trecho achado; mexer em outra parte da mesma linha não a cobra. O `legadoAte` só vale se for o commit que trouxe o pipeline ou um anterior a ele, então o legado só perdoa o que é de antes do pipeline. Ele só pode recuar ou sair: o `pre-commit` recusa movê-lo para a frente, e mexer nele, inclusive tirá-lo, chama o `revisor-lgpd`. Avalie com o jurídico se o dado real no histórico é um incidente.
- **Projeto sem dados pessoais (sem LGPD):**
  1. Remova o bloco do matcher `Edit|Write|MultiEdit|NotebookEdit` em `PreToolUse` no [`.claude/settings.json`](.claude/settings.json), e a chamada do `confere-lgpd.mjs` em [`.claude/hooks/git/pre-commit`](.claude/hooks/git/pre-commit) e no `git/pre-merge-commit`.
  2. Apague os gatilhos `lgpd_ignora` e `lgpd_regras` inteiros, e tire o `revisor-lgpd` do `dado_pessoal`, no `pipeline.json` e no `PISO_GATILHOS`.
  3. Tire o `revisor-lgpd` dos `FIXOS` do `config.mjs`, do `TETO` da [`guarda-agentes.mjs`](.claude/hooks/guarda-agentes.mjs) e de `agentes` no `pipeline.json`, e apague `.claude/agents/revisor-lgpd.md`.
  4. Tire-o dos testes que o citam (comece por `teste-apoio.mjs` e `guarda-agentes.test.mjs`) e dos documentos: `CLAUDE.md`, o portão 6 e a seção 4 da skill `pipeline`, o `orquestrador.md` e o `decisao.md`.
  5. Rode os testes do pipeline: eles apontam o que sobrou.
- **Projeto sem tela:**
  1. Apague o gatilho `tela` inteiro, no `pipeline.json` e no `PISO_GATILHOS`.
  2. Tire o `revisor-tela` dos `PISOS`, do `TETO` e de `agentes`, e apague `.claude/agents/revisor-tela.md`.
  3. Desligue o plugin `frontend-design` no `settings.json`.
  4. Faça a mesma limpeza nos testes e nos documentos: o portão 5 e a seção 4 da skill `pipeline`, o `feature.md` e o `orquestrador.md`.
- **Criar ou alterar um agente fixo:** um agente fixo precisa de seis coisas, ou a guarda bloqueia a execução e os testes falham:
  - o arquivo `.claude/agents/<nome>.md`, com `name`, `model`, `effort` e `tools` no cabeçalho;
  - a entrada em `agentes` no `pipeline.json`, com o mesmo par e as mesmas ferramentas;
  - o teto em `TETO`, na `guarda-agentes.mjs`;
  - o piso em `PISOS`, ou o par exato em `FIXOS`, no `config.mjs`;
  - quem o chama: o nome em `revisao.sempre` ou num gatilho (e no `PISO_GATILHOS`, para travar);
  - a tabela da skill `pipeline` regerada com `node .claude/hooks/ajusta-pipeline.mjs --sincronizar-tabela`.

  Pela D3, o modelo vem do papel e o esforço de partida, do custo do erro.
- **Regras específicas do domínio do projeto:** escreva as invariantes de negócio, isolamento de dados, autenticação e integrações no item 8 de [`CLAUDE.md`](CLAUDE.md) e detalhe em [`docs/arquitetura.md`](docs/arquitetura.md). Os agentes [`revisor-arquitetura`](.claude/agents/revisor-arquitetura.md), [`revisor-seguranca`](.claude/agents/revisor-seguranca.md) e [`revisor-lgpd`](.claude/agents/revisor-lgpd.md) leem diretamente desses dois arquivos.
- **Layout de pastas (`monorepo` ou pacote único):** ajuste o array `pastasDeTrabalho` em [`.claude/pipeline.json`](.claude/pipeline.json). Mantenha o sufixo `(?=/)` nas regex, para que pastas agrupadoras como `apps/` ou `src/` não sejam cobradas como pastas de trabalho folha.
