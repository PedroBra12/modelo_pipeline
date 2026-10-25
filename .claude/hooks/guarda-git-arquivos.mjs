// Guarda dos arquivos do git (hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit).
// A guarda-git.mjs segura o que o agente faz pelo shell; esta segura a mesma porta pelas ferramentas de edição: nega o
// caminho dentro de .git/ (config, config.worktree, hooks/…) e o próprio arquivo .git (o ponteiro de um worktree).
// Os hooks do git, o core.hooksPath e o pre-push moram lá; editar esses arquivos os desligaria sem passar pela guarda-git.
// O caminho se lê a partir do cwd da entrada, com `..` resolvido, e pelo nome de cada pasta: no Windows `.git.`, `.git ` e
// `GIT~1` abrem a mesma pasta. Modo em PIPELINE_GUARDA_GIT, igual ao da guarda-git: "negar" (padrão), "perguntar" ou "desligado".
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_DO_GIT = /^(\.git[. ]*|git~\d+)$/i;

/** O motivo de negar o caminho (ou null). Erra para o lado de negar: sem texto de caminho, nega. */
export function motivoDoCaminho(caminho, cwd) {
  if (typeof caminho !== 'string' || caminho.trim() === '') return 'caminho ilegível pela guarda';
  const absoluto = resolve(typeof cwd === 'string' && cwd !== '' ? cwd : '.', caminho.replaceAll('\\', '/'));
  return absoluto.split(/[\\/]/).some((parte) => PASTA_DO_GIT.test(parte))
    ? 'editar dentro de .git/ (config, hooks…) ou o arquivo .git desliga os hooks do git'
    : null;
}

function decidir(decisao, motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decisao,
      permissionDecisionReason: `Guarda de git do projeto: ${motivo}. Se o usuário pediu explicitamente, peça para ele fazer a mudança por fora da sessão.`,
    },
  }));
}

async function principal() {
  const modo = process.env.PIPELINE_GUARDA_GIT ?? 'negar';
  if (modo === 'desligado') return;
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let motivo;
  try {
    const dados = JSON.parse(entrada);
    motivo = motivoDoCaminho(dados.tool_input?.file_path ?? dados.tool_input?.notebook_path, dados.cwd);
  } catch {
    motivo = 'entrada ilegível pela guarda';
  }
  if (motivo !== null) decidir(modo === 'perguntar' ? 'ask' : 'deny', motivo);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
