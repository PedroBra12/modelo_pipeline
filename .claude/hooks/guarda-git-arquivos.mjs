// Guarda dos arquivos do git (hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit).
// A guarda-git.mjs segura o que o agente faz pelo shell; esta segura a mesma porta pelas ferramentas de edição: nega o
// caminho dentro de .git/ (config, config.worktree, hooks/…) e o próprio arquivo .git (o ponteiro de um worktree).
// Os hooks do git, o core.hooksPath e o pre-push moram lá; editar esses arquivos os desligaria sem passar pela guarda-git.
// O caminho se lê a partir do cwd da entrada, com `..` resolvido, e pelo nome de cada pasta: no Windows `.git.`, `.git ` e
// `GIT~1` abrem a mesma pasta. Modo em PIPELINE_GUARDA_GIT, igual ao da guarda-git: "negar" (padrão), "perguntar" ou "desligado".
import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_DO_GIT = /^(\.git[. ]*|git~\d+)$/i;

// realpath dos dois lados: no macOS o /var é /private/var e o import.meta.url vem resolvido (o hook ficaria mudo, e mudo é "passou")
const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

/**
 * O caminho de verdade (links resolvidos) do absoluto, mesmo que o fim ainda não exista: resolve o ancestral mais próximo que
 * existe e junta o resto. O link solto (que aponta para o que ainda não existe) se segue pelo readlink. Null se não resolve (ciclo).
 */
function caminhoReal(absoluto, fundo = 0) {
  if (fundo > 40) return null;
  const resto = [];
  for (let atual = absoluto; ; atual = dirname(atual)) {
    try {
      return resolve(realpathSync(atual), ...resto);
    } catch {
      try {
        lstatSync(atual); // existe mas não resolve: é o link solto (ou o ciclo)
        return caminhoReal(resolve(dirname(atual), readlinkSync(atual), ...resto), fundo + 1);
      } catch {
        // não existe: sobe um nível
      }
    }
    if (dirname(atual) === atual) return absoluto;
    resto.unshift(basename(atual));
  }
}

const naPastaDoGit = (caminho) => caminho.split(/[\\/]/).some((parte) => PASTA_DO_GIT.test(parte));

/** O motivo de negar o caminho (ou null). Erra para o lado de negar: sem texto de caminho, nega. */
export function motivoDoCaminho(caminho, cwd) {
  if (typeof caminho !== 'string' || caminho.trim() === '') return 'caminho ilegível pela guarda';
  const escrito = resolve(typeof cwd === 'string' && cwd !== '' ? cwd : '.', caminho.replaceAll('\\', '/'));
  const real = caminhoReal(escrito);
  // o caminho como está escrito e o de verdade (um link para o .git não esconde o alvo); o ciclo de links, que não resolve, nega
  return real === null || [escrito, real].some(naPastaDoGit)
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

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) await principal();
