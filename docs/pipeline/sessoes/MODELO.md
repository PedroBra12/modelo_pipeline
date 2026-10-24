# Sessão <AAAA-MM-DD>: <assunto>

Modelo da autoanálise de uma sessão (D2). Copie para `<AAAA-MM-DD>-<assunto-em-kebab>.md`, troque o bloco JSON pelo da sessão e escreva o texto curto. O `ajusta-pipeline.mjs` lê só o 1º bloco `json` e não conta este arquivo (o nome não começa com a data).

**Sem nome de cliente, código de cliente, celular, e-mail, CPF ou cidade.** Só módulo, pasta, arquivo e o achado técnico. O script recusa a sessão que passa nas regras do `confere-lgpd` ou tem texto com mais de 600 caracteres, e recusa nome que não existe em `.claude/pipeline.json` (erro de digitação).

## Campos

- `sessao`: `data`, `assunto`, `orquestrador` (`model` e `effort` em que o chat principal rodou, obrigatórios; a sessão fora de `opus xhigh` fica fora da conta, D3); `aprox: true` quando os números são estimados; `baseline: true` na sessão que só serve de comparação (entra no relatório, não conta na janela).
- `agentes[]`: um por subagente que rodou (reteste e rodada de correção com agente novo são outra linha). `papel` (`codigo`, `revisor`, `qa`, `bug`, `integracao`, `consulta` para quem só busca ou lê, com o `tipo` do nível em que rodou, como `leve`), `tipo` (o nome no `pipeline.json`: agente fixo, `ponytail-review` ou nível de código), `modelo`, `esforco` (o par em que rodou: o alvo só conta se foi o par atual), `modulo`, `tokens`, `minutos`, `rodadas` (rodadas de correção do módulo; só código). Revisor e `qa` levam `modelo` e `esforco` (sem eles o script recusa).
- `achados[]`: `revisor`, `modulo`, `severidade`, `resumo`. Médio ou mais: `critico`, `alto`, `medio`, `must`, `should`, `defeito`; graves: `critico`, `alto`, `must`; `baixo` e `nice` não contam.
  - `visto_por`: os outros revisores que viram o mesmo achado; ele conta para todos, e os que se sobrepõem não descem juntos. Sem `visto_por`, o achado é só de quem o achou (é o "único").
  - `escapou_de`: quem devia ter visto e não viu, só se o achado cai no domínio dele (bug de lógica não é escape da arquitetura); `nao_rodou`: quem, entre eles, nem foi lançado. Só conta de médio para cima.
  - `acionado_por` no achado: como o revisor foi lançado, para saber se um gatilho faltou.
  - `confirmado: false` para falso positivo; `quantidade` para um grupo de achados iguais.
- **Sessão limpa:** conta para descer um alvo só se ele rodou no par atual com código no diff, a sessão não marcou o gatilho dele como falso, e alguém achou nível médio ou mais nela. Sessão sem achado nenhum não derruba ninguém.
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
    { "revisor": "revisor-arquitetura", "modulo": "x", "severidade": "medio", "acionado_por": "sempre", "resumo": "o que achou" }
  ],
  "gatilho_falso": [],
  "adiar": [],
  "erros_orquestrador": [],
  "licoes": []
}
```

## Texto

Cinco linhas no máximo: o que a sessão fez, o que o pipeline errou, o que mudar.
