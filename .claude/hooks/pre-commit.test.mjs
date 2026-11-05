// Os hooks do git: o pre-commit roda o `node --test` dos hooks quando o commit toca .claude/ (D2), num git de verdade e sem
// package.json; e os cinco hooks de git/ limpam o NODE_OPTIONS na 1ª linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copiarHooks, HOOKS } from './teste-apoio.mjs';

/** O ambiente do git do teste: sem o contexto do runner que roda este arquivo (o node --test do hook se acharia recursivo e sairia verde). */
const ambiente = (extra = {}) => {
  const e = { ...process.env, ...extra };
  if (!('NODE_TEST_CONTEXT' in extra)) delete e.NODE_TEST_CONTEXT;
  return e;
};

/** Um projeto temporário com os hooks copiados, sem package.json (o do modelo), no branch `trabalho`. */
function projeto({ packageJson } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'pre-commit-'));
  const hooks = copiarHooks(raiz);
  const git = (args, env) => {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...args], { cwd: raiz, encoding: 'utf8', env: ambiente(env) });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  git(['init', '-q', '-b', 'trabalho']);
  git(['config', 'core.hooksPath', join(hooks, 'git')]);
  if (packageJson !== undefined) writeFileSync(join(raiz, 'package.json'), JSON.stringify(packageJson));
  writeFileSync(join(raiz, 'README.md'), '# x\n');
  const grava = (rel, texto) => {
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    writeFileSync(join(raiz, rel), texto);
  };
  /** Commita `rel`; `env` vai para o ambiente do git (e dos hooks); `semHooks` pula os hooks (para preparar o estado). */
  const commit = (rel, texto, { env, semHooks = false } = {}) => {
    grava(rel, texto);
    // a pasta dos hooks é pasta de trabalho: o commit-msg (confere-docs) pede o AGENTS.md dela
    const nosHooks = rel.startsWith('.claude/hooks/');
    if (nosHooks) grava('.claude/hooks/AGENTS.md', '# Hooks\n\nFaz: x.\n\nNão faz: y.\n\nComo testar: z.\n');
    git(['add', '-A', '--', rel, ...(nosHooks ? ['.claude/hooks/AGENTS.md'] : [])]);
    return git([...(semHooks ? ['-c', 'core.hooksPath='] : []), 'commit', '-q', '-m', 'x: muda'], env);
  };
  return { raiz, commit, git };
}
const com = (p, fn) => {
  try {
    fn(p);
  } finally {
    rmSync(p.raiz, { recursive: true, force: true });
  }
};
const TESTE_VERDE = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const TESTE_VERMELHO = "import { test } from 'node:test';\ntest('vermelho', () => { throw new Error('teste do pipeline vermelho'); });\n";

test('sem package.json: o commit que toca .claude/ com um teste vermelho é recusado, com a saída do teste', () => {
  com(projeto(), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO);
    assert.equal(r.ok, false);
    assert.match(r.saida, /teste do pipeline vermelho/);
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/, o CLAUDE\.md ou o docs\/arquitetura\.md e os testes do pipeline \(node --test\) falharam/);
  });
});

test('sem package.json: com os testes verdes o commit que toca .claude/ passa', () => {
  com(projeto(), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERDE);
    assert.equal(r.ok, true, r.saida);
  });
});

test('sem nenhum teste em .claude/hooks o commit que toca .claude/ é recusado (falha fechado: node --test sem arquivo sairia verde)', () => {
  com(projeto(), ({ commit }) => {
    const r = commit('.claude/x.json', '{}\n');
    assert.equal(r.ok, false);
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/, o CLAUDE\.md ou o docs\/arquitetura\.md e não há testes do pipeline/);
  });
});

test('o commit que não toca .claude/ não roda os testes do pipeline (mesmo vermelhos)', () => {
  com(projeto(), ({ commit }) => {
    assert.equal(commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO, { semHooks: true }).ok, true, 'prepara: o teste vermelho já está no repositório');
    assert.equal(commit('src/y.txt', 'a\n').ok, true);
  });
});

test('o script test:pipeline do package.json não vale: um commit podia trocá-lo por "exit 0"; o node --test roda sempre', () => {
  com(projeto({ scripts: { 'test:pipeline': 'node -e "process.exit(0)"' } }), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO);
    assert.equal(r.ok, false, 'o script verde não salva o teste vermelho');
    assert.match(r.saida, /teste do pipeline vermelho/);
  });
});

