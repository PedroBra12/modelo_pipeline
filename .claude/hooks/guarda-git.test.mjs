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
  // mudar o ambiente, de qualquer jeito: export/set/setx/env sem o "=", atribuição no PowerShell
  'export NODE_OPTIONS',
  'export -x GIT_CONFIG_COUNT',
  'set NODE_OPTIONS=--require=./x.js',
  'cmd /c "set GIT_CONFIG_COUNT=1 && git commit -m x"',
  '$env:GIT_CONFIG_COUNT = 1',
  "$env:NODE_OPTIONS='--require ./x.js'",
  'Set-Item -Path Env:GIT_CONFIG_KEY_0 -Value core.hooksPath',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
  // regra invertida: toda menção nega, menos no segmento cujo 1º programa só lê ou só tira. As formas que passaram nos relatórios:
  'Set-Item Env:\\NODE_OPTIONS "--require ./x.js"',
  'Set-Item -Path Env:\\GIT_CONFIG_COUNT -Value 1',
  'New-Item -Path Env:\\NODE_OPTIONS -Value "--require ./x.js"',
  '$env:NODE_OPTIONS+="--require ./x.js"',
  '$env:NODE_OPTIONS += " --require ./x.js"',
  '$env:GIT_CONFIG_COUNT+=1',
  '${env:NODE_OPTIONS}="--require ./x.js"',
  '${env:GIT_CONFIG_COUNT} = 1',
  'Set-Content env:NODE_OPTIONS "--require ./x.js"',
  'Set-Content -Path env:GIT_CONFIG_COUNT -Value 1',
  'Add-Content env:NODE_OPTIONS " --require ./x.js"',
  'Rename-Item env:FOO NODE_OPTIONS',
  'Rename-Item -Path env:NODE_OPTIONS -NewName FOO',
  'Copy-Item env:FOO env:NODE_OPTIONS',
  'Copy-Item -Path env:PATH -Destination env:GIT_CONFIG_COUNT',
  'Move-Item env:FOO env:NODE_OPTIONS',
  'Clear-Item env:NODE_OPTIONS; git commit -m x',
  'NODE_OPTIONS+=" --require ./x.js" git commit -m x',
  'NODE_OPTIONS+=" --require ./x.js"; export NODE_OPTIONS',
  'read NODE_OPTIONS',
  'read -r GIT_CONFIG_COUNT',
  'declare -x NODE_OPTIONS="--require ./x.js"',
  'declare -x GIT_CONFIG_COUNT=1',
  'typeset -x NODE_OPTIONS=x',
  'readonly NODE_OPTIONS=x',
  'printf "%s" x | read NODE_OPTIONS',
  // ler e depois mudar na mesma linha: o segmento que muda nega
  'echo $NODE_OPTIONS; export NODE_OPTIONS=x',
  'grep NODE_OPTIONS .env && NODE_OPTIONS=--require=./x.js git commit -m x',
  'cat .env | NODE_OPTIONS=x git commit -m x',
  'printenv NODE_OPTIONS || export NODE_OPTIONS=x',
  'echo ok\nexport GIT_CONFIG_COUNT=1',
  // a leitura que vira ordem: o que a leitura imprime vai para um shell, ou sai de uma substituição
  'echo "export NODE_OPTIONS=--require=./x.js" | sh',
  'cat envs.txt | grep NODE_OPTIONS | bash',
  'echo $(export NODE_OPTIONS=x)',
  'echo `export NODE_OPTIONS=x`',
  'eval "$(echo export NODE_OPTIONS=x)"',
  'env NODE_OPTIONS=x git commit -m x',
  'env -u FOO NODE_OPTIONS=x git commit -m x',
  'env -u NODE_OPTIONS GIT_CONFIG_COUNT=1 git commit -m x',
  // a leitura e a remoção de um dos nomes, mais a atribuição do outro, no mesmo segmento
  'unset NODE_OPTIONS; GIT_CONFIG_COUNT=1 git commit -m x',
  // PowerShell lido sem um programa de leitura da lista
  '$env:NODE_OPTIONS',
  // o += no push: GH_ e GIT_ também
  "$env:GH_REPO+='a/b'; gh pr comment 3 --body oi",
  'GIT_DIR+=../x/.git git push',
  'GH_REPO+=a/b gh pr create --draft --fill',
  "[Environment]::GetEnvironmentVariable('NODE_OPTIONS')",
];

