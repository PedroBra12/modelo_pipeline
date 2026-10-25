import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = join(AQUI, 'guarda-git-arquivos.mjs');
const { motivoDoCaminho } = await import(pathToFileURL(HOOK).href);
const CWD = resolve(AQUI, '..', '..');

const nega = [
  '.git/config',
  '.git/hooks/pre-commit',
  '.git/config.worktree',
  '.git/info/exclude',
  '.git/worktrees/wt/config.worktree',
  '.git',
  '.git/',
  './.git/config',
  'sub/../.git/config',
  'apps/api/.git/hooks/pre-push',
  '.GIT/config',
  '.git./config',
  '.git /config',
  'GIT~1/config',
  join(CWD, '.git', 'hooks', 'pre-commit'),
  join(CWD, '.git'),
  '.git\\config',
  '.git\\hooks\\pre-commit',
  'C:\\proj\\.git\\hooks\\pre-commit',
];
const libera = [
  '.gitignore',
  '.gitattributes',
  '.github/workflows/ci.yml',
  '.claude/hooks/git/pre-commit',
  '.claude/hooks/guarda-git.mjs',
  'docs/git.md',
  'apps/api/.gitkeep',
  'gitconfig.md',
  join(CWD, 'README.md'),
];

for (const c of nega) test(`nega: ${c}`, () => assert.notEqual(motivoDoCaminho(c, CWD), null));
for (const c of libera) test(`libera: ${c}`, () => assert.equal(motivoDoCaminho(c, CWD), null));
test('sem caminho legível, nega (falha fechado)', () => {
  for (const c of [undefined, null, '', 42, {}]) assert.notEqual(motivoDoCaminho(c, CWD), null);
});

/** Roda o hook de verdade com a entrada que o Claude Code manda. */
function hook(entrada, ambiente = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    encoding: 'utf8',
    env: { ...process.env, ...ambiente },
  });
  return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
}

test('o hook de ponta a ponta: nega dentro de .git/ nas quatro ferramentas, no formato da guarda-git, e deixa o resto', () => {
  const alvos = [
    ['Edit', { file_path: '.git/config', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: join(CWD, '.git', 'hooks', 'pre-commit'), content: 'x' }],
    ['MultiEdit', { file_path: '.git/config.worktree', edits: [] }],
    ['NotebookEdit', { notebook_path: '.git/x.ipynb', new_source: 'x' }],
  ];
  for (const [tool_name, tool_input] of alvos) {
    const saida = hook({ tool_name, tool_input, cwd: CWD });
    assert.equal(saida?.hookEventName, 'PreToolUse', tool_name);
    assert.equal(saida.permissionDecision, 'deny', tool_name);
    assert.match(saida.permissionDecisionReason, /^Guarda de git do projeto: /);
  }
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'README.md' }, cwd: CWD }), null);
  assert.equal(hook({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'docs/a.ipynb' }, cwd: CWD }), null);
});

test('o caminho relativo vale a partir do cwd da entrada', () => {
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'config' }, cwd: join(CWD, '.git') })?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'config' }, cwd: CWD }), null);
});

test('entrada ilegível ou sem caminho: nega; modos perguntar e desligado como na guarda-git', () => {
  assert.equal(hook('{ não é json')?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: {}, cwd: CWD })?.permissionDecision, 'deny');
  const dentro = { tool_name: 'Write', tool_input: { file_path: '.git/config' }, cwd: CWD };
  assert.equal(hook(dentro, { PIPELINE_GUARDA_GIT: 'perguntar' })?.permissionDecision, 'ask');
  assert.equal(hook(dentro, { PIPELINE_GUARDA_GIT: 'desligado' }), null);
});
