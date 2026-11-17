# Playbook: fase do plano

Para o orquestrador de uma fase do plano do projeto (`docs/plano.md`): o agente `.claude/agents/orquestrador.md`, que roda como agente do chat principal. O orquestrador não escreve código: prepara, divide, integra e fecha.

1. **Ler.** Antes, confira o chat: orquestrar é rodar como o agente `orquestrador` (nível `orquestracao`, `SKILL.md` seção 7). Se o chat não roda assim, peça ao usuário para reabrir com `claude --agent orquestrador` e espere. Depois, leia o `CLAUDE.md`, a seção da fase no plano e o `AGENTS.md` das pastas envolvidas; na dúvida sobre onde estão as seções da arquitetura e as decisões que a fase toca, acione o `leitor-docs` e leia apenas as linhas apontadas.
   **Pronto quando:** a entrega, o aceite e as perguntas ainda abertas da fase estão listados.
2. **Decidir primeiro.** Cada decisão que a fase pede passa por `decisao.md`, antes de dividir o trabalho. Pergunta que só outra pessoa responde vira questionário (siga `.claude/skills/to-questionnaire/SKILL.md`) e trava só o que depende dela.
   **Pronto quando:** nenhum agente vai começar em cima de uma escolha em aberto.
3. **Spec, tarefas e revisão (D12).** Siga `plano.md` com a fase como plano: a spec em `docs/specs/fase-<n>/spec.md` leva os contratos entre as pastas, fixados antes de dividir, e o aceite em comandos; as tarefas levam a pasta (nenhuma pasta com dois agentes ao mesmo tempo, `principle-separate-before-serializing-shared-state`), os bloqueios, o nível e a linha `Revisão`; `revisoes.md` leva os checkpoints.
   **Pronto quando:** o usuário aprovou as tarefas e o plano de revisão, e um agente que só leia a spec, a tarefa e o `AGENTS.md` da pasta dele consegue começar.
4. **Fronteira e checkpoints.** `plano.md`, passos 3 a 5: a fronteira roda em paralelo, cada tarefa integra em `pr/fase-<n>` sem revisão, e os revisores entram só nos checkpoints, só os previstos.
   **Pronto quando:** toda tarefa está `integrada` e o checkpoint final (`plano.md`, passo 6) cobriu cada gatilho de risco da fase.
5. **Integrar.** O branch `pr/fase-<n>` entra na `main` pelo PR dele: o orquestrador traz a `main` ao branch, roda os portões nele, sobe e marca o PR pronto, e o usuário junta. Depois, um `desenvolvedor` de integração, no nível `codigo-seguranca` (`SKILL.md`, seção 7), num branch `pr/<fase>-integracao`, roda tudo do zero (a montagem do ambiente local e a suíte completa). Por fim, o `qa` confere o aceite, item por item, com a saída real, no modo completo, em três fatias (as fatias só existem aqui, D5) e com o prazo que o orquestrador der (`SKILL.md`, seção 4, D4).
   **Pronto quando:** o `qa` aprovou o aceite, ou o que falhou está explicado com o comando que falha.
6. **Fechar.**
   - `ponytail-audit` nas pastas da fase;
   - `ponytail-debt` para os atalhos (`shortcut:`) deixados;
   - achado que se repetiu entre agentes vira lint, teste ou script (`principle-encode-lessons-in-structure`);
   - a seção "Estado" do `CLAUDE.md` atualizada;
   - **autoanálise da fase (D2, D6):** o subagente da seção 6 do `SKILL.md` junta o livro da sessão com o `coleta-agentes.mjs` e grava `docs/pipeline/sessoes/<AAAA-MM-DD>-<fase>.md` no formato do `MODELO.md` (agentes com tokens e rodadas, achados com quem viu e quem deixou escapar, erros do orquestrador, lições), e o orquestrador roda `node .claude/hooks/ajusta-pipeline.mjs --relatorio`; o que ele pedir segue a skill `adjust-pipeline`.
   **Pronto quando:** o relatório da fase para o usuário tem a entrega, o aceite, os achados, a dívida, as decisões e a saída da autoanálise, e o usuário juntou o PR da fase.
