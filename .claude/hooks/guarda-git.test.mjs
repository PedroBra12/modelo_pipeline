import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIGURE } from './config.mjs';
import { CONFIG_PADRAO, copiarHooks, escreverConfig } from './teste-apoio.mjs';

// A guarda calcula o PROJETO pela pasta do próprio arquivo: dentro de um worktree de agente ele cairia em
// .claude/worktrees/<x> e tudo seria negado. Por isso o teste monta um projeto de verdade numa pasta temporária
// (os hooks e o pipeline.json, com o repositorio acme/app, em <tmp>/.claude, e <tmp>/.git) e testa a cópia, de qualquer pasta que rode.
const PROJETO = realpathSync(mkdtempSync(join(tmpdir(), 'guarda-git-projeto-')));
const HOOKS = copiarHooks(PROJETO, CONFIG_PADRAO);
mkdirSync(join(PROJETO, '.git'));
process.on('exit', () => rmSync(PROJETO, { recursive: true, force: true }));
const { analisar, avaliar, avaliarEntrada, decisao } = await import(pathToFileURL(join(HOOKS, 'guarda-git.mjs')).href);

const bloqueia = [
  // forçar e apagar, em toda forma de escrever
  'git --no-pager push -f origin main',
  'git status; git push --force-with-lease',
  '& git push -uf origin main',
  'C:/Program\\ Files/Git/bin/git.exe push --force',
  "& 'C:\\Program Files\\Git\\cmd\\git.exe' push --force",
  'FOO=1 git push --force',
  'git commit -m x; if ($?) { git push --force }',
  '(git push --force)',
  '{ git push --force; }',
  'if true; then git push --force; fi',
  'git push origin +main',
  'git push origin "+main"',
  "git push origin ':feat/a'",
  'git push origin main "--force"',
  'foreach ($b in $branches) { git push origin "+$b" }',
  'git push origin :feat/a',
  'git push --delete origin feat/a',
  'git push --del origin feat/a',
  'git push --force-w origin main',
  'git push -d origin feat/a',
  'git push --mirror origin',
  'git push --prune origin',
  'git push --all origin',
  'git push --no-verify origin main',
  'git push origin feat/a \\\n--force-with-lease',
  'git push origin feat/a `\n--force-with-lease',
  'git branch -r --merged | xargs -n1 git push origin --delete',
  'timeout 60 git push --force',
  'cmd /c git push --force origin main',
  'cmd /c "git push --force origin main"',
  'bash -c "cd ../outro-projeto && git push"',
  "pwsh -Command 'git push -f origin main'",
  'pwsh -EncodedCommand ZwBpAHQAIABwAHUAcwBoAA==',
  // outro destino ou outra pasta
  'git push outro main',
  'git push https://github.com/a/b.git main',
  'git push --repo=outro',
  'git -C . push origin main',
  'git -C ../outro-projeto push origin main',
  'git --git-dir=../x/.git push',
  'GIT_DIR=../x/.git git push',
  'cd ../outro-projeto && git push',
  'Set-Location ..\\outro-projeto; git push origin main',
  'git -c remote.origin.url=https://example.com/x.git push',
  'git -c "remote.origin.url=https://example.com/x.git" push',
  'git --config-env=remote.origin.url=VAR push',
  'git remote add origin https://example.com/x.git',
  'git remote add outro https://github.com/acme/app.git',
  'git remote -v set-url origin x',
  'git remote set-url origin https://github.com/a/b.git',
  'git remote rename origin x',
  'git config remote.origin.url https://example.com/x.git',
  'git config url.https://example.com/.insteadOf https://github.com/',
  'git config branch.main.remote outro',
  'git config alias.sobe "push --force"',
  'git send-pack https://example.com/x.git main',
  'git subtree push --prefix apps https://example.com/x.git main',
  // o token
  'gh auth token',
  'gh auth status -t',
  'gh auth status --show-token',
  'git credential fill',
  'git credential-manager get',
  // o PR e o gh que escreve
  'gh pr merge 3',
  'gh pr merge 3 --merge',
  'gh pr merge 3 -m --subject x',
  'gh pr create --fill',
  'gh pr create --draft=false --fill',
  'gh pr create --draft=0 --fill',
  'gh pr create --draft=f --fill',
  'gh pr create --draft=maybe --fill',
  'gh pr create --draft= --fill',
  'gh pr create --draft --draft=false --fill',
  'gh pr create -d=false --fill',
  'gh pr create -d=2 --fill',
  'gh pr create -R acme/app --base main --fill',
  'gh pr create --title --draft',
  'gh pr merge 3 --squash',
  'gh pr merge 3 --rebase',
  'gh pr merge 3 --merge --admin',
  'gh pr merge 3 --merge --delete-branch',
  'gh pr merge 3 -md',
  'gh pr merge 3 --merge -R a/b',
  'gh pr review https://github.com/a/b/pull/3 --approve',
  'gh -R acme/outro-repo pr merge 7 --merge',
  'gh --repo=x/y release create v1',
  'gh pr review 7 -aR acme/outro-repo',
  'gh pr merge 7 -mR acme/outro-repo',
  'gh pr merge 7 --merge -R acme/app -R outro/repo',
  'gh pr merge 3 --merge --admin=true',
  'gh pr merge 3 --merge --delete-branch=true',
  'gh pr merge 3 --merge -d=1',
  'gh pr merge 3 -tm --squash=true',
  'gh pr merge 3 -tm',
  'gh pr create -R a/b --fill',
  'gh pr create --repo=a/b --fill',
  'gh pr create -Ra/b --fill',
  'gh pr create -R=a/b --fill',
  'GH_REPO=a/b gh pr create --fill',
  "$env:GH_REPO='a/b'; gh pr comment 3 --body oi",
  "$env:gh_repo='a/b'; gh pr create --fill",
  'gh pr comment https://github.com/acme/outro-repo/pull/7 --body oi',
  'gh alias set junta "pr merge"',
  'glab mr create',
  'gh issue comment 3 --body oi',
  'gh repo delete acme/app',
  'gh api repos/a/b/issues -f title=t',
  'gh api -X POST /repos/a/b/pulls',
  'gh api -XPUT repos/acme/app/pulls/3/merge',
  'gh api -X=DELETE repos/acme/app/git/refs/heads/main',
  'gh api graphql -fquery=x',
  'gh api --method=PATCH /x',
  'npm publish',
  // os hooks do git
  'git commit --no-verify -m x',
  'git commit --no-verif -m x',
  'git commit -nm x',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git config --unset core.hooksPath',
  'git config core.hooksPath outro',
  'git config core.hooksPath ""',
  'git config --remove-section core',
  'git config --rename-section core outra',
  'git config --unset-all core.hooksPath .claude/hooks/git',
  'git config --replace-all core.hooksPath .claude/hooks/git',
  'git config --add core.hooksPath .claude/hooks/git',
  "git config core.hooksPath ''",
  // o ambiente e o include da configuração desviam os hooks sem tocar no core.hooksPath (em qualquer comando, não só no que sobe)
  'GIT_CONFIG_COUNT=1 git commit -m x',
  'GIT_CONFIG_GLOBAL=/tmp/x git commit -m x',
  'GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
  'git_config_count=1 git status',
  'NODE_OPTIONS=--require=./x.js git commit -m x',
  "export NODE_OPTIONS='--require ./x.js'; git commit -m x",
  '$env:NODE_OPTIONS="--require ./x.js"; git commit -m x',
  'cd . && NODE_OPTIONS=--import=./x.mjs git status',
  'bash -c "NODE_OPTIONS=--require=./x.js git commit -m x"',
  'git -c include.path=/tmp/x commit -m x',
  'git -c includeIf.gitdir:/p/.path=/tmp/x commit -m x',
  'git -c "include.path=/tmp/x" status',
  'git config include.path /tmp/x',
  'git config includeIf.gitdir:/p/.path /tmp/x',
  'git config --global include.path /tmp/x',
  // só o nome, sem o "=": o PowerShell e o env mudam a variável sem escrevê-la como VAR=valor
  'Set-Item env:NODE_OPTIONS "--require ./x.js"',
  'Set-Item -Path Env:NODE_OPTIONS -Value "--require ./x.js"; git commit -m x',
  'Set-Item env:GIT_CONFIG_COUNT 1',
  'Set-Item -Path env:GIT_CONFIG_GLOBAL -Value /tmp/x',
  'New-Item -Path Env:NODE_OPTIONS -Value "--require ./x.js"',
  '[Environment]::SetEnvironmentVariable("NODE_OPTIONS", "--require ./x.js")',
  "[System.Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT', '1')",
  '$env:node_options = "--require ./x.js"',
  'env NODE_OPTIONS=--require=./x.js git commit -m x',
  'export GIT_CONFIG_PARAMETERS="x"',
  'setx NODE_OPTIONS "--require ./x.js"',
];

