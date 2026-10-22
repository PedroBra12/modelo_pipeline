// Hook reference-transaction do git, estado prepared: a main local só anda para um commit que o origin/main já
// tem (ou para ele mesmo), que é o que o git pull --ff-only faz depois do fetch. Pega o que o pre-commit não vê:
// merge fast-forward, cherry-pick, revert, reset --hard, branch -f e update-ref. O --no-verify não o pula; a saída
// do usuário é git -c core.hooksPath= <comando>, pelo !. A entrada traz uma linha por ref: <antigo> <novo> <ref>.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ZERO = /^0+$/;
const MAIN = 'refs/heads/main';
export const MENSAGEM = 'a main só anda pelo merge do PR no GitHub, trazido com git pull --ff-only';

/** O motivo de negar a transação (ou null). `origem` é o sha do origin/main (ou null); `ehAncestral(a, b)`: a está na história de b. */
export function avaliarMain(linhas, origem, ehAncestral) {
  for (const linha of linhas) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length !== 3) return 'linha do git ilegível';
    const [antigo, novo, ref] = campos;
    if (ref !== MAIN) continue;
    // o git manda o antigo zerado quando apaga sem conferir o valor: apagar vem antes do "não mudou"
    if (ZERO.test(novo)) return `apagar a main não: ${MENSAGEM}`;
    if (antigo === novo) continue; // o que não muda a main (um merge --abort, um reset --hard HEAD) passa
    if (origem === null) return `sem origin/main para conferir: ${MENSAGEM}`;
    if (novo !== origem && !ehAncestral(novo, origem)) return MENSAGEM;
  }
  return null;
}

async function principal() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  const linhas = entrada.split(/\r?\n/).filter((l) => l.trim() !== '');
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], { encoding: 'utf8' });
  const origem = r.status === 0 ? r.stdout.trim() : null;
  const ehAncestral = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b]).status === 0;
  const motivo = avaliarMain(linhas, origem, ehAncestral);
  if (motivo !== null) {
    process.stderr.write(`confere-main: ${motivo}. Só o usuário passa por cima, com git -c core.hooksPath= <comando>, pelo !.\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
