// Hook reference-transaction do git, estado prepared: a main local só anda para um commit que o origin/main já
// tem (ou para ele mesmo), que é o que o git pull --ff-only faz depois do fetch. Pega o que o pre-commit não vê:
// merge fast-forward, cherry-pick, revert, reset --hard, branch -f e update-ref. O --no-verify não o pula; a saída
// do usuário é git -c core.hooksPath= <comando>, pelo !. A entrada traz uma linha por ref: <antigo> <novo> <ref>.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ZERO = /^0+$/;
const MAIN = 'refs/heads/main';
export const MENSAGEM = 'a main só anda pelo merge do PR no GitHub, trazido com git pull --ff-only';

/**
 * O motivo de negar a transação (ou null). `origem` é o sha do origin/main (ou null); `ehAncestral(a, b)`: a está na história de b.
 * `empacotaMain(antigo)` (D63): o `git pack-refs` (a manutenção automática do git) grava a main no `packed-refs` e depois apaga a ref
 * solta, e essa poda chega aqui como `<sha> 000… refs/heads/main`; passa só se for ele de verdade (ver `ehPodaDoPackRefs`).
 */
export function avaliarMain(linhas, origem, ehAncestral, empacotaMain = () => false) {
  for (const linha of linhas) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length !== 3) return 'linha do git ilegível';
    const [antigo, novo, ref] = campos;
    if (ref !== MAIN) continue;
    // o git manda o antigo zerado quando apaga sem conferir o valor: apagar vem antes do "não mudou"
    if (ZERO.test(novo)) {
      if (!ZERO.test(antigo) && empacotaMain(antigo)) continue;
      return `apagar a main não: ${MENSAGEM}`;
    }
    if (antigo === novo) continue; // o que não muda a main (um merge --abort, um reset --hard HEAD) passa
    if (origem === null) return `sem origin/main para conferir: ${MENSAGEM}`;
    if (novo !== origem && !ehAncestral(novo, origem)) return MENSAGEM;
  }
  return null;
}

const PAI_PACK_REFS = /^(?:\S*[/\\])?git(?:\.exe)?(?:\s+-c\s+\S+|\s+--?\S+)*\s+pack-refs(?:\s|$)/;

/**
 * A poda do `pack-refs` (D63): um ancestral do hook (até 3 níveis: o `sh` do hook, o `git`) é o `git pack-refs` (o `ps` de cada
 * um; sem `ps`, nega) e o `packed-refs` já tem a main nesse sha. Só o estado dos arquivos não basta: `git update-ref -d
 * refs/heads/main <sha>` com a ref solta e empacotada no mesmo valor chega igual. Limite: o `git pack-refs` que o usuário
 * roda à mão também passa (ele não apaga a main, que fica no `packed-refs`).
 */
export function ehPodaDoPackRefs(antigo, { pai = process.ppid, lerPacked = lerPackedRefs, processo = dadosDoProcesso } = {}) {
  try {
    if (!lerPacked().some((l) => l === `${antigo} ${MAIN}`)) return false;
    for (let pid = pai, nivel = 0; nivel < 3 && pid > 1; nivel += 1) {
      const { ppid, comando } = processo(pid);
      if (PAI_PACK_REFS.test(comando.trim())) return true;
      pid = ppid;
    }
    return false;
  } catch {
    return false;
  }
}

function dadosDoProcesso(pid) {
  const r = spawnSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8' });
  const m = r.status === 0 ? /^\s*(\d+)\s+(.*)$/s.exec(r.stdout) : null;
  return m === null ? { ppid: 0, comando: '' } : { ppid: Number(m[1]), comando: m[2] };
}

function lerPackedRefs() {
  const caminho = spawnSync('git', ['rev-parse', '--git-path', 'packed-refs'], { encoding: 'utf8' }).stdout.trim();
  return readFileSync(caminho, 'utf8').split(/\r?\n/);
}

async function principal() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  const linhas = entrada.split(/\r?\n/).filter((l) => l.trim() !== '');
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], { encoding: 'utf8' });
  const origem = r.status === 0 ? r.stdout.trim() : null;
  const ehAncestral = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b]).status === 0;
  const motivo = avaliarMain(linhas, origem, ehAncestral, (antigo) => ehPodaDoPackRefs(antigo));
  if (motivo !== null) {
    process.stderr.write(`confere-main: ${motivo}. Só o usuário passa por cima, com git -c core.hooksPath= <comando>, pelo !.\n`);
    process.exit(1);
  }
}

// realpath dos dois lados: no macOS o /tmp é /private/tmp, e o import.meta.url vem resolvido (o hook ficaria mudo, e mudo é "passou")
const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) await principal();
