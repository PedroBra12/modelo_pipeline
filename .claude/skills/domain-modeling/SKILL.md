---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing docs/glossario.md, or recording a decision in docs/decisoes.md.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `docs/glossario.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

This project already has its places. Never create a root `GLOSSARY.md`, a `GLOSSARY-MAP.md` or `docs/adr/`.

- **Glossary:** `docs/glossario.md`, in Portuguese (pt-BR). Create it lazily, when the first term is resolved.
- **Decisions:** a new row `D<n>` (the next number) in today's dated section of `docs/decisoes.md`, with the columns already there: decision, what it replaces, why. Open questions go in the `P<n>` table.
- **Architecture:** `docs/arquitetura.md`. **Plan:** `docs/plano.md`. **Per-folder rules:** the folder's `AGENTS.md`.
- **Never in the glossary:** a single client's vocabulary (what one customer calls a thing). That is that client's configuration, not a product term.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `docs/glossario.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update docs/glossario.md inline

When a term is resolved, update `docs/glossario.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`docs/glossario.md` should be totally devoid of implementation details. Do not treat `docs/glossario.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer decisions sparingly

Only offer to record a decision in `docs/decisoes.md` when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip it. Ask the user before writing the row: decisions are theirs.
