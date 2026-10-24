// O hook pre-commit do git roda `npm run test:pipeline` (ou, sem o script, `node --test`) quando o commit toca .claude/ (D2), num git de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copiarHooks } from './teste-apoio.mjs';

// o node --test do hook roda dentro de um teste: sem isto ele se acha recursivo e não roda nada (e sai verde)
const semContextoDeTeste = { ...process.env };
delete semContextoDeTeste.NODE_TEST_CONTEXT;

/** Um projeto temporário com os hooks copiados, o script `test:pipeline` à escolha (undefined = sem o script: o hook cai no node --test) e o branch `trabalho`. */
function projeto(scriptDoTeste) {
  const raiz = mkdtempSync(join(tmpdir(), 'pre-commit-'));
  const hooks = copiarHooks(raiz);
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...args], { cwd: raiz, encoding: 'utf8', env: semContextoDeTeste });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  git('init', '-q', '-b', 'trabalho');
  git('config', 'core.hooksPath', join(hooks, 'git'));
  const scripts = scriptDoTeste === undefined ? {} : { 'test:pipeline': scriptDoTeste };
  writeFileSync(join(raiz, 'package.json'), JSON.stringify({ scripts }));
  writeFileSync(join(raiz, 'README.md'), '# x\n');
  const grava = (rel, texto) => {
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    writeFileSync(join(raiz, rel), texto);
  };
  const commit = (rel, texto) => {
    grava(rel, texto);
    // a pasta dos hooks é pasta de trabalho: o commit-msg (confere-docs) pede o AGENTS.md dela
    const nosHooks = rel.startsWith('.claude/hooks/');
    if (nosHooks) grava('.claude/hooks/AGENTS.md', '# Hooks\n\nFaz: x.\n\nNão faz: y.\n\nComo testar: z.\n');
    git('add', '-A', '--', rel, ...(nosHooks ? ['.claude/hooks/AGENTS.md'] : []));
    return git('commit', '-q', '-m', 'x: muda');
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
const FALHA = 'node -e "console.log(\'testes do pipeline falharam\'); process.exit(1)"';
const PASSA = 'node -e "process.exit(0)"';
const TESTE_VERDE = "import { test } from 'node:test';\ntest('ok', () => {});\n";
const TESTE_VERMELHO = "import { test } from 'node:test';\ntest('vermelho', () => { throw new Error('teste do pipeline vermelho'); });\n";

test('o commit que toca .claude/ com o test:pipeline vermelho é recusado, com a saída dos testes', () => {
  com(projeto(FALHA), ({ commit }) => {
    const r = commit('.claude/x.json', '{}\n');
    assert.equal(r.ok, false);
    assert.match(r.saida, /testes do pipeline falharam/);
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/ e npm run test:pipeline falhou/);
  });
});

test('com o test:pipeline verde o commit que toca .claude/ passa', () => {
  com(projeto(PASSA), ({ commit }) => {
    const r = commit('.claude/x.json', '{}\n');
    assert.equal(r.ok, true, r.saida);
  });
});

test('o commit que não toca .claude/ não roda os testes do pipeline (mesmo vermelhos)', () => {
  com(projeto(FALHA), ({ commit }) => {
    assert.equal(commit('src/y.txt', 'a\n').ok, true);
  });
  com(projeto(undefined), ({ commit }) => {
    assert.equal(commit('src/y.txt', 'a\n').ok, true);
  });
});

test('sem o script test:pipeline o hook roda node --test nos testes dos hooks: vermelho recusa, verde passa', () => {
  com(projeto(undefined), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERMELHO);
    assert.equal(r.ok, false);
    assert.match(r.saida, /teste do pipeline vermelho/);
    assert.match(r.saida, /Commit recusado: o commit toca \.claude\/ e os testes do pipeline \(node --test\) falharam/);
  });
  com(projeto(undefined), ({ commit }) => {
    const r = commit('.claude/hooks/x.test.mjs', TESTE_VERDE);
    assert.equal(r.ok, true, r.saida);
  });
});

test('sem o script e sem nenhum teste em .claude/hooks o commit que toca .claude/ é recusado (falha fechado)', () => {
  com(projeto(undefined), ({ commit }) => {
    const r = commit('.claude/x.json', '{}\n');
    assert.equal(r.ok, false, 'node --test sem arquivo de teste não pode valer como verde');
    assert.match(r.saida, /Commit recusado/);
  });
});
