# <Nome do projeto>

<O que o projeto é, para quem, em duas linhas.>

- Plano: `docs/plano.md`. **Arquitetura: `docs/arquitetura.md`.** Decisões: `docs/decisoes.md`. Produto (quem usa, para quê): `PRODUCT.md`.
- Responsável: <pessoa ou célula>. Respostas curtas, em português.
- **Repositório:** `github.com/<dono>/<repo>`, o mesmo de `.claude/pipeline.json`. Nada se commita na `main`: cada tarefa vai num branch `pr/<assunto-em-kebab>` e termina num commit, com a documentação conferida. O orquestrador sobe o branch e abre o PR em rascunho no 1º push, e o marca pronto com os portões verdes, a revisão feita e o `qa` aprovado; todo push e toda escrita em PR pedem a confirmação do usuário, e o merge é dele, nunca de quem abriu. Agente de worktree só commita.

## Regras que não se negociam

1. **Pipeline:** toda tarefa que cria ou muda código, migração, contrato, pasta ou arquitetura segue a skill `pipeline` (`.claude/skills/pipeline/`): classificar, playbook, portões, revisão e QA, commit, relatório.
   - Decisão de arquitetura vem antes do código e é do usuário, registrada como `D<n>` em `docs/decisoes.md`.
   - Os hooks de `.claude/settings.json` e de `.claude/hooks/git/` fazem parte do pipeline (`.claude/hooks/AGENTS.md`): a guarda de git deixa push e PR só para o `origin` do repositório acima, com a confirmação do usuário, e nega outro remoto, o PR que não nasce rascunho, o merge do PR e o token; o pre-commit recusa commit na `main`, e o pre-push nega o push para outra URL, para a `main`, o forçado e o que apaga; a `guarda-agentes` confere o modelo e o esforço de cada subagente; o `confere-docs` recusa commit com documentação que não bate; o `confere-lgpd` nega a edição e o commit com dado pessoal exposto; e o portão rápido roda no fim do turno quando houve código alterado.
2. **Um `AGENTS.md` por pasta de trabalho** (as de `pastasDeTrabalho` em `.claude/pipeline.json`).
   - Antes de mexer numa pasta, ler o `AGENTS.md` dela e os das pastas acima.
   - Pasta nova nasce com o seu; mudou o que a pasta faz, o `AGENTS.md` muda junto.
   - Todo commit passa pelo `confere-docs`: o `AGENTS.md` de cada pasta tocada tem de corresponder ao código.
   - Agente que desenvolve mexe só na sua pasta; mudança de contrato entre pastas se relata, não se edita.
3. **Multiagentes:** todo trabalho com mais de um agente tem um orquestrador (`.claude/agents/orquestrador.md`, `opus`, `xhigh`, só como agente do chat principal: `claude --agent orquestrador`). Ele planeja lendo os `AGENTS.md`, aciona na dúvida o `leitor-docs` para localizar onde focar na documentação, divide as tarefas, dá a cada agente que escreve a sua pasta (worktree) e junta o resultado.
   - Quem escreve código roda no `sonnet`. Nenhum subagente comum herda o modelo do chat: toda chamada passa `model` e `effort`, fora os agentes fixos, que os trazem no cabeçalho (`leitor-docs`, `qa` e os `revisor-*`).
   - O modelo e o esforço de cada nível estão só na skill `pipeline`, seção 7.
4. **Dado inventado** em todo código, teste, semente e exemplo <até o portão que libera dado real, se houver>.
5. **Local primeiro:** nenhuma requisição a sistema de produção durante o desenvolvimento, nem de leitura. Serviço de fora (pagamento, canal, IA) só por simulador local. Todo endereço vem explícito da configuração, sem padrão de produção.
6. **Segredos** nunca em código, chat, log ou URL. O `.env` local fica fora do git.
7. **Recurso pago** (nuvem, domínio, IA, canal): só com "sim" explícito na hora, dizendo o custo.
8. <Regras do domínio deste projeto: isolamento entre donos de dado, permissão, dado pessoal, envio. Cada uma curta, com o porquê numa decisão.>

## Como rodar

- `npm run <portaoRapido>`: <o que roda: tipos, lint, formato, testes sem serviço externo>. É o portão que o hook roda no fim do turno.
- `npm test`: <a suíte completa>.
- <Como subir o ambiente local e em que endereço ele responde.>
- **Hooks do git:** `git config core.hooksPath .claude/hooks/git` (uma vez por clone).
- **Hooks do pipeline:** `node --test ".claude/hooks/*.test.mjs"`.
- **Máquina:** <sistema, versões de Node e do que mais precisa>.

## Onde está o quê

- `docs/plano.md`: objetivo, fases, portões e próximo passo.
- `docs/arquitetura.md`: linguagem e tipagem, pastas, banco, testes.
- `docs/decisoes.md`: as decisões `D<n>` e as perguntas abertas `P<n>`.
- `PRODUCT.md`: quem usa, para quê, princípios de produto.
- `.claude/skills/pipeline/`: o pipeline. `.claude/agents/`: o `orquestrador`, o `leitor-docs`, o `qa` e os revisores (`revisor-arquitetura`, `revisor-seguranca`, `revisor-lgpd`). `.claude/hooks/`: as guardas e os portões. `.claude/skills/ORIGEM.md`: de onde vêm as skills de terceiros.
- **Tela nova:** com a skill `frontend-design` (plugin oficial, ligado em `.claude/settings.json`), dentro do `PRODUCT.md`.

## Estado (<data>)

- <Fase atual, o que está pronto, o próximo passo.>
