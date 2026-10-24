---
name: pipeline
description: Pipeline de desenvolvimento deste projeto. Carregue primeiro, antes de `ponytail`, `diagnosing-bugs` ou `codebase-design`, em toda tarefa que muda o repositório (código, banco, contrato, tela, `AGENTS.md`, `docs/arquitetura.md` ou regra do `CLAUDE.md`), numa decisão de arquitetura ou numa fase do plano.
---

# Pipeline

Todo trabalho que muda o repositório passa pelas mesmas portas, nesta ordem: **classificar → playbook → portões → revisão e QA → commit → relatório**. O `CLAUDE.md` vale acima desta skill, e esta skill vale acima das de terceiros (`.claude/skills/ORIGEM.md`): onde divergirem, siga o playbook.

## 1. Classificar

Leia o pedido e o `AGENTS.md` das pastas que ele toca (e os das pastas acima). Escolha um caminho:

| A tarefa | Caminho |
|---|---|
| pede uma **decisão**: módulo ou pasta nova, mudança no contrato público de outra pasta (API, evento, tipo exportado), dependência nova, tabela que outra pasta vai ler, provedor ou integração nova, mudança numa regra do `CLAUDE.md` ou do `docs/arquitetura.md`, ou qualquer escolha difícil de reverter | [`decisao.md`](decisao.md), **antes** de qualquer outro |
| comportamento novo | [`feature.md`](feature.md) |
| algo quebrado, errado ou lento | [`bug.md`](bug.md) |
| mudar a forma sem mudar o comportamento | [`refactor.md`](refactor.md) |
| uma fase inteira do plano | [`fase.md`](fase.md) |
| mudança trivial (uma ou duas linhas óbvias, sem lógica nova) | só as seções 3 a 5 abaixo |
| só uma pergunta | responda; sem portão |

**Pronto quando:** a 1ª linha da resposta diz o caminho (`Pipeline: feature`) e a lista de tarefas tem os passos do playbook, copiados.

## 2. Regras de todo caminho

- **Escopo:** só a pasta da tarefa. Fora dela, a mudança se relata ao orquestrador, não se edita.
- **Estilo:** a menor mudança completa (skill `ponytail`). As camadas que a arquitetura pede (contrato, provedor, ponto de extensão) são deliberadas e ficam.
- **Perguntas:** na dúvida sobre onde uma regra ou decisão (`D<n>`) está em `docs/` ou nos `AGENTS.md`, só o chat principal (o `orquestrador`) aciona o subagente `leitor-docs`, que apenas lê e aponta os arquivos e linhas onde focar; o agente de worktree não o aciona e relata a dúvida ao orquestrador. Fato no código se busca com `Explore` (nível leve da seção 7); só a decisão vai para o usuário.
- **Regras do `CLAUDE.md`** valem em todo passo. O commit e o push seguem a seção 5.

## 3. Portões

"Pronto" quer dizer todos verdes, com a saída real no relatório. Os comandos de cada portão estão no `CLAUDE.md`, seção "Como rodar".

1. **Rápido:** o portão rápido (tipos, lint, formato, testes sem serviço externo; o script `portaoRapido` de `.claude/pipeline.json`). O hook de fim de turno roda sozinho quando há código alterado.
2. **Completo:** a suíte inteira, quando a mudança tocou banco, rota, permissão ou mais de uma pasta.
3. **Prova:** a coisa de verdade rodou (`principle-prove-it-works`): o teste ficou vermelho antes e verde depois (no refactor, verde antes e depois), a rota respondeu, o comando devolveu o que devia.
4. **Documentação:** em cada pasta tocada, cada campo do `AGENTS.md` confere com o código (skill `writing-for-agents`); decisão nova tem a linha `D<n>` em `docs/decisoes.md`; termo novo está em `docs/glossario.md`.
5. **Tela:** tela nova ou mudada foi feita com a skill `frontend-design`, dentro do `PRODUCT.md`. Quem a vê rodando na tela estreita (320 px) e na larga é o `revisor-tela`, na seção 4 (D3).
6. **LGPD:** `node .claude/hooks/confere-lgpd.mjs <pastas da tarefa>` sem achado crítico nem alto. Os avisos (médio) e as supressões vão para o relatório e para o `revisor-lgpd`. O hook do Edit não vê o que o shell escreve; isso só é pego no commit.

Enquanto o projeto não tiver os comandos dos portões 1 e 2, eles não existem: diga isso no relatório, sem fingir verde.

## 4. Revisão e QA

Depois dos portões, o chat principal (o `orquestrador`; subagente não abre outro subagente) roda o script, que dá o **mínimo obrigatório**:

