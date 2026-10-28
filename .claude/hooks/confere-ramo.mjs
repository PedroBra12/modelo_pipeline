// Hook pre-commit e pre-merge-commit do git: nada se commita na main; todo trabalho vai num branch pr/<assunto-em-kebab>.
// Com o HEAD solto (rebase, bisect) deixa passar. Só o usuário passa por cima, com git -c core.hooksPath= <comando>, pelo !.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MENSAGEM =
  'confere-ramo: nada se commita na main; crie um branch: git switch -c pr/<assunto-em-kebab>. Só o usuário passa por cima, com git -c core.hooksPath= <comando>, pelo !.';

function principal() {
  const r = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8' });
  // status 1 com --quiet é o HEAD solto e passa; qualquer outra falha do git (128, não achou o git…) nega
  const solto = r.status === 1;
  if (!solto && (r.status !== 0 || r.stdout.trim() === 'main')) {
    process.stderr.write(`${MENSAGEM}\n`);
    process.exit(1);
  }
}

const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) principal();