const libera = [
  // as leituras e as remoções da lista passam, na ponta de qualquer pipeline
  'grep -rn NODE_OPTIONS .claude/hooks | head -5',
  'rg -n GIT_CONFIG .claude | wc -l',
  'cat .env | grep -c NODE_OPTIONS',
  'echo "$NODE_OPTIONS" && git status',
  'printenv GIT_CONFIG_COUNT; git log --oneline -3',
  'Select-String -Path .claude/hooks/*.mjs -Pattern NODE_OPTIONS',
  'Get-ChildItem Env:NODE_OPTIONS',
  'Get-ChildItem env: | Select-String GIT_CONFIG',
  'Get-Content .claude/hooks/guarda-git.mjs | Select-String NODE_OPTIONS',
  'Get-Item Env:\\NODE_OPTIONS',
  'Get-Item env:GIT_CONFIG_COUNT',
  'unset NODE_OPTIONS GIT_CONFIG_COUNT',
  'unset -v NODE_OPTIONS',
  'env -u NODE_OPTIONS -u GIT_CONFIG_COUNT git status',
  'env --unset=NODE_OPTIONS git status',
  'Remove-Item env:\\NODE_OPTIONS',
  'Remove-Item -Path Env:GIT_CONFIG_COUNT',
  'Write-Output $env:GIT_CONFIG_COUNT',
  'Write-Host $env:NODE_OPTIONS',
  'unset NODE_OPTIONS && export FOO=1',
  // ler ou tirar a variável passa: a guarda só nega quem muda o ambiente
  'grep -rn NODE_OPTIONS docs/',
  'rg GIT_CONFIG_COUNT .claude/hooks',
  'echo $NODE_OPTIONS',
  'echo "$GIT_CONFIG_COUNT"',
  'printenv NODE_OPTIONS',
  'cat .claude/hooks/guarda-git.mjs',
  'unset NODE_OPTIONS',
  'unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0',
  'env -u NODE_OPTIONS git status',
  'Remove-Item env:NODE_OPTIONS',
  'Remove-Item Env:GIT_CONFIG_COUNT',
  'Get-Item env:NODE_OPTIONS',
  'echo $env:NODE_OPTIONS',
  'Write-Output $env:GIT_CONFIG_COUNT',
  'set | grep NODE_OPTIONS',
  'export | grep GIT_CONFIG',
  'git config --get core.hooksPath',
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

// Os itens da rodada da guarda (D2 e D3 do autoajuste): cada grupo traz o que tem de negar e o que tem de passar.
const itens = {
  '1 separador &': {
    bloqueia: [
      'grep x f & export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null; git commit -m y',
      'echo ok & NODE_OPTIONS=--require=./x.js git commit -m x',
      'cat .env &export NODE_OPTIONS=x',
    ],
    libera: [
      'grep -rn NODE_OPTIONS docs/ 2>&1 | head -3',
      'echo $NODE_OPTIONS >&2',
      'grep -rn NODE_OPTIONS docs/ 2>/dev/null',
      'grep -rn NODE_OPTIONS docs/ &>/dev/null',
      'git status & grep -c NODE_OPTIONS .env',
    ],
  },
  '2 parêntese': {
    bloqueia: [
      'cat <(GIT_CONFIG_COUNT=1 git commit -m y)',
      'Write-Output (Set-Item env:GIT_CONFIG_COUNT 1)',
      'echo >(export NODE_OPTIONS=x)',
      'Write-Output @(Set-Item env:NODE_OPTIONS x)',
      'grep -rn NODE_OPTIONS $(pwd)',
      "awk 'BEGIN{system(\"export NODE_OPTIONS=x\")}'",
    ],
    libera: ['echo $NODE_OPTIONS'],
  },
  '3 configuração do git sem variável': {
    bloqueia: [
      "printf '[core]\\n\\thooksPath = x\\n' >> .git/config",
      "sed -i 's/^/hooksPath=x /' .git/config",
      'cp evil.cfg .git/hooks/pre-commit',
      'echo x > .git/hooks/pre-commit',
      'touch .git/config.worktree',
      'ln -s /dev/null .git/hooks/pre-commit',
      'mv .git/hooks .git/hooks.off',
      'python x.py .git/config',
      'Set-Content .git/config "[core]"',
      "printf 'hooksPath = x' | tee .git/config.worktree",
      'git config --file .git/config user.name y',
    ],
    libera: [
      'cat .git/config',
      'grep -n hooksPath .git/config',
      'head -n 20 .git/config',
      'Get-Content .git/config',
      'git log -S hooksPath --oneline',
      'git config --get core.hooksPath',
    ],
  },
  '4 redirecionamento': {
    bloqueia: [
      "echo 'export GIT_CONFIG_COUNT=1' >> ~/.bashrc",
      "cat >> ~/.bashrc <<'EOF'\nexport NODE_OPTIONS=--require=./x.js\nEOF",
      "cat > .git/config <<'EOF'\n[core]\n\thooksPath = x\nEOF",
      'cat <<EOF > ~/.profile\nNODE_OPTIONS=x\nEOF',
      "echo 'export NODE_OPTIONS=x' | tee -a ~/.bashrc",
      "Write-Output 'GIT_CONFIG_COUNT=1' | Add-Content $PROFILE",
      "echo NODE_OPTIONS=x | Out-File .env",
      'printenv NODE_OPTIONS > .env.local',
      'grep -rn NODE_OPTIONS docs/ >| out.txt',
      "python - <<'EOF'\nimport os; os.environ['NODE_OPTIONS'] = 'x'\nEOF",
    ],
    libera: [
      'grep -rn NODE_OPTIONS docs/ > /dev/null',
      'printenv NODE_OPTIONS 2>/dev/null',
      "cat <<'EOF'\nexport NODE_OPTIONS=x\nEOF",
      'Write-Output $env:NODE_OPTIONS > $null',
    ],
  },
  '6 leitura': {
    bloqueia: [
      'git commit -m "x"; export NODE_OPTIONS=x',
      'git commit -m "$(export NODE_OPTIONS=x)"',
      'git commit -m "ok" -m "$(export NODE_OPTIONS=x)"',
      'git commit -m "ok" && echo -m "export NODE_OPTIONS=1" >> ~/.bashrc',
      'git commit NODE_OPTIONS=y -m "ok"',
      "sed -i 's/^/NODE_OPTIONS=x /' f",
      "sed -ni '/x/p' .git/config",
      'sed --in-place s/a/b/ .git/config',
      'git diff --output=.git/config',
      'echo NODE_OPTIONS=x | xargs export',
      'echo NODE_OPTIONS=x | xargs sh -c',
      'find . | xargs -I{} env NODE_OPTIONS=x git commit -m x',
      'find . | xargs env NODE_OPTIONS=x git commit -m x',
    ],
    libera: [
      'git grep -n NODE_OPTIONS',
      'git log -S NODE_OPTIONS --oneline',
      'git -C . log -S hooksPath --oneline',
      'git --no-pager show HEAD:.claude/hooks/guarda-git.mjs | grep GIT_CONFIG',
      'git diff -G hooksPath',
      'head -n 5 .git/config',
      'tail -n 3 .git/config',
      "grep -E 'NODE_OPTIONS|GIT_CONFIG' .env",
      "find . -name '*.mjs' | xargs grep -n NODE_OPTIONS",
      "find . -name '*.mjs' | xargs -n1 rg GIT_CONFIG",
      "find . -name '*.mjs' -print0 | xargs -0 -I{} grep NODE_OPTIONS {}",
      'git commit -m "documenta o NODE_OPTIONS"',
      "git commit -am 'GIT_CONFIG vira outra coisa; hooksPath tambem'",
      'git commit --message="NODE_OPTIONS no .git/config"',
      'git commit -m "primeira" -m "NODE_OPTIONS e o eval do bash"',
      'git commit -m "$(cat <<\'EOF\'\nmenciona NODE_OPTIONS, hooksPath e .git/hooks\nEOF\n)"',
    ],
  },
};
for (const [item, { bloqueia: nega, libera: passa }] of Object.entries(itens)) {
  for (const c of nega) test(`[item ${item}] bloqueia: ${c}`, () => assert.notEqual(avaliar(c), null));
  for (const c of passa) test(`[item ${item}] libera: ${c}`, () => assert.equal(avaliar(c), null));
}

// Os cinco ajustes da rodada seguinte: cada um com o que tem de negar e o que tem de continuar passando.
const ajustes = {
  '1 awk, sed e rg --pre não são só leitura': {
    bloqueia: [
      "awk '/NODE_OPTIONS/' .env",
      "awk '/NODE_OPTIONS/ { print | \"sh\" }' .env",
      "sed -n '/GIT_CONFIG/p' .env",
      "sed -n '/NODE_OPTIONS/w out.txt' .env",
      'echo NODE_OPTIONS | sed s/a/b/',
      'rg --pre ./x.sh NODE_OPTIONS .',
      'rg --pre=./x.sh NODE_OPTIONS .',
      'rg --hostname-bin ./x.sh NODE_OPTIONS .',
      'find . | xargs rg --pre ./x.sh NODE_OPTIONS',
    ],
    libera: ['rg -n NODE_OPTIONS .claude', 'rg -n --glob *.mjs GIT_CONFIG .claude | head -3', 'grep -rn NODE_OPTIONS .claude'],
  },
  '2 git que lê não traz configuração nem programa': {
    bloqueia: [
      'git -c core.pager=sh log -S NODE_OPTIONS',
      'git -c core.pager=sh diff -G hooksPath',
      'git --config-env=core.pager=PAGER show HEAD -S hooksPath',
      'git --config-env core.pager=PAGER log -S hooksPath',
      'git grep -O ./x.sh NODE_OPTIONS',
      'git grep -Osh NODE_OPTIONS',
      'git grep --open-files-in-pager=sh NODE_OPTIONS',
      'git grep --open-files NODE_OPTIONS',
      'git diff --ext-diff -G hooksPath',
      'git log -p --ext-diff -S NODE_OPTIONS',
      'git diff --ext-di -G hooksPath',
      'git diff --outp=.git/config',
    ],
    libera: [
      'git -C . log -S hooksPath --oneline',
      'git log -c -S NODE_OPTIONS',
      'git diff --no-ext-diff -G hooksPath',
      'git grep -o -n NODE_OPTIONS',
      'git grep -n -e NODE_OPTIONS',
      'git log --oneline -S hooksPath',
      'git --no-pager diff -G hooksPath',
    ],
  },
  '3 a máscara da mensagem do commit': {
    bloqueia: [
      'python x.py git commit -m "NODE_OPTIONS=x"',
      'env GIT_AUTHOR_NAME=x git commit -m "NODE_OPTIONS=x" && python y.py',
      'git commit -m "a\\"; export NODE_OPTIONS=x; echo \\"b"',
      'git commit -m "$(cat <<\'EOF\'; export NODE_OPTIONS=x\nmensagem\nEOF\n)"',
      'git commit -m "$(cat <<\'EOF\' > ~/.bashrc\nexport NODE_OPTIONS=x\nEOF\n)"',
      'git commit -m "usa eval aqui" ; echo NODE_OPTIONS',
      'git commit -m "roda | sh agora" ; grep NODE_OPTIONS .env',
    ],
    libera: [
      'git status; git commit -m "documenta o NODE_OPTIONS"',
      'cd docs && git commit -m "documenta o NODE_OPTIONS"',
      'git add . && git commit -m "documenta o NODE_OPTIONS" && git log -1',
      'git -C . commit --message="NODE_OPTIONS no .git/config"',
      'git commit -m "$(cat <<\'EOF\'  \nmenciona NODE_OPTIONS, hooksPath e .git/hooks\nEOF\n)"',
    ],
  },
  '4 ${ atribui': {
    bloqueia: [
      'echo ${NODE_OPTIONS:=--require=./x.js}',
      'echo "${GIT_CONFIG_COUNT:=1}"',
      'printenv ${GIT_CONFIG_COUNT:-x}',
      'grep ${NODE_OPTIONS:=x} .env',
    ],
    libera: ['echo $NODE_OPTIONS', 'echo "$GIT_CONFIG_COUNT"'],
  },
  '5 o que vem depois do 1º segmento do pipe também só lê': {
    bloqueia: [
      'echo export NODE_OPTIONS=x | python',
      'echo NODE_OPTIONS=x | Tee-Object .env',
      'grep NODE_OPTIONS .env | node',
      'cat .env | python | grep NODE_OPTIONS',
      'grep NODE_OPTIONS .env | grep -v x | python',
    ],
    libera: [
      "find . -name '*.mjs' | xargs grep NODE_OPTIONS",
      'grep -rn NODE_OPTIONS . | head',
      "grep NODE_OPTIONS .env | wc -l | tr -d ' '",
      'git log -S NODE_OPTIONS | head -3',
      'cat .env | cut -d= -f1 | grep NODE_OPTIONS',
      'find . -name x.mjs | xargs -n1 grep -c GIT_CONFIG | head -3',
    ],
  },
};
for (const [item, { bloqueia: nega, libera: passa }] of Object.entries(ajustes)) {
  for (const c of nega) test(`[ajuste ${item}] bloqueia: ${c}`, () => assert.notEqual(avaliar(c), null));
  for (const c of passa) test(`[ajuste ${item}] libera: ${c}`, () => assert.equal(avaliar(c), null));
}

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

test('.claude/estado/esforco (D64): gravar medio ou alto e ler/limpar passam direto; gravar rapido ou qualquer outro comando que toque o arquivo pede confirmação (ask)', () => {
  for (const seguro of [
    "mkdir -p .claude/estado && printf '%s\\n' medio > .claude/estado/esforco",
    "mkdir -p .claude/estado && printf '%s\\n' alto > .claude/estado/esforco",
    "printf '%s\\n' medio > .claude/estado/esforco",
    "printf '%s\\n' alto > .claude/estado/esforco",
    'echo medio > .claude/estado/esforco',
    'echo alto > .claude/estado/esforco',
    'cat .claude/estado/esforco',
    'rm -f .claude/estado/esforco',
  ]) {
    assert.deepEqual(decisao(seguro, PROJETO), { decisao: null, motivo: null }, seguro);
  }
  for (const pedeAsk of [
    "mkdir -p .claude/estado && printf '%s\\n' rapido > .claude/estado/esforco",
    "printf '%s\\n' rapido > .claude/estado/esforco",
    'echo rapido > .claude/estado/esforco',
    'cp /tmp/x .claude/estado/esforco',
    'echo medio > .claude/estado/esforco && echo rapido > .claude/estado/esforco',
  ]) {
    const d = decisao(pedeAsk, PROJETO);
    assert.equal(d.decisao, 'ask', pedeAsk);
    assert.match(d.motivo, /confirme o esforço rapido em \.claude\/estado\/esforco/);
  }
});
