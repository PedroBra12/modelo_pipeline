# <Nome do projeto>

<O que o projeto é, para quem, em duas linhas.>

- Plano: `docs/plano.md`. **Arquitetura: `docs/arquitetura.md`.** Decisões: `docs/decisoes.md`. Produto (quem usa, para quê): `PRODUCT.md`.
- Responsável: <pessoa ou célula>. Respostas curtas, em português.
- **Repositório:** `github.com/<dono>/<repo>`, o mesmo de `.claude/pipeline.json`. Nada se commita na `main`: cada tarefa vai num branch `pr/<assunto-em-kebab>` e termina num commit, com a documentação conferida. O orquestrador sobe o branch e abre o PR em rascunho no 1º push, e o marca pronto com os portões verdes, a revisão feita e o `qa` aprovado; todo push e toda escrita em PR pedem a confirmação do usuário, e o merge é dele, nunca de quem abriu. Agente de worktree só commita.

## Regras que não se negociam

1. **Pipeline:** toda tarefa que cria ou muda código, migração, contrato, pasta ou arquitetura segue a skill `pipeline` (`.claude/skills/pipeline/`): classificar, playbook, portões, revisão e QA, commit, relatório.
   - Decisão de arquitetura vem antes do código e é do usuário, registrada como `D<n>` em `docs/decisoes.md`.
   - Os hooks de `.claude/settings.json` e de `.claude/hooks/git/` fazem parte do pipeline (`.claude/hooks/AGENTS.md`): a guarda de git deixa push e PR só para o `origin` do repositório acima, com a confirmação do usuário, e nega outro remoto, o PR que não nasce rascunho, o merge do PR e o token; o pre-commit recusa commit na `main`, e o pre-push nega o push para outra URL, para a `main`, o forçado e o que apaga; a `guarda-agentes` confere o modelo e o esforço de cada subagente pela seção `agentes` de `.claude/pipeline.json` (pede confirmação acima do teto que ela guarda) e nega delegar quando o chat principal não está em `opus xhigh` (D3); o `escolhe-revisores.mjs <base> <head>` diz o mínimo de revisores que a mudança exige; o `ajusta-pipeline.mjs` faz a conta da autoanálise (D2); o `confere-docs` recusa commit com documentação que não bate; o `confere-lgpd` nega a edição e o commit com dado pessoal exposto; o commit que toca `.claude/` roda os testes do pipeline; e o portão rápido roda no fim do turno quando houve código alterado.
2. **Um `AGENTS.md` por pasta de trabalho** (as de `pastasDeTrabalho` em `.claude/pipeline.json`).
   - Antes de mexer numa pasta, ler o `AGENTS.md` dela e os das pastas acima.
   - Pasta nova nasce com o seu; mudou o que a pasta faz, o `AGENTS.md` muda junto.
   - Todo commit passa pelo `confere-docs`: o `AGENTS.md` de cada pasta tocada tem de corresponder ao código.
   - Agente que desenvolve mexe só na sua pasta; mudança de contrato entre pastas se relata, não se edita.
3. **Multiagentes:** todo trabalho com mais de um agente tem um orquestrador (`.claude/agents/orquestrador.md`, só como agente do chat principal). Ele planeja lendo os `AGENTS.md`, aciona na dúvida o `leitor-docs` para localizar onde focar na documentação, divide as tarefas, dá a cada agente que escreve a sua pasta (worktree) e junta o resultado.
   - **O orquestrador roda sempre em `opus xhigh` (D3):** o `.claude/settings.json` abre toda sessão como o agente `orquestrador`, e a sessão em outro par fica fora da conta da autoanálise.
   - **A regra do par (D3):** o papel dá o modelo (julgar lendo = `opus`, escrever ou rodar = `sonnet`, só apontar = `haiku`), o custo do erro dá o esforço de partida, e depois só a conta da D2 mexe, um degrau.
   - Quem escreve código roda no `sonnet`. Nenhum subagente comum herda o modelo do chat: toda chamada passa `model` e `effort`, fora os agentes fixos, que os trazem no cabeçalho (`leitor-docs`, `qa` e os `revisor-*`).
   - O modelo e o esforço de cada um moram em `.claude/pipeline.json`; a skill `pipeline`, seção 7, mostra a tabela gerada dali.
   - O `escolhe-revisores.mjs` dá o mínimo obrigatório de revisores de cada mudança; o orquestrador pode somar um com o motivo no relatório, nunca tirar.
   - **O pipeline se ajusta (D2):** ao fim de toda sessão que mudou o repositório, o orquestrador grava `docs/pipeline/sessoes/<AAAA-MM-DD>-<assunto>.md` (formato em `MODELO.md` ali) e roda `node .claude/hooks/ajusta-pipeline.mjs --relatorio`. A skill `adjust-pipeline` aplica sozinha os ajustes **para menos** e propõe os **para mais**, que esperam o "sim" do usuário; cada ajuste fica em `docs/pipeline/ajustes/`.
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
- **Hooks do pipeline:** `node --test ".claude/hooks/*.test.mjs"` (o pre-commit roda quando o commit toca `.claude/`). Revisores de uma mudança: `node .claude/hooks/escolhe-revisores.mjs main HEAD`. Autoanálise: `node .claude/hooks/ajusta-pipeline.mjs --relatorio`.
- **Máquina:** <sistema, versões de Node e do que mais precisa>.

## Onde está o quê

- `docs/plano.md`: objetivo, fases, portões e próximo passo.
- `docs/arquitetura.md`: linguagem e tipagem, pastas, banco, testes.
- `docs/decisoes.md`: as decisões `D<n>` e as perguntas abertas `P<n>`.
- `PRODUCT.md`: quem usa, para quê, princípios de produto.
- `.claude/skills/pipeline/`: o pipeline. `.claude/skills/adjust-pipeline/`: o autoajuste (D2). `.claude/pipeline.json`: modelo, esforço, revisores e gatilhos. `.claude/agents/`: o `orquestrador`, o `leitor-docs`, o `qa` e os revisores (`revisor-arquitetura`, `revisor-seguranca`, `revisor-lgpd`, `revisor-tela`). `.claude/hooks/`: as guardas, os portões e os scripts do pipeline. `.claude/skills/ORIGEM.md`: de onde vêm as skills de terceiros.
- `docs/pipeline/sessoes/`: a autoanálise de cada sessão; `docs/pipeline/ajustes/`: cada ajuste que ela fez.
- **Tela nova:** com a skill `frontend-design` (plugin oficial, ligado em `.claude/settings.json`), dentro do `PRODUCT.md`.

## Estado (<data>)

- <Fase atual, o que está pronto, o próximo passo.>