test('com NODE_TEST_CONTEXT=child no ambiente do commit o hook roda os testes mesmo assim e recusa o vermelho', () => {
  com(projeto(), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO, { env: { NODE_TEST_CONTEXT: 'child' } });
    assert.equal(r.ok, false, 'o filho do runner não pode pular os testes e sair verde');
    assert.match(r.saida, /teste do pipeline vermelho/);
  });
});

test('um NODE_OPTIONS que quebraria o node não derruba nem desvia o commit: os hooks o limpam', () => {
  com(projeto(), ({ commit }) => {
    const env = { NODE_OPTIONS: '--require=./nao-existe.js' };
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERDE, { env });
    assert.equal(r.ok, true, r.saida);
    assert.equal(commit('src/y.txt', 'a\n', { env }).ok, true);
  });
});

test('os cinco hooks de git/ limpam o NODE_OPTIONS na 1ª linha, logo depois do shebang', () => {
  const nomes = readdirSync(join(HOOKS, 'git')).sort();
  assert.deepEqual(nomes, ['commit-msg', 'pre-commit', 'pre-merge-commit', 'pre-push', 'reference-transaction']);
  for (const nome of nomes) {
    const [shebang, primeira] = readFileSync(join(HOOKS, 'git', nome), 'utf8').split('\n');
    assert.equal(shebang, '#!/bin/sh', nome);
    assert.match(primeira, /^unset NODE_OPTIONS(\s|$)/, nome);
  }
});

test('o pre-commit não tem o ramo do npm run test:pipeline', () => {
  const texto = readFileSync(join(HOOKS, 'git', 'pre-commit'), 'utf8');
  assert.doesNotMatch(texto, /npm run/);
  assert.doesNotMatch(texto, /grep -qs/);
});

// ---------- o CLAUDE.md e o docs/arquitetura.md também rodam os testes do pipeline (D8) ----------

test('o commit que toca o CLAUDE.md ou o docs/arquitetura.md roda os testes do pipeline: vermelhos recusam, verdes passam', () => {
  for (const rel of ['CLAUDE.md', 'docs/arquitetura.md']) {
    com(projeto(), ({ commit }) => {
      assert.equal(commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO, { semHooks: true }).ok, true, 'prepara: o teste vermelho já está no repositório');
      const r = commit(rel, '# fonte do desenvolvedor\n');
      assert.equal(r.ok, false, `${rel} com teste vermelho`);
      assert.match(r.saida, /teste do pipeline vermelho/);
      assert.match(r.saida, /Commit recusado: o commit toca .*CLAUDE\.md.* e os testes do pipeline \(node --test\) falharam/);
    });
    com(projeto(), ({ commit }) => {
      assert.equal(commit('.claude/hooks/x.test.mjs', TESTE_VERDE, { semHooks: true }).ok, true);
      const r = commit(rel, '# fonte do desenvolvedor\n');
      assert.equal(r.ok, true, `${rel} com teste verde: ${r.saida}`);
    });
  }
});

test('o CLAUDE.md sem nenhum teste em .claude/hooks é recusado (falha fechado); outro .md e arquivo de nome parecido não rodam os testes', () => {
  com(projeto(), ({ commit }) => {
    const r = commit('CLAUDE.md', '# x\n');
    assert.equal(r.ok, false);
    assert.match(r.saida, /Commit recusado: o commit toca .*CLAUDE\.md.* e não há testes do pipeline/);
  });
  com(projeto(), ({ commit }) => {
    assert.equal(commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO, { semHooks: true }).ok, true, 'prepara: o teste vermelho já está no repositório');
    assert.equal(commit('README.md', '# x\n', { semHooks: true }).ok, true); // o confere-docs (commit-msg) lê o README.md do repositório
    for (const rel of ['docs/outro.md', 'docs/arquitetura.md.txt', 'sub/CLAUDE.md', 'docs/sub/arquitetura.md', 'claude.md.txt']) {
      const r = commit(rel, 'a\n');
      assert.equal(r.ok, true, `${rel}: ${r.saida}`);
    }
  });
});

// ---------- o desenvolvedor.md só se commita no checkout do orquestrador (D8.7) ----------

const RECUSA_DEV = /Commit recusado: o `?desenvolvedor\.md`? só se commita no checkout do orquestrador \(D8\)/;

