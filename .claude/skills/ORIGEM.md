# Origem das skills

Skills de terceiros, copiadas e revisadas à mão. Nada aqui se atualiza sozinho: para trazer uma versão nova, ler de novo e copiar.

| Origem | Commit | Skills | Ajustes |
|---|---|---|---|
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `f329330` | `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | nenhum. Os hooks do plugin ficaram de fora (registram cada tarefa e podem enviar para um webhook) |
| [cursor/plugins · pstack](https://github.com/cursor/plugins/tree/main/pstack) | `f713f14` | `unslop`, `sharpen`, `in-your-own-words`, `bro`, `tdd`, `typescript-best-practices` e 20 `principle-*` | regras do pipeline: commit só pelo pipeline, e push e PR só pelo orquestrador, com o merge do usuário, `as` proibido, brand pelo Zod, `Resultado` no domínio, a política de acesso do banco não é validação redundante, contrato entre pastas se relata. Os princípios e o TS deixaram de ser só por `/` (sem o `poteto-mode`, ficariam inertes) |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `49dd158` | `codebase-design`, `domain-modeling`, `grill-with-docs`, `grilling`, `diagnosing-bugs`, `to-questionnaire`, `handoff`, `writing-for-agents` | glossário em `docs/glossario.md` e decisões em `docs/decisoes.md` (nunca `docs/adr/`); só dado inventado e nada de produção no diagnóstico; fatos só do repositório local, nunca de conector; questionário em `docs/questionarios/`, em português. Sem as pastas `agents/` (metadado do Codex) |
| [metricasboss/otto](https://github.com/metricasboss/otto) | `f0bb2bd` | nenhuma skill: as regras de LGPD viraram o hook `.claude/hooks/confere-lgpd.mjs` (regras em `lgpd-regras.mjs`); o subagente de LGPD que também veio dali saiu do pipeline na D34 | portado de Python para Node; artigos corrigidos (CPF é dado pessoal, não sensível; CNPJ fora; sem soma de multas); dado literal vale também em teste e doc (regra 6); regras genéricas de projeto (PII em log e URL, PII para a IA, dado sensível do Art. 11, consentimento marcado por padrão). Ficaram de fora o `install.sh` (grava no `~/.claude` global), a GitHub Action (a CI é decisão de cada projeto), o GDPR e a nota de 0 a 100 |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0) | skill 4.5.0, motor 0.1.11, via o clone da Agenda `agenda-relacionamento@fb06df4` (`.claude/skills/impeccable/`) | `impeccable` (`SKILL.md`, `reference/`, `scripts/command-metadata.json`, `scripts/VERSION` e `scripts/data/`, e o `LICENSE`), usada só pelo agente `designer-ui` e pelo `revisor-tela` (D35) | o conteúdo copiado não foi reescrito. **Restrição da D35 (6), que vale sobre o texto da skill:** a skill só roda pelo lançador preso `.claude/hooks/impeccable.mjs`, só com `context` e `detect`, com o motor já baixado em `~/.impeccable/bin/<versão>/` (nada baixa), só o da tabela do lançador (hoje `darwin-arm64`, 0.1.11, com o SHA-256 conferido antes de rodar), dentro de uma caixa `sandbox-exec` sem rede e sem a pasta dos segredos locais, as chaves `IMPECCABLE_NO_UPDATE_CHECK`, `IMPECCABLE_NO_TELEMETRY`, `IMPECCABLE_NO_STALENESS_CHECK` e `DO_NOT_TRACK` ligadas e um ambiente sem segredos; onde a `SKILL.md` ou uma referência manda `scripts/impeccable`, vale o lançador preso. Nenhum hook da `impeccable` entra no `settings.json`. **Ficaram de fora:** `scripts/live-browser*.js` e `scripts/modern-screenshot.umd.js` (uns 600 KB de JavaScript de navegador que só o comando `live` usa) e o lançador original, `scripts/impeccable` e `scripts/impeccable.cmd`, que a `SKILL.md` (`user-invocable: true`, Setup 1) manda rodar: ele roda o motor com o ambiente inteiro e sem as chaves, e baixa o motor do GitHub quando falta. O ramo "Launcher unavailable" da `SKILL.md` cobre a falta; o texto da skill não foi reescrito (um teste confere que os arquivos não voltam) |
| [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) (CC0-1.0) | `b044f95` (via a Agenda) | nenhuma skill: `rules/toss-style-design-system.mdc` e `rules/playwright-accessibility-testing-cursorrules-prompt-file.mdc` viraram o "Checklist da tela" do agente `designer-ui` (D35) | resumidas e traduzidas, abaixo do `DESIGN.md` (vence onde divergir); do teste de acessibilidade ficou só a conferência pelo teclado e pelo `aria-live`, sem o `axe-core` (dependência nova). Ficaram de fora as regras de stack (Tailwind, shadcn, Chakra, MUI, `nuqs`, v0.dev): a tela daqui é Next com CSS próprio (`apps/web/public/estilos.css`) |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) | `715c180` | `pick-ui-library`, `break-ui` (com o `CATALOG.md`), `mobile-native`, `emil-design-eng` (com o `ui-cheatsheet.md`) | copiadas sem reescrever: o corpo é o original, fora o bloco "Neste repositório (D37)" no topo, que vale sobre o resto, o `disable-model-invocation: true` no cabeçalho (como a `tdd`) e três linhas que levam no fim o comentário `lgpd-ignora` do `confere-lgpd` (duas do `CATALOG.md` e uma do corpo da `break-ui/SKILL.md`, as três com e-mail de exemplo fora de domínio reservado). O `ui-cheatsheet.md` entra sem mudança. O catálogo dá a forma do pior caso, nunca o valor: há exemplo ali que coincide com o nome de gente de verdade, e o bloco da `break-ui` proíbe copiá-lo como dado. Lidas só pelo `designer-ui` e pelo `revisor-tela`, por caminho, como lente; a pasta de cada uma está no gatilho `config_pipeline` (o texto é instrução de agente que escreve e roda comandos) |

**A tela (D35):** a skill `impeccable`, pelo agente `designer-ui`, entra no lugar do plugin `frontend-design` (`claude-plugins-official`), que saiu do `.claude/settings.json`. O `DESIGN.md` nasce na 1ª tarefa de tela (D36).

**As bibliotecas de tela (D37):** a lista aprovada para `apps/web` é **Base UI, cmdk, Sonner e NumberFlow**, e **nada está instalado**: cada uma entra só quando uma tela precisar, com as condições do bloco da `pick-ui-library`. Ficaram de fora: Vaul (o README dele diz "This repo is unmaintained", conferido em 11/11/2026), Radix (mesmo papel do Base UI), shadcn/ui (pede Tailwind) e as galerias Magic UI, Aceternity UI, RareUI, Beautiful UI e 21st.dev (vitrine animada em Tailwind; a 21st.dev tem parte paga). A CSP da web não afrouxa por nenhuma delas.

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
- **emilkowalski/skills:** `animate`, `animate-expo`, `animation-performance`, `animation-vocabulary`, `choreograph`, `find-animation-opportunities`, `gestures`, `improve-animations`, `remove-animations`, `review-animations` e `apple-design` (movimento, que o `DESIGN.md` não tem); `write-swift` (outra linguagem); `prototype` (monta um seletor de variantes dentro do produto); `ask-sonner` (entra, se entrar, com a Sonner).

## Licenças

As quatro primeiras origens e a `emilkowalski/skills` são MIT, com o mesmo texto abaixo. A `impeccable` é Apache 2.0 (`license: Apache 2.0` no cabeçalho da `SKILL.md`): o texto da licença está em `.claude/skills/impeccable/LICENSE` (a Apache License 2.0, versão 2.0, de janeiro de 2004, copiada do `LICENSE.txt` do pacote `typescript` do `node_modules`, que é o mesmo texto-padrão e vem sem nota de direitos de outro projeto; fim de linha trocado para LF). O repositório de origem pode ter um arquivo `NOTICE`, que daqui não se confere (sem rede): **não conferido**. O que veio do `awesome-cursorrules` é CC0-1.0 (domínio público).

- Copyright (c) 2026 DietrichGebert (ponytail)
- Copyright (c) 2026 Lauren Tan (pstack)
- Copyright (c) 2026 Matt Pocock (mattpocock/skills)
- Copyright (c) 2026 OTTO.ai Contributors (otto)
- Copyright (c) 2026 Emil Kowalski (emilkowalski/skills)

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
