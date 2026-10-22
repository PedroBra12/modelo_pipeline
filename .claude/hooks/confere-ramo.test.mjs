// O confere-ramo como hook pre-commit e pre-merge-commit num git de verdade: nada se commita na main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOKS = join(AQUI, 'git');
const SEM_HOOKS = ['-c', 'core.hooksPath='];

test('o commit na main é recusado, no branch pr/x passa, o merge na main é recusado e o git -c core.hooksPath= do usuário passa', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-ramo-git-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: base, encoding: 'utf8' });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  const escrever = (nome, texto) => writeFileSync(join(base, nome), texto);
  try {
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.autocrlf', 'false'], ['core.hooksPath', HOOKS]]) git('config', k, v);

    escrever('README.md', '# repo\n');
    git('add', '-A');
    const naMain = git('commit', '-q', '-m', 'raiz');
    assert.equal(naMain.ok, false, 'o commit na main devia ser recusado');
    assert.match(naMain.saida, /confere-ramo/);
    assert.match(naMain.saida, /git switch -c pr\/<assunto-em-kebab>/);

    // o --no-verify já não basta (o reference-transaction também recusa); a saída do usuário é sem os hooks
    assert.equal(git('commit', '-q', '--no-verify', '-m', 'raiz').ok, false, 'o --no-verify não pula o reference-transaction');
    assert.equal(git(...SEM_HOOKS, 'commit', '-q', '-m', 'raiz').ok, true, 'o usuário passa por cima com git -c core.hooksPath=');

    assert.equal(git('switch', '-q', '-c', 'pr/x').ok, true);
    escrever('a.txt', 'a\n');
    git('add', '-A');
    const noBranch = git('commit', '-q', '-m', 'a');
    assert.equal(noBranch.ok, true, noBranch.saida);

    assert.equal(git('switch', '-q', 'main').ok, true);
    escrever('b.txt', 'b\n');
    git('add', '-A');
    assert.equal(git(...SEM_HOOKS, 'commit', '-q', '-m', 'b').ok, true);
    const merge = git('merge', '--no-ff', '-m', 'junta', 'pr/x');
    assert.equal(merge.ok, false, 'o merge na main devia ser recusado');
    assert.match(merge.saida, /confere-ramo/);
    git('merge', '--abort');

    assert.equal(git('switch', '-q', '--detach').ok, true);
    escrever('c.txt', 'c\n');
    git('add', '-A');
    assert.equal(git('commit', '-q', '-m', 'c').ok, true, 'com o HEAD solto, deixa passar');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('quando o git falha, o confere-ramo nega: só o HEAD solto (status 1 do symbolic-ref) passa', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-ramo-falha-'));
  try {
    const r = spawnSync(process.execPath, [join(AQUI, 'confere-ramo.mjs')], {
      cwd: base,
      encoding: 'utf8',
      env: { ...process.env, GIT_DIR: join(base, 'nao-existe') },
    });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /confere-ramo/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