/**
 * O projeto com um teste verde e, se `existente`, o desenvolvedor.md já commitados, e um worktree ligado `pr/x`. `noWt` roda o git nele.
 * Com `dentro` (o padrão) o worktree é o do agente, numa pasta `.claude/worktrees/` do projeto; sem ele, é um worktree de fora disso
 * (o do próprio orquestrador, quando o checkout dele é um worktree).
 */
function projetoComWorktree({ existente = false, dentro = true } = {}) {
  const p = projeto();
  assert.equal(p.commit('README.md', '# x\n', { semHooks: true }).ok, true); // o confere-docs lê o README.md do repositório, que o worktree herda
  if (existente) assert.equal(p.commit('.claude/agents/desenvolvedor.md', 'a\n', { semHooks: true }).ok, true);
  assert.equal(p.commit('.claude/hooks/x.test.mjs', TESTE_VERDE, { semHooks: true }).ok, true);
  const wt = dentro ? join(p.raiz, '.claude', 'worktrees', 'agent-x') : mkdtempSync(join(tmpdir(), 'pre-commit-wt-'));
  if (dentro) mkdirSync(dirname(wt), { recursive: true });
  assert.equal(p.git(['worktree', 'add', '-q', '-b', 'pr/x', wt]).ok, true);
  const noWt = (...args) => {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...args], { cwd: wt, encoding: 'utf8', env: ambiente() });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  /** Grava `rel` no worktree, põe tudo no índice e tenta commitar. */
  const commitaNoWt = (rel, texto) => {
    mkdirSync(dirname(join(wt, rel)), { recursive: true });
    writeFileSync(join(wt, rel), texto);
    noWt('add', '-A');
    return noWt('commit', '-q', '-m', 'x: muda');
  };
  return { ...p, wt, noWt, commitaNoWt };
}
const comWorktree = (p, fn) => {
  try {
    fn(p);
  } finally {
    rmSync(p.wt, { recursive: true, force: true });
    rmSync(p.raiz, { recursive: true, force: true });
  }
};

test('o worktree do agente (em .claude/worktrees/) recusa o commit com o .claude/agents/desenvolvedor.md no índice (qualquer caixa), com a mensagem da D8', () => {
  comWorktree(projetoComWorktree(), ({ commitaNoWt, noWt }) => {
    const criado = commitaNoWt('.claude/agents/desenvolvedor.md', 'a\n');
    assert.equal(criado.ok, false);
    assert.match(criado.saida, RECUSA_DEV);
    noWt('reset', '-q', '--hard');
    assert.match(commitaNoWt('.claude/agents/DESENVOLVEDOR.md', 'b\n').saida, RECUSA_DEV, 'outra caixa');
    noWt('reset', '-q', '--hard');
    assert.match(commitaNoWt('.Claude/Agents/Desenvolvedor.md', 'b\n').saida, RECUSA_DEV, 'outra caixa, na pasta');
  });
});

test('o worktree do agente recusa mudar, apagar e renomear o desenvolvedor.md que já está no repositório', () => {
  comWorktree(projetoComWorktree({ existente: true }), ({ commitaNoWt, noWt }) => {
    assert.match(commitaNoWt('.claude/agents/desenvolvedor.md', 'b\n').saida, RECUSA_DEV, 'mudado');
    noWt('reset', '-q', '--hard');
    noWt('rm', '-q', '.claude/agents/desenvolvedor.md');
    assert.match(noWt('commit', '-q', '-m', 'x: apaga').saida, RECUSA_DEV, 'apagado');
    noWt('reset', '-q', '--hard');
    noWt('mv', '.claude/agents/desenvolvedor.md', 'docs-dev.md');
    assert.match(noWt('commit', '-q', '-m', 'x: renomeia').saida, RECUSA_DEV, 'renomeado para fora: o caminho velho está no índice');
  });
});

test('o worktree do agente commita os outros agentes, nomes parecidos e o resto; o checkout principal commita o desenvolvedor.md', () => {
  comWorktree(projetoComWorktree(), ({ commitaNoWt }) => {
    for (const rel of ['.claude/agents/qa.md', '.claude/agents/desenvolvedor.md.txt', 'docs/agents/desenvolvedor.md', 'src/y.txt']) {
      const r = commitaNoWt(rel, 'a\n');
      assert.equal(r.ok, true, `${rel}: ${r.saida}`);
    }
  });
  comWorktree(projetoComWorktree(), ({ commit }) => {
    const r = commit('.claude/agents/desenvolvedor.md', 'a\n');
    assert.equal(r.ok, true, r.saida);
    const mudado = commit('.claude/agents/desenvolvedor.md', 'b\n');
    assert.equal(mudado.ok, true, mudado.saida);
  });
});

