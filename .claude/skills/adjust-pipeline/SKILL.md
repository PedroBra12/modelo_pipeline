---
name: adjust-pipeline
description: Ajusta revisores e esforços do pipeline com o que as sessões mediram. Carregue ao fim de toda sessão que mudou o repositório, quando o `ajusta-pipeline.mjs --relatorio` pedir ajuste, ou quando o usuário quiser rever o custo ou a cobertura da revisão.
---

# Ajustar o pipeline

O pipeline mede a si mesmo (D2). Cada sessão deixa um arquivo em `docs/pipeline/sessoes/`; o `ajusta-pipeline.mjs` conta, para cada alvo, as sessões que o último ajuste dele ainda não tinha visto (a `janela` fecha uma descida); você grava a sessão com honestidade e leva ao usuário o que sobe. Modelo, esforço, revisores e gatilhos moram em `.claude/pipeline.json`; os pisos e o teto moram no código (`config.mjs`, `guarda-agentes.mjs`) e nenhum ajuste passa deles.

A regra (D3): o papel dá o modelo, que não se ajusta; o custo do erro dá o esforço de partida; depois, só esta conta mexe, um degrau. O orquestrador é `opus xhigh`, sempre: a sessão orquestrada em outro par fica fora da conta (o relatório a lista). Um agente entra quando, em 2 sessões, um portão obrigatório fica sem dono ou o mesmo tipo de defeito escapa de todos; um agente sai quando, já no piso, roda a janela inteira sem achado único de nível médio ou mais. Entrar e sair são propostas ao usuário, nunca automáticas.

## 1. Gravar a sessão

Copie `docs/pipeline/sessoes/MODELO.md` para `docs/pipeline/sessoes/<AAAA-MM-DD>-<assunto-em-kebab>.md` e preencha o bloco JSON com o que houve: cada subagente (`tipo`, o par em que rodou, `tokens`, `minutos`, `rodadas`), cada achado dos revisores e do `qa` (quem viu, `visto_por`, `escapou_de` só no domínio do revisor), os erros do orquestrador. Estimativa leva `"aprox": true`. Dado pessoal fica de fora: só módulo, pasta, arquivo e o achado técnico.

**Pronto quando:** todo subagente e todo achado "corrigir agora" ou defeito do `qa` tem uma linha e `node .claude/hooks/ajusta-pipeline.mjs --relatorio` lê o arquivo sem erro.

## 2. Rodar a conta

```
node .claude/hooks/ajusta-pipeline.mjs --relatorio
```

A tabela mostra, por alvo e desde o último ajuste dele: sessões em que rodou, achados únicos (sem `visto_por`) de nível médio ou mais, tokens por achado único, escapes e rodadas de correção. Cole a saída no relatório da sessão. A `janela` completa vale só para descer: escape e gatilho que falta viram proposta na hora.

## 3. Para menos: o script aplica sozinho

Um revisor desce um degrau de esforço, dentro do mesmo modelo (a escada nunca troca o modelo: D3), quando a `janela` de sessões limpas se completa: ele rodou no par atual com código no diff, sem achado de nível médio ou mais dele (único ou visto por mais de um) e sem escape. A sessão só conta como limpa se alguém achou nível médio ou mais nela; sessão vazia, mesmo com o gatilho do revisor ativo, não prova nada. Um alvo por execução, o mais caro primeiro. O `revisor-lgpd` e o `leitor-docs` são fixos: o par deles nunca se mexe.

```
node .claude/hooks/ajusta-pipeline.mjs --aplicar-menos
```

Ele edita a linha do alvo em `pipeline.json`, o cabeçalho do agente e a tabela da skill `pipeline`, e grava `docs/pipeline/ajustes/<data>-<alvo>.md`, com a lista das sessões já contadas (`vistas`), que é o que impede contá-las de novo. Avise o usuário no relatório, com a linha. Para adiar uma descida, ponha `adiar: [{ alvo, motivo }]` na sessão. Rode `node --test ".claude/hooks/*.test.mjs"` depois.

## 4. Para mais: proponha e espere o "sim"

O relatório propõe (a) um degrau acima quando um defeito de nível médio ou mais passou pelo revisor e foi pego depois, ou quando um nível de código teve média de rodadas de correção no limite; (b) um gatilho novo quando o escape veio de um revisor que nem rodou, ou o achado grave único veio de um acionamento por julgamento; (c) estreitar o gatilho quando a sessão o marcou falso. Mostre ao usuário a evidência e o comando com o alvo à vista, e espere o "sim":

```
node .claude/hooks/ajusta-pipeline.mjs --aplicar-mais <alvo>
```

Gatilho novo e gatilho estreitado entram por edição de `revisao.gatilhos` no `pipeline.json`, testada com `escolhe-revisores.mjs` contra o diff da sessão. O código sobe só dentro do `sonnet`; o `opus` fica para o `Plan` de uma decisão.

## 5. Limites

- Um degrau de esforço por vez, sem trocar o modelo, nunca abaixo do piso nem acima do teto; o piso e o teto estão no código.
- O nível de código só sobe, com o "sim".
- Um gatilho só cresce. Os gatilhos de `PISO_GATILHOS` (`config.mjs`) e o `qa` por caminho ficam; descer é o nível do revisor, não a cobertura.
- Regra do `CLAUDE.md` não muda por aqui.
- Achado em dúvida conta: a dúvida cai do lado de manter o revisor. Só o falso positivo comprovado leva `"confirmado": false`.
- O ciclo de subir e descer entre sessões é um risco aceito (D2): cada degrau pede a `janela` inteira de sessões limpas, e a subida de revisor pede um escape; a de código, a janela de rodadas altas.

**Pronto quando:** o relatório da sessão traz a saída do `--relatorio`, as propostas esperando o "sim" e os ajustes aplicados, e `node --test ".claude/hooks/*.test.mjs"` está verde.
