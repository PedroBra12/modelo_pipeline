# Playbook: refactor

Mudar a forma sem mudar o comportamento.

1. **Fixar o comportamento.** Antes de mexer, os testes que descrevem o que o usuário observa estão verdes e cobrem o que vai mudar (`principle-test-behavior-not-implementation`). Se faltam, escreva primeiro.
   **Pronto quando:** existe um teste verde que ficaria vermelho se o comportamento mudasse.
2. **Subtrair primeiro.** Tire o código morto, a validação repetida e a referência que não leva a nada (`principle-subtract-before-you-add`).
   **Pronto quando:** os testes do passo 1 seguem verdes, numa base menor.
3. **Reorganizar em unidades conferidas.** Uma mudança, os testes, a próxima (`principle-sequence-verifiable-units`):
   - API interna nova: os chamadores migram e a antiga sai na mesma onda, dentro da pasta (`principle-migrate-callers-then-delete-legacy-apis`);
   - camada que só repassa: sai. Contrato, provedor e ponto de extensão: ficam (`principle-minimize-reader-load`);
   - migração planejada em etapas: siga `principle-outcome-oriented-execution`. Os testes de isolamento e de permissão nunca ficam vermelhos.
   **Pronto quando:** cada unidade terminou com os testes verdes antes da próxima.
4. **Portões, revisão e relatório:** seções 3 a 6 do `SKILL.md` (o `qa` só entra se o comportamento mudou, e aí não era refactor). Se o refactor mudou o que a pasta expõe, é decisão: volte para `decisao.md`.
