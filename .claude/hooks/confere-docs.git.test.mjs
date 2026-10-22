// Roda o confere-docs como hook commit-msg num git de verdade: primeiro commit, -a, -F, worktree e a configuração.
// Os hooks e o pipeline.json são cópias numa pasta temporária, para o teste não depender do pipeline.json do projeto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CONFIG_PADRAO, copiarHooks, escreverConfig } from './teste-apoio.mjs';

const AGENTS = `# contatos
Faz:          contatos
Não faz:      disparos
Como testar:  npm test
`;

function git(pasta, ...args) {
  const r = spawnSync('git', args, { cwd: pasta, encoding: 'utf8' });
  return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
}

function escrever(raiz, rel, conteudo) {
  mkdirSync(join(raiz, dirname(rel)), { recursive: true });
  writeFileSync(join(raiz, rel), conteudo);
}

/** Um repositório com os hooks copiados ligados no branch pr/teste. */
function repositorio(base, config) {
  const raiz = join(base, 'repo');
  mkdirSync(raiz);
  const hooks = copiarHooks(raiz, config);
  git(raiz, 'init', '-q', '-b', 'pr/teste');
  for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.autocrlf', 'false'], ['core.hooksPath', join(hooks, 'git')]]) git(raiz, 'config', k, v);
  escrever(raiz, 'README.md', '# repo\n');
  return raiz;
}

test('commit-msg confere a documentação num git de verdade', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-docs-git-'));
  try {
    const raiz = repositorio(base, CONFIG_PADRAO);
    // o .claude/ da cópia (hooks e pipeline.json) entra no repositório de teste só depois: aqui interessa a pasta packages/
    escrever(raiz, 'packages/contatos/dominio/mescla.ts', 'export const a = 1;\n');
    git(raiz, 'add', 'README.md', 'packages');
    const semAgents = git(raiz, 'commit', '-q', '-m', 'contatos: começa');
    assert.equal(semAgents.ok, false, 'o 1º commit sem AGENTS.md devia ser recusado');
    assert.match(semAgents.saida, /packages\/contatos não tem AGENTS\.md/);

    escrever(raiz, 'packages/contatos/AGENTS.md', AGENTS);
    git(raiz, 'add', 'README.md', 'packages');
    const primeiro = git(raiz, 'commit', '-q', '-m', 'contatos: começa');
    assert.equal(primeiro.ok, true, primeiro.saida);

    escrever(raiz, 'packages/contatos/dominio/mescla.ts', 'export const a = 2;\n');
    const semDeclarar = git(raiz, 'commit', '-q', '-a', '-m', 'contatos: muda a mescla');
    assert.equal(semDeclarar.ok, false, 'código mudado sem Docs-conferidos devia ser recusado');
    assert.match(semDeclarar.saida, /Docs-conferidos: packages\/contatos\/AGENTS\.md/);

    escrever(base, 'msg.txt', 'contatos: muda a mescla\n\nDocs-conferidos: packages/contatos/AGENTS.md\n');
    const comArquivo = git(raiz, 'commit', '-q', '-a', '-F', join(base, 'msg.txt'));
    assert.equal(comArquivo.ok, true, comArquivo.saida);

    const wt = join(base, 'agente');
    assert.equal(git(raiz, 'worktree', 'add', '-q', wt, '-b', 'agente').ok, true);
    escrever(wt, 'packages/contatos/dominio/mescla.ts', 'export const a = 3;\n');
    assert.equal(git(wt, 'commit', '-q', '-a', '-m', 'contatos: no worktree').ok, false, 'no worktree, a regra vale igual');
    const noWorktree = git(wt, 'commit', '-q', '-a', '-m', 'contatos: no worktree', '-m', 'Docs-conferidos: packages/contatos/AGENTS.md');
    assert.equal(noWorktree.ok, true, noWorktree.saida);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('as pastas de trabalho vêm do pipeline.json: pasta fora da lista não pede AGENTS.md, a da lista pede', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-docs-cfg-'));
  try {
    const raiz = repositorio(base, { ...CONFIG_PADRAO, pastasDeTrabalho: ['^servicos/[^/]+(?=/)'] });
    escrever(raiz, 'packages/contatos/dominio/mescla.ts', 'export const a = 1;\n');
    git(raiz, 'add', 'README.md', 'packages');
    assert.equal(git(raiz, 'commit', '-q', '-m', 'packages fora da lista').ok, true, 'packages não é pasta de trabalho nesta configuração');
    escrever(raiz, 'servicos/cobranca/x.ts', 'export const a = 1;\n');
    git(raiz, 'add', 'servicos');
    const recusado = git(raiz, 'commit', '-q', '-m', 'servicos sem AGENTS');
    assert.equal(recusado.ok, false);
    assert.match(recusado.saida, /servicos\/cobranca não tem AGENTS\.md/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('pipeline.json ilegível ou sem pastasDeTrabalho válidas: o commit é recusado com o motivo', () => {
  for (const config of ['{ lixo', { ...CONFIG_PADRAO, pastasDeTrabalho: [] }, { ...CONFIG_PADRAO, pastasDeTrabalho: ['('] }]) {
    const base = mkdtempSync(join(tmpdir(), 'confere-docs-cfg-'));
    try {
      const raiz = repositorio(base, CONFIG_PADRAO);
      escreverConfig(raiz, config);
      git(raiz, 'add', 'README.md');
      const r = git(raiz, 'commit', '-q', '-m', 'readme');
      assert.equal(r.ok, false, JSON.stringify(config));
      assert.match(r.saida, /Commit recusado pelo confere-docs: .*(pipeline\.json|pastasDeTrabalho)/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
});
