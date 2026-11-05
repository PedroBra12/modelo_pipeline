// Guarda da pasta .claude/agents/ (hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit; D8.7).
// Os agentes de .claude/agents/ são do orquestrador: o subagente (a entrada do hook traz agent_id, o mesmo sinal da
// guarda-agentes) não os edita, nem o desenvolvedor.md, que roda com o cabeçalho e o texto fixo que a guarda dos subagentes confere.
// Nega o caminho que tem um segmento `.claude` seguido de `agents`, sem diferença de maiúscula e minúscula, em qualquer
// profundidade (também dentro de .claude/worktrees/*/). O caminho se lê a partir do cwd da entrada, com `..` resolvido, e pelo
// nome de cada pasta: no Windows `.claude.`, `.claude ` e `CLAUDE~1` abrem a mesma pasta. Subagente sem caminho legível nega
// (falha fechado); sem agent_id o hook não age. Sem modo: o PIPELINE_GUARDA_GIT da guarda-git não o desliga nem o afrouxa.
// O que o subagente faz pelo shell é da guarda-git.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_CLAUDE = /^(\.claude|claude~\d+)[. ]*$/i;
const PASTA_AGENTS = /^agents[. ]*$/i;
const MOTIVO = 'subagente não edita `.claude/agents/` (D8)';

/** A entrada é de um subagente? O critério é o da guarda-agentes: `agent_id` é um texto não vazio. */
export function ehSubagente(entrada) {
  const id = entrada?.agent_id;
  return typeof id === 'string' && id.trim() !== '';
}

/** O motivo de negar a entrada (ou null). Erra para o lado de negar: com agent_id e sem texto de caminho, nega. */
export function motivoDaEntrada(entrada) {
  if (!ehSubagente(entrada)) return null;
  const caminho = entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path;
  if (typeof caminho !== 'string' || caminho.trim() === '') return `${MOTIVO}: caminho ilegível pela guarda`;
  const cwd = typeof entrada.cwd === 'string' && entrada.cwd !== '' ? entrada.cwd : '.';
  const partes = resolve(cwd, caminho.replaceAll('\\', '/')).split(/[\\/]/);
  return partes.some((parte, i) => PASTA_CLAUDE.test(parte) && PASTA_AGENTS.test(partes[i + 1] ?? '')) ? MOTIVO : null;
}

function decidir(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Guarda de agentes do projeto: ${motivo}. Relate ao orquestrador o que precisa mudar em .claude/agents/; só ele edita.`,
    },
  }));
}

async function principal() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let motivo;
  try {
    motivo = motivoDaEntrada(JSON.parse(entrada));
  } catch {
    motivo = 'entrada ilegível pela guarda';
  }
  if (motivo !== null) decidir(motivo);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
