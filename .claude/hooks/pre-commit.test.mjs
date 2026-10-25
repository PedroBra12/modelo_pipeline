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
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/ e os testes do pipeline \(node --test\) falharam/);
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
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/ e não há testes do pipeline/);
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
