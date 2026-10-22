# .claude/hooks

Faz:          os hooks do pipeline: os do Claude Code, ligados em `.claude/settings.json`, e os do git, em `git/`.
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
              - `config.mjs`: leitura e validação do `.claude/pipeline.json`. Cada campo devolve `{ valor, erro }`
                (`lerRepositorio`, `lerPortao`, `lerPastas`), mais `urlDoRepositorio(repo)`, a regex de push do GitHub
                (https ou ssh, com ou sem `.git`, sem caixa, valor escapado). Quem bloqueia trata o erro como recusa;
                o `portao.mjs` só avisa.
              - `guarda-git.mjs`: PreToolUse em Bash e PowerShell. A função `decisao(comando, cwd)` devolve `deny` (há
                motivo para negar), `ask` (sem motivo, mas o comando sobe algo: push, `remote add` ou `set-url`, escrita
                em PR; o motivo é "confirme o comando: push ou PR", sem o texto de "peça para ele rodar com !", que é só
                do `deny`) ou `null`; o `push --dry-run` também pede a confirmação, de propósito. A guarda não olha a ref
                do push (quem nega a `main` é o `pre-push`).
                - Deixa o push e o `gh pr create`, `edit`, `comment`, `ready` e `review` só para o `origin` e só do
                  repositório do projeto (o 1º `.git` acima do `cwd` da entrada do hook é a pasta `.git` do projeto),
                  nunca de um worktree de agente (`.claude/worktrees/`) ou de um clone, nem com link de PR ou `-R` de
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
                  `--remove-section` ou `--rename-section` na seção `core`).
                - Lê a linha continuada (`\` e a crase) separada e junta, tira as aspas dos argumentos sem espaço (a
                  aspa vazia fica), acha o programa depois de `xargs`, `timeout`, `cmd /c`, lê também o comando entre
                  aspas passado a outro shell (`bash -c`, `cmd /c`, `pwsh -Command`) e nega o `-EncodedCommand`.
                - Modo em `PIPELINE_GUARDA_GIT`: `negar` (padrão), `perguntar` (o `deny` vira `ask`, menos a falta de
                  repositório configurado), `desligado` (sai antes de tudo).
              - `guarda-agentes.mjs`: PreToolUse na ferramenta `Agent`. A função pura `decidirAgente(entrada,
                lerCabecalho)` devolve `deny`, `ask` ou `null`; `lerCabecalho(tipo)` dá o `name`, o `model`, o `effort`
                e o `tools` do frontmatter de `.claude/agents/<tipo>.md` (nada se o arquivo não existe) e um `problema`
                quando o cabeçalho repete `name`, `model`, `effort` ou `tools` ou quando a pasta `.claude/agents`, com
                as subpastas, tem um `.md` fora de `AGENTES_FIXOS` e do `orquestrador`, ou um 2º arquivo com o mesmo
                `name:` do fixo.
                - A tabela exportada `AGENTES_FIXOS` diz o modelo, o esforço e as ferramentas de cada agente fixo:
                  `revisor-seguranca` em `opus` e `xhigh`; `revisor-arquitetura` e `revisor-lgpd` em `opus` e `high`;
                  `leitor-docs` em `haiku` e `low`; os quatro com `Read, Grep, Glob`; `qa` em `sonnet` e `high`, com
                  `Read, Grep, Glob, Bash`.
                - Nos fixos, o `subagent_type` tem de ser exatamente igual ao `name:` do cabeçalho (sem aparar nem mudar
                  a caixa), senão nega; passa direto (`null`) só quando o cabeçalho tem o modelo, o esforço e as
                  ferramentas da tabela (estas em qualquer ordem), a pasta não tem `problema` e o modelo e o esforço
                  efetivos (o da chamada, ou senão o do cabeçalho) são os da tabela; senão nega.
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
              - `confere-push.mjs`: hook pre-push do git (`git/pre-push`). Pega o que a guarda não vê no texto do
                comando: nega o push, nesta ordem, quando o `repositorio` não está configurado (mesma mensagem da
                guarda), quando a URL não é a dele, quando apagaria uma ref, quando a ref remota é `refs/heads/main`
                ("a main só anda pelo merge do PR no GitHub") e quando o remoto tem commit que o push descartaria
                (forçar). Só o usuário passa por cima, com `--no-verify` pelo `!`.
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
                quando ele cita um arquivo que não existe na pasta; quando um link relativo de um .md do commit não
                leva a nada (exemplos em bloco de código e em `.claude/skills/` não contam); quando o repositório não
                tem README.md; e quando o código mudou e o AGENTS.md não, sem a linha "Docs-conferidos:
                <pasta>/AGENTS.md" na mensagem. Arquivo dentro de uma pasta `gerado/` que o AGENTS.md da pasta cita
                pelo nome não conta como código nessa última regra (o gerador tem teste que falha quando ele fica
                velho); gerado novo, não citado, conta; as outras regras valem para ele. Com o `.claude/pipeline.json`
                ilegível ou sem `pastasDeTrabalho` válidas, recusa o commit com o motivo.
              - `confere-lgpd.mjs`: dado pessoal (LGPD), com as regras de `lgpd-regras.mjs`, portadas do otto e sem regra
                presa a um projeto. PreToolUse em Edit, Write, MultiEdit e NotebookEdit: nega a edição com achado crítico
                ou alto (a raiz vem do git do arquivo, então vale no worktree; fora de um repositório, não confere). Hook
                pre-commit do git (`git/pre-commit`, depois do confere-ramo, modo `--indice`): confere o conteúdo em
                preparo de cada arquivo do commit (UTF-16 com BOM vira texto; binário só passa pelas regras de caminho e
                de binário), recusa o mesmo e mostra os avisos (médio) e as supressões. À mão:
                `node .claude/hooks/confere-lgpd.mjs <arquivo ou pasta>...`. Falso positivo se suprime na linha, ou num
                comentário na linha de cima, com "lgpd-ignora: <regra> -- <motivo>"; CPF, cartão e chave não se
                suprimem, e o revisor-lgpd confere cada supressão. Regra que não carrega nega toda edição e recusa todo
                commit: corrija pelo shell. As regras cobrem dado real escrito (CPF, RG, cartão, telefone, e-mail fora
                de `example.com`, `.test` e `.invalid`), chave e segredo, arquivo de dados e binário, dado pessoal em
                log, erro e URL, `select *` em tabela de pessoas, coluna pessoal e dado sensível no banco, SQL
                concatenado, dado pessoal para IA, analytics, webhook e HTTP de fora, consentimento marcado,
                `localStorage`, cookie, geolocalização e cache sem prazo.
              - `marca-alterado.mjs`: PostToolUse em Edit, Write, MultiEdit e NotebookEdit; anota código alterado em
                `.claude/estado/alterados.txt`. Nunca bloqueia.
              - `portao.mjs`: Stop; com código alterado e o script do `portaoRapido` no package.json, roda o portão
                rápido (`npm run <portaoRapido>`). Vermelho devolve o erro; verde pede a revisão do pipeline uma vez e
                depois libera; com `stop_hook_active`, vermelho só avisa. Sem o script, não faz nada; com o
                `.claude/pipeline.json` ilegível, só avisa. O arquivo vem de `CLAUDE_PROJECT_DIR`.
              - `teste-apoio.mjs`: não é hook; monta, para os testes, um projeto numa pasta temporária com os hooks
                copiados e um `.claude/pipeline.json` à escolha.
Não faz:      a regra do pipeline (está na skill `.claude/skills/pipeline`); a conferência do que o AGENTS.md diz em
              prosa (é do revisor-arquitetura); o julgamento da lei, como finalidade, base legal e retenção (é do
              revisor-lgpd); os hooks globais do usuário não são daqui.
Depende de:   Node 24 e git, sem pacote nenhum; o `.claude/pipeline.json`; os cabeçalhos de `.claude/agents/`
              (`guarda-agentes.mjs`).
Regras daqui: hook de guarda erra para o lado de bloquear; hook de anotação nunca bloqueia; nada de rede.
              O `.claude/pipeline.json` é a única configuração: nenhum repositório, pasta ou script fixo no código.
              O confere-lgpd nunca repete o trecho achado (pode ser dado pessoal), o arquivo de regras fica fora da
              varredura, e toda regra nova traz exemplo do que pega e do que deixa passar.
              Tudo em LF (`.gitattributes`): o git do Windows converte para CRLF, e o hook do git com CRLF não roda.
Como testar:  `node --test ".claude/hooks/*.test.mjs"`.
              - O `config.test.mjs` escreve `pipeline.json` temporários; o `confere-docs.test.mjs` não usa git.
              - O `confere-docs.git.test.mjs`, o `confere-lgpd.test.mjs`, o `confere-ramo.test.mjs`, o
                `confere-main.test.mjs` (com um remoto bare e o `origin/main`) e o `confere-push.test.mjs` usam um git de
                verdade numa pasta temporária; os que dependem do `pipeline.json` copiam os hooks e escrevem o deles
                (`teste-apoio.mjs`), então não mudam quando o do projeto muda.
              - O `portao.test.mjs` usa um `package.json` e um `pipeline.json` falsos numa pasta temporária.
              - O `guarda-agentes.test.mjs` usa um `lerCabecalho` falso e também lê os cabeçalhos de verdade de
                `.claude/agents/` (com as subpastas): todo arquivo está em `AGENTES_FIXOS` ou é o `orquestrador`
                (`opus`, `xhigh`), senão o teste falha; o `name:` é o nome do arquivo e o `tools:` dos fixos é o da
                tabela; copia a pasta e o hook para uma pasta temporária para provar o arquivo estranho, o campo
                repetido e a falha fechada.
              - O `settings.test.mjs` confere que o `.claude/settings.json` liga a `guarda-agentes` (matcher `Agent`) e
                a `guarda-git` (Bash e PowerShell), as duas com `onFailure: "block"`, e que todo hook ligado existe.
              - Teste que commita num git temporário não pode usar a `main` com os hooks ligados: use outro branch ou
                `-c core.hooksPath=`. O `guarda-git.test.mjs` copia os hooks e o `pipeline.json` para um projeto numa
                pasta temporária (com `.git`) e testa a cópia, então roda igual na pasta principal e dentro de um
                worktree de agente.