```
node .claude/hooks/escolhe-revisores.mjs <base> <head>
node .claude/hooks/escolhe-revisores.mjs --trabalho      # antes do commit: o HEAD contra a árvore, com o que ainda não foi commitado
```

`<base>` é a `main` ou o commit de onde o branch saiu, e `<head>` o commit da tarefa (a comparação parte do merge-base). O script aplica a seção `revisao` de `.claude/pipeline.json` ao diff e imprime os revisores com modelo, esforço e o motivo (gatilho, arquivo e linha):
- `sempre`: `revisor-arquitetura` e `ponytail-review`, para todo código;
- gatilhos por caminho ou por linha do diff, inclusive linha removida onde removê-la enfraquece uma proteção: `permissao`, `dado_pessoal`, `banco`, `config_pipeline`, `rede_rota`, `lgpd_ignora`, `lgpd_regras` e `tela`;
- `qa`, obrigatório quando o diff toca um caminho de `comportamento_caminhos` (no modelo, `apps/`, `packages/` e `src/`). `--sem-comportamento "<motivo>"` o tira (CSS, texto, renome) e o motivo vai para o relatório; `--comportamento` o exige em qualquer outro código.

Lance numa mensagem só, em paralelo, todos os que o script imprime. O orquestrador pode somar um revisor por julgamento e põe o motivo no relatório; o que o script lista, nunca tira. O que o script não lista foi decidido pelo `pipeline.json`, e mudar isso é a skill `adjust-pipeline`.

Como lançar cada nome:
- `ponytail-review`: subagente `general-purpose`, no nível `revisao-ponytail` (seção 7): "aplique a skill `ponytail-review` a <arquivos>; relate em português, não edite";
- `revisor-arquitetura` e `revisor-seguranca`: subagentes fixos de `.claude/agents/`;
- `revisor-lgpd`: subagente fixo. Ele não roda comando: passe a ele os arquivos tocados e a saída do `confere-lgpd` do portão 6;
- `qa`: subagente fixo. Passe a ele o objetivo, o critério de aceite, as pastas tocadas, os comandos de "Como rodar" e a saída dos portões (ele não os repete);
- `revisor-tela`: subagente fixo, dono do portão 5. Passe a ele as telas tocadas (arquivos e rotas), o papel e a conta de exemplo de quem as usa e o worktree. Ele sobe o app local em portas próprias e grava as capturas numa pasta temporária, que você apaga depois de ler o relatório. Na troca só de texto, de cópia ou de renome, `--sem-tela "<motivo>"` o dispensa, e o motivo vai para o relatório.

**Triagem:**
- **corrigir agora:** o "Must fix" do `ponytail-review`, todo achado de bug, risco ou regra não negociável dos revisores, e todo defeito do `qa` (cada um vira teste antes da correção). Depois, rode os portões de novo, e o `qa` de novo (retomando o mesmo, com `SendMessage`) depois de toda rodada de correção, não só se ele reprovou: a correção de um achado já criou defeito novo mais de uma vez;
- **corrigir se couber no escopo:** o "Should fix" e o resto do que é desta pasta; o que não couber, o "Nice to have" e as `Suspeitas` do `qa` vão para o relatório;
- **achado que aparece pela 2ª vez:** vira lint, teste ou script (`principle-encode-lessons-in-structure`), não mais uma linha de texto.

**Pronto quando:** todo achado de "corrigir agora" foi corrigido, com os portões verdes de novo e o `qa` aprovado, e os demais estão no relatório.

## 5. Commit

