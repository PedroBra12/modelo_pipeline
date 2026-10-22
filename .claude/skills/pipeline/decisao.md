# Playbook: decisão de arquitetura

Para quando a tarefa pede uma escolha difícil de reverter (critérios na seção 1 do `SKILL.md`). Nenhuma linha de código antes do passo 5. **A decisão é do usuário;** o agente prepara, compara e recomenda.

1. **Enquadrar.** Use a skill `grilling`: a árvore de decisões, em rodadas, cada pergunta com a sua recomendação. Fatos no código vêm de um subagente `Explore` (nível leve, `SKILL.md`, seção 7); na dúvida sobre onde estão as regras e decisões nos documentos, acione o `leitor-docs` e leia apenas as seções e linhas apontadas de `docs/arquitetura.md` e `docs/decisoes.md`, além do `AGENTS.md` das pastas envolvidas.
   **Pronto quando:** a fronteira da árvore está vazia, as restrições e o que está fora do escopo estão escritos, e o usuário confirmou o entendimento.
2. **Desenhar duas vezes.** Dois subagentes `Plan`, em paralelo, no nível forte da `SKILL.md`, seção 7, cada um com uma restrição diferente:
   - **A:** "a menor mudança que resolve, dentro da arquitetura atual";
   - **B:** "a que melhor protege as fronteiras entre as pastas e o projeto daqui a dois anos".
   Cada proposta usa o vocabulário da skill `codebase-design` (módulo fundo, costura, adaptador) e diz: os tipos e o contrato, os arquivos e pastas, as migrações, os testes, a seção da arquitetura que muda, e o custo de reverter.
   **Pronto quando:** as duas propostas existem e são diferentes de verdade. Se ficaram iguais, a restrição B era fraca: refaça com outra.
3. **Julgar.** Mande as duas para o subagente `revisor-arquitetura`, e para o `revisor-seguranca` e o `revisor-lgpd` nos casos da descrição de cada um. Monte uma tabela curta com os critérios: regras não negociáveis, custo de reverter, carga de quem lê, testabilidade, efeito no resto do projeto. Recomende uma.
   **Pronto quando:** a tabela cobre as duas propostas em todos os critérios, os revisores responderam e há uma recomendada.
4. **Decidir.** Mostre ao usuário a tabela e a recomendação (`AskUserQuestion`, a recomendada primeiro). Se quem decide é outra pessoa (o cliente, o jurídico), escreva o questionário seguindo `.claude/skills/to-questionnaire/SKILL.md` e pare aqui.
   **Pronto quando:** o usuário escolheu, com as palavras dele.
5. **Registrar.** Com a skill `domain-modeling`:
   - a linha `D<n>` em `docs/decisoes.md`, na seção da data de hoje: a decisão, o que ela substitui e o porquê, com a alternativa rejeitada e o motivo;
   - a seção certa de `docs/arquitetura.md` (a fonte da verdade);
   - o `AGENTS.md` das pastas afetadas (skill `writing-for-agents`);
   - o termo novo em `docs/glossario.md`, se houver.
   **Pronto quando:** buscar a regra antiga em `docs/` e nos `AGENTS.md` não acha nada que ainda a afirme.
6. **Implementar.** Siga para `feature.md` ou `refactor.md`, com a decisão como entrada.
