// A guarda-pasta-agentes (D8.7, ampliada na D11): o subagente, que a entrada do hook marca com agent_id, não edita `.claude/` fora
// do próprio worktree (e nunca agents/, pipeline.json e settings*.json) pelas ferramentas de edição. O orquestrador (sem agent_id)
// edita. Funções puras e o hook de ponta a ponta. Os caminhos são de uma raiz inventada: o resultado não depende de onde os testes rodam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = join(AQUI, 'guarda-pasta-agentes.mjs');
const { motivoDaEntrada, ehSubagente } = await import(pathToFileURL(HOOK).href);
const CWD = '/proj-inventado';
const WORKTREE = `${CWD}/.claude/worktrees/agent-abc123`;
const OUTRO = `${CWD}/.claude/worktrees/agent-outro`;
const MOTIVO = /subagente não edita `\.claude\/` fora do próprio worktree \(D11\)/;

/** Caminhos que o subagente com cwd na raiz do projeto (fora de worktree) não edita: tudo sob `.claude/`. */
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
  `${CWD}/.claude/agents/desenvolvedor.md`,
  `${WORKTREE}/.claude/agents/desenvolvedor.md`,
  `${CWD}/.claude/worktrees/a/.claude/worktrees/b/.claude/agents/x.md`,
  'C:\\proj\\.claude\\agents\\x.md',
  // o que a D11 acrescenta: pipeline.json e settings*.json de qualquer .claude, e o resto de .claude/ fora do worktree
  '.claude/pipeline.json',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/settings-x.json',
  '.Claude/Pipeline.JSON',
  '.claude/pipeline.json::$DATA',
  '.claude/pipeline.json.',
  '.claude/PIPELI~1.JSO',
  '.claude/SETTIN~1.JSO',
  'apps/api/.claude/pipeline.json',
  `${WORKTREE}/.claude/pipeline.json`,
  `${WORKTREE}/.claude/settings.json`,
  `${WORKTREE}/.claude/settings.local.json`,
  `${OUTRO}/.claude/pipeline.json`,
  '.claude/hooks/guarda-git.mjs',
  '.claude/hooks/git/pre-commit',
  '.claude/skills/pipeline/SKILL.md',
  '.claude/commands/x.md',
  '.claude/estado/esforco',
  '.claude/x.json',
  `${CWD}/.claude/hooks/guarda-git.mjs`,
  `${OUTRO}/.claude/hooks/guarda-git.mjs`,
  `${OUTRO}/src/x.ts`,
  `${CWD}/.claude/worktrees/agent-abc123-outro/.claude/hooks/x.mjs`,
];
const libera = [
  'README.md',
  'src/x.ts',
  'apps/web/app/page.tsx',
  'docs/x.md',
  'agents/x.md',
  'claude/agents-antigos/x.md',
  '.claudeX/agents/x.md',
  'docs/.claude-agents.md',
  'agents/claude/x.md',
  'pipeline.json',
  'src/settings.json',
  `${CWD}/docs/agents/x.md`,
  `${CWD}/docs/pipeline.json`,
];
for (const c of nega) test(`subagente na raiz do projeto nega: ${c}`, () => assert.match(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: c } }) ?? '', MOTIVO));
for (const c of libera) test(`subagente na raiz do projeto libera: ${c}`, () => assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: c } }), null));
for (const c of nega) test(`sem agent_id (o orquestrador) libera: ${c}`, () => assert.equal(motivoDaEntrada({ cwd: CWD, tool_input: { file_path: c } }), null));

/** O que o desenvolvedor edita no próprio worktree (cwd nele): o código e o que fica sob `.claude/`, menos agents, pipeline.json e settings. */
const naoNegaNoWorktree = [
  'src/x.ts',
  'apps/web/app/page.tsx',
  '.claude/hooks/guarda-git.mjs',
  '.claude/hooks/AGENTS.md',
  '.claude/hooks/git/pre-commit',
  '.claude/skills/pipeline/SKILL.md',
  '.claude/commands/x.md',
  '.claude/estado/esforco',
  `${WORKTREE}/.claude/hooks/guarda-git.mjs`,
  `${WORKTREE}/src/x.ts`,
  '../agent-abc123/.claude/hooks/x.mjs',
];
const negaNoWorktree = [
  '.claude/agents/desenvolvedor.md',
  '.claude/pipeline.json',
  '.claude/settings.json',
  '.claude/settings.local.json',
  `${WORKTREE}/.claude/pipeline.json`,
  `${WORKTREE}/.claude/agents/qa.md`,
  `${CWD}/.claude/hooks/guarda-git.mjs`,
  `${CWD}/.claude/pipeline.json`,
  `${CWD}/.claude/skills/pipeline/SKILL.md`,
  `${OUTRO}/.claude/hooks/guarda-git.mjs`,
  `${OUTRO}/src/x.ts`,
  '../agent-outro/.claude/hooks/x.mjs',
  '../../hooks/x.mjs',
  '../../../.claude/hooks/x.mjs',
  '.claude/../../../hooks/x.mjs',
  `${WORKTREE}/../../hooks/x.mjs`,
  `${CWD}/.claude/estado/esforco`,
  `${WORKTREE}-2/.claude/hooks/x.mjs`,
];
for (const c of naoNegaNoWorktree) test(`subagente com cwd no worktree libera: ${c}`, () => assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { file_path: c } }), null));
for (const c of negaNoWorktree) test(`subagente com cwd no worktree nega: ${c}`, () => assert.match(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { file_path: c } }) ?? '', MOTIVO));