Com os portões verdes, a revisão feita e o `qa` aprovado, num branch `pr/<assunto-em-kebab>`, nunca na `main` (o pre-commit recusa):
- `git add` só dos arquivos da tarefa;
- mensagem em português: `<pasta>: <o que mudou>` na 1ª linha; no corpo, o porquê; para cada pasta cujo código mudou sem o `AGENTS.md` mudar, releia o arquivo e, se ele ainda diz o que a pasta é, ponha a linha `Docs-conferidos: <pasta>/AGENTS.md` (arquivo de `gerado/` que o `AGENTS.md` da pasta cita não conta como código); por último, a linha de coautoria que o Claude Code pedir;
- o hook `pre-commit` do git (`confere-lgpd`) recusa o commit com dado pessoal exposto: corrija o arquivo, ou suprima com o motivo, que o `revisor-lgpd` confere;
- o hook `commit-msg` do git (`confere-docs`) recusa o commit quando a documentação não bate com o código: corrija o `AGENTS.md`, nunca só a mensagem. `--no-verify` não existe aqui (a guarda nega);
- num worktree, o subagente commita no branch dele (depois dos portões da seção 3) e devolve o hash e os arquivos ao `orquestrador`, que roda a seção 4;
- **push e PR:** só o orquestrador (o agente `.claude/agents/orquestrador.md`, que roda como agente do chat principal), e cada um com a confirmação do usuário: mostre o comando antes, e a guarda pede a confirmação de novo.
  - No 1º push do branch (`git push -u origin pr/<assunto>`), abra o PR em rascunho (`gh pr create --draft --base main`).
  - Com os portões verdes no branch e a revisão feita, traga a `main` (`git merge main`), suba e marque pronto (`gh pr ready`). A descrição diz o que muda de comportamento, como se conferiu e, até existir CI, a saída dos portões.
  - O merge é do usuário, nunca de quem abriu (a guarda nega o `gh pr merge`). Depois dele: `git switch main` e `git pull --ff-only`.
  - Nunca forçar nem apagar branch remoto (o `pre-push` e a guarda negam), e o branch que subiu só anda para a frente: commit novo ou merge, nunca `--amend` nem rebase. O agente de worktree não faz push (a guarda nega de dentro de `.claude/worktrees/`).

**Pronto quando:** o commit existe (`git log -1`) no branch da tarefa, o `git status` das pastas dela está limpo e o branch está no `origin`, com o PR aberto.

## 6. Relatório e autoanálise

O relatório, curto, em português:
- o que mudou (arquivos);
- os portões, com a saída;
- o que a revisão e o `qa` acharam, e o que ficou;
- as decisões registradas;
- os riscos que o usuário precisa saber (inclusive as linhas finais do `ponytail`);
- o commit (hash e 1ª linha).

**Autoanálise (D2), ao fim de toda sessão que mudou o repositório:** o orquestrador grava `docs/pipeline/sessoes/<AAAA-MM-DD>-<assunto>.md`, no formato de `docs/pipeline/sessoes/MODELO.md`: um bloco JSON fixo (agentes com modelo, esforço, tokens, minutos e rodadas; achados com revisor, severidade, se foi só ele que viu, se foi confirmado e quem deveria ter visto e não viu; erros do orquestrador) e um texto curto com as lições. Os números vêm do que os subagentes devolvem; o que for estimado leva `"aprox": true`. Depois roda `node .claude/hooks/ajusta-pipeline.mjs --relatorio`, cola a saída no relatório e, se ela pedir ajuste, segue a skill `adjust-pipeline`. A sessão entra no commit da tarefa ou num commit `docs:` à parte.

## 7. Agentes: modelo e esforço

**A regra do par (D3):** o papel dá o modelo, que não se ajusta: julgar lendo é `opus`, escrever ou rodar é `sonnet`, só apontar é `haiku`. O custo do erro dá o esforço de partida, do mais alto ao mais baixo: quem orquestra e o revisor cujo erro vaza dado entre donos ou abre a guarda; quem revisa ou testa e o código que toca um gatilho de risco (`permissao`, `dado_pessoal`, `banco`, `config_pipeline`, `rede_rota`); o resto do código; o trivial. Depois, só a conta da D2 mexe, um degrau. O par vigente de cada um é o da tabela abaixo.

O orquestrador é `opus xhigh`, sempre: a `guarda-agentes` nega delegar com o chat principal em outro par.

**Nenhum subagente comum herda o modelo do chat principal** (que roda no nível `orquestracao`). A fonte de modelo e esforço é `.claude/pipeline.json` (seções `agentes` e `niveis`; D2): a `guarda-agentes` lê `agentes`, os cabeçalhos de `.claude/agents/` repetem o mesmo valor (um teste confere) e a tabela abaixo é gerada dali (`node .claude/hooks/ajusta-pipeline.mjs --sincronizar-tabela`; um teste confere). Mudar o modelo ou o esforço de alguém é mudar o `pipeline.json`, pela skill `adjust-pipeline`. Fora dos agentes fixos, toda chamada passa `model` e `effort` (`low`, `medium` ou `high`), o padrão é o `sonnet`, e o `opus` só entra nas propostas `Plan` de uma decisão de arquitetura (`effort: high`), com o motivo no `description` e a confirmação do usuário. `haiku` fora do `leitor-docs` não se usa. Na dúvida entre dois níveis de `sonnet`, use o mais alto. Os pisos e o teto moram no código, não no JSON (`config.mjs` e `guarda-agentes.mjs`): o ajuste nunca passa deles, e um `pipeline.json` fora deles é recusado.