const libera = [
  'GIT_AUTHOR_NAME=x git commit -m x',
  'git config --get include.path',
  'git -c user.name=x -c core.autocrlf=false commit -m y',
  'git config user.name x',
  'git push',
  'git push origin main',
  'git push -u origin main',
  "git push 'origin' main",
  'git push origin feat/a feat/b',
  'git push origin HEAD:refs/heads/feat/a',
  'git push --dry-run origin main',
  'git commit -m x && git push origin main',
  'git remote add origin https://github.com/acme/app.git',
  'git remote add origin git@github.com:acme/app.git',
  'git remote set-url origin https://github.com/acme/app',
  'gh pr create --draft --fill',
  'gh pr create --draft=true --fill',
  'gh pr create --draft=1 --fill',
  'gh pr create --draft=t --fill',
  'gh pr create --draft=TRUE --fill',
  'gh pr create --draft=false --draft --fill',
  'gh pr create -d=true --fill',
  'gh pr create -d=1 --fill',
  'gh pr create -d --fill',
  'gh pr create -df',
  'gh pr create --fill -fd',
  'gh pr create -R acme/app --base main --draft --fill',
  'gh pr edit 3 --title x',
  'gh pr ready 3',
  'gh pr review 3 --approve',
  'gh --version',
  'gh pr comment 3 --body oi',
  'gh pr comment https://github.com/acme/app/pull/7 --body oi',
  'bash -c "npm test"',
  'gh auth status',
  'git commit -m "x"',
  'git -c user.name=x commit -am y',
  'cd apps && git commit -am x',
  '"C:/Program Files/Git/bin/git.exe" commit -m x',
  'git status',
  'git log --oneline -5',
  'git diff --stat',
  'git remote -v',
  'git worktree add ../agente-a -b agente-a',
  'git clone --depth 1 https://github.com/a/b',
  'rg "git push --force" docs/',
  "grep -n 'git push --force' CLAUDE.md",
  'echo "a; git push --force"',
  "cat <<'EOF' > nota.md\ngit push --force origin main\nEOF",
  'gh pr view 1',
  'gh pr list --state all',
  'gh api repos/a/b',
  'gh api -X GET /repos/a/b',
  'npm test',
  'npm run checar:rapido',
  'git config --get core.hooksPath',
  'git config core.hooksPath',
  'git config --get remote.origin.url',
  'git config remote.origin.url',
  'git config get remote.origin.url',
  'git config core.hooksPath .claude/hooks/git',
  'git config user.name x',
  'git commit --amend --no-edit',
];

