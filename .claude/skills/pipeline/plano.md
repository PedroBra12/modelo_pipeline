# Playbook: plano (spec e tarefas, D12)

Para todo plano: a fase do `docs/plano.md` e o pedido que não cabe numa tarefa só (mais de uma pasta, ou trabalho que um `desenvolvedor` não fecha num contexto). Vem do `implement-spec` do `mattpocock/skills` (`.claude/skills/ORIGEM.md`), sem issue tracker. O orquestrador não escreve código: escreve a spec e as tarefas, solta a fronteira, integra e marca as revisões.

**A ideia:** a revisão não roda por tarefa. Ela roda em **checkpoints**, cada um sobre um bloco de tarefas já integradas, e cada revisor só entra no checkpoint cujo bloco tocou o gatilho dele. A tarefa que não mexe em segurança não paga revisão de segurança.

1. **Spec.** Toda escolha difícil de reverter já passou por `decisao.md`. Leia `.claude/skills/to-spec/SKILL.md` e escreva `docs/specs/<assunto-em-kebab>/spec.md` (o bloco "Neste repositório" do topo vale sobre o resto, inclusive as seções `## Pastas` e `## Aceite`).
   **Pronto quando:** a spec diz o problema, a solução, as decisões, os testes, o que fica fora, as pastas e o aceite em comandos.
2. **Tarefas.** Leia `.claude/skills/to-tickets/SKILL.md` e escreva uma tarefa por arquivo em `docs/specs/<assunto>/tarefas/<NN>-<slug>.md`, cada uma com `Bloqueada por`, `Pasta`, `Gatilhos previstos` e `Agente`. Mostre ao usuário a lista (título, bloqueios, pasta, gatilhos) e as costuras de teste da spec numa pergunta só, e ajuste até o "sim".
   - Tarefa pequena o bastante para um `desenvolvedor` fechar num contexto novo; grande o bastante para valer um worktree (renome de duas linhas entra na tarefa vizinha).
   - Duas tarefas na mesma pasta ou mexendo no mesmo contrato ficam em série (uma bloqueia a outra); as outras, sem aresta, rodam juntas.
   - As tarefas com gatilho de risco ficam juntas na ordem, quando os bloqueios deixam: o checkpoint delas leva o `revisor-seguranca` uma vez, não várias.
   - **O plano de revisão nasce aqui, junto com as tarefas.** Cada tarefa ganha a linha `**Revisão:**` com os revisores de que ela precisa de verdade e o porquê de cada um, tirado do que ela muda, não da lista fixa do pipeline: `revisor-seguranca` só se ela toca permissão, dado pessoal, banco, rede, segredo ou o pipeline; `revisor-arquitetura` só se ela cria pasta, muda contrato entre pastas ou o pipeline; `revisor-tela` só com layout novo; `ponytail-review` só com lógica nova que vale enxugar; "nenhum" quando não há o que ver. Daí sai `docs/specs/<assunto>/revisoes.md`: os checkpoints previstos (blocos de 5 tarefas ou mais, mais o final) e, em cada um, só os revisores que alguma tarefa do bloco pediu. O `qa` fica no final, sobre o aceite.
   - O usuário aprova a lista e o plano de revisão na mesma pergunta.
   **Pronto quando:** o usuário aprovou a lista e o plano de revisão, e a spec, as tarefas e `revisoes.md` estão commitados no branch do plano `pr/<assunto>` (o branch de integração).
3. **Fronteira.** A fronteira são as tarefas `pronta` cujos bloqueios estão todos `integrada`. Lance numa mensagem só um agente por tarefa da fronteira (`desenvolvedor`, ou `designer-ui` na tela), cada um no seu worktree, no branch `pr/<assunto>-<NN>`, com o 1º passo `git switch -c pr/<assunto>-<NN> pr/<assunto>` (D6), o `effort` do nível pelos gatilhos previstos (`SKILL.md`, seção 7) e um pacote curto (seção 2): o caminho da spec e da tarefa, a pasta, o `AGENTS.md` dela e o playbook (`feature`, `bug` ou `refactor`). O pacote aponta, não copia: a spec e a tarefa estão no branch.
   - Nunca dois agentes na mesma pasta ao mesmo tempo; a tarefa que espera pasta fica para a próxima leva.
   - Marque a tarefa `em-andamento`.
   **Pronto quando:** toda tarefa da fronteira tem um agente rodando.
