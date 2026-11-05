# Sessão 2026-11-05: agente desenvolvedor (D8)

Decisão D8 (agente `desenvolvedor`, em `sonnet`, sempre num worktree, sem o `CLAUDE.md`), com 2 propostas `Plan` julgadas por dois revisores, implementação em 3 partes, 1 rodada de revisão e 2 de correção. Esforço do pipeline `alto`; a sessão foi reiniciada uma vez porque o agente novo não carregou no meio dela.

O pipeline errou ao ligar a guarda nova antes de confirmar o carregamento do tipo, e ao pôr a coautoria na parte fixa do agente. Contexto do 1º pedido do código: 37.922 tokens no `general-purpose` contra 6.466 a 6.477 no `desenvolvedor`. Retomar por `SendMessage` custou 9.874 a 22.193 tokens por agente.

```json
{
  "sessao": { "data": "2026-11-05", "assunto": "agente desenvolvedor (D8)", "orquestrador": { "model": "opus", "effort": "xhigh" } },
  "agentes": [
    { "papel": "consulta", "tipo": "leve", "modelo": "sonnet", "esforco": "low", "modulo": "agentes", "tokens": 34423, "minutos": 1, "agente": "claude-code-guide", "contexto1": 27573, "pacote1": 0 },
    { "papel": "consulta", "tipo": "forte", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 179424, "minutos": 8.9, "pacote": true, "agente": "Plan", "contexto1": 20442, "pacote1": 2891 },
    { "papel": "consulta", "tipo": "forte", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 167780, "minutos": 8.8, "pacote": true, "agente": "Plan", "contexto1": 20529, "pacote1": 2891 },
    { "papel": "revisor", "tipo": "revisor-arquitetura", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 78346, "minutos": 3.2, "modo": "completo", "pacote": true, "contexto1": 9575, "pacote1": 1415 },
    { "papel": "revisor", "tipo": "revisor-seguranca", "modelo": "opus", "esforco": "xhigh", "modulo": ".claude", "tokens": 121288, "minutos": 8.4, "modo": "completo", "pacote": true, "contexto1": 10047, "pacote1": 1415 },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 204330, "minutos": 9.9, "rodadas": 2, "pacote": true, "agente": "general-purpose", "contexto1": 37922, "pacote1": 3755 },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 167199, "minutos": 10.7, "rodadas": 2, "pacote": true, "agente": "desenvolvedor", "contexto1": 6466, "pacote1": 1380 },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 81682, "minutos": 3.8, "rodadas": 2, "pacote": true, "agente": "desenvolvedor", "contexto1": 6468, "pacote1": 1247 },
    { "papel": "revisor", "tipo": "revisor-seguranca", "modelo": "opus", "esforco": "xhigh", "modulo": ".claude", "tokens": 188939, "minutos": 11.3, "modo": "completo", "pacote": true, "contexto1": 10062, "pacote1": 1171 },
    { "papel": "revisor", "tipo": "revisor-arquitetura", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 163334, "minutos": 5, "modo": "completo", "pacote": true, "contexto1": 9756, "pacote1": 1171 },
    { "papel": "qa", "tipo": "qa", "modelo": "sonnet", "esforco": "high", "modulo": ".claude", "tokens": 118484, "minutos": 8, "modo": "completo", "pacote": true, "contexto1": 10426, "pacote1": 1250 },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 87592, "minutos": 4.5, "rodadas": 2, "pacote": true, "agente": "desenvolvedor", "contexto1": 6473, "pacote1": 1092 },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 129697, "minutos": 10.6, "rodadas": 2, "pacote": true, "agente": "desenvolvedor", "contexto1": 6473, "pacote1": 1618 },
    { "papel": "revisor", "tipo": "revisor-seguranca", "modelo": "opus", "esforco": "xhigh", "modulo": ".claude", "tokens": 98912, "minutos": 7, "modo": "curto", "pacote": true, "contexto1": 9977, "pacote1": 1082, "aprox": true },
    { "papel": "revisor", "tipo": "revisor-arquitetura", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 37702, "minutos": 6.5, "modo": "curto", "pacote": true, "contexto1": 9673, "pacote1": 1082, "aprox": true },
    { "papel": "qa", "tipo": "qa", "modelo": "sonnet", "esforco": "high", "modulo": ".claude", "tokens": 57154, "minutos": 7, "modo": "curto", "pacote": true, "contexto1": 10409, "pacote1": 875, "aprox": true },
    { "papel": "codigo", "tipo": "codigo-seguranca", "modelo": "sonnet", "esforco": "high", "modulo": ".claude/hooks", "tokens": 71916, "minutos": 4.9, "rodadas": 2, "pacote": true, "agente": "desenvolvedor", "contexto1": 6477, "pacote1": 920 },
    { "papel": "revisor", "tipo": "revisor-seguranca", "modelo": "opus", "esforco": "xhigh", "modulo": ".claude", "tokens": 14164, "minutos": 6, "modo": "curto", "pacote": true, "aprox": true },
    { "papel": "revisor", "tipo": "revisor-arquitetura", "modelo": "opus", "esforco": "high", "modulo": ".claude", "tokens": 9874, "minutos": 6.5, "modo": "curto", "pacote": true, "aprox": true },
    { "papel": "qa", "tipo": "qa", "modelo": "sonnet", "esforco": "high", "modulo": ".claude", "tokens": 22193, "minutos": 7, "modo": "curto", "pacote": true, "aprox": true }
  ],
  "achados": [
    { "revisor": "revisor-arquitetura", "modulo": ".claude", "severidade": "alto", "acionado_por": "gatilho", "resumo": "cabeçalho do agente conferido só no teste; campo a mais (permissionMode) passa na guarda", "visto_por": ["revisor-seguranca"] },
    { "revisor": "revisor-arquitetura", "modulo": ".claude/hooks", "severidade": "alto", "acionado_por": "gatilho", "resumo": "subagent_type ausente com worktree passa como general-purpose" },
    { "revisor": "revisor-arquitetura", "modulo": ".claude", "severidade": "alto", "acionado_por": "gatilho", "resumo": "regra 7 (recurso pago) sai do agente com Bash quando o CLAUDE.md é omitido", "visto_por": ["revisor-seguranca"] },
    { "revisor": "revisor-seguranca", "modulo": ".claude", "severidade": "alto", "acionado_por": "gatilho", "resumo": "primeiro preenchimento da parte do projeto sem nenhum controle" },
    { "revisor": "revisor-seguranca", "modulo": ".claude/hooks", "severidade": "alto", "acionado_por": "gatilho", "resumo": "trava de edição do agente só por lista de proibidos; sed pelo Bash e caixa no macOS passam", "visto_por": ["revisor-arquitetura"] },
    { "revisor": "revisor-arquitetura", "modulo": ".claude", "severidade": "medio", "acionado_por": "gatilho", "resumo": "parte fixa estoura o teto com a parte do projeto cheia; mudar só o CLAUDE.md não roda o teste da cópia" },
    { "revisor": "revisor-arquitetura", "modulo": ".claude/hooks", "severidade": "medio", "acionado_por": "gatilho", "resumo": "--repetidas conta pacote de planejamento; guarda compara regras a cada chamada" },
    { "revisor": "revisor-arquitetura", "modulo": ".claude/hooks", "severidade": "alto", "acionado_por": "gatilho", "resumo": "lint de fonte aceita item sem marca" },
    { "revisor": "revisor-arquitetura", "modulo": "docs", "severidade": "medio", "acionado_por": "gatilho", "resumo": "fase.md não acompanhou a D8 (modelo, esforço, handoff)" },
    { "revisor": "revisor-arquitetura", "modulo": ".claude/hooks", "severidade": "medio", "acionado_por": "gatilho", "resumo": "pre-commit recusa o commit do orquestrador quando o checkout dele é worktree", "visto_por": ["revisor-seguranca"] },
    { "revisor": "revisor-seguranca", "modulo": ".claude/hooks", "severidade": "alto", "acionado_por": "gatilho", "resumo": "extrairRegras corta a regra em linha em branco, sublista, tab ou 4 espaços" },
    { "revisor": "revisor-seguranca", "modulo": ".claude/hooks", "severidade": "medio", "acionado_por": "gatilho", "resumo": "projeto adotado sem o bloco domínio passa na guarda" },
    { "revisor": "qa", "modulo": ".claude/hooks", "severidade": "medio", "resumo": "guarda de pasta dos agentes muda quando o script é chamado por caminho com symlink" },
    { "revisor": "qa", "modulo": ".claude/hooks", "severidade": "medio", "resumo": "trava da pasta dos agentes no Bash é léxica: aspas partidas, variável, glob, symlink e git apply passam" },
    { "revisor": "revisor-arquitetura", "modulo": ".claude", "severidade": "medio", "acionado_por": "gatilho", "resumo": "conferência curta: teste do desenvolvedor.md real sem ajuste; 1º lote [ajuste] quebra o pre-commit adotado" }
  ],
  "gatilho_falso": [],
  "adiar": [],
  "erros_orquestrador": [
    { "resumo": "Estimou uns 200 mil tokens para as propostas e a revisão da decisão", "custo": "gastou uns 590 mil" },
    { "resumo": "Fez o merge da guarda nova antes de confirmar que o tipo desenvolvedor carregava na sessão", "custo": "o código travou até reiniciar a sessão" },
    { "resumo": "Pôs a coautoria na parte fixa do agente por uma premissa falsa", "custo": "conflito com a linha do Claude Code, revisor-lgpd acionado à toa, 2 commits" },
    { "resumo": "A frase acrescentada ao agente passou da folga de 2.450 bytes do corpo fixo", "custo": "teste vermelho no merge" },
    { "resumo": "Anotação no livro citou nome de variável que a guarda de git nega", "custo": "falso positivo próprio, reescrito" }
  ],
  "licoes": [
    "Agente novo na pasta de agentes não carrega no meio da sessão (Claude Code 2.1.318), contra a documentação; confirmar o carregamento antes de ligar a guarda.",
    "Conferência curta por SendMessage: 9.874 a 22.193 tokens por agente, contra 40 a 100 mil de um agente novo com pacote pequeno.",
    "Contexto do 1º pedido do código: 37.922 (general-purpose, com CLAUDE.md) contra 6.466 a 6.477 (desenvolvedor, sem CLAUDE.md).",
    "--repetidas: nenhuma economia perdida; as 4 candidatas eram próprias da sessão, nenhum lote; a contagem de testes no texto separou duas linhas iguais."
  ]
}
```
