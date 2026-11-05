// A guarda-pasta-agentes (D8.7): o subagente, que a entrada do hook marca com agent_id, não edita .claude/agents/ pelas
// ferramentas de edição. O orquestrador (sem agent_id) edita. Funções puras e o hook de ponta a ponta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = join(AQUI, 'guarda-pasta-agentes.mjs');
const { motivoDaEntrada, ehSubagente } = await import(pathToFileURL(HOOK).href);
const CWD = resolve(AQUI, '..', '..');
const WORKTREE = join(CWD, '.claude', 'worktrees', 'agent-abc123');

const nega = [
  '.claude/agents/desenvolvedor.md',
  '.claude/agents/qa.md',
  '.claude/agents/novo.md',
  '.claude/agents/sub/x.md',
  '.claude/agents',
  '.claude/agents/',
  './.claude/agents/x.md',
  'sub/../.claude/agents/x.md',
  '.CLAUDE/AGENTS/x.md',
  '.Claude/Agents/Desenvolvedor.md',
  '.claude/./agents/x.md',
  '.claude//agents/x.md',
  '.claude\\agents\\x.md',
  '.claude./agents/x.md',
  '.claude /agents /x.md',
  'CLAUDE~1/agents/x.md',
  'apps/api/.claude/agents/x.md',
  '../outro/.claude/agents/x.md',
  join(CWD, '.claude', 'agents', 'desenvolvedor.md'),
  join(WORKTREE, '.claude', 'agents', 'desenvolvedor.md'),
  join(CWD, '.claude', 'worktrees', 'a', '.claude', 'worktrees', 'b', '.claude', 'agents', 'x.md'),
  'C:\\proj\\.claude\\agents\\x.md',
];
const libera = [
  'README.md',
  '.claude/hooks/guarda-git.mjs',
  '.claude/settings.json',
  '.claude/skills/pipeline/feature.md',
  '.claude/pipeline.json',
  '.claude/worktrees/agent-abc123/src/x.ts',
  'agents/x.md',
  '.claude/agents-antigos/x.md',
  '.claude/agentes/x.md',
  '.claudeX/agents/x.md',
  'docs/.claude-agents.md',
  'agents/.claude/x.md',
  join(CWD, 'docs', 'agents', 'x.md'),
];

for (const c of nega) test(`subagente nega: ${c}`, () => assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: c } }), null));
for (const c of libera) test(`subagente libera: ${c}`, () => assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: c } }), null));
for (const c of nega) test(`sem agent_id (o orquestrador) libera: ${c}`, () => assert.equal(motivoDaEntrada({ cwd: CWD, tool_input: { file_path: c } }), null));

test('o motivo diz D8; o notebook_path vale como o file_path', () => {
  assert.match(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: '.claude/agents/x.md' } }), /subagente não edita `\.claude\/agents\/` \(D8\)/);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { notebook_path: '.claude/agents/x.ipynb' } }), null);
});

test('o caminho relativo vale a partir do cwd da entrada, inclusive o de dentro de um worktree', () => {
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: join(CWD, '.claude'), tool_input: { file_path: 'agents/x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: join(CWD, '.claude', 'agents'), tool_input: { file_path: 'x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { file_path: '.claude/agents/x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: join(WORKTREE, 'src'), tool_input: { file_path: '../.claude/agents/x.md' } }), null);
  assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: 'x.md' } }), null);
});

test('com agent_id e sem caminho legível, nega; sem agent_id, passa', () => {
  for (const c of [undefined, null, '', '  ', 42, {}, []]) {
    assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: c } }), null, JSON.stringify(c));
    assert.equal(motivoDaEntrada({ cwd: CWD, tool_input: { file_path: c } }), null, `sem agent_id: ${JSON.stringify(c)}`);
  }
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD }), null, 'sem tool_input');
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: null }), null);
});

test('agent_id só vale como texto não vazio (o mesmo critério da guarda-agentes)', () => {
  for (const id of ['a1', ' a1 ', 'x']) assert.equal(ehSubagente({ agent_id: id }), true, id);
  for (const id of ['', '  ', null, undefined, 7, {}, []]) assert.equal(ehSubagente({ agent_id: id }), false, JSON.stringify(id));
  assert.equal(ehSubagente(undefined), false);
  assert.equal(ehSubagente(null), false);
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

test('o hook de ponta a ponta: o subagente é negado nas quatro ferramentas, no formato das outras guardas; o orquestrador e o resto passam', () => {
  const alvos = [
    ['Edit', { file_path: '.claude/agents/desenvolvedor.md', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: join(WORKTREE, '.claude', 'agents', 'qa.md'), content: 'x' }],
    ['MultiEdit', { file_path: '.claude/agents/qa.md', edits: [] }],
    ['NotebookEdit', { notebook_path: '.claude/agents/x.ipynb', new_source: 'x' }],
  ];
  for (const [tool_name, tool_input] of alvos) {
    const saida = hook({ tool_name, tool_input, cwd: CWD, agent_id: 'a1' });
    assert.equal(saida?.hookEventName, 'PreToolUse', tool_name);
    assert.equal(saida.permissionDecision, 'deny', tool_name);
    assert.match(saida.permissionDecisionReason, /subagente não edita `\.claude\/agents\/` \(D8\)/, tool_name);
    assert.equal(hook({ tool_name, tool_input, cwd: CWD }), null, `${tool_name} sem agent_id`);
  }
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'README.md' }, cwd: CWD, agent_id: 'a1' }), null);
});

test('o hook: entrada ilegível ou subagente sem caminho nega; o orquestrador sem caminho passa; o modo da guarda-git não o desliga', () => {
  assert.equal(hook('{ não é json')?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: {}, cwd: CWD, agent_id: 'a1' })?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: {}, cwd: CWD }), null);
  const dentro = { tool_name: 'Write', tool_input: { file_path: '.claude/agents/x.md' }, cwd: CWD, agent_id: 'a1' };
  for (const modo of ['perguntar', 'desligado']) assert.equal(hook(dentro, { PIPELINE_GUARDA_GIT: modo })?.permissionDecision, 'deny', modo);
});
