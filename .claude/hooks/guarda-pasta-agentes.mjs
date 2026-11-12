// Guarda de `.claude/` para os subagentes (hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit; D8.7, ampliada na D11).
// Tudo de `.claude/` é do orquestrador, menos o que o subagente escreve no próprio worktree: a entrada do hook traz agent_id
// (o mesmo sinal da guarda-agentes) e o subagente não edita (1) `agents/`, `pipeline.json` e `settings*.json` de nenhuma `.claude`, em
// qualquer profundidade, também dentro de .claude/worktrees/*/ (o desenvolvedor.md e os pares que as guardas conferem); (2) qualquer outro
// caminho sob `.claude/` (hooks, skills, commands, estado...) que não esteja no worktree que contém o cwd da entrada: o `desenvolvedor`
// edita .claude/worktrees/<x>/.claude/hooks/ do worktree dele, não o .claude/hooks/ do checkout vivo nem o de outro worktree.
// O caminho se lê a partir do cwd da entrada, com `..` resolvido, pelo caminho escrito e pelo de verdade (links), e pelo nome de cada
// pasta: no Windows `.claude.`, `.claude ` e `CLAUDE~1` abrem a mesma pasta, e `pipeline.json::$DATA` o mesmo arquivo. Sem diferença de
// caixa. Subagente sem caminho legível nega (falha fechado); sem agent_id o hook não age. Sem modo: o PIPELINE_GUARDA_GIT da guarda-git
// não o desliga nem o afrouxa. O que o subagente faz pelo shell é da guarda-git.
import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_CLAUDE = /^(\.claude|claude~\d+)[. ]*$/i;
// o que de `.claude/` o subagente não edita nem no próprio worktree; `pipeli~1.jso` e `settin~1.jso` são os nomes curtos (8.3) do Windows
const SO_DO_ORQUESTRADOR = /^(agents|pipeline\.json|settings[^/]*\.json|pipeli~\d+\.jso|settin~\d+\.jso)[. ]*$/i;
const WORKTREE = /(?:^|\/)\.claude\/worktrees\/[^/]+/gi;
const MOTIVO = 'subagente não edita `.claude/` fora do próprio worktree (D11)';

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

const emBarras = (caminho) => caminho.replaceAll('\\', '/');
// o nome de cada pasta ou arquivo sem o fluxo do NTFS (`pipeline.json::$DATA`, `.claude::$INDEX_ALLOCATION`)
const partesDe = (caminho) => emBarras(caminho).split('/').map((parte) => parte.split(':')[0]);

/** A raiz do worktree que contém o caminho (o `.claude/worktrees/<x>` mais fundo, em barras `/`), ou null. */
function raizDoWorktree(caminho) {
  const barras = emBarras(caminho);
  const ultimo = [...barras.matchAll(WORKTREE)].at(-1);
  return ultimo === undefined ? null : barras.slice(0, ultimo.index + ultimo[0].length);
}
const dentroDe = (caminho, raiz) => raiz !== null && (caminho === raiz || caminho.startsWith(`${raiz}/`));

/** O caminho (escrito ou de verdade) é de `.claude/` e o subagente não o edita? `raiz` é o worktree que contém o cwd, lido do mesmo modo. */
function negaCaminho(caminho, raiz) {
  const partes = partesDe(caminho);
  if (partes.some((parte, i) => PASTA_CLAUDE.test(parte) && SO_DO_ORQUESTRADOR.test(partes[i + 1] ?? ''))) return true;
  return !dentroDe(emBarras(caminho), raiz) && partes.some((parte) => PASTA_CLAUDE.test(parte));
}

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
  const cwd = resolve(typeof entrada.cwd === 'string' && entrada.cwd !== '' ? entrada.cwd : '.');
  const escrito = resolve(cwd, emBarras(caminho));
  const real = caminhoReal(escrito);
  const cwdReal = caminhoReal(cwd);
  if (real === null || cwdReal === null) return `${MOTIVO}: caminho de links que a guarda não resolve`;
  // o caminho como está escrito e o de verdade: um link para .claude, para agents/ ou para fora do worktree não esconde o alvo
  return negaCaminho(escrito, raizDoWorktree(cwd)) || negaCaminho(real, raizDoWorktree(cwdReal)) ? MOTIVO : null;
}

function decidir(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Guarda de agentes do projeto: ${motivo}. Relate ao orquestrador o que precisa mudar fora do seu worktree; só ele edita.`,
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

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) await principal();
