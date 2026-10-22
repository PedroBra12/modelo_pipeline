# Origem das skills

Skills de terceiros, copiadas e revisadas à mão. Nada aqui se atualiza sozinho: para trazer uma versão nova, ler de novo e copiar.

| Origem | Commit | Skills | Ajustes |
|---|---|---|---|
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `f329330` | `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | nenhum. Os hooks do plugin ficaram de fora (registram cada tarefa e podem enviar para um webhook) |
| [cursor/plugins · pstack](https://github.com/cursor/plugins/tree/main/pstack) | `f713f14` | `unslop`, `sharpen`, `in-your-own-words`, `bro`, `tdd`, `typescript-best-practices` e 20 `principle-*` | regras do pipeline: commit só pelo pipeline, e push e PR só pelo orquestrador, com o merge do usuário, `as` proibido, brand pelo Zod, `Resultado` no domínio, a política de acesso do banco não é validação redundante, contrato entre pastas se relata. Os princípios e o TS deixaram de ser só por `/` (sem o `poteto-mode`, ficariam inertes) |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `49dd158` | `codebase-design`, `domain-modeling`, `grill-with-docs`, `grilling`, `diagnosing-bugs`, `to-questionnaire`, `handoff`, `writing-for-agents` | glossário em `docs/glossario.md` e decisões em `docs/decisoes.md` (nunca `docs/adr/`); só dado inventado e nada de produção no diagnóstico; fatos só do repositório local, nunca de conector; questionário em `docs/questionarios/`, em português. Sem as pastas `agents/` (metadado do Codex) |
| [metricasboss/otto](https://github.com/metricasboss/otto) | `f0bb2bd` | nenhuma skill: as regras de LGPD viraram o hook `.claude/hooks/confere-lgpd.mjs` (regras em `lgpd-regras.mjs`) e o subagente `revisor-lgpd` | portado de Python para Node; artigos corrigidos (CPF é dado pessoal, não sensível; CNPJ fora; sem soma de multas); dado literal vale também em teste e doc (regra 6); regras genéricas de projeto (PII em log e URL, PII para a IA, dado sensível do Art. 11, consentimento marcado por padrão). Ficaram de fora o `install.sh` (grava no `~/.claude` global), a GitHub Action (a CI é decisão de cada projeto), o GDPR e a nota de 0 a 100 |

**Ficaram de fora, de propósito:**
- **pstack:**
  - `poteto-mode`, `why`, `recall`, `reflect`, `automate-me`, `setup-pstack`, `make-bot-ui`, `poteto-help`, `swarm` e `no-comments`: commitam, abrem PR ou fazem merge, consultam todo conector (MCP), rodam modelos fora da Claude ou dependem do Cursor;
  - `never-block-on-the-human`: contraria o "sim" explícito do projeto;
  - `laziness-protocol` e `guard-the-context-window`: já cobertas.
- **mattpocock:**
  - `code-review`, `implement`, `implement-spec`, `pr`, `triage`, `wayfinder`, `to-spec`, `to-tickets`, `setup-matt-pocock-skills`: precisam de commit, PR ou issue tracker;
  - `wizard`, `setup-pre-commit`, `git-guardrails-claude-code`, `scaffold-exercises`, `migrate-to-shoehorn`: instalam pacote ou hook, ou commitam;
  - `teach` e `wait-what`: fora do escopo ou já cobertas;
  - as skills `in-progress`: instáveis.

## Licenças

As quatro origens são MIT, com o mesmo texto:

- Copyright (c) 2026 DietrichGebert (ponytail)
- Copyright (c) 2026 Lauren Tan (pstack)
- Copyright (c) 2026 Matt Pocock (mattpocock/skills)
- Copyright (c) 2026 OTTO.ai Contributors (otto)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