for (const c of bloqueia) test(`bloqueia: ${c}`, () => assert.notEqual(avaliar(c), null));
for (const c of libera) test(`libera: ${c}`, () => assert.equal(avaliar(c), null));

test('o push e o PR saem só da pasta do projeto, fora dos worktrees de agente', () => {
  for (const c of ['git push origin main', 'gh pr create --draft --fill']) {
    assert.equal(avaliarEntrada(c, PROJETO), null);
    assert.equal(avaliarEntrada(c, join(PROJETO, 'apps', 'api')), null);
    assert.notEqual(avaliarEntrada(c, join(PROJETO, '..', 'outro-projeto')), null);
    assert.notEqual(avaliarEntrada(c, join(PROJETO, '.claude', 'worktrees', 'agent-x')), null);
    assert.notEqual(avaliarEntrada(c, undefined), null);
  }
  assert.equal(avaliarEntrada('git status', join(PROJETO, '..', 'outro-projeto')), null);
});

test('o push e o PR não saem de outro repositório dentro da pasta do projeto (um clone)', () => {
  const cache = join(PROJETO, 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const clone = mkdtempSync(join(cache, 'guarda-git-clone-'));
  try {
    mkdirSync(join(clone, '.git'));
    assert.notEqual(avaliarEntrada('git push origin main', clone), null);
    assert.notEqual(avaliarEntrada('gh pr create --draft --fill', join(clone, '.git')), null);
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
});

test('o projeto que é ele mesmo um worktree (.git em arquivo) sobe; um worktree dentro dele não', async () => {
  const arvore = realpathSync(mkdtempSync(join(tmpdir(), 'guarda-git-wt-')));
  try {
    const hooks = copiarHooks(arvore, CONFIG_PADRAO);
    writeFileSync(join(arvore, '.git'), 'gitdir: C:/repo/.git/worktrees/wt\n');
    const guarda = await import(pathToFileURL(join(hooks, 'guarda-git.mjs')).href);
    for (const c of ['git push -u origin pr/x', 'gh pr create --draft --fill']) {
      assert.equal(guarda.avaliarEntrada(c, arvore), null);
      assert.equal(guarda.avaliarEntrada(c, join(arvore, 'src', 'api')), null);
    }
    const dentro = join(arvore, 'outro');
    mkdirSync(dentro);
    writeFileSync(join(dentro, '.git'), 'gitdir: C:/repo/.git/worktrees/outro\n');
    assert.notEqual(guarda.avaliarEntrada('git push origin main', dentro), null);
    assert.notEqual(guarda.avaliarEntrada('git push origin main', join(arvore, '.claude', 'worktrees', 'agent-x')), null);
  } finally {
    rmSync(arvore, { recursive: true, force: true });
  }
});

test('reconhece o que sobe para o GitHub', () => {
  assert.deepEqual(analisar('git commit -m "x"'), { proibido: null, sobe: false });
  assert.deepEqual(analisar('git push origin main'), { proibido: null, sobe: true });
  assert.equal(analisar('gh pr create --draft --fill').sobe, true);
  assert.equal(analisar('echo "git push"').sobe, false);
});

test('decisao: nega o proibido, pede a confirmação do que sobe e deixa o resto', () => {
  const sobe = 'confirme o comando: push ou PR';
  assert.deepEqual(decisao('git push origin main', PROJETO), { decisao: 'ask', motivo: sobe }, 'a guarda não olha a ref: quem nega a main é o pre-push');
  assert.deepEqual(decisao('git push origin pr/x', PROJETO), { decisao: 'ask', motivo: sobe });
  assert.deepEqual(decisao('gh pr create --draft --fill', PROJETO), { decisao: 'ask', motivo: sobe });
  assert.deepEqual(decisao('gh pr ready 3', PROJETO), { decisao: 'ask', motivo: sobe });
  assert.deepEqual(decisao('git status', PROJETO), { decisao: null, motivo: null });
  assert.deepEqual(decisao('gh pr view 3', PROJETO), { decisao: null, motivo: null });
  assert.equal(decisao('git push --force', PROJETO).decisao, 'deny');
  assert.equal(decisao('gh pr merge 3 --merge', PROJETO).decisao, 'deny');
  assert.match(decisao('gh pr create --fill', PROJETO).motivo, /sem --draft/);
  assert.equal(decisao('git push origin pr/x', join(PROJETO, '.claude', 'worktrees', 'agent-x')).decisao, 'deny', 'o negado vence o que só pede');
});

test('o hook de ponta a ponta: pede a confirmação do push, nega o merge, e o que não sobe não tem saída', () => {
  const hook = (command, cwd = PROJETO, ambiente = {}) => {
    const r = spawnSync(process.execPath, [join(HOOKS, 'guarda-git.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
      encoding: 'utf8',
      env: { ...process.env, ...ambiente },
    });
    return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
  };
  const sobe = hook('git push origin pr/x');
  assert.equal(sobe?.permissionDecision, 'ask');
  assert.match(sobe.permissionDecisionReason, /confirme o comando: push ou PR/);
  assert.doesNotMatch(sobe.permissionDecisionReason, /peça para ele rodar/, 'o texto do ask é curto');
  assert.equal(hook('gh pr create --draft --fill')?.permissionDecision, 'ask');
  const merge = hook('gh pr merge 3');
  assert.equal(merge?.permissionDecision, 'deny');
  assert.match(merge.permissionDecisionReason, /peça para ele rodar o comando com "!"/, 'o deny manda o usuário rodar com !');
  assert.equal(hook('gh pr create --fill')?.permissionDecision, 'deny');
  assert.equal(hook('git status'), null);
  assert.equal(hook('git push --force')?.permissionDecision, 'deny');
  assert.equal(hook('git push --force', PROJETO, { PIPELINE_GUARDA_GIT: 'perguntar' })?.permissionDecision, 'ask', 'o modo perguntar');
  assert.equal(hook('git push --force', PROJETO, { PIPELINE_GUARDA_GIT: 'desligado' }), null, 'o modo desligado');
});

/** Roda `fn` com o pipeline.json do projeto de teste trocado por `config`, e o devolve ao padrão no fim. */
function comConfig(config, fn) {
  escreverConfig(PROJETO, config);
  try {
    fn();
  } finally {
    escreverConfig(PROJETO, CONFIG_PADRAO);
  }
}

const SOBE = [
  'git push origin pr/x',
  'git push',
  'git remote add origin https://github.com/acme/app.git',
  'git remote set-url origin https://github.com/acme/app',
  'gh pr create --draft --fill',
  'gh pr comment 3 --body oi',
  'gh pr ready 3',
  'gh pr edit 3 --title x',
  'bash -c "git push origin pr/x"',
];

test('repositorio no marcador <dono>/<repo>, ausente, inválido ou arquivo ilegível: push, remote add/set-url e escrita em PR são negados com a mensagem de configurar', () => {
  const configs = [
    { ...CONFIG_PADRAO, repositorio: '<dono>/<repo>' },
    { portaoRapido: 'checar:rapido', pastasDeTrabalho: ['^src(?=/)'] },
    { ...CONFIG_PADRAO, repositorio: 'https://github.com/acme/app' },
    { ...CONFIG_PADRAO, repositorio: '' },
    '{ não é json',
  ];
  for (const config of configs) {
    comConfig(config, () => {
      for (const comando of SOBE) {
        assert.ok(avaliar(comando)?.startsWith(CONFIGURE), `${JSON.stringify(config)}: ${comando}`);
        const d = decisao(comando, PROJETO);
        assert.equal(d.decisao, 'deny', comando);
        assert.match(d.motivo, /configure o repositorio em \.claude\/pipeline\.json/);
      }
      // o que não sobe nada continua livre, e o que é proibido de qualquer jeito continua com o motivo dele
      for (const comando of ['git status', 'git commit -m x', 'git log --oneline', 'gh pr view 1', 'gh pr list', 'npm test']) assert.equal(avaliar(comando), null, comando);
      assert.match(avaliar('gh pr merge 3') ?? '', /gh pr merge/);
      assert.match(avaliar('git push --force') ?? '', /git push --force/);
    });
  }
});

test('repositorio configurado: libera o que sobe para o origin e nega o remoto e o PR de outro repositório', () => {
  comConfig({ ...CONFIG_PADRAO, repositorio: 'Outra-Conta/api.v2' }, () => {
    for (const comando of [
      'git push origin pr/x',
      'git remote add origin https://github.com/outra-conta/api.v2.git',
      'git remote add origin git@github.com:Outra-Conta/api.v2.git',
      'gh pr create -R Outra-Conta/api.v2 --draft --fill',
      'gh pr comment https://github.com/Outra-Conta/api.v2/pull/7 --body oi',
    ]) assert.equal(avaliar(comando), null, comando);
    for (const comando of [
      'git remote add origin https://github.com/acme/app.git',
      'git remote add origin https://github.com/outra-conta/apiXv2.git',
      'gh pr create -R acme/app --draft --fill',
      'gh pr comment https://github.com/acme/app/pull/7 --body oi',
      'gh pr create --draft --fill -R outra-conta/api.v2x',
    ]) assert.notEqual(avaliar(comando), null, comando);
  });
});

test('o hook de ponta a ponta com o repositorio no marcador: nega com a mensagem curta de configurar, sem o "peça para ele rodar com !"', () => {
  comConfig({ ...CONFIG_PADRAO, repositorio: '<dono>/<repo>' }, () => {
    const r = spawnSync(process.execPath, [join(HOOKS, 'guarda-git.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin pr/x' }, cwd: PROJETO }),
      encoding: 'utf8',
      env: { ...process.env, PIPELINE_GUARDA_GIT: 'perguntar' },
    });
    const saida = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(saida.permissionDecision, 'deny', 'mesmo no modo perguntar: sem repositório, não há o que confirmar');
    assert.match(saida.permissionDecisionReason, /configure o repositorio em \.claude\/pipeline\.json/);
    assert.doesNotMatch(saida.permissionDecisionReason, /peça para ele rodar/);
  });
});
