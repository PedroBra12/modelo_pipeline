---
description: Roda a tarefa no esforço alto do pipeline (todos os revisores, incluindo revisor-arquitetura e revisor-lgpd, QA e autoanálise, D64).
argument-hint: <tarefa>
---
O usuário pediu explicitamente o esforço **alto** (`alto`, D64) para a tarefa abaixo.

1. Grave `alto` em `.claude/estado/esforco` (`mkdir -p .claude/estado && printf '%s\n' alto > .claude/estado/esforco`) e abra a resposta com `Pipeline: <caminho> · esforço: alto`.
2. Siga a skill `.claude/skills/pipeline/SKILL.md` no esforço `alto`.

Tarefa: $ARGUMENTS