test('o cwd numa subpasta do worktree vale como o worktree; o worktree mais fundo é o que conta; o outro nunca', () => {
  const sub = { agent_id: 'a1', cwd: `${WORKTREE}/apps/web` };
  assert.equal(motivoDaEntrada({ ...sub, tool_input: { file_path: '../../.claude/hooks/x.mjs' } }), null);
  assert.equal(motivoDaEntrada({ ...sub, tool_input: { file_path: 'x.tsx' } }), null);
  assert.notEqual(motivoDaEntrada({ ...sub, tool_input: { file_path: '../../.claude/pipeline.json' } }), null);
  assert.notEqual(motivoDaEntrada({ ...sub, tool_input: { file_path: `${CWD}/.claude/hooks/x.mjs` } }), null);
  const aninhado = { agent_id: 'a1', cwd: `${WORKTREE}/.claude/worktrees/interno` };
  assert.equal(motivoDaEntrada({ ...aninhado, tool_input: { file_path: '.claude/hooks/x.mjs' } }), null, 'o worktree interno é o do cwd');
  assert.notEqual(motivoDaEntrada({ ...aninhado, tool_input: { file_path: `${WORKTREE}/.claude/hooks/x.mjs` } }), null, 'o externo já não é o do cwd');
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: `${WORKTREE}/.claude/hooks/x.mjs` } }), null, 'sem worktree no cwd, nada de .claude/');
});

test('o motivo diz D11; o notebook_path vale como o file_path', () => {
  assert.match(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: '.claude/agents/x.md' } }), MOTIVO);
  assert.match(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { file_path: '.claude/pipeline.json' } }), MOTIVO);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: CWD, tool_input: { notebook_path: '.claude/agents/x.ipynb' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { notebook_path: '.claude/settings.json' } }), null);
  assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { notebook_path: '.claude/hooks/x.ipynb' } }), null);
});

test('o caminho relativo vale a partir do cwd da entrada, inclusive o de dentro de um worktree', () => {
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: `${CWD}/.claude`, tool_input: { file_path: 'agents/x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: `${CWD}/.claude/agents`, tool_input: { file_path: 'x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: WORKTREE, tool_input: { file_path: '.claude/agents/x.md' } }), null);
  assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: `${WORKTREE}/src`, tool_input: { file_path: '../.claude/agents/x.md' } }), null);
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
    ['Write', { file_path: `${WORKTREE}/.claude/agents/qa.md`, content: 'x' }],
    ['MultiEdit', { file_path: '.claude/agents/qa.md', edits: [] }],
    ['NotebookEdit', { notebook_path: '.claude/agents/x.ipynb', new_source: 'x' }],
  ];
  for (const [tool_name, tool_input] of alvos) {
    const saida = hook({ tool_name, tool_input, cwd: CWD, agent_id: 'a1' });
    assert.equal(saida?.hookEventName, 'PreToolUse', tool_name);
    assert.equal(saida.permissionDecision, 'deny', tool_name);
    assert.match(saida.permissionDecisionReason, MOTIVO, tool_name);
    assert.equal(hook({ tool_name, tool_input, cwd: CWD }), null, `${tool_name} sem agent_id`);
  }
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'README.md' }, cwd: CWD, agent_id: 'a1' }), null);
  // o desenvolvedor no próprio worktree: edita .claude/hooks/, não o pipeline.json nem o checkout vivo
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: `${WORKTREE}/.claude/hooks/x.mjs` }, cwd: WORKTREE, agent_id: 'a1' }), null);
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: `${WORKTREE}/.claude/pipeline.json` }, cwd: WORKTREE, agent_id: 'a1' })?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: `${CWD}/.claude/hooks/x.mjs` }, cwd: WORKTREE, agent_id: 'a1' })?.permissionDecision, 'deny');
});

