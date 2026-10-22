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
5. **Tela:** tela nova ou mudada foi feita com a skill `frontend-design`, dentro do `PRODUCT.md`, e foi vista rodando na tela estreita (320 px) e na larga.
6. **LGPD:** `node .claude/hooks/confere-lgpd.mjs <pastas da tarefa>` sem achado crítico nem alto. Os avisos (médio) e as supressões vão para o relatório e para o `revisor-lgpd`. O hook do Edit não vê o que o shell escreve; isso só é pego no commit.

Enquanto o projeto não tiver os comandos dos portões 1 e 2, eles não existem: diga isso no relatório, sem fingir verde.

## 4. Revisão e QA

Depois dos portões, o chat principal (o `orquestrador`; subagente não abre outro subagente) dispara numa mensagem só, em paralelo:

- um subagente `general-purpose`, no nível revisão da seção 7 (`model: sonnet`, `effort: high`): "aplique a skill `ponytail-review` a <arquivos>; relate em português, não edite";
- o subagente `revisor-arquitetura`, sempre que houve código;
- o subagente `revisor-seguranca`, nos casos da descrição dele;
- o subagente `revisor-lgpd`, nos casos da descrição dele e sempre que a mudança traz um `lgpd-ignora`. Ele não roda comando: passe a ele os arquivos tocados e a saída do `confere-lgpd` do portão 6;
- o subagente `qa`, sempre que o comportamento mudou (feature, bug, fase). Passe a ele o objetivo, o critério de aceite, as pastas tocadas e os comandos de "Como rodar".

**Triagem:**
- **corrigir agora:** o "Must fix" do `ponytail-review`, todo achado de bug, risco ou regra não negociável dos revisores, e todo defeito do `qa` (cada um vira teste antes da correção). Depois, rode os portões de novo, e o `qa` de novo se ele reprovou;
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

## 6. Relatório

Curto, em português:
- o que mudou (arquivos);
- os portões, com a saída;
- o que a revisão e o `qa` acharam, e o que ficou;
- as decisões registradas;
- os riscos que o usuário precisa saber (inclusive as linhas finais do `ponytail`);
- o commit (hash e 1ª linha).

## 7. Agentes: modelo e esforço

**Nenhum subagente comum herda o modelo do chat principal** (que roda no `opus`, `xhigh`). Os agentes fixos de `.claude/agents/` trazem o modelo e o esforço no cabeçalho (tabela abaixo), e a `guarda-agentes` confere. Fora deles, toda chamada passa `model` e `effort` (`low`, `medium` ou `high`), o padrão é o `sonnet`, e o `opus` só entra nas propostas `Plan` de uma decisão de arquitetura (`effort: high`), com o motivo no `description` e a confirmação do usuário. `haiku` fora do `leitor-docs` não se usa. Na dúvida entre dois níveis de `sonnet`, use o mais alto.

| Nível | Tarefa | `model` | `effort` |
|---|---|---|---|
| localizar docs | `leitor-docs` (`.claude/agents/`): ler `docs/` e os `AGENTS.md` e apontar ao orquestrador os arquivos e linhas onde focar | `haiku` | `low` |
| leve | renomear, buscar (`Explore`), conferir um fato ou um arquivo, mudança trivial, `ponytail-debt` | `sonnet` | `low` |
| médio | código: feature, bug ou refactor dentro de uma pasta | `sonnet` | `medium` |
| código, segurança | código que muda permissão, isolamento entre donos de dado ou dado pessoal, e a integração de fase | `sonnet` | `high` |
| QA | `qa` (`.claude/agents/`): rodar a coisa de verdade e tentar quebrar | `sonnet` | `high` |
| revisão (`ponytail`) | `ponytail-review` e `ponytail-audit` (em `general-purpose`) | `sonnet` | `high` |
| revisores (`arquitetura`, `lgpd`) | `revisor-arquitetura` e `revisor-lgpd` (`.claude/agents/`) | `opus` | `high` |
| segurança | `revisor-seguranca` (`.claude/agents/`) | `opus` | `xhigh` |
| orquestração | `orquestrador` (`.claude/agents/orquestrador.md`), só como agente do chat principal | `opus` | `xhigh` |
| forte | as propostas `Plan` de uma decisão de arquitetura (`decisao.md`) | `opus` | `high` |

- Fork (`subagent_type: "fork"`) herda o modelo e o esforço de quem o lança, então não se usa.
- O chat principal roda no modelo que o usuário escolheu (`/model`). Orquestrar uma fase é rodar o chat como o agente `orquestrador` (`claude --agent orquestrador`). A `guarda-agentes` nega o `orquestrador` como subagente. Se o chat não roda assim, peça ao usuário para reabrir antes de seguir.

## Mapa das skills

| Momento | Skill ou subagente |
|---|---|
| entender um pedido vago | ler `.claude/skills/in-your-own-words/SKILL.md` e `.claude/skills/sharpen/SKILL.md` |
| decisão em aberto | `grilling`, `codebase-design`, `domain-modeling`; ler `.claude/skills/to-questionnaire/SKILL.md` quando quem decide é outra pessoa |
| desenhar tipos e dados | `principle-foundational-thinking`, `principle-model-the-domain`, `principle-type-system-discipline`, `typescript-best-practices`, `principle-boundary-discipline` |
| desenhar tela | `frontend-design` (plugin oficial), dentro do `PRODUCT.md` |
| escrever | `ponytail`, ler `.claude/skills/tdd/SKILL.md`, `principle-test-behavior-not-implementation`, `principle-make-operations-idempotent`, `principle-build-the-lever` |
| consertar | `diagnosing-bugs`, `principle-fix-root-causes`, `principle-attack-the-premise` |
| reorganizar | `principle-subtract-before-you-add`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-minimize-reader-load`, `principle-sequence-verifiable-units`, `principle-outcome-oriented-execution` |
| conferir | `principle-prove-it-works`, `principle-explain-the-number` (antes de confiar num número medido), o subagente `qa` |
| revisar | `ponytail-review`, `revisor-arquitetura`, `revisor-seguranca`, `revisor-lgpd` |
| fechar uma fase | `ponytail-audit`, `ponytail-debt`, `principle-encode-lessons-in-structure` |
| escrever para agentes | `writing-for-agents`; ler `.claude/skills/unslop/SKILL.md` |

As skills citadas por caminho só o usuário dispara (`/nome`): o agente lê o arquivo e segue.
