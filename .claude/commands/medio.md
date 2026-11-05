---
description: Roda a tarefa no esforço médio (padrão) do pipeline (sem revisor-arquitetura e sem revisor-lgpd; mantém segurança, ponytail-review, tela, QA e autoanálise, D64).
argument-hint: <tarefa>
---
O usuário pediu o esforço **médio** (`medio`, padrão da D64) para a tarefa abaixo.

1. Grave `medio` em `.claude/estado/esforco` (`mkdir -p .claude/estado && printf '%s\n' medio > .claude/estado/esforco`) e abra a resposta com `Pipeline: <caminho> · esforço: medio`.
2. Siga a skill `.claude/skills/pipeline/SKILL.md` no esforço `medio`.

Tarefa: $ARGUMENTS