test('o hook: entrada ilegível ou subagente sem caminho nega; o orquestrador sem caminho passa; o modo da guarda-git não o desliga', () => {
  assert.equal(hook('{ não é json')?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: {}, cwd: CWD, agent_id: 'a1' })?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: {}, cwd: CWD }), null);
  const dentro = { tool_name: 'Write', tool_input: { file_path: '.claude/agents/x.md' }, cwd: CWD, agent_id: 'a1' };
  for (const modo of ['perguntar', 'desligado']) assert.equal(hook(dentro, { PIPELINE_GUARDA_GIT: modo })?.permissionDecision, 'deny', modo);
});

// ---------- a falha aberta e o link simbólico (D8.7, correção) ----------

/** Uma pasta temporária com `lnk-hooks` (link para a pasta dos hooks) e `proj/lnk` (link para o `.claude` do projeto, que tem agents/). */
function comLinks(fn) {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'guarda-pasta-link-')));
  try {
    mkdirSync(join(raiz, 'proj', '.claude', 'agents'), { recursive: true });
    symlinkSync(AQUI, join(raiz, 'lnk-hooks'), 'junction');
    symlinkSync(join(raiz, 'proj', '.claude'), join(raiz, 'proj', 'lnk'), 'junction');
    fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test('o script chamado por um caminho com link simbólico (o /var do macOS) também age: o hook não fica mudo', () => {
  comLinks((raiz) => {
    const r = spawnSync(process.execPath, [join(raiz, 'lnk-hooks', 'guarda-pasta-agentes.mjs')], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/r/.claude/agents/x.md' }, cwd: '/r', agent_id: 'a1' }),
      encoding: 'utf8',
    });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
});

test('o link para a pasta .claude (ou para a de agentes) não esconde o alvo: vale o caminho de verdade do ancestral que existe', () => {
  comLinks((raiz) => {
    const proj = join(raiz, 'proj');
    for (const c of ['lnk/agents/desenvolvedor.md', 'lnk/agents/novo/x.md', join(proj, 'lnk', 'agents', 'qa.md'), 'lnk/../lnk/agents/x.md']) {
      assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: proj, tool_input: { file_path: c } }), null, c);
      assert.equal(motivoDaEntrada({ cwd: proj, tool_input: { file_path: c } }), null, `sem agent_id: ${c}`);
    }
    symlinkSync(join(proj, '.claude', 'agents'), join(proj, 'lnk-agentes'), 'junction');
    assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: proj, tool_input: { file_path: 'lnk-agentes/x.md' } }), null);
    symlinkSync(join(proj, '.claude', 'agents', 'ainda-nao-existe.md'), join(proj, 'ponta.md')); // o link que ainda não aponta para nada
    assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: proj, tool_input: { file_path: 'ponta.md' } }), null, 'link solto para dentro de agents/');
    assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: proj, tool_input: { file_path: 'lnk/skills/x.md' } }), null, 'o link para .claude, fora de agents/ e de worktree');
    const wt = join(proj, '.claude', 'worktrees', 'w');
    mkdirSync(wt, { recursive: true });
    symlinkSync(join(proj, '.claude'), join(wt, 'lnk-vivo'), 'junction'); // dentro do worktree, um link para o .claude do checkout vivo
    assert.notEqual(motivoDaEntrada({ agent_id: 'a1', cwd: wt, tool_input: { file_path: 'lnk-vivo/hooks/x.mjs' } }), null, 'o link de dentro do worktree para o checkout vivo');
    assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: wt, tool_input: { file_path: '.claude/hooks/x.mjs' } }), null, 'o próprio worktree, com o cwd real');
    assert.equal(motivoDaEntrada({ agent_id: 'a1', cwd: proj, tool_input: { file_path: 'src/novo/x.md' } }), null, 'caminho que ainda não existe, sem link');
  });
});

test('o hook como processo nega pelo link de verdade, no Edit e no Write', () => {
  comLinks((raiz) => {
    const proj = join(raiz, 'proj');
    for (const tool_name of ['Edit', 'Write']) {
      const saida = hook({ tool_name, tool_input: { file_path: join(proj, 'lnk', 'agents', 'desenvolvedor.md') }, cwd: proj, agent_id: 'a1' });
      assert.equal(saida?.permissionDecision, 'deny', tool_name);
    }
  });
});
