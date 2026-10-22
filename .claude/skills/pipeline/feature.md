# Playbook: feature

Comportamento ou ferramenta nova, dentro de uma pasta.

1. **Entender.** Diga o objetivo em duas linhas (se o pedido é vago, siga `.claude/skills/in-your-own-words/SKILL.md`). Ache a pasta dona e leia o `AGENTS.md` dela. Se a feature cruza para outra pasta ou pede algo da lista de decisão, pare e vá para `decisao.md`.
   **Pronto quando:** a pasta dona, o que muda para quem usa (o critério de aceite, que o `qa` vai conferir) e o que fica fora estão escritos.
2. **Forma do dado e contrato.** Antes de qualquer lógica:
   - os tipos: ids com marca, estados como união discriminada, erro como valor no domínio;
   - a validação na borda: entrada, saída e eventos;
   - a permissão nova, com quem pode;
   - a tabela nova, com o dono do dado e o isolamento que o `CLAUDE.md` pede;
   - o texto de tela, onde o projeto o guarda.
   **Pronto quando:** o contrato compila, e cada item acima existe ou está marcado "não se aplica", com o motivo.
3. **Teste vermelho.** Um teste do comportamento que o usuário observa (siga `.claude/skills/tdd/SKILL.md` e `principle-test-behavior-not-implementation`): pela rota ou pelo comando, para o que é de borda; pelo domínio puro, para a regra. Se tocou dado de um dono, inclua o caso de isolamento (o dono B não vê o dado do A).
   **Pronto quando:** o teste roda e fica **vermelho** pelo motivo certo.
4. **Implementar.** A menor mudança completa que deixa o teste verde (skill `ponytail`):
   - regra no domínio, pura;
   - borda validada;
   - job e migração que podem rodar de novo sem estrago (`principle-make-operations-idempotent`).
   **Pronto quando:** o teste fica verde, e os chamadores, testes e sementes que a mudança alcança estão ajustados.
5. **Tela, se houver.** Use a skill `frontend-design`, dentro do `PRODUCT.md`: contraste AA, forma e cor nos estados, e o texto de onde o projeto o guarda.
   **Pronto quando:** a tela roda localmente e foi vista na tela estreita (320 px) e na larga.
6. **Portões, revisão, QA e relatório:** seções 3 a 6 do `SKILL.md`.
