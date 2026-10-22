# Playbook: fase do plano

Para o orquestrador de uma fase do plano do projeto (`docs/plano.md`): o agente `.claude/agents/orquestrador.md`, que roda como agente do chat principal. O orquestrador não escreve código: prepara, divide, integra e fecha.

1. **Ler.** Antes, confira o chat: orquestrar é rodar como o agente `orquestrador` (`opus`, `xhigh`; linha "orquestração" da `SKILL.md`, seção 7). Se o chat não roda assim, peça ao usuário para reabrir com `claude --agent orquestrador` e espere. Depois, leia o `CLAUDE.md`, a seção da fase no plano e o `AGENTS.md` das pastas envolvidas; na dúvida sobre onde estão as seções da arquitetura e as decisões que a fase toca, acione o `leitor-docs` e leia apenas as linhas apontadas.
   **Pronto quando:** a entrega, o aceite e as perguntas ainda abertas da fase estão listados.
2. **Decidir primeiro.** Cada decisão que a fase pede passa por `decisao.md`, antes de dividir o trabalho. Pergunta que só outra pessoa responde vira questionário (siga `.claude/skills/to-questionnaire/SKILL.md`) e trava só o que depende dela.
   **Pronto quando:** nenhum agente vai começar em cima de uma escolha em aberto.
3. **Handoff.** Escreva `docs/fases/fase-<n>.md`:
   - os contratos entre as pastas, fixados antes de dividir;
   - as pastas de cada agente: um agente por pasta, e nenhuma pasta com dois agentes escrevendo (`principle-separate-before-serializing-shared-state`);
   - a ordem e o que espera o quê;
   - o nível de cada agente (`SKILL.md`, seção 7);
   - o aceite, como lista de comandos e resultados esperados.
   **Pronto quando:** um agente que só leia o handoff e o `AGENTS.md` da pasta dele consegue começar.
4. **Dividir.** Lance os agentes em paralelo, cada um no seu worktree (`isolation: "worktree"`, um branch por agente, em `pr/<fase>-<assunto-em-kebab>`), com:
   - o handoff;
   - o modelo e o esforço do nível da tarefa (`SKILL.md`, seção 7);
   - a pasta dele;
   - a ordem "siga a skill `pipeline` (feature ou refactor) só nesta pasta até os portões e o commit (a seção 4 fica com o orquestrador); mudança de contrato se relata".
   **Pronto quando:** todos voltaram, cada um com os portões verdes e o commit no seu branch, e o orquestrador rodou a revisão (seção 4 do `SKILL.md`) sobre eles.
5. **Integrar.** Cada branch entra na `main` pelo PR dele: o orquestrador traz a `main` ao branch, roda os portões nele, sobe e marca o PR pronto, e o usuário junta, um por vez. Depois, um agente de integração, no nível código, segurança (`sonnet`, `high`), num branch `pr/<fase>-integracao`, roda tudo do zero (a montagem do ambiente local e a suíte completa). Por fim, o `qa` confere o aceite, item por item, com a saída real.
   **Pronto quando:** o `qa` aprovou o aceite, ou o que falhou está explicado com o comando que falha.
6. **Fechar.**
   - `ponytail-audit` nas pastas da fase;
   - `ponytail-debt` para os atalhos (`shortcut:`) deixados;
   - achado que se repetiu entre agentes vira lint, teste ou script (`principle-encode-lessons-in-structure`);
   - a seção "Estado" do `CLAUDE.md` atualizada.
   **Pronto quando:** o relatório da fase para o usuário tem a entrega, o aceite, os achados, a dívida e as decisões, e o usuário juntou todos os PRs da fase.
