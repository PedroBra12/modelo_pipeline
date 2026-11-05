// A guarda-git e o subagente (D8.7): com agent_id na entrada, toda menção a `.claude/agents` (sem diferença de caixa) fora de um
// segmento que só lê nega. Sem agent_id nada muda. Mesmo projeto temporário do guarda-git.test.mjs (a guarda acha o PROJETO pela pasta dela).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_PADRAO, copiarHooks } from './teste-apoio.mjs';

const PROJETO = realpathSync(mkdtempSync(join(tmpdir(), 'guarda-git-agentes-')));
const HOOKS = copiarHooks(PROJETO, CONFIG_PADRAO);
mkdirSync(join(PROJETO, '.git'));
process.on('exit', () => rmSync(PROJETO, { recursive: true, force: true }));
const { analisar, avaliarEntrada, decisao } = await import(pathToFileURL(join(HOOKS, 'guarda-git.mjs')).href);

const NEGA = [
  'echo x > .claude/agents/desenvolvedor.md',
  "sed -i 's/a/b/' .claude/agents/qa.md",
  'sed --in-place s/a/b/ .claude/agents/qa.md',
  'cp /tmp/x .claude/agents/desenvolvedor.md',
  'mv x .CLAUDE/AGENTS/y.md',
  'rm .claude/agents/qa.md',
  'git checkout main -- .claude/agents/qa.md',
  'git restore --source=main .claude/agents/qa.md',
  'git add .claude/agents/qa.md',
  'git commit -m x .claude/agents/qa.md',
  'git rm -q .claude/agents/qa.md',
  'ls .claude/agents',
  'tee .claude/agents/x.md < y',
  'cat y | tee .claude/agents/x.md',
  'cat .claude/agents/qa.md > x.md',
  'cat .claude/agents/qa.md | sh',
  'cat .claude/agents/qa.md; touch .claude/agents/x.md',
  "cat <<'EOF' > .claude/agents/x.md\nx\nEOF",
  'bash -c "echo x > .claude/agents/y"',
  "python -c \"open('.claude/agents/x.md','w')\"",
  'echo $(cat .claude/agents/qa.md)',
  'node -e "fs.writeFileSync(\'.claude\\\\agents\\\\x.md\', \'x\')"',
  'cp x .claude/./agents/y.md',
  'cp x .claude//agents/y.md',
  'cp x .claude/worktrees/agent-a/.claude/agents/y.md',
  'Set-Content -Path .claude\\agents\\x.md -Value x',
  'git config user.name .claude/agents/z.md',
  // a troca de pasta antes: o caminho relativo da pasta de agentes
  'cd .claude && sed -i s/a/b/ agents/qa.md',
  'git -C .claude checkout main -- agents/qa.md',
];
const LIBERA = [
  'cat .claude/agents/qa.md',
  'cat .CLAUDE/AGENTS/qa.md',
  'grep -n x .claude/agents/qa.md',
  'grep -rn x .claude/agents/',
  'rg x .claude/agents',
  'head -n 5 .claude/agents/qa.md',
  'tail -n 5 .claude/agents/qa.md',
  'wc -l .claude/agents/qa.md',
  'echo .claude/agents',
  'echo "relate: .claude/agents/qa.md"',
  'git log --oneline -- .claude/agents',
  'git diff main -- .claude/agents/qa.md',
  'git show main:.claude/agents/qa.md',
  'git --no-pager show HEAD:.claude/agents/qa.md | grep model',
  'git grep -n model -- .claude/agents',
  'git commit -m "docs: relata o que falta em .claude/agents/x.md"',
  "git commit -m 'relata .claude/agents'",
  'git commit -m "$(cat <<\'EOF\'\nrelata o .claude/agents/x.md\nEOF\n)"',
  // o que não é a pasta de agentes do projeto
  'node .claude/hooks/confere-lgpd.mjs apps/agents/x',
  'git add apps/agents/x.ts',
  'ls apps/agents',
  'cp x src/agents/y.ts',
  'echo x > docs/agents/y.md',
  'sed -i s/a/b/ .claude/hooks/guarda-git.mjs',
  'cp x .claude/agents-antigos/y.md',
  'npm test',
  'git status',
];

for (const c of NEGA) test(`subagente (agent_id) nega: ${c}`, () => assert.notEqual(avaliarEntrada(c, PROJETO, true), null));
for (const c of LIBERA) test(`subagente (agent_id) libera: ${c}`, () => assert.equal(avaliarEntrada(c, PROJETO, true), null));
for (const c of NEGA) test(`sem agent_id (o orquestrador) nada muda: ${c}`, () => assert.equal(avaliarEntrada(c, PROJETO), null));

test('o motivo cita .claude/agents e D8; analisar e decisao levam o mesmo sinal', () => {
  assert.match(avaliarEntrada('echo x > .claude/agents/qa.md', PROJETO, true), /\.claude\/agents.*D8/);
  assert.match(analisar('echo x > .claude/agents/qa.md', undefined, true).proibido, /\.claude\/agents.*D8/);
  assert.equal(analisar('echo x > .claude/agents/qa.md').proibido, null);
  assert.equal(decisao('cp x .claude/agents/y.md', PROJETO, true).decisao, 'deny');
  assert.deepEqual(decisao('cp x .claude/agents/y.md', PROJETO), { decisao: null, motivo: null });
  assert.deepEqual(decisao('cat .claude/agents/qa.md', PROJETO, true), { decisao: null, motivo: null });
});

test('o hook de ponta a ponta: o agent_id da entrada liga a regra, que vale também no modo perguntar; sem ele, o mesmo comando passa', () => {
  const hook = (entrada, ambiente = {}) => {
    const r = spawnSync(process.execPath, [join(HOOKS, 'guarda-git.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: PROJETO, ...entrada }),
      encoding: 'utf8',
      env: { ...process.env, ...ambiente },
    });
    return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
  };
  const tool_input = { command: 'cp /tmp/x .claude/agents/desenvolvedor.md' };
  const negado = hook({ tool_input, agent_id: 'a1' });
  assert.equal(negado?.permissionDecision, 'deny');
  assert.match(negado.permissionDecisionReason, /\.claude\/agents/);
  assert.equal(hook({ tool_input }), null, 'sem agent_id');
  assert.equal(hook({ tool_input, agent_id: '' }), null, 'agent_id vazio não é subagente');
  assert.equal(hook({ tool_input, agent_id: '  ' }), null, 'agent_id em branco não é subagente');
  assert.equal(hook({ tool_input, agent_id: 'a1', agent_type: 'desenvolvedor' }, { PIPELINE_GUARDA_GIT: 'perguntar' })?.permissionDecision, 'ask');
  assert.equal(hook({ tool_input, agent_id: 'a1' }, { PIPELINE_GUARDA_GIT: 'desligado' }), null, 'o modo desligado desliga a guarda inteira');
  assert.equal(hook({ tool_input: { command: 'cat .claude/agents/qa.md' }, agent_id: 'a1' }), null);
});