<!-- tabela-agentes:inicio (gerada por ajusta-pipeline.mjs --sincronizar-tabela; não edite) -->
| Quem | Tarefa | `model` | `effort` |
|---|---|---|---|
| nível `leve` | renomear, buscar (`Explore`), conferir um fato ou um arquivo, mudança trivial, `ponytail-debt` | `sonnet` | `low` |
| nível `medio` | código: feature, bug ou refactor dentro de uma pasta | `sonnet` | `medium` |
| nível `codigo-seguranca` | código que toca um gatilho de risco (`permissao`, `dado_pessoal`, `banco`, `config_pipeline`, `rede_rota`) e a integração de fase | `sonnet` | `high` |
| nível `revisao-ponytail` | `ponytail-review` e `ponytail-audit` (em `general-purpose`) | `sonnet` | `high` |
| nível `orquestracao` | `orquestrador` (`.claude/agents/orquestrador.md`), só como agente do chat principal | `opus` | `xhigh` |
| nível `forte` | as propostas `Plan` de uma decisão de arquitetura (`decisao.md`) | `opus` | `high` |
| agente `revisor-seguranca` (`.claude/agents/`) | revisão de risco: banco, permissão, dado pessoal, rede, segredo, isolamento entre donos de dado | `opus` | `xhigh` |
| agente `revisor-arquitetura` (`.claude/agents/`) | revisão de arquitetura: fronteiras entre pastas, contrato, AGENTS.md, decisão registrada | `opus` | `high` |
| agente `revisor-lgpd` (`.claude/agents/`) | revisão de LGPD: finalidade, caminho do dado pessoal, retenção, supressões | `opus` | `high` |
| agente `qa` (`.claude/agents/`) | rodar a coisa de verdade e tentar quebrar | `sonnet` | `high` |
| agente `revisor-tela` (`.claude/agents/`) | ver a tela tocada rodando a 320 px e a 1280 px no ambiente local, com a skill de tela do projeto, contra o PRODUCT.md (portão 5) | `sonnet` | `high` |
| agente `leitor-docs` (`.claude/agents/`) | ler `docs/` e os `AGENTS.md` e apontar os arquivos e linhas onde focar | `haiku` | `low` |
<!-- tabela-agentes:fim -->

- Fork (`subagent_type: "fork"`) herda o modelo e o esforço de quem o lança, então não se usa.
- O chat principal é o `orquestrador` em `opus xhigh` (D3): o `.claude/settings.json` abre toda sessão como esse agente (`agent`), com `model: opus` (vence o modelo do `settings.json` do usuário) e `effortLevel: xhigh`. O usuário ainda pode trocar com `/model` ou `/effort`, e aí a `guarda-agentes` nega delegar até ele voltar (`/model opus` e `/effort xhigh`). A `guarda-agentes` também nega o `orquestrador` como subagente.

## Mapa das skills

| Momento | Skill ou subagente |
|---|---|
| entender um pedido vago | ler `.claude/skills/in-your-own-words/SKILL.md` e `.claude/skills/sharpen/SKILL.md` |
| decisão em aberto | `grilling`, `codebase-design`, `domain-modeling`; ler `.claude/skills/to-questionnaire/SKILL.md` quando quem decide é outra pessoa |
| desenhar tipos e dados | `principle-foundational-thinking`, `principle-model-the-domain`, `principle-type-system-discipline`, `typescript-best-practices`, `principle-boundary-discipline` |
| desenhar tela | `frontend-design` (plugin oficial), dentro do `PRODUCT.md`; o subagente `revisor-tela` a vê rodando |
| escrever | `ponytail`, ler `.claude/skills/tdd/SKILL.md`, `principle-test-behavior-not-implementation`, `principle-make-operations-idempotent`, `principle-build-the-lever` |
| consertar | `diagnosing-bugs`, `principle-fix-root-causes`, `principle-attack-the-premise` |
| reorganizar | `principle-subtract-before-you-add`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-minimize-reader-load`, `principle-sequence-verifiable-units`, `principle-outcome-oriented-execution` |
| conferir | `principle-prove-it-works`, `principle-explain-the-number` (antes de confiar num número medido), o subagente `qa` |
| revisar | `ponytail-review`, `revisor-arquitetura`, `revisor-seguranca`, `revisor-lgpd`, `revisor-tela` |
| fechar uma fase | `ponytail-audit`, `ponytail-debt`, `principle-encode-lessons-in-structure` |
| escrever para agentes | `writing-for-agents`; ler `.claude/skills/unslop/SKILL.md` |

As skills citadas por caminho só o usuário dispara (`/nome`): o agente lê o arquivo e segue.