test('o worktree ligado de fora de .claude/worktrees/ (o checkout do orquestrador, quando ele é um worktree) commita o desenvolvedor.md', () => {
  comWorktree(projetoComWorktree({ dentro: false }), ({ commitaNoWt }) => {
    const criado = commitaNoWt('.claude/agents/desenvolvedor.md', 'a\n');
    assert.equal(criado.ok, true, criado.saida);
    const mudado = commitaNoWt('.claude/agents/desenvolvedor.md', 'b\n');
    assert.equal(mudado.ok, true, mudado.saida);
  });
});

test('o critério é o caminho do topo do repositório, sem diferença de caixa: .Claude/Worktrees também recusa', () => {
  const p = projetoComWorktree({ dentro: false });
  const wt2 = join(p.raiz, '.Claude', 'Worktrees', 'agent-y');
  try {
    mkdirSync(dirname(wt2), { recursive: true });
    assert.equal(p.git(['worktree', 'add', '-q', '-b', 'pr/y', wt2]).ok, true);
    mkdirSync(join(wt2, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(wt2, '.claude', 'agents', 'desenvolvedor.md'), 'a\n');
    const git = (...args) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: wt2, encoding: 'utf8', env: ambiente() });
    assert.equal(git('add', '-A').status, 0);
    const r = git('commit', '-q', '-m', 'x: muda');
    assert.match(`${r.stdout}${r.stderr}`, RECUSA_DEV);
  } finally {
    rmSync(wt2, { recursive: true, force: true });
    comWorktree(p, () => {});
  }
});

/** No projeto com o worktree `pr/x`: o ramo `nome` (num worktree à parte, sem hooks) ganha `rel`, e `pr/x` um commit vazio, para o merge não ser avanço rápido. */
function preparaMerge(p, nome, rel) {
  assert.equal(p.git(['branch', nome]).ok, true);
  assert.equal(p.noWt('commit', '-q', '--allow-empty', '-m', 'x: diverge').ok, true);
  const lado = mkdtempSync(join(tmpdir(), 'pre-commit-lado-'));
  try {
    assert.equal(p.git(['worktree', 'add', '-q', lado, nome]).ok, true);
    mkdirSync(dirname(join(lado, rel)), { recursive: true });
    writeFileSync(join(lado, rel), 'a\n');
    const git = (...args) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.hooksPath=', ...args], { cwd: lado, encoding: 'utf8', env: ambiente() });
    assert.equal(git('add', '-A').status, 0);
    assert.equal(git('commit', '-q', '-m', 'x: traz').status, 0);
  } finally {
    p.git(['worktree', 'remove', '--force', lado]);
    rmSync(lado, { recursive: true, force: true });
  }
}
const juntar = (p, nome) => p.noWt('merge', '--no-ff', '-q', '-m', 'x: junta', nome);

test('o merge no worktree do agente que traz o desenvolvedor.md é recusado (pre-merge-commit); outro arquivo passa', () => {
  comWorktree(projetoComWorktree(), (p) => {
    preparaMerge(p, 'pr/dev', '.claude/agents/desenvolvedor.md');
    const r = juntar(p, 'pr/dev');
    assert.equal(r.ok, false);
    assert.match(r.saida, /Merge recusado: o `?desenvolvedor\.md`? só se commita no checkout do orquestrador \(D8\)/);
  });
  comWorktree(projetoComWorktree(), (p) => {
    preparaMerge(p, 'pr/outro', 'docs/y.md');
    const r = juntar(p, 'pr/outro');
    assert.equal(r.ok, true, r.saida);
  });
});

test('o merge no worktree de fora de .claude/worktrees/ (o do orquestrador) traz o desenvolvedor.md', () => {
  comWorktree(projetoComWorktree({ dentro: false }), (p) => {
    preparaMerge(p, 'pr/dev', '.claude/agents/desenvolvedor.md');
    const r = juntar(p, 'pr/dev');
    assert.equal(r.ok, true, r.saida);
  });
});
