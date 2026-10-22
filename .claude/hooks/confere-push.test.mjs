// O confere-push como função e como hook pre-push num git de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avaliarPush } from './confere-push.mjs';
import { CONFIGURE, MARCADOR } from './config.mjs';
import { CONFIG_PADRAO, copiarHooks } from './teste-apoio.mjs';

const URL = 'https://github.com/acme/app.git';
const REPO = { valor: 'acme/app', erro: null };
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);
const ancestral = () => true;
const naoAncestral = () => false;
const avaliar = (url, linhas, anc) => avaliarPush(url, linhas, anc, REPO);

test('libera o push que só anda para frente no repositório configurado', () => {
  assert.equal(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral), null);
  assert.equal(avaliar('git@github.com:acme/app.git', [`refs/heads/pr/y ${A} refs/heads/pr/y ${ZERO}`], naoAncestral), null);
  assert.equal(avaliar('https://github.com/acme/app', [], ancestral), null);
  assert.equal(avaliar('https://github.com/Acme/App', [], ancestral), null, 'o GitHub não distingue a caixa');
});

test('nega outro destino, apagar e forçar', () => {
  assert.notEqual(avaliar('https://github.com/acme/outro-repo.git', [`refs/heads/main ${A} refs/heads/main ${B}`], ancestral), null);
  assert.notEqual(avaliar('https://github.com/outra-conta/app.git', [], ancestral), null);
  assert.notEqual(avaliar('https://github.com/acme/appX', [], ancestral), null);
  assert.notEqual(avaliar('https://example.com/acme/app.git', [], ancestral), null);
  assert.match(avaliar('/tmp/remoto.git', [], ancestral) ?? '', /não é o repositório do projeto \(acme\/app\)/);
  assert.notEqual(avaliar(URL, [`(delete) ${ZERO} refs/heads/pr/a ${A}`], ancestral), null);
  assert.notEqual(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], naoAncestral), null);
  assert.notEqual(avaliar(URL, ['refs/heads/main'], ancestral), null);
});

test('nega o push para a main do GitHub e deixa o de pr/x', () => {
  const main = avaliar(URL, [`refs/heads/main ${A} refs/heads/main ${B}`], ancestral);
  assert.match(main ?? '', /a main só anda pelo merge do PR no GitHub/);
  assert.match(avaliar(URL, [`refs/heads/main ${A} refs/heads/main ${ZERO}`], ancestral) ?? '', /a main só anda/, 'a main nova também');
  assert.match(avaliar(URL, [`(delete) ${ZERO} refs/heads/main ${A}`], ancestral) ?? '', /apagaria/, 'apagar vem antes da main');
  assert.match(avaliar(URL, [`refs/heads/f ${A} refs/heads/main ${B}`], ancestral) ?? '', /a main só anda/, 'a ref remota é que vale');
  assert.equal(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral), null);
  assert.equal(avaliar(URL, [`refs/heads/main ${A} refs/heads/pr/x ${ZERO}`], ancestral), null);
});

test('repositório no marcador, ausente ou ilegível: nega todo push, mesmo para a URL certa, e manda configurar', () => {
  const marcador = avaliarPush(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral, { valor: null, erro: CONFIGURE });
  assert.equal(marcador, CONFIGURE);
  assert.equal(avaliarPush(URL, [], ancestral, { valor: null, erro: `${CONFIGURE} (o campo repositorio falta)` })?.startsWith(CONFIGURE), true);
});

/** Um projeto temporário com os hooks copiados, um remoto local (bare) e um commit no branch pr/teste. */
function projeto(base, config) {
  const git = (pasta, ...args) => spawnSync('git', args, { cwd: pasta, encoding: 'utf8' });
  const remoto = join(base, 'remoto.git');
  const raiz = join(base, 'repo');
  mkdirSync(raiz);
  const hooks = copiarHooks(raiz, config);
  git(base, 'init', '-q', '--bare', remoto);
  git(raiz, 'init', '-q', '-b', 'pr/teste');
  for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.hooksPath', join(hooks, 'git')]]) git(raiz, 'config', k, v);
  writeFileSync(join(raiz, 'a.txt'), 'a\n');
  git(raiz, 'add', 'a.txt');
  git(raiz, 'commit', '-q', '--no-verify', '-m', 'a');
  git(raiz, 'remote', 'add', 'origin', remoto);
  return { git, raiz, remoto };
}

test('o hook pre-push, num git de verdade: nega o remoto que não é o configurado, o marcador manda configurar, e o --no-verify do usuário passa', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-push-git-'));
  try {
    const { git, raiz, remoto } = projeto(base, CONFIG_PADRAO);
    const negado = git(raiz, 'push', 'origin', 'pr/teste');
    assert.notEqual(negado.status, 0);
    assert.match(negado.stderr, /confere-push: push para origin negado: o destino ".*" não é o repositório do projeto \(acme\/app\)/);
    assert.equal(git(remoto, 'rev-parse', '--verify', '-q', 'refs/heads/pr/teste').status, 1);
    assert.equal(git(raiz, 'push', '--no-verify', 'origin', 'pr/teste').status, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o hook pre-push, num git de verdade, com o repositorio no marcador: nega com "configure o repositorio em .claude/pipeline.json"', () => {
  for (const config of [{ ...CONFIG_PADRAO, repositorio: MARCADOR }, '{ lixo']) {
    const base = mkdtempSync(join(tmpdir(), 'confere-push-marcador-'));
    try {
      const { git, raiz, remoto } = projeto(base, config);
      const negado = git(raiz, 'push', 'origin', 'pr/teste');
      assert.notEqual(negado.status, 0);
      assert.match(negado.stderr, /configure o repositorio em \.claude\/pipeline\.json/);
      assert.equal(git(remoto, 'rev-parse', '--verify', '-q', 'refs/heads/pr/teste').status, 1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
});
