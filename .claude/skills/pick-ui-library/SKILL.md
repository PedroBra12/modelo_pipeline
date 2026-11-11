---
name: pick-ui-library
description: Pick the right library for a given frontend task from a curated, opinionated list — numbers, OTP inputs, charts, command menus, virtualization, drag and drop, toasts, state, styling, and more. Only runs when explicitly invoked; it does not trigger on its own.
disable-model-invocation: true
---

## Neste repositório (D37): vale sobre o resto deste arquivo

Texto de terceiro (`emilkowalski/skills@715c180`, MIT; `.claude/skills/ORIGEM.md`), copiado sem reescrever. Quem o lê é o `designer-ui` e o `revisor-tela`, por caminho, como lente. Acima dele valem o `CLAUDE.md`, a skill `pipeline`, o arquivo do agente que o lê, o `PRODUCT.md` e o `DESIGN.md`. A seção "Initial Response" não vale aqui. O relato sai em português, no formato de saída do agente.

- **Você recomenda, nunca instala.** O passo 3 do original ("install/wire it up") não vale: nenhum agente de tela roda `npm install` nem importa pacote que não está no `package.json` da raiz. A recomendação vai em `Propostas:`, com a tarefa, a biblioteca e a tela que precisa dela.
- **Lista aprovada (D37 (2)).** Das linhas da lista abaixo, só estas quatro entram sem decisão nova, e só quando uma tela precisar:

  | Tarefa | Biblioteca |
  |---|---|
  | diálogo, menu, popover, select e os outros componentes sem estilo | Base UI |
  | paleta de comandos | cmdk |
  | toast e notificação | Sonner |
  | número que muda na tela | NumberFlow |

- **Condições de entrada (D37 (3)), todas:**
  1. quem instala é o agente de código, numa tarefa do caminho `feature`, com a versão exata no `package.json` da raiz e o `apps/web/AGENTS.md` ("Depende de") no mesmo commit;
  2. a licença e o estado do repositório se conferem na hora: biblioteca abandonada ou sem licença livre não entra;
  3. a prova é o `npm run web:navegador` com o componente na tela e a CSP sem violação. A CSP não afrouxa: a biblioteca que pede `unsafe-inline`, `<style>` injetado ou `style=` que a CSP barra fica de fora e volta ao usuário;
  4. nenhuma chamada de rede em execução (fonte, CDN, telemetria);
  5. o estilo é só o `apps/web/public/estilos.css`, com os tokens do `DESIGN.md`; componente novo no `DESIGN.md` segue sendo decisão do usuário (D35 (3)).
- **Fora, de propósito (D37 (4)):** Vaul (o repositório se declara sem manutenção; a gaveta se decide quando uma tela pedir), Radix (mesmo papel do Base UI), shadcn/ui e `cva` (pedem Tailwind; a tela daqui é CSS próprio) e as galerias Magic UI, Aceternity UI, RareUI, Beautiful UI e 21st.dev.
- **O resto da lista abaixo é referência:** cada biblioteca dali pede uma decisão própria do usuário (`D<n>`) antes de entrar; a proposta diz isso.

# Picking The Right Library

## Initial Response

When this skill is first invoked without a specific question, respond only with:

> I'm ready to pick the right library for your task, my picks come from Emil Kowalski's curated list.

Do not provide any other information until the user asks a question.

A lookup skill. When invoked with a task ("I need toasts", "what should I use for drag and drop?"), match the task to the curated list below and recommend the library. These are deliberate, taste-driven picks — don't substitute alternatives outside this list unless the user asks for one or the task genuinely isn't covered.

## How to use this

1. **Identify the task**, not the library the user named. "I need to show a dropdown" is a UI-primitives task (base-ui), even if they asked about something else.
2. **Check what's already installed.** Look at `package.json` first. If the project already uses a listed library, use it. If it uses a competitor (e.g. react-window instead of Virtuoso), flag the recommendation but don't churn the dependency without being asked.
3. **Recommend one library**, state what it's for in one sentence, and install/wire it up if that's part of the request. Don't present a menu of options when the list has a clear answer.
4. If the task isn't covered by the list, say so explicitly and recommend from your own knowledge — but be clear you've left the curated list.

## The list

### UI components & primitives

| Task | Library |
| --- | --- |
| Unstyled, accessible UI components (dialogs, popovers, menus, selects…) | [base-ui](https://base-ui.com) |
| Command menus (⌘K palettes) | [cmdk](https://cmdk.paco.me) |
| Toasts / notifications | [Sonner](https://sonner.emilkowal.ski) |
| One-time password / verification code inputs | [input-otp](https://input-otp.rodz.dev) |
| Customizable GUIs / control panels | [Leva](https://github.com/pmndrs/leva) — [dialkit](https://joshpuckett.me/dialkit) is an alternative |

### Motion & visuals

| Task | Library |
| --- | --- |
| General-purpose animation (springs, layout animations, enter/exit) | [motion](https://motion.dev) (Framer Motion) |
| Animating numbers (counters, prices, stats) | [NumberFlow](https://number-flow.barvian.me) |
| Animated text components | [torph](https://torph.lochie.me/) |
| 3D globes | [Cobe](https://cobe.vercel.app) |
| Dynamic OG images (HTML/CSS → SVG/PNG) | [Satori](https://github.com/vercel/satori) |
| Syntax highlighting | [shiki](https://shiki.style) |

Reach for motion when you need springs, layout animations, exit animations, or gesture-driven values. A simple hover or fade doesn't need it — plain CSS transitions are the right tool there.

### Charts

| Task | Library |
| --- | --- |
| Real-time / streaming charts | [Liveline](https://github.com/benjitaylor/liveline) |
| General charts (static or interactive dashboards) | [recharts](https://recharts.org) |

The split: if data points arrive live and the chart scrolls with time, use Liveline. Everything else is recharts.

### Interaction & performance

| Task | Library |
| --- | --- |
| Drag and drop | [dnd kit](https://dndkit.com) |
| Virtualization (long lists, large tables) | [Virtuoso](https://virtuoso.dev) |

### State & styling

| Task | Library |
| --- | --- |
| State management | [zustand](https://zustand.docs.pmnd.rs) |
| Constructing `className` strings conditionally | [clsx](https://github.com/lukeed/clsx) |
| Type-safe, variant-driven styling for Tailwind | [cva](https://cva.style) |
| Theme switching / dark mode (no flash on load) | [next-themes](https://github.com/pacocoursey/next-themes) |

The styling split: clsx for ad-hoc conditional classes; cva when a component has real variants (size, intent, state) that deserve a typed API. They compose — cva uses clsx-style inputs internally.

## Common mismatches to catch

- **Toasts built by hand or with a modal library** → Sonner exists for exactly this.
- **A `<div>`-based dropdown/dialog with manual focus handling** → base-ui, which handles accessibility, focus trapping, and dismissal.
- **Animating a number by re-rendering text** → NumberFlow handles digit transitions properly.
- **Rendering a 1,000+ row list directly** → Virtuoso before reaching for pagination hacks.
- **A `useState`-per-component web of props for shared state** → zustand.
- **Template-literal className ternaries three conditions deep** → clsx (or cva if it's variant-shaped).
