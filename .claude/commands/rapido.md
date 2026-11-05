---
description: Roda a tarefa no esforço rápido do pipeline (sem revisores, sem QA e sem autoanálise; exige confirmação e trava se tocar gatilho de risco, D64).
argument-hint: <tarefa>
---
O usuário pediu explicitamente o esforço **rápido** (`rapido`, D64) para a tarefa abaixo.

1. Grave `rapido` em `.claude/estado/esforco` (`mkdir -p .claude/estado && printf '%s\n' rapido > .claude/estado/esforco`; a `guarda-git` pedirá a confirmação do usuário) e abra a resposta com `Pipeline: <caminho> · esforço: rapido`.
2. Siga a skill `.claude/skills/pipeline/SKILL.md` no esforço `rapido`: escrita de código + portões da seção 3 + `node .claude/hooks/escolhe-revisores.mjs <base> <head>` para confirmar que nenhum gatilho de risco foi acionado (sem revisores, sem `qa` e sem autoanálise da sessão).

Tarefa: $ARGUMENTS
