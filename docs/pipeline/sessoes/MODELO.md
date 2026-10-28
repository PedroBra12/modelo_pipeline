# Sessão <AAAA-MM-DD>: <assunto>

Modelo da autoanálise de uma sessão (D2). O arquivo nasce do livro da sessão (`<scratchpad>/livro-sessao.jsonl`, que o orquestrador anota a cada agente que volta) e da saída do `coleta-agentes.mjs` (modelo, tokens e minutos tirados das transcrições em disco); o subagente do nível `autoanalise` os junta (D6). O `coleta-agentes.mjs` não fatia o agente retomado (`pedidos` maior que 1): ele sai numa linha, com o contexto final e os minutos do 1º ao último registro; a linha própria do retomado vem do livro e leva `"aprox": true` na sessão. Copie para `<AAAA-MM-DD>-<assunto-em-kebab>.md` (o assunto em kebab, com até 60 caracteres; o script recusa outro nome), troque o bloco JSON pelo da sessão e escreva o texto curto. O `ajusta-pipeline.mjs` lê só o 1º bloco `json` e não conta este arquivo (o nome não começa com a data).

**Sem nome de pessoa (cliente, usuário ou alguém da equipe), código ou id de pessoa, celular, e-mail, CPF ou cidade, nem no assunto nem no nome do arquivo.** Só módulo, pasta, arquivo e o achado técnico. O script recusa a sessão que passa nas regras do `confere-lgpd` ou tem texto com mais de 600 caracteres, e recusa nome que não existe em `.claude/pipeline.json` (erro de digitação).

## Campos

- `sessao`: `data`, `assunto`, `orquestrador` (`model` e `effort` em que o chat principal rodou, obrigatórios; a sessão fora de `opus xhigh` fica fora da conta, D3); `aprox: true` quando os números são estimados; `baseline: true` na sessão que só serve de comparação (entra no relatório, não conta na janela).
- `agentes[]`: um por subagente que rodou (reteste, rodada de correção com agente novo e agente retomado por `SendMessage` são outra linha; o retomado leva os minutos e os tokens dele: o total devolvido menos o da linha anterior). `papel` (`codigo`, `revisor`, `qa`, `bug`, `integracao`, `consulta` para quem só busca ou lê, com o `tipo` do nível em que rodou, como `leve`), `tipo` (o nome no `pipeline.json`: agente fixo, `ponytail-review` ou nível de código), `modelo`, `esforco` (o par em que rodou: o alvo só conta se foi o par atual), `modulo`, `tokens`, `minutos`, `rodadas` (rodadas de correção do módulo; só código), `modo` (opcional, só `qa` e `revisor-tela`, D4: `completo`, `fatia 1` a `fatia 3`, `curto`), `pacote` (opcional, D4: `true` quando o agente recebeu o pacote de contexto; serve para comparar os tokens com e sem pacote). Revisor e `qa` levam `modelo` e `esforco` (sem eles o script recusa).
- `achados[]`: `revisor`, `modulo`, `severidade`, `resumo`. Médio ou mais: `critico`, `alto`, `medio`, `must`, `should`, `defeito`; graves: `critico`, `alto`, `must` (para travar a descida, também o `defeito`, D5); `baixo` e `nice` não contam.
  - `visto_por`: os outros revisores que viram o mesmo achado; ele conta para todos, e os que se sobrepõem não descem juntos. Sem `visto_por`, o achado é só de quem o achou (é o "único").
  - `escapou_de`: quem devia ter visto e não viu, só se o achado cai no domínio dele (bug de lógica não é escape da arquitetura); `nao_rodou`: quem, entre eles, nem foi lançado. Só conta de médio para cima.
  - `acionado_por` no achado: como o revisor foi lançado (`sempre`, `grande`, `gatilho` ou `julgamento`), para saber se um gatilho faltou.
  - `confirmado: false` para falso positivo; `quantidade` para um grupo de achados iguais.
- **Sessão limpa:** conta para descer um alvo só se ele rodou no par atual com código no diff, não achou nem viu achado grave (`critico`, `alto`, `must` ou `defeito`; D5), a sessão não marcou o gatilho dele como falso, e alguém achou nível médio ou mais nela. Sessão sem achado nenhum não derruba ninguém.
- `gatilho_falso`: os revisores cujo gatilho disparou à toa nesta sessão; ela não conta como limpa para eles e o relatório propõe estreitar o gatilho.
- `adiar`: `[{ alvo, motivo }]`, o orquestrador adia a descida de um alvo.
- `erros_orquestrador[]` (`resumo`, `custo`) e `licoes[]`.

## Sessão

```json
{
  "sessao": { "data": "AAAA-MM-DD", "assunto": "assunto", "orquestrador": { "model": "<modelo>", "effort": "<esforço>" } },
  "agentes": [
    { "papel": "codigo", "tipo": "medio", "modelo": "<modelo>", "esforco": "<esforço>", "modulo": "x", "tokens": 100000, "minutos": 20, "rodadas": 1 },
    { "papel": "revisor", "tipo": "revisor-arquitetura", "modelo": "<modelo>", "esforco": "<esforço>", "modulo": "x", "tokens": 150000, "minutos": 6 }
  ],
  "achados": [
    { "revisor": "revisor-arquitetura", "modulo": "x", "severidade": "medio", "acionado_por": "grande", "resumo": "o que achou" }
  ],
  "gatilho_falso": [],
  "adiar": [],
  "erros_orquestrador": [],
  "licoes": []
}
```

## Texto

Cinco linhas no máximo: o que a sessão fez, o que o pipeline errou, o que mudar.
