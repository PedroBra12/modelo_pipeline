# .claude/hooks

Faz:          os hooks do pipeline: os do Claude Code, ligados em `.claude/settings.json` (que também abre toda sessão como o
              agente `orquestrador`, com `model: opus` e `effortLevel: xhigh`, D3), e os do git, em `git/`.
              A configuração do projeto mora num lugar só, `.claude/pipeline.json`, lido por `config.mjs`.
              - `.claude/pipeline.json` (contrato):
                - `repositorio`: o `dono/repo` do GitHub (sem URL). Enquanto for o marcador `<dono>/<repo>`, faltar ou
                  for inválido, ou com o arquivo ilegível, a `guarda-git` e o `confere-push` negam o push, o `remote
                  add`/`set-url` e a escrita em PR com "configure o repositorio em .claude/pipeline.json" (falha fechado).
                - `portaoRapido`: o nome do script do `package.json` que o `portao.mjs` roda (padrão `checar:rapido`;
                  só letras, dígitos, `_`, `:`, `.` e `-`).
                - `pastasDeTrabalho`: lista de regex (texto) que o `confere-docs.mjs` aplica ao caminho relativo de cada
                  arquivo do commit; o trecho achado é a pasta de trabalho, que precisa de `AGENTS.md`. Termine a regex
                  com `(?=/)`, para o `AGENTS.md` de uma pasta que só agrupa (como `apps/`) não virar pasta de trabalho.
                - **Um agente e um nível por linha.** O `--aplicar-menos` e o `--aplicar-mais` do `ajusta-pipeline.mjs` editam a linha do alvo no `pipeline.json` (`"nome": { "model": "...", "effort": "..." ... }`), então cada entrada de `agentes` e de `niveis` fica numa linha só, e nenhum formatador (Prettier, `JSON.stringify` com recuo) pode reescrevê-lo: sem esse formato o ajuste não acha a linha e se recusa a gravar.
                - `agentes`: os agentes fixos de `.claude/agents/` (`revisor-seguranca`, `revisor-arquitetura`,
                  `revisor-lgpd`, `revisor-tela`, `qa`, `leitor-docs`), cada um com `model`, `effort`, `tools` e `tarefa`. É a fonte do
                  modelo e do esforço (D2): a `guarda-agentes.mjs` lê daqui e um teste confere que o cabeçalho de cada
                  `.claude/agents/<nome>.md` diz o mesmo.
                - `niveis`: os níveis dos subagentes comuns (`leve`, `medio`, `codigo-seguranca`, `revisao-ponytail`,
                  `orquestracao`, `forte`, `autoanalise`), com `model`, `effort`, `tarefa` e, no nível de um revisor que não é agente
                  fixo, `revisor` (o nome que o `escolhe-revisores.mjs` imprime, como `ponytail-review`). A tabela da
                  seção 7 de `.claude/skills/pipeline/SKILL.md` é gerada daqui e de `agentes`.
                - `revisao`: quem revisa o quê. `sempre` (revisores de toda mudança de código; vazio desde a D5), `grande`
                  (D5: `{ revisores, gatilhos }`, a regra da mudança grande, com `revisor-arquitetura` e `ponytail-review`; dispara
                  quando um dos gatilhos nomeados nela, hoje o `banco`, dispara no diff, quando os arquivos de `app/` (ou `src/app/`, `apps/<nome>/app/`, sem `.md`) caem em
                  2 rotas ou mais, ou quando um `AGENTS.md` é criado numa pasta de trabalho), `comportamento` (o `qa`)
                  com `comportamento_caminhos` (regex dos caminhos que o tornam obrigatório) e `comportamento_ignorar` (D6,
                  opcional: regex dos caminhos que não o tornam obrigatório, como arquivo de teste; o `config.mjs` valida que são regex e recusa a entrada com `(?` ou que case um caminho de `EXEMPLOS_CODIGO`), `gatilhos` e
                  `ignorar_conteudo` (arquivos cujas linhas não acionam gatilho de conteúdo: `.md`, `.test`, `.spec` e `.cy`, `__tests__/`, `__mocks__/`, `tests/`). Cada gatilho é `{ nome, revisores, caminhos, conteudo }` (regex, sem caixa, sobre o
                  caminho e sobre as linhas adicionadas do diff), mais `layout` (D5, booleano, só no `tela`: com ele, um arquivo que casa os `caminhos` só dispara com layout novo), `remocoes` (as linhas removidas também contam),
                  `todo_arquivo` (vale até nos arquivos de `ignorar_conteudo`) e `ignorar` (arquivos que só este gatilho
                  ignora; o código recusa um `ignorar` que case com um caminho mínimo de gatilho de conteúdo, que não seja um prefixo de caminho
                  literal (`^pasta/`) ou, como o `ignorar_conteudo`, que use `(?` (um lookahead cala quase tudo)). Hoje: `permissao`, `dado_pessoal`, `banco`, `config_pipeline`, `rede_rota`, `lgpd_ignora` (a supressão do `confere-lgpd`, com a mesma regex, em
                  qualquer forma de comentário) e `lgpd_regras` (por caminho: a regra do `confere-lgpd`, o `config.mjs`, onde mora a `SUPRESSAO`, e o agente `revisor-lgpd`) e `tela` (D3, por caminho; D5, só com layout novo: todo arquivo de tela (`.jsx`, `.tsx`, `.vue`, `.svelte`, `.css`, `.scss` ou `.html`) de `apps/`, `packages/` ou `src/`, criado, apagado ou com layout mudado, chama o `revisor-tela`; o `.js` ou `.ts` de ação ou de rota, não). O `dado_pessoal` e a `permissao` ignoram o `.claude/` pelo conteúdo (o `config_pipeline` já chama a segurança por lá): o pipeline fala de permissão e de dado pessoal sem ser um nem outro.
                  O `dado_pessoal`, o `banco`, a `permissao` e a `rede_rota` contam a linha removida também (tirar o filtro do dono, o campo, a anonimização ou a purga muda o tratamento).
                  **Os gatilhos de caminho não valem para documentação, só pela extensão** (`.md`, `.mdx`, `.txt`, `.rst` e o que se publica como documento: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.pdf`, `.html`; a regra de print do `confere-lgpd` segue valendo para a imagem: `docs/login.md` não é o código de login; o código dentro de `docs/` ou de `apps/docs/`, como `docs/migrations/001.sql` ou `apps/docs/app/api/x/route.ts`, continua disparando), menos o `config_pipeline` e o
                  `lgpd_regras`, que cobrem os `.md` de `.claude/` de propósito, e a `tela`, cujo `.html` é arquivo de tela. O conteúdo do `dado_pessoal` não leva o limite de palavra da frente, para casar o nome
                  composto (`data_nascimento`, `cliente_cpf`, `email_hmac`, `cliente_rg`); `address` só casa composto (`shipping_address`, `address_line`) ou como campo de uma entidade de pessoa (`user`, `customer`, `client`, `person`, `contact`, `order`, `shipping`, `billing`, `cliente`, `pessoa`, `contato`, `pedido` seguidos de `.address`): "ip address", `ipAddress`, `server.address()` e `wallet.address` não.
                  A `permissao` pega o caminho `auth` e `auth-*`, papéis, cargos, rbac, acl, guards, sessão, middleware, proxy, login e jwt, e no conteúdo policy, grant,
                  revoke, security definer, autoriz, forbidden, permiss, papel/papéis, roles, `.role` e `is_admin` (não o `role="button"` do JSX nem um `403` solto). O `banco` pega o
                  `.sql`, `migrations/` e o schema do Prisma, e o filtro de consulta preso a quem chama (`supabase|client|db|sb|knex|trx|tx|admin.from(`, o `.where(` depois de
                  um receptor de consulta, o `where: {` do Prisma e o `where: eq(...)` (e `and`, `or`, `not`, `inArray`, `sql`) e o `where: (t) => ...` do Drizzle, a cadeia do supabase-js de várias linhas (`  .from('tabela')` no começo da linha), `.eq(`, `.rpc(`): `Array.from(` e `const where: Foo` não. A `rede_rota` pega `api/`, `server/`, `servidor/`, `routes/`,
                  `controllers/`, `handlers/`, `route.*` e `actions/` (server action), e `fetch(`, `axios`, `process.env`, `import.meta.env`, `"use server"`, `Cache-Control`,
                  `service_role`, `Deno.env` e `auth.admin`. O `lgpd_regras` também pega o conteúdo `legadoAte`, e conta a linha removida (mexer na âncora, tirá-la inclusive, chama o `revisor-lgpd`). A `tela` não pega arquivo de
                  teste, spec nem story (`.test.`, `.spec.`, `.stories.`). Os caminhos e conteúdos que o modelo traz são genéricos (`src/`, `apps/`, `packages/`, `.sql`, `api/`): o projeto que adotar o modelo soma os dele, no `pipeline.json` e, para travá-los, no `PISO_GATILHOS` do `config.mjs`.
                - `ajuste`: `janela` (sessões, 3) e `rodadas_altas`. A escada, os pisos e o
                  teto não estão aqui de propósito (ver `config.mjs` e `guarda-agentes.mjs`).
              - `lgpd` (opcional): `{ "legadoAte": "<sha>" }`, o commit a partir do qual o achado antigo do `confere-lgpd` não bloqueia. Sem a chave, que é o caso do modelo, não há legado nenhum. **Preso à adoção:** só vale se for ancestral do commit que trouxe o pipeline, ou ele mesmo (a adição de `.claude/hooks/confere-lgpd.mjs` que é ancestral de todas as outras, pela ordem do histórico e não pela data do commit, que se forja: `git log --full-history --diff-filter=A` e `merge-base --is-ancestor`; se nenhuma adição é ancestral de todas, não há adoção e não há legado); tirar a chave e pô-la de volta num commit mais novo não adianta a âncora.
              - `config.mjs`: leitura e validação do `.claude/pipeline.json`, aceitando o BOM. Cada campo devolve
                `{ valor, erro }` (`lerRepositorio`, `lerPortao`, `lerPastas`, `lerAgentes`, `lerNiveis`, `lerRevisao`
                com os regex já compilados, `lerAjuste`), mais `localizar` (acha um nome em `agentes` ou `niveis`) e
                `urlDoRepositorio(repo)`, a regex de push do GitHub (https ou ssh, com ou sem `.git`, sem caixa, valor
                escapado). Os **pisos do código** moram aqui, para um `pipeline.json` afrouxado não afrouxar a própria
                regra: `ESCADA` (a ordem fixa, do `sonnet:low` ao `opus:xhigh`, com o `opus:medium` logo depois do último degrau do sonnet; o ajuste só anda dentro do mesmo modelo), `PISOS` (o par mínimo de cada agente e nível ajustável; o do `revisor-tela` é `sonnet:medium` e o do `revisor-arquitetura` é `opus:medium`: o modelo vem do papel), `NIVEIS_DE_CODIGO` (`medio` e `codigo-seguranca`, que o JSON não põe em `opus`), `FIXOS` (o par
                exato do que não se ajusta: `leitor-docs`, `revisor-lgpd`, `revisor-seguranca` (`opus:xhigh`, D5) e os níveis `leve`, `autoanalise` (`sonnet:medium`, D6), `orquestracao` e `forte`),
                `SUPRESSAO` (a regex da supressão `lgpd-ignora`, que o `confere-lgpd` importa daqui), `PISO_GATILHOS` (os
                revisores, caminhos e conteúdo mínimos de cada gatilho, `tela` inclusive, o `remocoes` e o `todo_arquivo` obrigatórios e os
                `exemplos` de caminho contra os quais um `ignorar` é conferido), `PISO_REVISAO` (o mínimo de `sempre`, vazio desde a D5, `comportamento` e `comportamento_caminhos`) e `PISO_GRANDE` (D5: os revisores e o gatilho `banco` que a regra `grande` tem de manter); um valor
                abaixo do piso, um gatilho a menos, o `grande` ausente ou um `layout` que não é booleano é erro de `lerAgentes`, `lerNiveis` ou
                `lerRevisao`, e `conferirPisos` acusa piso fora da escada. Quem bloqueia trata o erro como recusa; o `portao.mjs` só avisa. Mora aqui também a **lista única do que é código** (`EXTENSOES_DE_CODIGO` e `ehArquivoDeCodigo`: `ts tsx mts cts js jsx mjs cjs sql json py go rs rb java kt cs php vue svelte css scss html sh yml yaml toml prisma`, menos o lockfile: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`), usada pelo `marca-alterado`, pelo `confere-docs`, pelo `confere-lgpd` (onde as regras de código valem) e pelo `escolhe-revisores`, e o `legadoAteDoTexto` / `lerLegadoAte` (o `lgpd.legadoAte` do `pipeline.json`: sha de 7 a 40 hexadecimais ou ausente).
              - `guarda-git.mjs`: PreToolUse em Bash e PowerShell. A função `decisao(comando, cwd)` devolve `deny` (há
                motivo para negar), `ask` (sem motivo, mas o comando sobe algo: push, `remote add` ou `set-url`, escrita
                em PR; o motivo é "confirme o comando: push ou PR", sem o texto de "peça para ele rodar com !", que é só
                do `deny`; ou quando o comando toca `.claude/estado/esforco` fora da escrita direta de `medio`/`alto` ou leitura/limpeza, D7: `pedeConfirmacaoEsforco`) ou `null`; o `push --dry-run` também pede a confirmação, de propósito. A guarda não olha a ref
                do push (quem nega a `main` é o `pre-push`).
                - Deixa o push e o `gh pr create`, `edit`, `comment`, `ready` e `review` só para o `origin` e só do
                  repositório do projeto (o 1º `.git` acima do `cwd` da entrada do hook é o do projeto: a pasta `.git`,
                  ou o arquivo `.git` quando o projeto é ele mesmo um worktree, porque os hooks que
                  rodam são os dele), nunca de um worktree de agente (`.claude/worktrees/`), de um clone ou de um
                  worktree aberto dentro do projeto, nem com link de PR ou `-R` de
                  outro repositório (confere com o `repositorio` configurado, sem caixa), nem com troca de pasta (`cd`,
                  `Set-Location`, `-C`, `--git-dir`, `--work-tree`) ou variável `GIT_*`/`GH_*` no comando; o `remote add`
                  e o `set-url` só com a URL do `repositorio`.
                - O PR nasce rascunho: o `gh pr create` só passa com `--draft`, `--draft=<valor>` ou `-d` (também colado
                  a outras letras sem valor, como `-df`, e `-d=<valor>`); o valor é lido como o gh o lê (verdadeiro: `1`,
                  `t`, `true`, sem caixa; falso: `0`, `f`, `false`; outro valor nega) e vale o último `--draft`. O merge é
                  do usuário: o `gh pr merge` é negado, como todo `gh` que escreve fora da lista acima.
                - O push aceita só as opções de uma lista (`-u`, `--dry-run`, `--tags`…): `--force`, `--delete`,
                  `--mirror`, `--no-verify` e os prefixos deles são negados, como o `+ref` e o `:ref`.
                - Nega também: outro remoto; desviar o remoto pela configuração (`remote.*`, `url.*`, `alias.*`,
                  `branch.*.remote`) e o `remote rename`; `send-pack`, `send-email`, `subtree`; o token (`gh auth token`,
                  `gh auth status -t`, `git credential`); o resto do `gh` e do `glab` que escreve (`pr merge`, `repo`,
                  `release`, `alias`, `api` de escrita, com o `-X` colado ou não…); `npm publish`; `commit --no-verify`;
                  mudar o `core.hooksPath` para outro valor (também `--unset-all`, `--replace-all` e `--add`, e
                  `--remove-section` ou `--rename-section` na seção `core`). Nega ainda as chaves `include.*` e `includeIf.*` em `-c` e em `git config` (trazem uma configuração que desvia os hooks).
                - **Regra invertida**, em qualquer comando, não só no que sobe: nega **toda menção** de `GIT_CONFIG*` ou `NODE_OPTIONS` (desviam os hooks do git e o que o node carrega dentro deles) e,
                  pela mesma regra, de `hooksPath`, `.git/config`, `config.worktree` e `.git/hooks` (desligam os hooks sem variável nenhuma). A exceção é só o **segmento** cujo 1º programa só lê
                  (`grep`, `rg`, `cat`, `echo`, `printenv`, `Select-String`, `Get-Item`, `Get-ChildItem`, `Get-Content`, `Write-Output`, `Write-Host`, `head`, `tail`, `wc`, `cut`, `tr`, `Measure-Object`,
                  `git grep|log|show|diff` sem `-c`/`--config-env` antes do subcomando e sem `--output`, `--ext-diff`, `-O`/`--open-files-in-pager` (nem o prefixo que o git aceita), `xargs grep|rg`; o `rg` sem `--pre` nem `--hostname-bin`; `awk` e `sed` ficam de fora: o `sed` grava e executa, o `awk` executa pelo pipe e pelo `getline`) ou só tira (`unset`, `env -u` sem atribuição, `Remove-Item`); o `git config` que só traz o `core.hooksPath` fica por
                  conta da regra do `core.hooksPath` acima. A regra é por menção, e não por uma lista de jeitos de escrever (`Set-Item Env:\NOME`, `$env:NOME+=`, `Set-Content`, `Rename-Item`,
                  `read NOME`, `declare -x`, `printf >> .git/config`... nunca fecha). Os segmentos se separam por `;`, `&`, `&&`, `||`, `|` e quebra de linha (o `&` de `>&2`, `2>&1` e `&>` não
                  separa), e o que está entre aspas não separa. Tiram a exceção do segmento: parêntese (`$(`, `<(`, `>(`, `@(` e o parêntese do PowerShell executam), `${` (a expansão `${X:=y}` atribui), crase, um `| sh`, `| bash`,
                  `| pwsh`, `| iex`, `eval`, `xargs` que não seja `grep|rg`, ou heredoc para um shell; e tira a da **unidade** (o mesmo, sem separar no `|`) o que grava em arquivo: `>`, `>>`, `tee`,
                  `Out-File`, `Set-Content`, `Add-Content`, mesmo começando por `echo` ou `cat`, e mesmo quando só o corpo do heredoc redirecionado cita o nome (`>&2`, `2>&1` e `> /dev/null` não contam). Na unidade que cita um nome, todo segmento à direita do 1º também tem de só ler (`echo NOME | python` e `echo NOME | Tee-Object f` negam; `find ... | xargs grep NOME` e `grep NOME f | head` passam).
                  Fica de fora da conferência só o texto entre aspas logo depois do `-m` ou `--message` de um `git commit` que é o 1º programa do segmento (sem `$(`, crase nem `` na mensagem; a forma
                  `$(cat <<'EOF' ... EOF)` também vale, com só espaço entre o `'EOF'` e a quebra de linha); o resto da linha continua conferido, e o `eval`, `sh` e afins se procuram no comando sem essa máscara. No push, o `AMBIENTE` (`GIT_*`, `GH_*`) vale também com `+=`.
                - Lê a linha continuada (`\` e a crase) separada e junta, tira as aspas dos argumentos sem espaço (a
                  aspa vazia fica), acha o programa depois de `xargs`, `timeout`, `cmd /c`, lê também o comando entre
                  aspas passado a outro shell (`bash -c`, `cmd /c`, `pwsh -Command`) e nega o `-EncodedCommand`.
                - Modo em `PIPELINE_GUARDA_GIT`: `negar` (padrão), `perguntar` (o `deny` vira `ask`, menos a falta de
                  repositório configurado), `desligado` (sai antes de tudo).
                - **O limite**: a guarda segura o erro e o atalho do agente, não um agente hostil. `sh x.sh` (um script que o agente escreveu antes) passa por qualquer regra de texto, e a trava
                  definitiva é uma checagem obrigatória no GitHub, que é decisão do usuário. Um link ou uma junção para a pasta `.git` passa pelo `Write` (a `guarda-git-arquivos` lê o nome do caminho, não o destino do link).
              - `guarda-git-arquivos.mjs`: PreToolUse em Edit, Write, MultiEdit e NotebookEdit (`.claude/hooks/guarda-git-arquivos.mjs`), a mesma porta da `guarda-git` pelas ferramentas de edição.
                `motivoDoCaminho(caminho, cwd)` nega o caminho dentro de `.git/` (config, `config.worktree`, `hooks/`…) e o próprio arquivo `.git` (o ponteiro de um worktree). O caminho se lê a
                partir do `cwd` da entrada, com `..` resolvido, `\` virado `/` e pelo nome de cada pasta: `.GIT`, `.git.`, `.git ` e `GIT~1` também negam, e `.gitignore`, `.github/` e
                `.claude/hooks/git/` passam. Sem caminho legível (JSON quebrado, `file_path` e `notebook_path` ausentes), nega. Mesma saída da `guarda-git` (`hookSpecificOutput`,
                `permissionDecision: deny`) e mesmo `PIPELINE_GUARDA_GIT` (`perguntar` vira `ask`, `desligado` sai antes de tudo). Ligado no `.claude/settings.json` com `onFailure: "block"`; testes em
                `guarda-git-arquivos.test.mjs` e `settings.test.mjs`.
              - `guarda-agentes.mjs`: PreToolUse na ferramenta `Agent`. A função pura `decidirAgente(entrada,
                lerCabecalho, agentes)` devolve `deny`, `ask` ou `null`; `lerCabecalho(tipo)` dá o `name`, o `model`, o
                `effort` e o `tools` do frontmatter de `.claude/agents/<tipo>.md` (nada se o arquivo não existe) e um
                `problema` quando o cabeçalho repete `name`, `model`, `effort` ou `tools` ou quando a pasta
                `.claude/agents`, com as subpastas, tem um `.md` fora de `TETO` e do `orquestrador`, ou um 2º arquivo
                com o mesmo `name:` do fixo. `agentes` é a seção `agentes` do `.claude/pipeline.json` (padrão: o
                `TETO`, nos testes).
                - `TETO`, no código, diz o modelo, o esforço máximo e as ferramentas exatas de cada agente fixo (D2;
                  o `revisor-tela` entra com o par e as ferramentas do `qa`, D3). O
                  `pipeline.json` pode descer abaixo dele (o ajuste automático); acima, a chamada pede a confirmação
                  do usuário (`ask`); ferramentas diferentes das do teto, ou um fixo que falta no JSON, negam.
                - `pipeline.json` ausente, ilegível, com marcas de conflito, sem `agentes` ou abaixo dos pisos: `deny`
                  em JSON ("pipeline.json ilegível: ..."), nunca saída com erro sem decisão. O `config.mjs` quebrado (conflito de
                  merge) também: ele é importado dentro de um `try` e a guarda nega com "config.mjs ilegível".
                - Nos fixos, o `subagent_type` tem de ser exatamente igual ao `name:` do cabeçalho (sem aparar nem mudar
                  a caixa), senão nega; passa direto (`null`) só quando o cabeçalho tem o modelo, o esforço e as
                  ferramentas do `pipeline.json` (estas em qualquer ordem), a pasta não tem `problema`, o modelo e o
                  esforço efetivos (o da chamada, ou senão o do cabeçalho) são os do `pipeline.json` e nada passa do
                  teto; senão nega.
                - Teto de 50 mil tokens (D5) em todo subagente, fixo ou comum: `decidirTeto` soma o tamanho do `prompt` ao dos arquivos fora do repositório que o `prompt` cita por caminho absoluto (o pacote da D4), cada um uma vez só pelo `realpath`, e nega acima de `TETO_TOKENS` (50000, estimados como tamanho ÷ 3).
                - O esforço do pipeline (D7): `lerEsforcoDoEstado` lê `PIPELINE_ESFORCO` ou `.claude/estado/esforco` (`rapido`, `medio` ou `alto`; sem arquivo ou vazio = `'<ausente>'`), e `decidirEsforcoPipeline(entrada, esforco)` exige que o esforço esteja gravado antes de delegar (com `'<ausente>'` só o `leitor-docs` passa) e nega fechado qualquer valor inválido. No `rapido`, nega todos os revisores fixos (`revisor-seguranca`, `revisor-arquitetura`, `revisor-lgpd`, `revisor-tela`), o `qa` e o subagente cujo `prompt` ou `description` cita `ponytail-review`; deixa passar o `leitor-docs` e os agentes de código. No `medio`, nega `revisor-arquitetura` e `revisor-lgpd` e deixa passar os demais. No `alto` (ou `undefined` na chamada interna), não barra nenhum.
                - O worktree nasce da `main` (D6): `decidirWorktree` nega o subagente com `isolation: "worktree"` quando nem o `prompt` nem um arquivo de pacote traz `git switch -c` ou `git checkout -b`.
                - O `orquestrador` (`SO_NO_CHAT`) só roda como agente do chat principal (`claude --agent orquestrador`):
                  como subagente nega, em qualquer modelo e esforço.
                - Nos demais tipos o cabeçalho não vale: a chamada tem de trazer `model` e `effort`. Nega: `fork`
                  (herda o chat); `effort` que não seja `low`, `medium` ou `high` (`xhigh`, `max` e o que mais vier);
                  chamada sem `model` ou sem `effort`; `haiku` fora do `leitor-docs`; modelo desconhecido. Pede a
                  confirmação do usuário, com o `description` como motivo, para `opus` ou `fable` fora dos agentes
                  fixos; `sonnet` passa.
                - Falha fechado: entrada ilegível, e erro ao ler a pasta ou o cabeçalho (como um `.md` que é pasta),
                  negam. Limites que ficam: o subagente aberto por `Skill`, `Workflow` ou `SendMessage` não passa pelo
                  matcher `Agent`; a guarda só lê `.claude/agents/` do projeto (agente de usuário, de plugin ou de
                  `--agents` com o `name:` de um fixo não é visto); o `.md` fora da pasta lida, e o `name:` que não está
                  no frontmatter da forma `name: valor`, escapam; o modelo efetivo é conferido por "contém"
                  (`claude-opus` passa como `opus`); o tipo com caractere fora de `[\w-]` não lê cabeçalho nenhum e cai
                  no ramo dos demais tipos, que exige `model` e `effort` na chamada.
                - **Só o orquestrador delega, e em `opus xhigh`, sempre (D3).** A entrada do hook de um subagente traz
                  `agent_id`; o `agent_type` também vem no chat aberto por `--agent` ou pelo `.claude/settings.json`, então
                  não separa os dois. `decidirChamador` nega quando o `agent_id` é texto não vazio, com qualquer
                  `agent_type` ("subagente não abre subagente: só o chat principal, o orquestrador, delega (D3)"), sem
                  rodar a checagem do par; sem `agent_id` (ausente, vazio, `null`, número), com qualquer `agent_type`,
                  segue para ela. Para o chat principal, `decidirOrquestrador(par)` compara com o `FIXOS.niveis.orquestracao` do
                  `config.mjs` (o par não se repete aqui): esforço conhecido e diferente nega com `/effort xhigh` na
                  mensagem; modelo conhecido sem `opus` nega com `/model opus` (os dois erros vêm numa mensagem só); modelo
                  ou esforço que não deu para ler pede a confirmação ("confirme que o chat está em opus xhigh, D3").
                  `juntarDecisoes` une isto com a decisão do subagente: o `deny` vence o `ask`, que vence passar, e os
                  motivos do mesmo peso se somam. `parDoChat(entrada, env, lerRegistro)` devolve `{ model, efforts }`: com
                  `effort.level` na entrada só ele vale; sem ele valem todos os que existem, `CLAUDE_EFFORT` e o do
                  registro, e qualquer um que não seja o esperado nega (só pede a confirmação quando nenhum existe); o
                  modelo vem do registro. `lerRegistroDoArquivo` lê só os
                  últimos 4 MB do JSONL de `transcript_path` (ele passa de 1 MB e o hook tem 10 s) e `lerParDoRegistro`
                  (pura) pega a última linha `assistant` sem `isSidechain: true`, de `message.model` e `effort`; pula a
                  linha quebrada e a mensagem sintética (`<synthetic>`). Falha de leitura é par desconhecido (`ask`), nunca
                  exceção.
              - `confere-push.mjs`: hook pre-push do git (`git/pre-push`). Pega o que a guarda não vê no texto do
                comando: nega o push, nesta ordem, quando o `repositorio` não está configurado (mesma mensagem da
                guarda), quando a URL não é a dele, quando apagaria uma ref, quando a ref remota é `refs/heads/main`
                ("a main só anda pelo merge do PR no GitHub") e quando o remoto tem commit que o push descartaria
                (forçar). **Roda também o `confere-lgpd` sobre os arquivos de cada ref que sobe** **commit a commit** (cada commit de `git rev-list --reverse <remoto>..<local>`, ou de `origin/main..<local>` quando a ref é nova, ou de todo o histórico se não há `origin/main`, contra o pai dele, e não só a árvore final: o dado pessoal de um commit do meio, apagado depois, fica no histórico que sobe; o commit raiz é conferido inteiro; num merge só entra o que difere de todos os pais, e o achado diz em que commit está): é a trava de quem commitou sem o hook (clone à parte e `pull --ff-only`, `PATH` com outro `node`). Achado que bloqueia nega o push, sem repetir o trecho; o legado vale pelo `pipeline.json` da base, não da ref, e só se a âncora for ancestral da ref e da adoção; regra que não carrega, ou erro ao conferir, nega (falha fechado). Só o usuário passa por cima, com `--no-verify` pelo `!`.
              - `confere-ramo.mjs`: nada se commita na `main`. Lê o branch (`git symbolic-ref`); na `main`, escreve no
                stderr (manda criar `pr/<assunto-em-kebab>`) e sai com 1; com o HEAD solto deixa passar. Ligado em
                `git/pre-commit` (antes do confere-lgpd; se falha, o commit para) e em `git/pre-merge-commit` (pega o
                `git merge` feito na `main`). Só o `symbolic-ref` com status 1 (HEAD solto) passa; qualquer outra
                falha do git nega. O ramo principal é `main`, fixo.
              - `confere-main.mjs`: hook reference-transaction do git (`git/reference-transaction`), só no estado
                `prepared` e só quando a transação toca `refs/heads/main` (senão o script `sh` sai sem chamar o node).
                Pega o que o pre-commit não vê (merge fast-forward, `cherry-pick`, `revert`, `reset --hard`,
                `branch -f`, `update-ref`): recusa apagar a `main` e movê-la para um commit que não é o `origin/main`
                nem ancestral dele; sem `origin/main`, nega. Deixa passar o `git pull --ff-only` (o fetch atualiza o
                `origin/main` antes, numa transação própria) e o que não muda a `main` (`merge --abort`). O `git` mexe
                na árvore antes de atualizar a ref: o merge ff recusado deixa os arquivos na árvore (`git reset --hard
                HEAD` desfaz). O `--no-verify` não pula este hook. A saída do usuário, nos hooks de `main` (pre-commit,
                pre-merge-commit e reference-transaction), é `git -c core.hooksPath= <comando>`, rodado por ele com o
                `!`; a guarda de git a nega para o agente.
              - `confere-docs.mjs`: hook commit-msg do git (`git/commit-msg`), então vale para todo commit, do agente
                ou da pessoa, em qualquer worktree. Recusa quando a pasta de trabalho (as regex de `pastasDeTrabalho`)
                não tem AGENTS.md ou ele não tem as partes `Faz:`, `Não faz:` e `Como testar:` (também em negrito);
                quando ele cita um arquivo que não existe na pasta nem na raiz (nome sem barra entre crases, com
                extensão de código (a lista única do `config.mjs`: `ts`, `py`, `css`, `yml` e as outras) ou `.md`); quando um link relativo de um .md do commit não
                leva a nada (exemplos em bloco de código e em `.claude/skills/` não contam); quando o repositório não
                tem README.md; e quando o código mudou e o AGENTS.md não, sem a linha "Docs-conferidos:
                <pasta>/AGENTS.md" na mensagem. Arquivo dentro de uma pasta `gerado/` que o AGENTS.md da pasta cita
                pelo nome não conta como código nessa última regra (o gerador tem teste que falha quando ele fica
                velho); gerado novo, não citado, conta; as outras regras valem para ele. Com o `.claude/pipeline.json`
                ilegível ou sem `pastasDeTrabalho` válidas, recusa o commit com o motivo.
              - `confere-lgpd.mjs`: dado pessoal (LGPD), com as regras de `lgpd-regras.mjs`, portadas do otto (`.claude/skills/ORIGEM.md`) e sem regra presa a um projeto. PreToolUse em Edit, Write, MultiEdit e NotebookEdit: nega a edição com achado crítico
                ou alto (a raiz vem do git do arquivo, então vale no worktree; fora de um repositório, não confere). Hook
                pre-commit e pre-merge-commit do git (`git/pre-commit` e `git/pre-merge-commit`, depois do confere-ramo, modo `--indice`): confere o conteúdo em
                preparo de cada arquivo do commit (UTF-16 com BOM vira texto; binário só passa pelas regras de caminho e
                de binário), recusa o mesmo e mostra os avisos (médio) e as supressões. À mão:
                `node .claude/hooks/confere-lgpd.mjs [--todos] <arquivo ou pasta>...` (só os arquivos do git, guardados
                ou novos; o ignorado, como o `.env.local`, fica de fora).
                - **Legado, opcional e ancorado.** Só existe com `"lgpd": { "legadoAte": "<sha>" }` no `pipeline.json` **do HEAD** (um commit que
                  põe ou muda a chave não perdoa a si mesmo); sem a chave, que é o caso do modelo, nenhum achado é legado. Com ela, "antes" é o
                  texto do arquivo naquele commit, seguido pelos renomes até o HEAD (`git diff -M`), e não o HEAD nem o MERGE_HEAD. O
                  achado de um trecho que a âncora já tinha não bloqueia, só é contado (`--todos` lista). A chave do legado é o **trecho
                  achado inteiro**, com os espaços normalizados, só em memória (nunca vai para a saída); cada trecho vale quantas
                  vezes aparecia na âncora, e a cópia bloqueia. As regras fortes (`cpf_literal`, `cartao_literal`, `chave_conhecida`,
                  `chave_privada`, as sem supressão) nunca viram legado. Regra de caminho e de binário só é legado com o arquivo igual.
                  No Edit, o orçamento do legado é o da âncora menos o que fica no arquivo fora do `old_string`: a cópia de uma linha
                  que já estava no arquivo bloqueia. Chave inválida, de um commit que não existe ou **que não é ancestral do HEAD** (do que sobe, no push) **nem da adoção do pipeline**, ou sem a adoção no histórico: sem legado e um aviso, nunca mais permissivo. O pre-commit (e o pre-merge-commit) **recusa o `legadoAte` novo que não é ancestral do valor de antes**: a chave só pode recuar ou sair (pôr pela primeira vez, sem valor de antes, é livre), porque avançar perdoaria mais dívida.
                Falso positivo se suprime na linha, ou num
                comentário na linha de cima, com "lgpd-ignora: <regra> -- <motivo>"; CPF, cartão e chave não se
                suprimem, e o revisor-lgpd confere cada supressão. Regra que não carrega (ou `config.mjs` quebrado, de onde vem a regex da supressão) nega toda edição e recusa
                todo commit; só a edição do `lgpd-regras.mjs` e do `config.mjs` passa, para consertar; o resto, pelo shell. As regras cobrem dado real escrito (CPF, RG, cartão, telefone, e-mail fora
                de `example.com`, `.test` e `.invalid`), chave e segredo, arquivo de dados e binário, dado pessoal em
                log, erro e URL, `select *` em tabela de pessoas, coluna pessoal e dado sensível no banco, SQL
                concatenado, dado pessoal para IA, analytics, webhook e HTTP de fora, consentimento marcado,
                `localStorage`, cookie, geolocalização e cache sem prazo.
              - `git/pre-commit`: roda o `confere-ramo`, o `confere-lgpd --indice` e, quando o commit toca `.claude/`, os testes do pipeline: sempre o
                `node --test` sobre a lista expandida `.claude/hooks/*.test.mjs` (sem as variáveis `GIT_*` do commit nem o
                `NODE_TEST_CONTEXT`, que os testes não podem herdar). Nunca o script `test:pipeline` de um `package.json`: um commit
                podia trocá-lo por `exit 0` (o atalho `test:pipeline` vale só para quem roda os testes à mão). Falhou, ou não há teste nenhum (o `node --test` sem arquivo sairia verde), o commit é
                recusado (falha fechado). O `git/pre-merge-commit` roda o `confere-ramo` e o `confere-lgpd --indice` (o git não roda o
                pre-commit num merge quando este hook existe). Os cinco hooks de `git/` começam com `unset NODE_OPTIONS`, logo depois
                do shebang: o ambiente do comando não escolhe o que o node carrega. Quem muda a regra do pipeline passa nos testes dela.
                - `escolhe-revisores.mjs <base> <head> | --trabalho [--esforco rapido|medio|alto] [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]`:
                não é hook; é o script que a seção 4 da skill `pipeline` manda rodar. Lê o esforço de `--esforco` ou de `.claude/estado/esforco` (`lerEsforcoDaPasta`, padrão `medio`, D7; valor inválido sai com 2): `medio` dispensa `revisor-arquitetura` e `revisor-lgpd` (com `motivo: "esforço medio (D64)"` em `dispensados`); `rapido` recusa com erro 2 se o diff acionar gatilho de risco (`GATILHOS_BLOQUEADOS_NO_RAPIDO`: `banco`, `permissao`, `dado_pessoal`, `config_pipeline`, `lgpd_ignora`, `lgpd_regras`, `confere-lgpd`) e, fora disso, dispensa todos os revisores e o `qa` (`"esforço rapido (D64)"`); `alto` mantém todos. Lê o diff arquivo por arquivo
                (`base...head`, a partir do merge-base; ou o HEAD contra a árvore com `--trabalho`, inclusive arquivo
                novo ainda fora do git; as referências não podem começar com `-`), casando os cabeçalhos pela lista de
                `git diff --name-only -z`, e aplica a seção `revisao` do `.claude/pipeline.json`: a **união** da base
                (`git show <base>:.claude/pipeline.json`) com o head, para o branch não ser avaliado pela regra que ele
                mesmo afrouxou (gatilhos, revisores, caminhos e conteúdo somam; o `ignorar_conteudo` global e o
                `ignorar` de cada gatilho só valem se os dois lados ignoram). O head é sempre o do git em `<head>`; a
                árvore só entra com `--trabalho`. Um branch que afrouxa um `ignorar` pede a revisão uma vez, e o seguinte
                já não pede. Imprime os revisores obrigatórios com `modelo:esforço` e o motivo (gatilho, arquivo e
                linha, no máximo 3 por revisor; nunca o texto da linha, que pode ser dado pessoal). `sempre` (vazio desde a D5) vale
                quando um arquivo de código mudou (extensão da lista única do `config.mjs`, em qualquer lugar do repositório: as `pastasDeTrabalho` só decidem onde se exige o `AGENTS.md` e o binário); o `grande` (D5) imprime os seus revisores quando um gatilho listado nele disparou, quando os arquivos de `app/` (ou `src/app/`, `apps/<nome>/app/`, sem `.md`) caem em 2 rotas ou mais (`rotaDe`), ou quando um `AGENTS.md` foi criado numa pasta de trabalho ou trocou de pasta num renome; os `gatilhos` casam o caminho de qualquer
                arquivo e as linhas adicionadas (e as removidas, nos gatilhos com `remocoes`) dos que não estão em
                `ignorar_conteudo` (no gatilho com `layout`, hoje o `tela`, só dispara quando o arquivo é criado, apagado ou tem layout mudado no CSS ou no JSX/TSX, D5; o `.sql` só de comentário perde o caminho e não conta para o `grande` nem para o `qa`, D6); um binário numa pasta de trabalho aciona os gatilhos de conteúdo (menos imagem, fonte, pdf e vídeo: `png jpg jpeg gif webp ico avif woff woff2 ttf otf pdf mp4 webm`, que não contam como ilegíveis); o `lgpd_ignora` olha
                todo arquivo. O `qa` é obrigatório quando o diff toca `comportamento_caminhos`, menos os caminhos de `comportamento_ignorar` (D6); `--sem-comportamento`
                o tira e o motivo aparece na saída. `--sem-tela "<motivo>"` faz o mesmo só com o `revisor-tela`, para a troca só de
                texto, de cópia ou de renome de uma tela (o motivo é obrigatório e sai em "Dispensado"; o `qa` e os outros
                ficam). A opção que não tirou nada (sem tela no diff; no `--sem-comportamento`, sem código) imprime
                "revisor-tela não era obrigatório: --sem-tela sem efeito" (ou "qa não era obrigatório: --sem-comportamento sem
                efeito"), e o JSON traz `semEfeito`. O `confere-lgpd` também roda (`varrer`) nas linhas novas de cada arquivo de texto: todo achado ativo, o aviso médio inclusive (campo sensível, telemetria de fora), chama o `revisor-lgpd` com o motivo `confere-lgpd: <regra>` (o suprimido não; sem as regras carregadas, falha fechado). O binário roda o `varrer` com `"\0"`: só as regras de caminho e de binário, então a imagem nova chama o `revisor-lgpd` pela regra de print (`imagem_no_repositorio`) sem disparar gatilho de conteúdo. **Cada imagem nova ou mudada custa uma revisão de LGPD, de propósito:** um print com dado real pode ter qualquer nome (o `.pdf` cai na regra de arquivo de dados, e o `.avif` no binário desconhecido, até a extensão entrar no `fora` dessa regra). Só a imagem removida (`D`) não chama o `revisor-lgpd`; a renomeada (`git mv docs/print.png public/print.png`, o `R100` do git) chama, porque publica o print em outro lugar. Com `--trabalho` o item novo que não é arquivo (repositório aninhado, link) é pulado. Referência que não existe vira "a referência <x> não existe" (a `main` que ainda não existe diz como criá-la). O nome de revisor errado em `sempre`, `comportamento`, `grande` ou em qualquer gatilho é recusado ao carregar, mesmo que o gatilho não dispare. Revisor que não existe em `agentes` nem em `niveis`, `pipeline.json` do head abaixo dos pisos e
                diff que não casa com a lista de nomes saem com 2, não com omissão; quando o head não tem um gatilho do
                `PISO_GATILHOS` ou a regra `grande` (branch que saiu antes da regra), a mensagem acrescenta "branch anterior à regra: traga a
                main (git merge main)".
              - `coleta-agentes.mjs <pasta> [--desde <ISO>] [--json]`: não é hook; só lê, sem rede (D6). A autoanálise tira daqui os números dos subagentes (`agentId`, `modelo`, `tokens`, `minutos`, `inicio`, `fim`, `pedidos` e `primeiroPedido`) das transcrições `tasks/*.output` da sessão; testes em `coleta-agentes.test.mjs`.
              - `ajusta-pipeline.mjs [--relatorio] [--aplicar-menos] [--aplicar-mais <alvo>] [--sincronizar-tabela] [--data
                AAAA-MM-DD] [--json] [--raiz <pasta>]`: não é hook; é a conta da skill `adjust-pipeline` (D2). Lê as
                sessões de `docs/pipeline/sessoes/` (o bloco json de cada `AAAA-MM-DD-*.md`, validado: nomes que existem
                no `pipeline.json`, sem dado pessoal pelas regras do `confere-lgpd`, texto de até 600 caracteres) e os
                ajustes de `docs/pipeline/ajustes/`. Cada sessão leva `sessao.orquestrador` (obrigatório: `model` texto e
                `effort` texto ou `null`), e a cujo orquestrador não está no par de `FIXOS.niveis.orquestracao` do `config.mjs`
                (o modelo contém `opus` e o esforço é `xhigh`, sem caixa nem espaços nas pontas; D3) fica fora da janela
                como a de linha de base: entra só na tabela de "Linha de base e fora da conta", e o relatório diz qual e por quê numa linha (`Fora da conta (orquestrador em haiku:null, D3):
                <arquivos>`; a que já é de linha de base continua listada só como linha de base). O `papel` `consulta` é o
                do subagente que só busca ou lê, com o `tipo` de um nível (como o `leve`) e não o nome do agente (`Explore`,
                `claude-code-guide`): não conta como código e não leva modelo e esforço. Para cada alvo conta as sessões que o último ajuste dele não tinha
                visto (a lista `vistas` do arquivo de ajuste; a de `baseline` só entra no relatório). `unico` não se
                grava: é o achado sem `visto_por`. Para menos (revisor que rodou no par atual em `janela` sessões com
                código no diff, sem achado de nível médio ou mais dele ou visto por ele, sem escape e sem gatilho
                falso; a sessão só conta se alguém achou nível médio ou mais nela) desce um degrau da `ESCADA` **dentro do mesmo modelo** (o ajuste só mexe no esforço; o modelo vem do papel, D3: a arquitetura desce até o piso dela, o `opus:medium`, e para aí), nunca abaixo do piso, um alvo por execução, o
                mais caro primeiro, respeitando o `adiar` da sessão. Para mais (escape de nível médio ou mais, na hora; rodadas
                altas do nível de código, com a janela completa) e gatilho que falta ou dispara à toa ele só propõe; o `--aplicar-mais` aplica
                a proposta existente. Código nunca passa de `sonnet`; agente fixo nunca passa do `TETO`. Aplicar edita
                só a linha do alvo no `pipeline.json`, o cabeçalho do agente e a tabela da seção 7 da skill `pipeline`, e
                grava `docs/pipeline/ajustes/<data>-<alvo>.md` (com as `vistas`); só grava se o `pipeline.json` novo passa nos pisos. A janela completa vale só para descer e para a subida do código por rodadas; escape e gatilho que falta viram proposta na hora. A tabela da skill mantém o fim de linha que o `SKILL.md` já usa (CRLF ou LF). O nome do arquivo de sessão, depois da data, é kebab de até 60 caracteres, e nem o nome nem o texto do bloco levam id de pessoa (`cliente 12345`, `lead #987`, `contato123`, `titular 0042`).
              - `marca-alterado.mjs`: PostToolUse em Edit, Write, MultiEdit e NotebookEdit; anota código alterado (a lista única de extensões do `config.mjs`, `.css` e `.py` inclusive) em
                `.claude/estado/alterados.txt`. Nunca bloqueia.
              - `portao.mjs`: Stop; com código alterado e o script do `portaoRapido` no package.json, roda o portão
                rápido (`npm run <portaoRapido>`). Vermelho devolve o erro; verde pede a revisão do pipeline uma vez e
                depois libera (exceto quando `.claude/estado/esforco` é `rapido`, D7: aí o verde já libera de primeira e limpa `alterados.txt`); com `stop_hook_active`, vermelho só avisa. Sem o script, não faz nada; com o
                `.claude/pipeline.json` ilegível, só avisa. O arquivo vem de `CLAUDE_PROJECT_DIR`.
              - `teste-apoio.mjs`: não é hook; monta, para os testes, um projeto numa pasta temporária com os hooks
                copiados e um `.claude/pipeline.json` à escolha, e guarda o `EXEMPLO` dos pares (e `fixarExemplo`, que põe
                a cópia de um projeto nesse estado): os testes da conta não leem os pares do `pipeline.json` de
                verdade, que o ajuste automático muda.
Não faz:      a regra do pipeline (está na skill `.claude/skills/pipeline`); a decisão de subir um revisor ou criar um
              gatilho (o `ajusta-pipeline.mjs` propõe, o usuário diz "sim"); a mudança de regra do `CLAUDE.md`; a conferência do que o AGENTS.md diz em
              prosa (é do revisor-arquitetura); o julgamento da lei, como finalidade, base legal e retenção (é do
              revisor-lgpd); os hooks globais do usuário não são daqui.
Depende de:   Node 24 e git, sem pacote nenhum; o `.claude/pipeline.json`; os cabeçalhos de `.claude/agents/` e o fim
              do registro da sessão que o hook aponta em `transcript_path`, só para ler (`guarda-agentes.mjs`); `docs/pipeline/` e a tabela da seção 7 de `.claude/skills/pipeline/SKILL.md`
              (`ajusta-pipeline.mjs`).
Regras daqui: hook de guarda erra para o lado de bloquear; hook de anotação nunca bloqueia; nada de rede.
              O `.claude/pipeline.json` é a única configuração: nenhum repositório, pasta ou script fixo no código.
              O confere-lgpd nunca repete o trecho achado (pode ser dado pessoal), o arquivo de regras fica fora da
              varredura, e toda regra nova traz exemplo do que pega e do que deixa passar.
              Tudo em LF (`.gitattributes`): o git do Windows converte para CRLF, e o hook do git com CRLF não roda.
Como testar:  `node --test ".claude/hooks/*.test.mjs"` (~1 min; num projeto com `package.json`, o script `test:pipeline` pode ser esse comando, mas só para quem roda à mão: o pre-commit roda sempre o `node --test`).
              - O `config.test.mjs` escreve `pipeline.json` temporários; o `confere-docs.test.mjs` não usa git.
              - O `confere-docs.git.test.mjs`, o `confere-lgpd.test.mjs`, o `confere-ramo.test.mjs`, o
                `confere-main.test.mjs` (com um remoto bare e o `origin/main`) e o `confere-push.test.mjs` usam um git de
                verdade numa pasta temporária; os que dependem do `pipeline.json` copiam os hooks e escrevem o deles
                (`teste-apoio.mjs`), então não mudam quando o do projeto muda.
              - O `portao.test.mjs` usa um `package.json` e um `pipeline.json` falsos numa pasta temporária, e confere o
                que o `marca-alterado.mjs` anota (código do produto pela lista única, `.jsx`, `.css` e `.py` inclusive; nunca `.claude/` nem `docs/`).
              - O `guarda-agentes.test.mjs` usa um `lerCabecalho` falso e também lê os cabeçalhos de verdade de
                `.claude/agents/` (com as subpastas): todo arquivo está em `TETO` ou é o `orquestrador`
                (o `orquestracao` de `niveis`), senão o teste falha; o cabeçalho tem de ser o do `pipeline.json`; o `name:` é o nome do arquivo e o `tools:` dos fixos é o da
                tabela; copia a pasta e o hook para uma pasta temporária para provar o arquivo estranho, o campo
                repetido e a falha fechada. Os casos do chat principal (D3) usam registros JSONL inventados numa pasta
                temporária: o parser puro, a janela do fim de um arquivo de mais de 4 MB (a única linha do chat no começo,
                coberta por linhas que não contam), o arquivo que falta, o esforço pela entrada, pela variável e pelo
                registro (sem `effort.level`, `CLAUDE_EFFORT` em xhigh não cobre um registro em low), o `agent_id` de
                subagente, a linha de outro `type` com `message.model` depois da linha do chat, e o hook de ponta a ponta (todos os que passam pela ferramenta
                `Agent` mandam um par certo, ou esperam o `ask` e o `deny`).
              - O `config.test.mjs` também cobre as seções novas e os pisos (`agentes`, `niveis`, `revisao`, `ajuste`).
              - O `escolhe-revisores.test.mjs` testa a escolha dentro do processo (`escolher` e `formatar` com o diff montado à mão: migration com
                `grant`, tela pura, `cpf`, linha de autorização removida, `lgpd-ignora`, `.claude/pipeline.json`, união com a base, o
                gatilho `tela` em `.jsx`, `.tsx`, `.vue`, `.svelte`, `.css`, `.scss` e `.html` mexido, criado e apagado, `--sem-tela`, a lista
                única de código em qualquer lugar) e usa um git de verdade numa pasta temporária só onde o git é o que se testa
                (diretório com " b/", linha `++`, binário e imagem, merge-base, `--trabalho` com repositório aninhado, a regra do head e
                da base, a linha de comando e as mensagens de erro, a `main` que não existe). Confere que cada regex de caminho do
                `pipeline.json` casa com um arquivo de `git ls-files --cached --others` ou com um exemplo genérico do modelo (que ainda não
                tem `src/`). O `escolhe-revisores.gatilhos.test.mjs` é o dos gatilhos genéricos um a um (permissao, rede_rota, banco, tela, documentação, lockfile,
                dado_pessoal, ignorar_conteudo), do aviso do `confere-lgpd`, da mídia binária e do nome de revisor errado, tudo dentro do processo.
              - O `confere-lgpd.adocao.test.mjs` testa o `legadoAte` preso à adoção (tirar e pôr a chave mais nova, adoção pela ordem do histórico e não pela data forjada, só recuar ou sair, âncora que não é ancestral, trecho mexido ou mudado), e o `confere-lgpd.legado.test.mjs` o resto do legado ancorado. Os dois, em arquivos à parte para o `node --test` rodá-los em paralelo: sem a chave não há
                legado, com ela vale o texto do commit (renome, cópia, trecho mexido, Edit, Write, à mão, `--todos`), a chave é a do HEAD, o
                `legadoAte` que não é ancestral não vale e só pode recuar ou sair, e o merge passa pelo `pre-merge-commit`. Os casos que só medem o
                portão do pre-commit chamam o `confere-lgpd.mjs --indice` direto, sem pagar os outros hooks de cada commit.
              - O `confere-push.test.mjs` chama o hook pre-push como o git o chama (remoto e URL nos argumentos, as refs na entrada) num repositório com um
                remoto `bare`: o diff `origin/main...ref` ou `remoto...ref`, a árvore vazia sem `origin/main`, o legado da base, a âncora que não é ancestral,
                as regras quebradas.
              - O `ajusta-pipeline.test.mjs` usa sessões de exemplo (desce um alvo por vez, piso, teto, janela
                incompleta, linha de base, histerese, sessão vazia, escape logo depois da descida, mesmo dia, `visto_por`, gatilho falso, `adiar`, código sem `opus`), aplica o
                ajuste num projeto temporário (e confere que nenhum par antigo sobra nos documentos) e confere em
                sincronia com os arquivos de verdade: a tabela da seção 7 da skill, os cabeçalhos de `.claude/agents/`,
                `docs/pipeline/sessoes/MODELO.md` e as sessões gravadas; cobre também o `orquestrador` obrigatório, o `consulta`
                e a sessão fora da conta.
              - O `ciclo-completo.test.mjs` copia só o que os quatro testes que leem o `pipeline.json` de verdade usam
                (`config`, `guarda-agentes`, `ajusta-pipeline` e `settings`), baixa todos os alvos ao piso (cabeçalhos e
                tabela sincronizados) e roda esses quatro lá (~9 s): um teste que crava um par quebraria no 1º ajuste
                automático e o pre-commit recusaria o commit.
              - O `pre-commit.test.mjs` usa um git de verdade com os hooks copiados e **sem `package.json`**: o commit que toca `.claude/` roda o
                `node --test` (vermelho recusa, verde passa, sem teste nenhum recusa, e o script `test:pipeline` de um `package.json` não
                vale), com `NODE_TEST_CONTEXT=child` e `NODE_OPTIONS` quebrado no ambiente do commit, e o que não toca `.claude/` não roda
                nada; confere que os cinco hooks de `git/` começam com `unset NODE_OPTIONS`.
              - O `settings.test.mjs` confere que o `.claude/settings.json` liga a `guarda-agentes` (matcher `Agent`) e
                a `guarda-git` (Bash e PowerShell) e a `guarda-git-arquivos` (Edit, Write, MultiEdit e NotebookEdit), as três com `onFailure: "block"`, que todo hook ligado existe e que
                a sessão abre como o agente `orquestrador` (`agent`), no modelo e no esforço do
                `FIXOS.niveis.orquestracao` (`model` e `effortLevel`, D3).
              - Teste que commita num git temporário não pode usar a `main` com os hooks ligados: use outro branch ou
                `-c core.hooksPath=`. O `guarda-git.test.mjs` copia os hooks e o `pipeline.json` para um projeto numa
                pasta temporária (com `.git`) e testa a cópia, então roda igual na pasta principal e dentro de um
                worktree de agente.