4. **Integrar, sem revisar.** Cada agente que volta com os portões verdes e o commit:
   - o orquestrador traz o branch dele para `pr/<assunto>` (`git merge --no-ff pr/<assunto>-<NN>`), roda o portão rápido ali e marca a tarefa `integrada` com o hash do merge;
   - conflito ou portão vermelho volta ao mesmo agente (retomado, se tiver menos de ~100 mil tokens) ou a um novo, com o item;
   - **nenhum revisor e nenhum `qa` aqui.** O hook de fim de turno pede a revisão: responda numa linha "checkpoint de revisão `<n>`: `<k>` de 5 tarefas (D12)";
   - anote a volta no livro da sessão e, se a fronteira cresceu, volte ao passo 3 na mesma hora, sem esperar os outros agentes.
5. **Checkpoint de revisão.** Abre quando **5 tarefas ou mais** foram integradas desde o último checkpoint, ou quando a última tarefa do plano foi integrada (o checkpoint final). Nunca com menos de 5, fora o final. Os agentes da fronteira seguem rodando durante o checkpoint.
   - **Roda o plano, não a lista fixa.** Lance numa mensagem só os revisores que `revisoes.md` previu para este checkpoint, cada um sobre `<ponto>..<head>`, em que `<ponto>` é o `<head>` do checkpoint anterior (no 1º, o commit da spec) e `<head>` o de `pr/<assunto>` agora. O revisor que nenhuma tarefa do bloco pediu não roda.
   - **A conferência da previsão.** Antes de lançar, rode `node .claude/hooks/escolhe-revisores.mjs <ponto> <head>` e compare com o plano:
     - **gatilho de risco não previsto** (`permissao`, `dado_pessoal`, `banco`, `config_pipeline`, `rede_rota`, `lgpd_ignora`, `lgpd_regras`, aviso do `confere-lgpd`): o revisor que o script imprime para ele roda neste checkpoint, sem exceção, e a tarefa que errou a previsão ganha a correção na linha `Revisão`;
     - **o resto** (`grande`, `tela`, o `qa` do meio): o plano vale. O revisor que o script imprimiu e o plano não previu fica dispensado, com o motivo numa linha de `revisoes.md` (o que a tarefa muda e por que não há o que ver);
     - revisor previsto que o script não imprime roda do mesmo jeito: a previsão foi pelo que a tarefa muda, e o orquestrador pode somar.
   - **Adiar:** o orquestrador pode passar um revisor previsto para o checkpoint seguinte quando a área dele ainda está mudando numa tarefa da fronteira (por exemplo, a `permissao` que a próxima tarefa termina), com o motivo em `revisoes.md`; o bloco dele se soma ao próximo. Adiar não é dispensar.
   - O `qa` não roda no checkpoint do meio: o aceite é da spec inteira e fica para o final. A exceção é a tarefa que outras vão usar como base e cujo comportamento o orquestrador quer firmar antes (`qa` curto, só nela, com o motivo).
   - Os achados de "corrigir agora" (triagem do `SKILL.md`, seção 4) viram tarefas novas `<NN>-corrige-<slug>.md`, na fronteira, no lugar de uma rodada fora do plano; o revisor que achou um item de risco o confere no checkpoint seguinte, só aquele item.
   - Registre em `revisoes.md`, uma linha por checkpoint: o número, `<ponto>..<head>`, as tarefas do bloco, os revisores que rodaram, os adiados com o motivo e os achados.
   **Pronto quando:** a linha do checkpoint está em `revisoes.md` e todo revisor dele voltou.
6. **Checkpoint final.** Depois da última tarefa e das correções:
   - rode também `escolhe-revisores.mjs <commit da spec> <head>`: todo gatilho de risco que ele imprimir precisa ter o seu revisor em algum checkpoint, sobre todos os blocos onde disparou; o que ficou de fora (adiado, ou bloco depois do último dele) roda agora, sobre esses blocos. O gatilho que não é de risco segue o plano e as dispensas de `revisoes.md`;
   - o `qa` completo roda sobre o aceite da spec (`SKILL.md`, seção 4: um só; num plano que é fase do `docs/plano.md`, as três fatias de `fase.md`, passo 5);
   - as correções seguem o `SKILL.md`, seção 4 (portões, `qa` curto, quem achou confere), com o mesmo teto de 3 rodadas.
   **Pronto quando:** toda tarefa está `integrada`, `revisoes.md` mostra cada gatilho do plano coberto pelo seu revisor, o `qa` aprovou o aceite, e o resto do `SKILL.md` (seções 5 e 6: PR, relatório e autoanálise) foi feito sobre `pr/<assunto>`.
7. **Limpar.** Apague os worktrees e os branches locais `pr/<assunto>-<NN>` já integrados (os remotos nunca: só o `pr/<assunto>` sobe).
