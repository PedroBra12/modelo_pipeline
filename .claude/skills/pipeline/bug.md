# Playbook: bug

Algo quebrado, errado ou lento.

1. **Laço vermelho.** Use a skill `diagnosing-bugs`: um comando só, que você já rodou, que fica **vermelho** no bug, com dado inventado e no ambiente local.
   **Pronto quando:** o comando existe, foi rodado, e a saída vermelha está na resposta.
2. **Causa raiz.** Siga o sintoma até o primeiro lugar em que o sistema errou (`principle-fix-root-causes`). Busque todos os chamadores da função antes de mexer nela. Depois de duas correções que falharam no mesmo portão, escreva a premissa que as duas assumiam e teste a premissa (`principle-attack-the-premise`).
   **Pronto quando:** a causa está numa frase, com a linha do código.
3. **Teste de regressão.** Um teste que fica vermelho no bug (siga `.claude/skills/tdd/SKILL.md`), no nível em que o bug acontece. Sem costura certa para esse teste, o motivo vai ao relatório como achado de arquitetura, e o laço do passo 1 serve de prova. Vazamento de dado entre donos também é bug: o teste prova o vazamento antes da correção.
   **Pronto quando:** o teste novo está vermelho.
4. **Corrigir uma vez.** Corrija no código compartilhado, não em cada chamador. Rode o laço do passo 1: ficou verde.
   **Pronto quando:** o laço e o teste novo estão verdes, e o resto continua verde.
5. **Portões, revisão, QA e relatório:** seções 3 a 6 do `SKILL.md`. Passe ao `qa` o laço do passo 1. O relatório diz a hipótese que se confirmou, para quem vier depois.
