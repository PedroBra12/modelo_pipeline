# .claude/hooks

Faz:          os hooks do pipeline: os do Claude Code, ligados em `.claude/settings.json` (que também abre toda sessão como o
              agente `orquestrador`, com `model: opus` e `effortLevel: xhigh`, D3, e leva o `env` gerado, D11), e os do git, em `git/`.
              A configuração do projeto mora num lugar só, `.claude/pipeline.json`, lido por `config.mjs` e, nas chaves de par
              (`familias`, `escada`, `comum`, `agentes`, `niveis`) e na chave opcional `neto`, só pelo `papeis.mjs` (D11).
              - `.claude/pipeline.json` (contrato):
                - `repositorio`: o `dono/repo` do GitHub (sem URL). Enquanto for o marcador `<dono>/<repo>`, faltar ou
                  for inválido, ou com o arquivo ilegível, a `guarda-git` e o `confere-push` negam o push, o `remote
                  add`/`set-url` e a escrita em PR com "configure o repositorio em .claude/pipeline.json" (falha fechado).
                - `portaoRapido`: o nome do script do `package.json` que o `portao.mjs` roda (padrão `checar:rapido`;
                  só letras, dígitos, `_`, `:`, `.` e `-`).
                - `pastasDeTrabalho`: lista de regex (texto) que o `confere-docs.mjs` aplica ao caminho relativo de cada
                  arquivo do commit; o trecho achado é a pasta de trabalho, que precisa de `AGENTS.md`. Termine a regex
                  com `(?=/)`, para o `AGENTS.md` de uma pasta que só agrupa (como `apps/`) não virar pasta de trabalho.
                - **Um agente e um nível por linha.** O `--aplicar-menos` e o `--aplicar-mais` do `ajusta-pipeline.mjs` editam a linha do alvo no `pipeline.json` (`"nome": { "model": "...", "effort": "..." ... }`: `model` e `effort` vêm no começo da linha, antes de `tools`, `piso`, `teto` e `tarefa`), então cada entrada de `agentes` e de `niveis` fica numa linha só, e nenhum formatador (Prettier, `JSON.stringify` com recuo) pode reescrevê-lo: sem esse formato o ajuste não acha a linha e se recusa a gravar.
                - `familias` (D11): a versão de cada família de modelo, `{ "opus": "claude-opus-5-5", "sonnet": "claude-sonnet-5-5", "haiku": "claude-haiku-5-5" }`;
                  as três chaves, cada versão no formato `claude-<família>-…` (a chave `opus` não aponta para o haiku).
                - `escada` (D11): a ordem do mais barato ao mais forte, `["haiku:low", "sonnet:low", "sonnet:medium", "sonnet:high", "opus:medium", "opus:high", "opus:xhigh"]`;
                  sem par repetido, só pares `família:esforço` válidos, cada família contígua e com o esforço subindo. O ajuste anda um degrau por vez
                  nela, dentro do mesmo modelo, e todo par de `agentes` e `niveis` tem de estar nela.
                - `comum` (D11): o que a chamada comum (`general-purpose`, `Explore`, `Plan`) aceita, `{ "esforcos": ["low", "medium", "high"], "passa": ["sonnet"], "confirma": ["opus", "fable"] }`:
                  esforço fora de `esforcos` nega, modelo em `passa` passa, em `confirma` pede a confirmação (com o motivo do `description`), o resto (o haiku inclusive) nega.
                - `agentes`: os agentes de `.claude/agents/`: os fixos (`revisor-seguranca`, `revisor-arquitetura`, `revisor-tela`, `qa`, `leitor-docs` e o `designer-ui`, D35,
                  que escreve a tela) e o `desenvolvedor` (D8, obrigatório: o cabeçalho dele é gerado da entrada, `model: sonnet`, `effort: medium`, `tools: Read, Edit, Write, Bash, Grep, Glob`,
                  com `piso: sonnet:low` e `teto: sonnet:high` para o esforço da chamada; fica fora da tabela da skill e do ajuste D2). Cada um com `model`, `effort`, `tools` e `tarefa`,
                  mais `piso` e `teto` opcionais (D11): **sem `piso` e `teto` a entrada é fixa** (o par dela não se ajusta: hoje o `revisor-seguranca`, o `leitor-docs` e o `designer-ui`);
                  com os dois, o par anda só entre eles, no mesmo modelo (hoje o `revisor-arquitetura`, o `qa` e o `revisor-tela`; os valores estão no arquivo, e este documento não os repete).
                  É a fonte do modelo e do esforço (D2): a `guarda-agentes.mjs` lê daqui e um teste confere que o cabeçalho de cada
                  `.claude/agents/<nome>.md` diz o mesmo.
                - `neto` (D11, opcional): o nome de um agente de `agentes`, o único que um subagente pode abrir (ver `guarda-agentes.mjs`). O arquivo de hoje não tem a chave (o subagente segue sem abrir subagente); o orquestrador a
                  liga depois, com o agente `leitor` (`haiku low`, `Read, Grep, Glob`). O `papeis.mjs` recusa (falha fechado) a chave cujo agente não existe em `agentes`, não é fixo (tem `piso` e `teto`), é o `desenvolvedor` ou tem em `tools`
                  algo fora de `Read, Grep, Glob` (nem `Agent`, nem `Agent(<nome>)`, nem `Bash`). Nas `tools` dos outros agentes vale `Agent` e a forma `Agent(<nome>)` (ex.: `Agent(leitor)`); a regra da linha única continua.
                - `niveis`: os níveis dos subagentes comuns (`leve`, `medio`, `codigo-seguranca`, `revisao-ponytail`,
                  `orquestracao` (obrigatório: é o par do chat principal), `forte`, `autoanalise`), com `model`, `effort`, `tarefa`, `piso` e `teto` opcionais como nos agentes
                  (fixos: `leve`, `autoanalise`, `orquestracao` e `forte`; com faixa: `medio`, `codigo-seguranca` e `revisao-ponytail`, e o `teto` dos de código é de `sonnet`: o código nunca passa de `sonnet`,
                  o `opus` só entra no `Plan` de uma decisão) e, no nível de um revisor que não é agente
                  fixo, `revisor` (o nome que o `escolhe-revisores.mjs` imprime, como `ponytail-review`). A tabela da
                  seção 7 de `.claude/skills/pipeline/SKILL.md` é gerada daqui e de `agentes` (sem o `desenvolvedor`).
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
                  qualquer forma de comentário, em todo arquivo; chama o `revisor-seguranca`, que confere o motivo dela) e `lgpd_regras` (por caminho: a regra do `confere-lgpd`, o `config.mjs`, onde mora a `SUPRESSAO`, `docs/decisoes.md`, `docs/arquitetura.md` e o `CLAUDE.md`; chama o `revisor-seguranca`, D34) e `tela` (D3, por caminho; D5, só com layout novo: todo arquivo de tela (`.jsx`, `.tsx`, `.vue`, `.svelte`, `.css`, `.scss` ou `.html`) de `apps/`, `packages/` ou `src/`, criado, apagado ou com layout mudado, chama o `revisor-tela`; o `.js` ou `.ts` de ação ou de rota, não). O `dado_pessoal` e a `permissao` ignoram o `.claude/` pelo conteúdo (o `config_pipeline` já chama a segurança por lá): o pipeline fala de permissão e de dado pessoal sem ser um nem outro.
                  O `dado_pessoal`, o `banco`, a `permissao` e a `rede_rota` contam a linha removida também (tirar o filtro do dono, o campo, a anonimização ou a purga muda o tratamento).
                  **Os gatilhos de caminho não valem para documentação, só pela extensão** (`.md`, `.mdx`, `.txt`, `.rst` e o que se publica como documento: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.pdf`, `.html`; a regra de print do `confere-lgpd` segue valendo para a imagem: `docs/login.md` não é o código de login; o código dentro de `docs/` ou de `apps/docs/`, como `docs/migrations/001.sql` ou `apps/docs/app/api/x/route.ts`, continua disparando), menos o `config_pipeline` e o
                  `lgpd_regras`, que cobrem os `.md` de `.claude/` de propósito, e a `tela`, cujo `.html` é arquivo de tela. O conteúdo do `dado_pessoal` não leva o limite de palavra da frente, para casar o nome
                  composto (`data_nascimento`, `cliente_cpf`, `email_hmac`, `cliente_rg`); `address` só casa composto (`shipping_address`, `address_line`) ou como campo de uma entidade de pessoa (`user`, `customer`, `client`, `person`, `contact`, `order`, `shipping`, `billing`, `cliente`, `pessoa`, `contato`, `pedido` seguidos de `.address`): "ip address", `ipAddress`, `server.address()` e `wallet.address` não.
                  A `permissao` pega o caminho `auth` e `auth-*`, papéis, cargos, rbac, acl, guards, sessão, middleware, proxy, login e jwt, e no conteúdo policy, grant,
                  revoke, security definer, autoriz, forbidden, permiss, papel/papéis, roles, `.role` e `is_admin` (não o `role="button"` do JSX nem um `403` solto). O `banco` pega o
                  `.sql`, `migrations/` e o schema do Prisma, e o filtro de consulta preso a quem chama (`supabase|client|db|sb|knex|trx|tx|admin.from(`, o `.where(` depois de
                  um receptor de consulta, o `where: {` do Prisma e o `where: eq(...)` (e `and`, `or`, `not`, `inArray`, `sql`) e o `where: (t) => ...` do Drizzle, a cadeia do supabase-js de várias linhas (`  .from('tabela')` no começo da linha), `.eq(`, `.rpc(`): `Array.from(` e `const where: Foo` não. A `rede_rota` pega `api/`, `server/`, `servidor/`, `routes/`,
                  `controllers/`, `handlers/`, `route.*` e `actions/` (server action), e `fetch(`, `axios`, `process.env`, `import.meta.env`, `"use server"`, `Cache-Control`,
                  `service_role`, `Deno.env` e `auth.admin`. O `lgpd_regras` também pega o conteúdo `legadoAte`, e conta a linha removida (mexer na âncora, tirá-la inclusive, chama o `revisor-seguranca`). A `tela` não pega arquivo de
                  teste, spec nem story (`.test.`, `.spec.`, `.stories.`). Os caminhos e conteúdos que o modelo traz são genéricos (`src/`, `apps/`, `packages/`, `.sql`, `api/`): o projeto que adotar o modelo soma os dele, no `pipeline.json` e, para travá-los, no `PISO_GATILHOS` do `config.mjs`.
                - `ajuste`: `janela` (sessões, 3) e `rodadas_altas`. A escada, o piso e o teto estão em `escada` e nas entradas
                  de `agentes` e `niveis`, lidos só pelo `papeis.mjs`.
              - `lgpd` (opcional): `{ "legadoAte": "<sha>" }`, o commit a partir do qual o achado antigo do `confere-lgpd` não bloqueia. Sem a chave, que é o caso do modelo, não há legado nenhum. **Preso à adoção:** só vale se for ancestral do commit que trouxe o pipeline, ou ele mesmo (a adição de `.claude/hooks/confere-lgpd.mjs` que é ancestral de todas as outras, pela ordem do histórico e não pela data do commit, que se forja: `git log --full-history --diff-filter=A` e `merge-base --is-ancestor`; se nenhuma adição é ancestral de todas, não há adoção e não há legado); tirar a chave e pô-la de volta num commit mais novo não adianta a âncora.
              - `config.mjs`: leitura e validação do `.claude/pipeline.json`, aceitando o BOM. Cada campo devolve
                `{ valor, erro }` (`lerRepositorio`, `lerPortao`, `lerPastas`, `lerRevisao`
                com os regex já compilados, `lerAjuste`: só `janela` e `rodadas_altas`), mais `localizar` (acha um nome em `agentes` ou `niveis`),
                `lerObjeto`, `ok` e `falha` (a leitura crua e o resultado `{ valor, erro }`, que o `papeis.mjs` reaproveita) e
                `urlDoRepositorio(repo)`, a regex de push do GitHub (https ou ssh, com ou sem `.git`, sem caixa, valor
                escapado). O par modelo/esforço, a escada, os pisos e os tetos **não** moram mais aqui (D11: `papeis.mjs`). Os **pisos do código** que ficam: `APOSENTADOS` (os agentes que saíram do pipeline, D34), `SUPRESSAO` (a regex da supressão `lgpd-ignora`, que o `confere-lgpd` importa daqui), `PISO_GATILHOS` (os
                revisores, caminhos e conteúdo mínimos de cada gatilho, `tela` inclusive, o `remocoes` e o `todo_arquivo` obrigatórios e os
                `exemplos` de caminho contra os quais um `ignorar` é conferido), `PISO_REVISAO` (o mínimo de `sempre`, vazio desde a D5, `comportamento` e `comportamento_caminhos`) e `PISO_GRANDE` (D5: os revisores e o gatilho `banco` que a regra `grande` tem de manter); um valor
                abaixo do piso, um gatilho a menos, o `grande` ausente ou um `layout` que não é booleano é erro de `lerRevisao`. Quem bloqueia trata o erro como recusa; o `portao.mjs` só avisa. Mora aqui também a **lista única do que é código** (`EXTENSOES_DE_CODIGO` e `ehArquivoDeCodigo`: `ts tsx mts cts js jsx mjs cjs sql json py go rs rb java kt cs php vue svelte css scss html sh yml yaml toml prisma`, menos o lockfile: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`), usada pelo `marca-alterado`, pelo `confere-docs`, pelo `confere-lgpd` (onde as regras de código valem) e pelo `escolhe-revisores`, e o `legadoAteDoTexto` / `lerLegadoAte` (o `lgpd.legadoAte` do `pipeline.json`: sha de 7 a 40 hexadecimais ou ausente).
              - `papeis.mjs` (D11): não é hook; é o **único** módulo que lê do `pipeline.json` as chaves `familias`, `escada`, `comum`, `agentes`, `niveis` e `neto`
                e o único que ordena, compara, sobe ou desce um par. Importa `lerObjeto`, `ok` e `falha` do `config.mjs`
                (o `config.mjs` não importa o `papeis.mjs`). `lerPapeis(arquivo)` devolve `{ valor, erro }` e `papeisDeObjeto(dados)`, pura, faz a validação, **falhando
                fechado** (quem chama nega, como antes): família só `opus`, `sonnet` ou `haiku` e a versão em `familias` no formato `claude-<família>-…`; esforço de `low` a `max`;
                a escada sem repetição, só com pares válidos, cada família contígua e o esforço subindo; todo par de entrada na escada; `piso` e `teto` juntos ou nenhum,
                na escada, no **mesmo modelo** da entrada (D3) e com `piso ≤ par ≤ teto`; `tools` de uma linha só nos agentes; `comum` com os três campos; o nome aposentado
                (`APOSENTADOS`) não volta a `agentes`; `agentes.desenvolvedor` e `niveis.orquestracao` presentes; o `neto`, se vier, é um agente fixo só com `Read`, `Grep` e `Glob` (`TOOLS_DO_NETO`), que não é o `desenvolvedor`. O valor é `{ familias, escada, comum, agentes, niveis }` mais `neto` quando a chave existe,
                com as entradas como estão no arquivo. Consultas puras: `par(e)` (`"modelo:esforço"`), `papel(p, secao, nome)`, `ehFixo(e)` (sem `piso` e `teto`),
                `faixa(parTexto, e)` (`abaixo`, `dentro`, `acima` do `piso` ao `teto`, ou `fora` se for de outro modelo; aceita par fora da escada, como `sonnet:xhigh`),
                `esforcosDe(e)` e `esforcosNegados(lista)` (para as mensagens), `degrau(p, { secao, chave, entrada }, ±1)` (um degrau na escada, preso ao piso e ao teto, no mesmo modelo;
                a entrada fixa não anda; devolve `{ de, para }` ou `{ erro }`), `orquestrador(p)` (`{ model, effort }` de `niveis.orquestracao`), `neto(p)` (o nome ou `undefined`), `versoes(p)`, `comum(p)`,
                `mudancas(antes, depois)` (o que mudou entre dois papéis, em frases curtas como `<agente>: teto <par antes> → <par depois>` e `neto: (nenhum) → leitor`: `familias`, `escada`, `comum`, `neto` e, em cada entrada de `agentes` e `niveis`,
                `model`, `effort`, `piso`, `teto` e `tools` sem a ordem; a `tarefa` não conta; entrada que entra ou sai também; a confirmação contra a `main` da `guarda-agentes` a usa),
                `agentesFixos(p)` (os agentes menos o `desenvolvedor`, que tem as regras da D8 e não é alvo do ajuste) e `nomesDeAgentes(p)`; mais `lerAgentes(arquivo)` e `lerNiveis(arquivo)`,
                as seções soltas (`{ valor, erro }`) para quem só precisa de uma (`escolhe-revisores`, `ajusta-pipeline`). Testes em `papeis.test.mjs`, que traz também o **teste de fronteira**: falha se um `.mjs`
                desta pasta fora do `papeis.mjs` define `FIXOS`, `PISOS`, `TETO`, `ESCADA`, `MODELOS` ou `NIVEIS_DE_CODIGO`, lê `.agentes`, `.niveis`, `.escada`, `.familias`, `.comum` ou `.neto` de um objeto
                vindo de `JSON.parse` (ou chamado `pipeline` ou `configuracao`), desestrutura essas chaves dele ou importa o `lerObjeto`. É uma heurística por regex, sem análise do código: não vê o apelido
                (`const x = dados; x.agentes`), a chave calculada (`dados[chave]`) nem o objeto passado de uma função a outra, e uma string com `TETO = ` dá falso positivo; por isso o `lerObjeto`, que dá
                o objeto cru, é proibido fora do `config.mjs` e do `papeis.mjs`.
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
                - **O subagente e `.claude/agents/` (D8.7), mais o `pipeline.json`, os `settings*.json` e `.claude/estado/` (D11).** Com `agent_id` na entrada do hook (o `ehSubagente` da `guarda-pasta-agentes`, o mesmo critério da `guarda-agentes`), a mesma regra invertida vale
                  também para toda menção a `.claude/agents` (sem caixa, com `./`, `//` ou `\` no meio): fora de um segmento que só lê, nega com "subagente não mexe em `.claude/agents/`, `.claude/pipeline.json`, `.claude/settings*.json` nem `.claude/estado/` pelo shell (D8, D11)".
                  A D11 soma à mesma regra `.claude/pipeline.json`, `.claude/settings*.json` e `.claude/estado/` (`NOME_DE_CONFIG`, com o nome solto só onde o comando também fala de `.claude`, `CONFIG_SOLTO`): o subagente os **lê** (`cat`, `grep`, `git show main:...`),
                  e `cp`, `sed -i`, `git add`, `echo alto > .claude/estado/esforco`, `rm` e o heredoc negam; vale **também no próprio worktree** (a regra é léxica e não sabe onde o comando roda). **O limite é o mesmo, léxico** (variável, glob, aspas partidas,
                  link feito pelo shell, `git apply`, um script escrito antes passam): a rede de verdade para o `pipeline.json` é a confirmação contra a `main` da `guarda-agentes`, não esta. Com `.claude`
                  em outro ponto do comando (`cd .claude`, `git -C .claude`), o `agents/` solto também conta; `apps/agents/` não. É a mesma máquina do segmento que só lê (`analisar`, `avaliarEntrada` e `decisao`
                  levam `agente` como último parâmetro), então `cat`, `grep`, `head`, `git show main:.claude/agents/x.md` passam, e `ls`, `cp`, `sed -i`, `git add` e `git checkout -- .claude/agents` negam. Sem `agent_id`
                  (o orquestrador), nada muda. Testes em `guarda-git.agentes.test.mjs`. Também contam como menção a `.claude/agents` as três opções do `ajusta-pipeline.mjs` que gravam o agente sem citar a pasta
                  (`--sincronizar-desenvolvedor`, `--aplicar-menos` e `--aplicar-mais`): com `agent_id`, `node .claude/hooks/ajusta-pipeline.mjs --aplicar-menos` nega. O mesmo vale para o gerador
                  `sincroniza-pares` (D11), com ou sem `.mjs` e com qualquer argumento, **menos o `--conferir`** no mesmo segmento do comando, que só lê (`node .claude/hooks/sincroniza-pares.mjs --conferir` passa;
                  `... --conferir; node .claude/hooks/sincroniza-pares.mjs` e `--conferir=0` negam). **A negação vale em qualquer modo:** o
                  `PIPELINE_GUARDA_GIT=desligado` não a some e o `perguntar` não a vira em `ask` (o `principal` lê a entrada antes do `desligado`; `negaAgentes` é a conta só da pasta de agentes); o resto continua
                  com o modo. A `guarda-pasta-agentes` é importada dentro de um `try`, como a `guarda-agentes` faz com o `config.mjs`: se não carrega (arquivo quebrado), a `guarda-git` nega tudo, em qualquer modo e com ou sem
                  `agent_id` ("guarda-pasta-agentes.mjs ilegível"), em vez de cair num erro que não nega nada. Com o `desligado` a entrada ilegível também nega (sem ler a entrada não se sabe se é subagente).
                  **O heredoc não esconde a menção:** o corpo de heredoc que cita a pasta de agentes vira o marcador `GIT_CONFIG_HEREDOC` no lugar do `<<EOF`, e a conta só dos agentes (`citaAgentes`) lê esse marcador como
                  menção; `bash <<'EOF'`, `node -` e `python3 -` com `echo x > .claude/agents/y` no corpo negam nos três modos (`negar`, `perguntar`, `desligado`), e o heredoc que só lê (`cat <<'EOF'`) passa. O teste
                  `guarda-git.agentes.test.mjs` roda **cada** item da lista `NEGA` pelo hook, como subagente, nos três modos, esperando `deny`.
                - Lê a linha continuada (`\` e a crase) separada e junta, tira as aspas dos argumentos sem espaço (a
                  aspa vazia fica), acha o programa depois de `xargs`, `timeout`, `cmd /c`, lê também o comando entre
                  aspas passado a outro shell (`bash -c`, `cmd /c`, `pwsh -Command`) e nega o `-EncodedCommand`.
                - Modo em `PIPELINE_GUARDA_GIT`: `negar` (padrão), `perguntar` (o `deny` vira `ask`, menos a falta de
                  repositório configurado), `desligado` (não confere nada, menos a negação da pasta de agentes ao subagente, D8.7, que vale em qualquer modo).
                - **O limite**: a guarda segura o erro e o atalho do agente, não um agente hostil. `sh x.sh` (um script que o agente escreveu antes) passa por qualquer regra de texto, e a trava
                  definitiva é uma checagem obrigatória no GitHub, que é decisão do usuário. O link ou a junção para a pasta `.git` feito pelo shell, e escrito pelo `Write`, é conferido pela `guarda-git-arquivos` (que resolve o caminho de verdade, ver abaixo).
              - `guarda-git-arquivos.mjs`: PreToolUse em Edit, Write, MultiEdit e NotebookEdit (`.claude/hooks/guarda-git-arquivos.mjs`), a mesma porta da `guarda-git` pelas ferramentas de edição.
                `motivoDoCaminho(caminho, cwd)` nega o caminho dentro de `.git/` (config, `config.worktree`, `hooks/`…) e o próprio arquivo `.git` (o ponteiro de um worktree). O caminho se lê a
                partir do `cwd` da entrada, com `..` resolvido, `\` virado `/` e pelo nome de cada pasta: `.GIT`, `.git.`, `.git ` e `GIT~1` também negam, e `.gitignore`, `.github/` e
                `.claude/hooks/git/` passam. Sem caminho legível (JSON quebrado, `file_path` e `notebook_path` ausentes), nega. Mesma saída da `guarda-git` (`hookSpecificOutput`,
                `permissionDecision: deny`) e mesmo `PIPELINE_GUARDA_GIT` (`perguntar` vira `ask`, `desligado` sai antes de tudo). Ligado no `.claude/settings.json` com `onFailure: "block"`; testes em
                `guarda-git-arquivos.test.mjs` e `settings.test.mjs`. **O link simbólico:** além do caminho como está escrito, confere o caminho de verdade (o `realpath` do ancestral mais próximo que existe, mais o resto;
                o link solto se segue pelo `readlink`; o ciclo de links nega), então `lnk/config` com `lnk` apontando para a pasta do git nega. E o hook roda mesmo quando o script é chamado por um caminho com link
                (no macOS, `/var` é link para `/private/var`): a comparação do `process.argv[1]` com o `import.meta.url` usa o `realpathSync` dos dois lados, como a `guarda-agentes` (a comparação crua deixava o hook mudo, e mudo é "passou").
              - `guarda-pasta-agentes.mjs`: PreToolUse em Edit, Write, MultiEdit e NotebookEdit (D8.7, ampliada na D11), ao lado da `guarda-git-arquivos`. O subagente (a entrada traz `agent_id`, texto não vazio) **não edita `.claude/` fora do próprio worktree**:
                `motivoDaEntrada(entrada)` nega com "subagente não edita `.claude/` fora do próprio worktree (D11)" (1) `agents/`, `pipeline.json` e `settings*.json` (o `.claude/settings.json` e o local) logo depois de um segmento `.claude`, em qualquer profundidade,
                **também dentro de `.claude/worktrees/*/`** (o próprio worktree não os edita); (2) qualquer outro caminho que tenha um segmento `.claude` (hooks, skills, commands, estado...) e **não esteja no worktree que contém o `cwd` da entrada**
                (o `.claude/worktrees/<x>` mais fundo do `cwd`; o `desenvolvedor` edita `.claude/worktrees/<x>/.claude/hooks/...` do próprio worktree, não o `.claude/hooks/` do checkout vivo nem o de outro worktree, nem o de um `<x>-2`; `cwd` fora de worktree: tudo sob `.claude/` nega).
                Sem diferença de caixa, lido a partir do `cwd` da entrada, com `..` resolvido, `\` virado `/` e pelo nome de cada pasta (`.claude.`, `.claude ` e `CLAUDE~1` também; `PIPELI~1.JSO` e `SETTIN~1.JSO`, os nomes curtos do Windows; `pipeline.json::$DATA`, o fluxo do NTFS). Com `agent_id` e sem caminho
                legível, nega; sem `agent_id` (o orquestrador, que edita tudo isso), não age, **menos com a entrada que não é JSON, que nega mesmo sem `agent_id`** (sem ler a entrada não se sabe quem é). Sem modo: o `PIPELINE_GUARDA_GIT`
                não a desliga. `ehSubagente` é importado pela `guarda-git` (dentro de um `try`). Ligada no `.claude/settings.json` com `onFailure: "block"`; testes em `guarda-pasta-agentes.test.mjs` (caminhos de uma raiz inventada, sem depender de onde rodam) e `settings.test.mjs`.
                **O link simbólico:** confere o caminho como está escrito e o de verdade (o `realpath` do ancestral mais próximo que existe, mais o resto, `caminhoReal`; o link solto se segue pelo `readlink`; o ciclo nega),
                então `lnk/agents/x.md` com `lnk` apontando para `.claude` nega no `Edit` e no `Write`, e o link de dentro do worktree para o `.claude` do checkout vivo também (o caminho de verdade fica fora do worktree). O hook também age quando o script é chamado por um caminho com link (o `/var` do macOS): a comparação do
                `process.argv[1]` com o `import.meta.url` usa o `realpathSync` dos dois lados (`mesmoArquivo`, como a `guarda-agentes`).
                **O que a trava não segura (D8.7), por desenho:**
                - **A trava do `Bash` é léxica.** Passam as aspas partidas (`a""gents`), a variável (`$D/agents`), o glob (`.cl*/agents`), o link simbólico feito e usado pelo shell, `git apply`, `git checkout <ref> -- .claude`
                  e `git stash pop`. Na D11 ela cobre também o `pipeline.json`, os `settings*.json` e `.claude/estado/`, com o mesmo limite; para o `pipeline.json` a rede é a confirmação contra a `main` (`guarda-agentes`).
                - **A cópia dos hooks do git no worktree do agente roda do próprio worktree** (o `core.hooksPath` é relativo), e o agente pode editá-la.
                - **A rede:** toda mudança em `.claude/hooks/` aciona o `config_pipeline` (revisor), e o orquestrador confere a lista de arquivos de cada branch antes do merge.
              - `desenvolvedor.mjs`: não é hook; módulo puro (só `node:*`, não lê arquivo) do agente de código `.claude/agents/desenvolvedor.md` (D8).
                O arquivo tem três zonas: o cabeçalho e o texto fixo (do modelo), o bloco entre `<!-- regras:inicio -->` e `<!-- regras:fim -->`
                (gerado) e a parte do projeto entre `<!-- projeto:inicio -->` e `<!-- projeto:fim -->` (vazia no modelo; o orquestrador a preenche
                só com itens `- `, e a regra 8 do `CLAUDE.md` vai num bloco gerado `dominio:inicio`/`dominio:fim` no topo dela). `cabecalho(entrada)` gera o
                cabeçalho exato da entrada `agentes.desenvolvedor` do `pipeline.json` (`model`, `effort`, `tools`; o resto é fixo), comparado byte a byte (campo a mais, repetido, CRLF, chave entre aspas ou valor diferente é problema); o módulo segue puro, quem chama passa a entrada, e `problemas(texto, fontes, entrada)` a recebe. `partes(texto)` divide o
                arquivo (exatamente um par de cada marcador, em ordem, ou `{ erro }` dizendo qual). `extrairRegras(claudeMd)` olha só a seção
                `## Regras que não se negociam` e acha cada regra pelo título em negrito, sem o `:` do fim (`TITULOS_FIXOS`: `Um \`AGENTS.md\` por pasta de
                trabalho`, `Dado inventado`, `Local primeiro`, `Segredos`, `Recurso pago`; título fixo ausente ou repetido é erro com o nome); o item
                sem título de `TITULOS_DO_MODELO` é do domínio. O item continua na linha de 3 espaços ou mais ou com tab (sublista aninhada, 4 espaços)
                e na linha em branco seguida de linha assim (o branco do fim sai); linha não vazia da seção que não é item nem continuação é erro, com a
                linha no texto (nada some em silêncio). `sincronizar(texto, claudeMd)` regrava o bloco `regras` e, se o `CLAUDE.md` já
                foi adotado (`adotado`: a 1ª linha, sem o BOM, deixou de ser `# <...>`), o bloco `dominio`; mantém o resto e o fim de linha, e é idempotente.
                `vazia` diz se a parte do projeto, sem comentários, não tem nada; `mesmaParteFixa(antes, depois)` diz se tudo fora do conteúdo
                do projeto é igual byte a byte (a conta da exceção do `escolhe-revisores`, D8.8). `problemas(texto, fontes)`
                é o que a guarda chama: o cabeçalho, os marcadores, os tetos (tamanho em bytes ÷ `CARACTERES_POR_TOKEN` = 3, o mesmo da guarda:
                corpo 1.500, parte fixa 900 e parte do projeto 600 tokens), o formato da parte do projeto fora do bloco `dominio` (só linhas
                vazias ou itens `- ` de até 240 caracteres, sem título, cerca de código, comentário nem marcador), a presença do bloco `dominio` (com o
                `CLAUDE.md` adotado e regras do domínio na extração, a falta dos marcadores é problema: "falta o bloco das regras do domínio: rode
                `--sincronizar-desenvolvedor`"; só presença, o texto não se compara; com o `CLAUDE.md` adotado e a extração em erro, o erro dela, com a frase dele, vira problema, para a regra 8 com subitem de 2 espaços não liberar o agente sem o bloco; não adotado, sem exigência) e a fonte: fora do bloco `dominio`, todo item `- ` termina numa marca,
                senão é "item sem fonte". `[CLAUDE.md]` ou `[docs/arquitetura.md]`: o texto (sem `- ` e sem a marca, com `trim`) é igual a uma linha da
                fonte. `[ajuste AAAA-MM-DD]`: `fontes.ajuste(data)` (injetável; devolve o texto de `docs/pipeline/ajustes/AAAA-MM-DD-desenvolvedor.md` ou
                `null`) tem uma linha `- entra: <texto>` com o mesmo texto (com `trim`). Marca que não confere é "fonte não confere". Não compara o bloco `regras` nem o `dominio` com o
                `CLAUDE.md`: isso é do teste, para a guarda não barrar o agente no meio da sessão. Testes em `desenvolvedor.test.mjs`.
              - `guarda-agentes.mjs`: PreToolUse na ferramenta `Agent`. A função pura `decidirAgente(entrada,
                lerCabecalho, p, lerTamanho, lerTexto, esforco, lerFontes)` devolve `deny`, `ask` ou `null`; `lerCabecalho(tipo)` dá o `name`, o `model`, o
                `effort` e o `tools` do frontmatter de `.claude/agents/<tipo>.md` (nada se o arquivo não existe) e um
                `problema` quando o cabeçalho repete uma chave, tem uma chave fora da **lista fechada** (D11: só `name`, `description`, `model`, `effort`, `tools` e, no agente `desenvolvedor`, `omitClaudeMd`; `mcpServers`, `hooks`, `permissionMode`, `memory`, `skills`...
                nega o agente, com o nome da chave; vale para o arquivo de **qualquer** agente da pasta, o `orquestrador` inclusive, que ninguém chama como subagente; e toda linha do cabeçalho tem de ser `chave: valor`, para o YAML aninhado ou a chave entre aspas não a esconderem) ou quando a pasta
                `.claude/agents`, com as subpastas, tem um `.md` fora dos agentes do `pipeline.json` (`nomesDeAgentes`), do `orquestrador` e do `desenvolvedor`, ou um 2º arquivo
                com o mesmo `name:` do fixo. `p` são os papéis do `.claude/pipeline.json` (`papeis.lerPapeis`; padrão: os do arquivo do projeto). Não há mais `TETO` no código (D11):
                o modelo, o esforço, as ferramentas, o `piso` e o `teto` de cada agente moram no `pipeline.json`, lidos pelo `papeis.mjs`. Uma entrada com o par fora do `piso` e do `teto`
                (`faixa` diferente de `dentro`; a leitura já a recusa, então só uma entrada montada na mão chega aqui) pede a confirmação do usuário (`ask`). **Efeito mudado na rodada 1 da D11:**
                as ferramentas do `pipeline.json` não são mais conferidas contra uma lista do código (só o cabeçalho tem de repetir o JSON); a trava contra o JSON afrouxado vem na rodada seguinte
                (a confirmação contra o `pipeline.json` da `main`, abaixo). Um tipo que tem arquivo em `.claude/agents` mas não tem entrada em `agentes` nega com "falta em agentes", sem cair na chamada comum.
                - `pipeline.json` ausente, ilegível, com marcas de conflito, sem `agentes`, sem `escada`, sem o `desenvolvedor` ou a `orquestracao`, ou com a estrutura quebrada (par fora do piso ou do teto, par fora da escada...): `deny`
                  em JSON ("pipeline.json ilegível: ..."), nunca saída com erro sem decisão. O `papeis.mjs` ou o `config.mjs` quebrado (conflito de
                  merge) também: o `papeis.mjs` é importado dentro de um `try` e a guarda nega com "papeis.mjs ou config.mjs ilegível".
                - Nos fixos, o `subagent_type` tem de ser exatamente igual ao `name:` do cabeçalho (sem aparar nem mudar
                  a caixa), senão nega; passa direto (`null`) só quando o cabeçalho tem o modelo, o esforço e as
                  ferramentas do `pipeline.json` (estas em qualquer ordem), a pasta não tem `problema`, o modelo e o
                  esforço efetivos (o da chamada, ou senão o do cabeçalho) são os do `pipeline.json` e o par não sai da faixa dele; senão nega.
                - Teto de 50 mil tokens (D5) em todo subagente, fixo ou comum: `decidirTeto` soma o tamanho do `prompt` ao dos arquivos fora do repositório que o `prompt` cita por caminho absoluto (o pacote da D4), cada um uma vez só pelo `realpath`, e nega acima de `TETO_TOKENS` (50000, estimados como tamanho ÷ 3).
                - O esforço do pipeline (D7): `lerEsforcoDoEstado` lê `PIPELINE_ESFORCO` ou `.claude/estado/esforco` (`rapido`, `medio` ou `alto`; sem arquivo ou vazio = `'<ausente>'`), e `decidirEsforcoPipeline(entrada, esforco)` exige que o esforço esteja gravado antes de delegar (com `'<ausente>'` só o `leitor-docs` passa) e nega fechado qualquer valor inválido. No `rapido`, nega todos os revisores fixos (`revisor-seguranca`, `revisor-arquitetura`, `revisor-tela`), o `qa` e o subagente cujo `prompt` ou `description` cita `ponytail-review`; deixa passar o `leitor-docs`, o `designer-ui` e os agentes de código. No `medio`, nega só o `revisor-arquitetura` (D12) e deixa passar os demais. No `alto` (ou `undefined` na chamada interna), não barra nenhum. O `designer-ui` (D35), que escreve a tela, roda nos três esforços (não é revisor nem qa).
                - O worktree nasce da `main` (D6): `decidirWorktree` nega o subagente com `isolation: "worktree"` quando nem o `prompt` nem um arquivo de pacote traz `git switch -c` ou `git checkout -b`.
                - **O agente de código é o `desenvolvedor` (D8).** Com `isolation: "worktree"` só ele passa: o `general-purpose`, o tipo ausente, um fixo ou
                  qualquer outro tipo nega com "só passa o `desenvolvedor` (D8)", e o `general-purpose` sem worktree passa como antes. Ele tem entrada em `agentes` no `pipeline.json` (D11), com `piso` e `teto`
                  (o esforço varia por chamada): a `decidirDesenvolvedor` passa só se o `subagent_type` é exatamente `desenvolvedor`
                  (sem mudar a caixa), a pasta não tem `problema` (o `.claude/agents/desenvolvedor.md` está na lista de arquivos permitidos), a chamada traz `isolation:
                  "worktree"`, traz `effort` (obrigatório, do `piso` ao `teto` da entrada, hoje de `low` a `high`; sem ele nega, sem cair no `medium` do cabeçalho), o `model` está ausente ou é o da entrada, `sonnet`
                  (outro nega, sem `ask`), `problemas(agente, fontes, entrada)` do `desenvolvedor.mjs` vem vazio (o cabeçalho é o gerado da entrada) e não ocorre de o projeto já ter adotado o `CLAUDE.md`
                  (a 1ª linha não é `# <...>`) com a parte do projeto vazia (nega com "preencha a parte do projeto"). `lerFontesDoDesenvolvedor` lê o agente, o
                  `CLAUDE.md` e o `docs/arquitetura.md` (injetável, 7º argumento do `decidirAgente`); arquivo que não lê nega. Dá também `fontes.ajuste(data)`, que só lê
                  o registro `docs/pipeline/ajustes/<data>-desenvolvedor.md` da data citada (AAAA-MM-DD; outra forma não lê) e devolve `null` se não existe ou não lê, o que nega o item. O `desenvolvedor.mjs` é importado
                  dentro de um `try`, como o `papeis.mjs`: se quebra, todo pedido de `Agent` nega ("desenvolvedor.mjs ilegível"). Depois valem, como para todos,
                  o esforço do pipeline (D7: o `desenvolvedor` passa em todos), o teto de 50 mil tokens (D5) e o `git switch -c` (D6).
                - O `orquestrador` (`SO_NO_CHAT`) só roda como agente do chat principal (`claude --agent orquestrador`):
                  como subagente nega, em qualquer modelo e esforço.
                - Nos demais tipos (a chamada comum, `comum` do `pipeline.json`) o cabeçalho não vale: a chamada tem de trazer `model` e `effort`. Nega: `fork`
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
                - **Chat principal e neto (D11).** Chat principal é **a chamada sem `agent_id` cujo `agent_type`, se vier, não é o nome de um agente de `agentes` do `pipeline.json`** (`ehChatPrincipal(entrada, p)`): a sessão em segundo plano chega com outro `agent_type` que não o `orquestrador`, e a regra "ausente ou `orquestrador`" travava o chat. Toda outra chamada de `Agent` é de subagente, inclusive a de um agente fixo que chegasse sem `agent_id` (valor que não é texto, como
                  `agent_id: 7` ou `agent_type: 7`, conta como subagente: na dúvida é subagente). O `principal` lê os papéis **antes** de qualquer decisão: com o `pipeline.json` inválido nega todo mundo, o neto inclusive. `decidirChamador(entrada, dados, p, lerCabecalho, lerTamanho, esforco)`
                  devolve `null` para o chat principal (segue para o `decidirOrquestrador` e o `decidirAgente`) e, para o subagente: **sem `neto(p)`** nega com "subagente não abre subagente: só o chat principal, o orquestrador, delega (D11)"
                  (a mensagem de hoje, que o arquivo atual, sem `neto`, continua dando); quem chama **sendo** o neto (`agent_type` igual a ele) nega ("o neto não abre outro agente: um nível só"); passa só com `subagent_type` igual ao neto
                  (sem mudar a caixa), **sem `isolation`**, `model` ausente ou da família da entrada dele e `effort` ausente ou igual ao dela; depois valem o `decidirFixo` (o cabeçalho contra o JSON), o `decidirTeto` (50 mil tokens) e o
                  `decidirEsforcoPipeline` (o neto respeita o esforço gravado: sem `.claude/estado/esforco` só o `leitor-docs` passa, como hoje). **Não** roda o `decidirOrquestrador`: o par do chat principal não é de quem chama.
                  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (no `env` do `.claude/settings.json`) é o que impede o neto de abrir outro; a guarda é a 2ª trava.
                - **O pipeline.json contra a `main` (D11).** A cada chamada de `Agent` (chat ou subagente) que não seja um `deny`, `decidirContraAMain(p)` compara os papéis lidos da árvore com os de `git show main:.claude/pipeline.json`
                  (`lerPipelineDaMain`: o git roda com `cwd` na raiz do projeto, sem shell, com timeout de 5 s; se a ref `main` não existe tenta `origin/main`), com `papeisDeObjeto` nos dois e `mudancas` (par, piso, teto, `tools`, `neto`, `familias`, `escada`, `comum`; a `tarefa` não conta).
                  Diferente: `ask` com o resumo ("o pipeline.json desta árvore difere do da main (<agente>: teto <par antes> → <par depois>; neto: (nenhum) → leitor); confirme", com no máximo 12 mudanças); o `deny` das outras regras vence (`juntarDecisoes`). **Nunca passa calado:** o git que não roda
                  ou estoura o tempo, a ref ausente nas duas, o JSON da `main` quebrado ou inválido (ex.: a `main` ainda no formato de antes da D11) também dão `ask`, dizendo isso. É a rede contra o `pipeline.json` afrouxado, que o subagente não edita (`guarda-pasta-agentes`, `guarda-git`).
                  **Nos testes** a comparação lê o git do ambiente: o hook de ponta a ponta roda com um `GIT_DIR` cujo `main` tem o arquivo igual ao da árvore (`ambienteDaMain` do `teste-apoio.mjs`), e o `guarda-agentes.test.mjs` traz também testes com um repositório git de verdade
                  (`main` com um arquivo e a árvore com outro, sem a ref, só com a `origin/main`, sem o git no `PATH`). Quem controla o ambiente do hook (`GIT_DIR`) controla a referência: o ambiente vem do Claude Code, não do shell do agente.
                - **O par do chat principal (D3).** Para ele, `decidirOrquestrador(par, p)` compara com o `niveis.orquestracao` do
                  `pipeline.json`, por `orquestrador(p)` (o par não se repete aqui): esforço conhecido e diferente nega com `/effort xhigh` na
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
              - `confere-esforco.mjs`: hook do `git/pre-commit` (depois do `confere-ramo`, antes do `confere-lgpd`), D11: **o esforço `rapido` não muda o pipeline.** Com o esforço em `rapido` (`PIPELINE_ESFORCO`, que vence, ou `.claude/estado/esforco`,
                lidos por `lerEsforcoDoEstado` da `guarda-agentes` em `CLAUDE_PROJECT_DIR`, na pasta do commit e no **checkout principal** do repositório, o pai do `git rev-parse --git-common-dir`: o worktree do agente não tem `.claude/estado/`; `rapido` em qualquer uma dessas
                raízes vale) e algum arquivo do índice (`git diff --cached --no-renames --name-only -z`, então o apagado e o renomeado contam) casando um caminho do gatilho `config_pipeline` (`PISO_GATILHOS.config_pipeline.caminhos` do `config.mjs` mais os do gatilho no `pipeline.json`,
                `caminhosDoConfigPipeline`), o commit é recusado: "o esforço rapido não muda o pipeline: grave medio ou alto" (`motivoDoRapido`, `conferir`). Sem esforço gravado, em `medio`, `alto` ou valor inválido, não faz nada; com o `rapido` e o git que não lista o índice, recusa (falha fechado).
                Não olha o conteúdo: o commit só da parte do projeto do `.claude/agents/desenvolvedor.md` (que a D8.8 tira do `config_pipeline` no `escolhe-revisores`) também é recusado no `rapido`. Fora do `pre-commit`: o `pre-merge-commit` não o chama. Testes em `confere-esforco.test.mjs` e `pre-commit.test.mjs`.
              - `git/pre-commit`: roda o `confere-ramo`, o `confere-esforco`, o `confere-lgpd --indice`, recusa o commit num worktree de agente (o topo do repositório, `git rev-parse --show-toplevel` absoluto e resolvido, dentro de um segmento `.claude/worktrees/`, sem caixa, o mesmo critério da `guarda-git`; o que o git não diz também recusa; o checkout do orquestrador, mesmo sendo um worktree ligado, commita) que tem o
                `.claude/agents/desenvolvedor.md` no índice, em qualquer caixa e mudado, criado, apagado ou renomeado ("o `.claude/agents/desenvolvedor.md` só se commita no checkout do orquestrador (D8)"; D8.7) e, quando o commit toca `.claude/`, o `CLAUDE.md` ou o
                `docs/arquitetura.md` (as fontes do `.claude/agents/desenvolvedor.md`), os testes do pipeline: sempre o
                `node --test` sobre a lista expandida `.claude/hooks/*.test.mjs` (sem as variáveis `GIT_*` do commit nem o
                `NODE_TEST_CONTEXT`, que os testes não podem herdar). Nunca o script `test:pipeline` de um `package.json`: um commit
                podia trocá-lo por `exit 0` (o atalho `test:pipeline` vale só para quem roda os testes à mão). Falhou, ou não há teste nenhum (o `node --test` sem arquivo sairia verde), o commit é
                recusado (falha fechado). O `git/pre-merge-commit` roda o `confere-ramo` e o `confere-lgpd --indice` (o git não roda o
                pre-commit num merge quando este hook existe) e recusa, com o mesmo critério do pre-commit (topo do repositório dentro de `.claude/worktrees/`), o merge que traz o
                `.claude/agents/desenvolvedor.md` para o índice ("Merge recusado: o `.claude/agents/desenvolvedor.md` só se commita no checkout do orquestrador (D8)"); o avanço rápido (fast-forward) não cria commit e não passa por hook nenhum. Os cinco hooks de `git/` começam com `unset NODE_OPTIONS`, logo depois
                do shebang: o ambiente do comando não escolhe o que o node carrega. Quem muda a regra do pipeline passa nos testes dela.
                - `escolhe-revisores.mjs <base> <head> | --trabalho [--esforco rapido|medio|alto] [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]`:
                não é hook; é o script que a seção 4 da skill `pipeline` manda rodar. Lê o esforço de `--esforco` ou de `.claude/estado/esforco` (`lerEsforcoDaPasta`, padrão `medio`, D7; valor inválido sai com 2): `medio` dispensa só o `revisor-arquitetura` (D12; com `motivo: "esforço medio (D64)"` em `dispensados`); `rapido` recusa com erro 2 se o diff acionar gatilho de risco (`GATILHOS_BLOQUEADOS_NO_RAPIDO`: `banco`, `permissao`, `dado_pessoal`, `config_pipeline`, `lgpd_ignora`, `lgpd_regras`, `confere-lgpd`) e, fora disso, dispensa todos os revisores e o `qa` (`"esforço rapido (D64)"`); `alto` mantém todos. Lê o diff arquivo por arquivo
                (`base...head`, a partir do merge-base; ou o HEAD contra a árvore com `--trabalho`, inclusive arquivo
                novo ainda fora do git; as referências não podem começar com `-`), casando os cabeçalhos pela lista de
                `git diff --name-only -z`, e aplica a seção `revisao` do `.claude/pipeline.json`: a **união** da base
                (`git show <base>:.claude/pipeline.json`) com o head, para o branch não ser avaliado pela regra que ele
                mesmo afrouxou (gatilhos, revisores, caminhos e conteúdo somam; o `ignorar_conteudo` global e o
                `ignorar` de cada gatilho só valem se os dois lados ignoram). O head é sempre o do git em `<head>`; a
                árvore só entra com `--trabalho`. Um branch que afrouxa um `ignorar` pede a revisão uma vez, e o seguinte
                já não pede. **Exceção da D8.8:** a mudança só na parte do projeto de `.claude/agents/desenvolvedor.md` não aciona o `config_pipeline` pelo caminho. O `lerDiff` anexa a esse
                arquivo (só com status `M`, sem renome, não binário) o `textoAntes` (o merge-base do `base...head`, ou o HEAD no `--trabalho`) e o `textoDepois` (o head, ou o disco no `--trabalho`);
                o `soParteDoProjeto(a)` é verdadeiro só com o caminho exato, os dois textos lidos, diferentes e com a mesma parte fixa (`mesmaParteFixa` do `desenvolvedor.mjs`). Texto que falta ou não
                lê, cabeçalho, parte fixa, bloco `regras` ou marcador mudado, arquivo criado, apagado ou renomeado: o gatilho dispara como sempre. A exceção é só do disparo por caminho do `config_pipeline`
                (o `soComentarioSql` é outra conta, que vale para todos os gatilhos); os gatilhos de conteúdo, o `grande` e o que conta como código ficam como estavam. Imprime os revisores obrigatórios com `modelo:esforço` e o motivo (gatilho, arquivo e
                linha, no máximo 3 por revisor; nunca o texto da linha, que pode ser dado pessoal). `sempre` (vazio desde a D5) vale
                quando um arquivo de código mudou (extensão da lista única do `config.mjs`, em qualquer lugar do repositório: as `pastasDeTrabalho` só decidem onde se exige o `AGENTS.md` e o binário); o `grande` (D5) imprime os seus revisores quando um gatilho listado nele disparou, quando os arquivos de `app/` (ou `src/app/`, `apps/<nome>/app/`, sem `.md`) caem em 2 rotas ou mais (`rotaDe`), ou quando um `AGENTS.md` foi criado numa pasta de trabalho ou trocou de pasta num renome; os `gatilhos` casam o caminho de qualquer
                arquivo e as linhas adicionadas (e as removidas, nos gatilhos com `remocoes`) dos que não estão em
                `ignorar_conteudo` (no gatilho com `layout`, hoje o `tela`, só dispara quando o arquivo é criado, apagado ou tem layout mudado no CSS ou no JSX/TSX, D5; o `.sql` só de comentário perde o caminho e não conta para o `grande` nem para o `qa`, D6); um binário numa pasta de trabalho aciona os gatilhos de conteúdo (menos imagem, fonte, pdf e vídeo: `png jpg jpeg gif webp ico avif woff woff2 ttf otf pdf mp4 webm`, que não contam como ilegíveis); o `lgpd_ignora` olha
                todo arquivo. O `qa` é obrigatório quando o diff toca `comportamento_caminhos`, menos os caminhos de `comportamento_ignorar` (D6); `--sem-comportamento`
                o tira e o motivo aparece na saída. `--sem-tela "<motivo>"` faz o mesmo só com o `revisor-tela`, para a troca só de
                texto, de cópia ou de renome de uma tela (o motivo é obrigatório e sai em "Dispensado"; o `qa` e os outros
                ficam). A opção que não tirou nada (sem tela no diff; no `--sem-comportamento`, sem código) imprime
                "revisor-tela não era obrigatório: --sem-tela sem efeito" (ou "qa não era obrigatório: --sem-comportamento sem
                efeito"), e o JSON traz `semEfeito`. O `confere-lgpd` também roda (`varrer`) nas linhas novas de cada arquivo de texto: todo achado ativo, o aviso médio inclusive (campo sensível, telemetria de fora), chama o `revisor-seguranca` (D34) com o motivo `confere-lgpd: <regra>` (o suprimido não; sem as regras carregadas, falha fechado). O binário roda o `varrer` com `"\0"`: só as regras de caminho e de binário, então a imagem nova chama o `revisor-seguranca` pela regra de print (`imagem_no_repositorio`) sem disparar gatilho de conteúdo. **Cada imagem nova ou mudada custa uma revisão de segurança/LGPD, de propósito:** um print com dado real pode ter qualquer nome (o `.pdf` cai na regra de arquivo de dados, e o `.avif` no binário desconhecido, até a extensão entrar no `fora` dessa regra). Só a imagem removida (`D`) não chama o `revisor-seguranca`; a renomeada (`git mv docs/print.png public/print.png`, o `R100` do git) chama, porque publica o print em outro lugar. Com `--trabalho` o item novo que não é arquivo (repositório aninhado, link) é pulado. Referência que não existe vira "a referência <x> não existe" (a `main` que ainda não existe diz como criá-la). O nome de revisor errado em `sempre`, `comportamento`, `grande` ou em qualquer gatilho é recusado ao carregar, mesmo que o gatilho não dispare. Revisor que não existe em `agentes` nem em `niveis`, `pipeline.json` do head abaixo dos pisos e
                diff que não casa com a lista de nomes saem com 2, não com omissão; quando o head não tem um gatilho do
                `PISO_GATILHOS` ou a regra `grande` (branch que saiu antes da regra), a mensagem acrescenta "branch anterior à regra: traga a
                main (git merge main)".
              - `coleta-agentes.mjs <pasta> [--desde <ISO>] [--json]`: não é hook; só lê, sem rede (D6). A autoanálise tira daqui os números dos subagentes (`agentId`, `modelo`, `tokens`, `minutos`, `inicio`, `fim`, `pedidos` e `primeiroPedido`; o pedido é a mensagem `user` que não é resultado de ferramenta **nem a que o Claude Code injeta, a de texto que começa por `<system-reminder>`**, então o agente comum sai com `pedidos: 1`, não "retomado") das transcrições `tasks/*.output` da sessão e, em campos separados no JSON e no texto (D8.9), o `contexto1` (medido: `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` do 1º `usage`, sem o `output_tokens`; `null` sem `usage`) e o `pacote1` (estimado: os tokens, tamanho ÷ `CARACTERES_POR_TOKEN`, dos arquivos de fora do repositório que o 1º pedido cita por caminho absoluto, com o `caminhosCitados` e o `tamanhoDoArquivo` da `guarda-agentes.mjs`, que o `lerAgente` e o `coletar` recebem como medidor injetável; 0 sem citação, `null` sem pedido); testes em `coleta-agentes.test.mjs`.
              - `sincroniza-pares.mjs [--conferir] [--raiz <pasta>]` (D11): o gerador dos pares; não é hook. Regrava, a partir do `pipeline.json` (lido só pelo `papeis.mjs`), o que antes se copiava à mão:
                (1) os cabeçalhos de `.claude/agents/<nome>.md` de cada entrada de `agentes` que tem arquivo (as linhas `model:`, `effort:` e `tools:`, com o modelo como apelido; o do `desenvolvedor` inteiro,
                pelo `cabecalho(entrada)` do `desenvolvedor.mjs`) e o `.claude/agents/orquestrador.md` (`model:` e `effort:` de `orquestrador(p)`), sem mudar mais nada do arquivo nem o `name:`; (2) o `.claude/settings.json`: `model` e
                `effortLevel` de `orquestrador(p)` e o `env`, que fica **exatamente** com `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` (de `versoes(p)`) e
                `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (`"1"` enquanto o `pipeline.json` não tem `neto`, `"2"` com ele), todos texto; qualquer outra chave do `env` some, e o resto do arquivo (`hooks` profundamente igual,
                recuo de 2, fim de linha e `\n` final) fica como está; (3) a tabela da seção 7 de `.claude/skills/pipeline/SKILL.md` (`tabela`, `tabelaDe`), no fim de linha que a skill já usa. O `.claude/settings.local.json`
                (fora do git), se existir com `env` de chave fora das 4, com `disableAllHooks`, ilegível ou de forma estranha, é **recusado** (sai 1 dizendo a chave, não grava nada, e o gerador nunca o regrava).
                Funções puras `cabecalhoDe(p, nome, texto)`, `settingsDe(p, texto)`, `tabelaDe(p, texto)` e `conferirLocal(texto)`, e um adaptador fino de disco (`montar(raiz, p)` monta tudo em memória e valida; `gravar` escreve cada
                arquivo que mudou por um temporário na mesma pasta + `rename`, então a 2ª execução não grava nada). **Falha fechado:** o `pipeline.json` inválido, um cabeçalho sem a linha a trocar, o `.claude/settings.json` ou a skill
                ausentes ou uma saída que não passa na conferência (JSON, `hooks` iguais, `env` só nas 4 chaves em texto, `name:` igual) saem com 1 sem gravar nada. Com `--conferir` não grava: sai 0 se tudo está em dia e 1 listando os
                arquivos que divergem e "rode node .claude/hooks/sincroniza-pares.mjs"; a recusa do `.claude/settings.local.json` vale também nele. Só ele e o `ajusta-pipeline.mjs --aplicar-*` (que usa o `montar` e o `gravar`) mudam esses
                arquivos; o subagente não o roda pelo shell (a `guarda-git`; o `--conferir` passa). Testes em `sincroniza-pares.test.mjs` (o repositório de verdade em dia, as funções puras, a idempotência pelo inode, a recusa sem
                gravar, o `--conferir`) e no `settings.test.mjs` (o `env`).
              - `ajusta-pipeline.mjs [--relatorio] [--aplicar-menos] [--aplicar-mais <alvo>] [--sincronizar-desenvolvedor] [--data
                AAAA-MM-DD] [--json] [--raiz <pasta>]`: não é hook; é a conta da skill `adjust-pipeline` (D2). O `--sincronizar-desenvolvedor` (D8)
                roda o `sincronizar` do `desenvolvedor.mjs` sobre `.claude/agents/desenvolvedor.md` com o `CLAUDE.md` da raiz, grava só
                se mudou, imprime o que mudou (`bloco regras`, `bloco dominio`) e, se a extração falha (título de regra ausente ou repetido, marcador quebrado),
                sai com 2 e a frase do erro. O `--repetidas <pasta> [--json]` (D8.3) é do fechamento: lê os `desenvolvedor-*.md` do 1º nível da pasta (os outros `.md`, como os pacotes de planejamento, e as subpastas ficam fora) e o `.claude/agents/desenvolvedor.md` da raiz, e imprime os pacotes contados, as **candidatas** (linha em 2 pacotes distintos ou mais que não é igual a uma linha do corpo do agente, com a contagem e os arquivos) e a **economia perdida** (linha de pacote igual a uma do corpo, com ≈ tokens = tamanho ÷ 3 × pacotes). A linha é normalizada (pula cerca de código e as linhas que começam por `#`, `|` ou `<!--`; tira `>`, o marcador de lista e `**`; junta espaços, tira `.;:,` do fim, minúsculas; menos de 40 caracteres é descartada). Só lê, nunca grava, e sai antes do `lerConfig` (funções `repetidas` e `linhasNormalizadas`). O lote que entra e sai do agente fica em `docs/pipeline/ajustes/<data>-desenvolvedor.md` (`tipo: parte-do-projeto`) e o `--relatorio` o aceita sem contá-lo em nenhum alvo. A sessão aceita em `agentes[]` os campos opcionais `agente` (texto), `contexto1` e `pacote1` (número ≥ 0 ou `null`). Lê as
                sessões de `docs/pipeline/sessoes/` (o bloco json de cada `AAAA-MM-DD-*.md`, validado: nomes que existem
                no `pipeline.json`, sem dado pessoal pelas regras do `confere-lgpd`, texto de até 600 caracteres) e os
                ajustes de `docs/pipeline/ajustes/`. Cada sessão leva `sessao.orquestrador` (obrigatório: `model` texto e
                `effort` texto ou `null`), e a cujo orquestrador não está no par de `niveis.orquestracao` (`orquestrador(p)` do `papeis.mjs`)
                (o modelo contém `opus` e o esforço é `xhigh`, sem caixa nem espaços nas pontas; D3) fica fora da janela
                como a de linha de base: entra só na tabela de "Linha de base e fora da conta", e o relatório diz qual e por quê numa linha (`Fora da conta (orquestrador em haiku:null, D3):
                <arquivos>`; a que já é de linha de base continua listada só como linha de base). O `papel` `consulta` é o
                do subagente que só busca ou lê, com o `tipo` de um nível (como o `leve`) e não o nome do agente (`Explore`,
                `claude-code-guide`): não conta como código e não leva modelo e esforço. Para cada alvo conta as sessões que o último ajuste dele não tinha
                visto (a lista `vistas` do arquivo de ajuste; a de `baseline` só entra no relatório). `unico` não se
                grava: é o achado sem `visto_por`. Para menos (revisor que rodou no par atual em `janela` sessões com
                código no diff, sem achado de nível médio ou mais dele ou visto por ele, sem escape e sem gatilho
                falso; a sessão só conta se alguém achou nível médio ou mais nela) desce um degrau da `escada` do `pipeline.json` (`degrau` do `papeis.mjs`) **dentro do mesmo modelo** (o ajuste só mexe no esforço; o modelo vem do papel, D3: a arquitetura desce até o piso dela, o `opus:medium`, e para aí), nunca abaixo do piso, um alvo por execução, o
                mais caro primeiro, respeitando o `adiar` da sessão. Para mais (escape de nível médio ou mais, na hora; rodadas
                altas do nível de código, com a janela completa) e gatilho que falta ou dispara à toa ele só propõe; o `--aplicar-mais` aplica
                a proposta existente. O nível de código nunca passa do `teto` dele (`sonnet:high`) e o agente nunca passa do `teto` da entrada; entrada fixa (sem `piso` e `teto`) e o `desenvolvedor` não são alvo. Aplicar edita
                só a linha do alvo no `pipeline.json` e, com o `montar` e o `gravar` do `sincroniza-pares.mjs` sobre o `pipeline.json` novo, regrava os cabeçalhos dos agentes, o `.claude/settings.json` e a tabela da seção 7 da skill `pipeline` (a tabela e o `--sincronizar-tabela` saíram daqui para o gerador), e
                grava `docs/pipeline/ajustes/<data>-<alvo>.md` (com as `vistas`); só grava se o `pipeline.json` novo passa na leitura do `papeis.mjs` (piso, teto, escada) e o alvo não é fixo. A janela completa vale só para descer e para a subida do código por rodadas; escape e gatilho que falta viram proposta na hora. A tabela da skill mantém o fim de linha que o `SKILL.md` já usa (CRLF ou LF), e o `aplicar` falha, sem gravar nada, se o `.claude/settings.local.json` for recusado pelo gerador. O nome do arquivo de sessão, depois da data, é kebab de até 60 caracteres, e nem o nome nem o texto do bloco levam id de pessoa (`cliente 12345`, `lead #987`, `contato123`, `titular 0042`).
              - `marca-alterado.mjs`: PostToolUse em Edit, Write, MultiEdit e NotebookEdit; anota código alterado (a lista única de extensões do `config.mjs`, `.css` e `.py` inclusive) em
                `.claude/estado/alterados.txt`. Nunca bloqueia.
              - `portao.mjs`: Stop; com código alterado e o script do `portaoRapido` no package.json, roda o portão
                rápido (`npm run <portaoRapido>`). Vermelho devolve o erro; verde pede a revisão do pipeline uma vez e
                depois libera (exceto quando `.claude/estado/esforco` é `rapido`, D7: aí o verde já libera de primeira e limpa `alterados.txt`); com `stop_hook_active`, vermelho só avisa. Sem o script, não faz nada; com o
                `.claude/pipeline.json` ilegível, só avisa. O arquivo vem de `CLAUDE_PROJECT_DIR`.
              - `impeccable.mjs`: launcher preso da skill `impeccable` (D35 (6)). Só aceita os verbos `context` e `detect`, confere a plataforma e o hash do motor em `~/.impeccable/bin/<versão>/`, roda em `sandbox-exec` sem rede e sem acesso a segredos locais, com as quatro chaves `IMPECCABLE_NO_*` ligadas.
              - `teste-apoio.mjs`: não é hook; monta, para os testes, um projeto numa pasta temporária com os hooks
                copiados e um `.claude/pipeline.json` à escolha, e guarda o `EXEMPLO` dos pares (e `fixarExemplo`, que põe
                a cópia de um projeto nesse estado; `papeisDeExemplo`, os papéis do arquivo com os pares do `EXEMPLO`, para os testes da guarda; `pisosDoProjeto`, o `piso` de cada entrada, para o
                `ciclo-completo`): os testes da conta e da guarda não leem os pares do `pipeline.json` de
                verdade, que o ajuste automático muda. O `fixarPares` regrava a tabela da skill com o `tabelaDe` do `sincroniza-pares.mjs`.
Não faz:      a regra do pipeline (está na skill `.claude/skills/pipeline`); a decisão de subir um revisor ou criar um
              gatilho (o `ajusta-pipeline.mjs` propõe, o usuário diz "sim"); a mudança de regra do `CLAUDE.md`; a conferência do que o AGENTS.md diz em
              prosa (é do revisor-arquitetura); o julgamento de risco e dado pessoal (é do revisor-seguranca; o revisor-lgpd saiu na D34); os hooks globais do usuário não são daqui.
Depende de:   Node 24 e git, sem pacote nenhum; o `.claude/pipeline.json`; os cabeçalhos de `.claude/agents/` e o fim
              do registro da sessão que o hook aponta em `transcript_path`, só para ler (`guarda-agentes.mjs`); `docs/pipeline/` (`ajusta-pipeline.mjs`); a tabela da seção 7 de `.claude/skills/pipeline/SKILL.md`, os cabeçalhos de `.claude/agents/` e o `.claude/settings.json`
              (`sincroniza-pares.mjs`, que os regrava, e o `ajusta-pipeline.mjs` por ele); o `CLAUDE.md`, o `docs/arquitetura.md` e `.claude/agents/desenvolvedor.md` (`guarda-agentes.mjs`, que os lê a cada chamada do
              `desenvolvedor`, e `ajusta-pipeline.mjs --sincronizar-desenvolvedor`, que regrava o agente a partir do `CLAUDE.md`).
              Claude Code 2.1.292 ou mais novo (o `effort` na chamada de `Agent`, que a guarda exige do `desenvolvedor`) e 2.1.271 ou mais novo (o `omitClaudeMd` do cabeçalho dele, D8).
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
              - O `desenvolvedor.test.mjs` confere o `desenvolvedor.mjs` com textos inventados (`partes` com 0 ou 2 pares, ordem trocada e CRLF; o cabeçalho com campo a
                mais, repetido, `tools` errado e chave entre aspas; os tetos; a extração com título ausente, repetido e o item do domínio; `sincronizar`
                idempotente; `mesmaParteFixa`; a regra com sublista aninhada, 4 espaços, tab e branco, e a linha solta, para uma regra fixa e para a do domínio; o BOM; a presença do bloco `dominio`;
                o lint de formato e de fonte, com o item sem marca, os três tipos de marca e o registro do ajuste) e o arquivo de verdade (o cabeçalho de `cabecalho(entrada)` com a entrada do `pipeline.json` e o `problemas` sem entrada): o `.claude/agents/desenvolvedor.md` sem problema,
                com os blocos iguais ao que o `CLAUDE.md` dá (se falha, rode `--sincronizar-desenvolvedor`), as fontes de verdade (`lerFontesDoDesenvolvedor(raiz).fontes`, com o leitor de
                `docs/pipeline/ajustes/`, para o item `[ajuste AAAA-MM-DD]` de um projeto adotado conferir; testado numa raiz temporária adotada, com o registro e sem ele), a parte do projeto vazia enquanto o `CLAUDE.md`
                for o do modelo, o bloco `dominio` igual à extração num `CLAUDE.md` adotado (fonte falsa) e o `CARACTERES_POR_TOKEN` igual ao da guarda.
              - O `guarda-agentes.test.mjs` usa um `lerCabecalho` falso e também lê os cabeçalhos de verdade de
                `.claude/agents/` (com as subpastas): todo arquivo está em `agentes` do `pipeline.json` ou é o `orquestrador`
                (o `orquestracao` de `niveis`) ou o `desenvolvedor` (cabeçalho exato do `desenvolvedor.mjs`), senão o teste falha; o `desenvolvedor` (D8) tem casos
                próprios (esforço na chamada, modelo, caixa, sem worktree, problema no corpo, os quatro estados adotado/vazio, arquivo que não lê, 2º arquivo com o
                mesmo `name:`, o `general-purpose` com worktree e o hook de ponta a ponta com o `desenvolvedor.mjs` quebrado), e os da regra do `git switch -c` rodam com ele; o cabeçalho tem de ser o do `pipeline.json`; o `name:` é o nome do arquivo e o `tools:` dos fixos é o do `pipeline.json`; os testes com cabeçalho montado na mão partem dos papéis do `EXEMPLO` (`papeisDeExemplo` do `teste-apoio.mjs`), não dos pares do arquivo, que o ajuste desce até o piso; a chamada comum e o esforço do `desenvolvedor` têm casos com `comum` e `piso`/`teto` trocados; copia a pasta e o hook para uma pasta temporária para provar o arquivo estranho, o campo
                repetido e a falha fechada. Os casos do chat principal (D3) usam registros JSONL inventados numa pasta
                temporária: o parser puro, a janela do fim de um arquivo de mais de 4 MB (a única linha do chat no começo,
                coberta por linhas que não contam), o arquivo que falta, o esforço pela entrada, pela variável e pelo
                registro (sem `effort.level`, `CLAUDE_EFFORT` em xhigh não cobre um registro em low), o `agent_id` de
                subagente, a linha de outro `type` com `message.model` depois da linha do chat, e o hook de ponta a ponta (todos os que passam pela ferramenta
                `Agent` mandam um par certo, ou esperam o `ask` e o `deny`).
              - O `config.test.mjs` cobre as chaves que o `config.mjs` lê (`revisao`, `ajuste`, `repositorio`, `portaoRapido`, `pastasDeTrabalho`, `lgpd`) e que o arquivo do projeto tem as dez chaves obrigatórias. As de par (`agentes`, `niveis`, `familias`, `escada`, `comum`) são do `papeis.test.mjs`.
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
                sincronia com os arquivos de verdade: a tabela da seção 7 da skill (pelo `tabelaDe`), os cabeçalhos de `.claude/agents/`,
                `docs/pipeline/sessoes/MODELO.md` e as sessões gravadas; cobre também o `orquestrador` obrigatório, o `consulta`
                e a sessão fora da conta; os campos opcionais `agente`, `contexto1` e `pacote1` (tipo errado recusado, sessão antiga válida); o `--repetidas` (limite de 1 contra 2 pacotes, de 39 contra 40 caracteres, cerca de código, nome do arquivo, economia perdida, linha de comando sem gravar nem ler o `pipeline.json`); o ajuste `desenvolvedor` que o `--relatorio` aceita; o `--sincronizar-desenvolvedor` (em dia, bloco `regras` regravado, adoção que cria o bloco `dominio` e erro de extração com saída 2); o `desenvolvedor` fora da conta e do `aplicar`, e o `aplicar` que recusa alvo fixo; o par antigo que sobra nos documentos não conta o `piso` e o `teto` do `pipeline.json`.
              - O `ciclo-completo.test.mjs` copia só o que os testes que leem o `pipeline.json` de verdade usam
                (`config`, `papeis`, `guarda-agentes`, `ajusta-pipeline`, `settings` e `sincroniza-pares`), baixa todos os alvos ao piso (cabeçalhos e
                tabela sincronizados) e roda esses seis lá (~9 s): um teste que crava um par quebraria no 1º ajuste
                automático e o pre-commit recusaria o commit.
              - O `pre-commit.test.mjs` usa um git de verdade com os hooks copiados e **sem `package.json`**: o commit que toca `.claude/` roda o
                `node --test` (vermelho recusa, verde passa, sem teste nenhum recusa, e o script `test:pipeline` de um `package.json` não
                vale), com `NODE_TEST_CONTEXT=child` e `NODE_OPTIONS` quebrado no ambiente do commit, e o que não toca `.claude/` não roda
                nada; confere que os cinco hooks de `git/` começam com `unset NODE_OPTIONS`. Também: o `CLAUDE.md` e o `docs/arquitetura.md` rodam os testes como `.claude/` (e `docs/outro.md`, `sub/CLAUDE.md`
                não); e, com um worktree ligado de verdade (`git worktree add`) dentro de `.claude/worktrees/` (também `.Claude/Worktrees`), o commit com o `.claude/agents/desenvolvedor.md` no índice é recusado (criado, mudado, apagado, renomeado e outra caixa), o dos outros agentes
                passa, o do checkout principal passa e o de um worktree de fora de `.claude/worktrees/` (o checkout do orquestrador) passa; o merge que traz o `.claude/agents/desenvolvedor.md` é recusado no worktree do agente (o que traz outro arquivo passa) e passa no de fora.
              - O `escolhe-revisores.desenvolvedor.test.mjs` testa a exceção da D8.8: dentro do processo (`soParteDoProjeto` e `escolher` com `textoAntes` e `textoDepois` anexados à mão: só a parte do projeto não
                aciona; cabeçalho, parte fixa, `regras`, marcador, criado, apagado, renomeado, binário e texto que falta acionam) e num git de verdade (`base...head`, inclusive com a base andando, e `--trabalho`).
              - Os testes da D11: o `papeis.test.mjs` traz o `neto` (a chave válida e cada recusa) e o `mudancas`; o `guarda-agentes.test.mjs`, o neto (`decidirChamador` e o hook com um `pipeline.json` com `neto` e o arquivo do `leitor`), a lista fechada de chaves (com um teste sobre os arquivos de verdade de
                `.claude/agents/`) e a confirmação contra a `main` (função pura, `lerPipelineDaMain` com o `spawnSync` injetado e um git de verdade); o `confere-esforco.test.mjs` e o `pre-commit.test.mjs`, o `rapido` (inclusive o worktree ligado de verdade, com o esforço no checkout principal).
              - O `guarda-pasta-agentes.test.mjs` testa o `motivoDaEntrada` (caminhos que negam e que passam, relativo ao `cwd`, `agent_id` ausente, vazio ou em branco, sem caminho legível) e o hook de ponta
                a ponta nas quatro ferramentas, inclusive o script chamado por um link e o caminho com link para `.claude` e para `agents/` (pastas de verdade, `spawnSync`). O `guarda-git-arquivos.test.mjs` tem os mesmos dois casos de link, para o `.git`.
              - O `settings.test.mjs` confere que o `.claude/settings.json` liga a `guarda-agentes` (matcher `Agent`) e
                a `guarda-git` (Bash e PowerShell), a `guarda-git-arquivos` e a `guarda-pasta-agentes` (Edit, Write, MultiEdit e NotebookEdit), as quatro com `onFailure: "block"`, que todo hook ligado existe e que
                a sessão abre como o agente `orquestrador` (`agent`), no modelo e no esforço do
                `niveis.orquestracao` do `pipeline.json` (`orquestrador(p)`; `model` e `effortLevel`, D3), e que o `env` é o de `versoes(p)` mais a profundidade do `neto` (`envDe`, D11), só essas 4 chaves e em texto.
              - Teste que commita num git temporário não pode usar a `main` com os hooks ligados: use outro branch ou
                `-c core.hooksPath=`. O `guarda-git.test.mjs` copia os hooks e o `pipeline.json` para um projeto numa
                pasta temporária (com `.git`) e testa a cópia, então roda igual na pasta principal e dentro de um
                worktree de agente.
