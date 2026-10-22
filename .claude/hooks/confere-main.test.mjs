// O confere-main como função e como hook reference-transaction num git de verdade: a main local só anda
// para um commit que o origin/main já tem, que é o que o git pull --ff-only faz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarMain } from './confere-main.mjs';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), 'git');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);

test('avaliarMain: só olha a main; apagar, commit fora do origin/main e origin/main ausente são negados', () => {
  const ancestral = () => true;
  const naoAncestral = () => false;
  assert.equal(avaliarMain([`${A} ${B} refs/heads/pr/x`], null, naoAncestral), null, 'outra ref não é da conta dele');
  assert.equal(avaliarMain([`${A} ${B} refs/heads/main`], B, naoAncestral), null, 'igual ao origin/main');
  assert.equal(avaliarMain([`${A} ${A} refs/heads/main`], null, naoAncestral), null, 'a main não muda (merge --abort, reset --hard HEAD)');
  assert.equal(avaliarMain([`${A} ${B} refs/heads/main`], A, ancestral), null, 'ancestral do origin/main');
  assert.match(avaliarMain([`${A} ${B} refs/heads/main`], A, naoAncestral) ?? '', /a main só anda pelo merge do PR no GitHub, trazido com git pull --ff-only/);
  assert.match(avaliarMain([`${A} ${ZERO} refs/heads/main`], A, ancestral) ?? '', /apagar a main/);
  assert.match(avaliarMain([`${ZERO} ${ZERO} refs/heads/main`], A, ancestral) ?? '', /apagar a main/, 'o git manda o antigo zerado ao apagar');
  assert.match(avaliarMain([`${ZERO} ${B} refs/heads/main`], null, ancestral) ?? '', /origin\/main/, 'sem origin/main, nega');
  assert.notEqual(avaliarMain([`${A} ${B} refs/heads/pr/x`, `${A} ${B} refs/heads/main`], A, naoAncestral), null);
  assert.notEqual(avaliarMain(['lixo'], A, ancestral), null, 'linha ilegível nega');
});

test('o hook reference-transaction no git de verdade: recusa a main fora do origin/main e deixa o pull --ff-only', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-main-git-'));
  const git = (pasta, ...args) => {
    const r = spawnSync('git', args, { cwd: pasta, encoding: 'utf8' });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  const configurar = (pasta, hooks) => {
    for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.autocrlf', 'false'], ...(hooks ? [['core.hooksPath', HOOKS]] : [])]) git(pasta, 'config', k, v);
  };
  const commit = (pasta, arquivo, msg) => {
    writeFileSync(join(pasta, arquivo), `${msg}\n`);
    git(pasta, 'add', '-A');
    return git(pasta, 'commit', '-q', '-m', msg);
  };
  try {
    // o repositório "do GitHub" (bare) e um clone sem hooks que semeia a main
    const remoto = join(base, 'remoto.git');
    const semente = join(base, 'semente');
    const repo = join(base, 'repo');
    git(base, 'init', '-q', '--bare', '-b', 'main', remoto);
    git(base, 'clone', '-q', remoto, semente);
    configurar(semente, false);
    assert.equal(commit(semente, 'README.md', 'a').ok, true);
    assert.equal(git(semente, 'push', '-q', 'origin', 'main').ok, true);
    // o repositório de trabalho, com os hooks do projeto ligados depois do clone
    assert.equal(git(base, 'clone', '-q', remoto, repo).ok, true);
    configurar(repo, true);

    assert.equal(git(repo, 'switch', '-q', '-c', 'pr/x').ok, true);
    const noBranch = commit(repo, 'b.txt', 'b');
    assert.equal(noBranch.ok, true, `o commit em pr/x não pode ser atrapalhado: ${noBranch.saida}`);
    const novo = git(repo, 'rev-parse', 'HEAD').saida.trim();

    const recusa = (r, o) => {
      assert.equal(r.ok, false, `${o} na main devia ser recusado: ${r.saida}`);
      assert.match(r.saida, /a main só anda pelo merge do PR no GitHub, trazido com git pull --ff-only/, o);
      // o git mexe na árvore antes de atualizar a ref: o que ficou pela metade se desfaz (o reset --hard HEAD não muda a main)
      git(repo, 'cherry-pick', '--abort');
      assert.equal(git(repo, 'reset', '-q', '--hard', 'HEAD').ok, true);
    };
    assert.equal(git(repo, 'switch', '-q', 'main').ok, true);
    recusa(git(repo, 'merge', '--ff-only', 'pr/x'), 'o merge ff');
    recusa(git(repo, 'cherry-pick', novo), 'o cherry-pick');
    git(repo, 'cherry-pick', '--abort');
    recusa(git(repo, 'reset', '-q', '--hard', 'pr/x'), 'o reset --hard');
    assert.equal(git(repo, 'switch', '-q', 'pr/x').ok, true);
    recusa(git(repo, 'branch', '-f', 'main', 'pr/x'), 'o branch -f');
    recusa(git(repo, 'update-ref', 'refs/heads/main', 'pr/x'), 'o update-ref');
    assert.match(git(repo, 'update-ref', '-d', 'refs/heads/main').saida, /apagar a main/, 'apagar a main');
    assert.equal(git(repo, 'rev-parse', '--verify', '-q', 'refs/heads/main').ok, true, 'a main continua lá');

    // a saída do usuário: sem os hooks
    assert.equal(git(repo, '-c', 'core.hooksPath=', 'branch', '-f', 'main', 'pr/x').ok, true, 'git -c core.hooksPath= passa');
    assert.equal(git(repo, '-c', 'core.hooksPath=', 'branch', '-f', 'main', 'origin/main').ok, true);

    // o caminho da: o remoto ganha um commit (o merge do PR) e o pull --ff-only o traz
    assert.equal(commit(semente, 'c.txt', 'c').ok, true);
    assert.equal(git(semente, 'push', '-q', 'origin', 'main').ok, true);
    assert.equal(git(repo, 'switch', '-q', 'main').ok, true);
    const pull = git(repo, 'pull', '--ff-only');
    assert.equal(pull.ok, true, `o pull --ff-only devia passar: ${pull.saida}`);
    assert.equal(git(repo, 'rev-parse', 'main').saida, git(repo, 'rev-parse', 'origin/main').saida);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
