// O ajuste automático desce os pares até o piso. Os testes que leem o pipeline.json de verdade têm de continuar
// verdes com todos os alvos no piso; senão um teste que crava um par quebraria no 1º ajuste e o pre-commit recusaria o commit.
// O mesmo vale para o neto (D11): o orquestrador o liga e o desliga no pipeline.json, e um teste cravado no estado de hoje
// (sem a chave, ou com o `Agent(leitor)` nas tools) quebraria no commit dele. Por isso a suíte roda também com o neto virado.
// Numa cópia só do que esses testes leem (não o projeto inteiro), com cabeçalhos e tabela sincronizados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixarPares, inverterNeto, pisosDoProjeto } from './teste-apoio.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTES = ['config.test.mjs', 'papeis.test.mjs', 'guarda-agentes.test.mjs', 'ajusta-pipeline.test.mjs', 'settings.test.mjs', 'sincroniza-pares.test.mjs'];

/** Copia o que os testes leem para uma pasta temporária, baixa os alvos ao piso, roda `preparar(raiz)` e a suíte; devolve o que ela disse. */
function rodaNaCopia(preparar = () => {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'ciclo-'));
  try {
    for (const rel of ['.claude', 'docs/pipeline', 'docs/arquitetura.md', 'CLAUDE.md', 'AGENTS.md']) {
      if (!existsSync(join(RAIZ, rel))) continue;
      mkdirSync(dirname(join(raiz, rel)), { recursive: true });
      cpSync(join(RAIZ, rel), join(raiz, rel), { recursive: true });
    }
    fixarPares(raiz, pisosDoProjeto());
    const estado = preparar(raiz);
    const { NODE_TEST_CONTEXT, ...ambiente } = process.env; // o node --test filho não pode se achar um filho do runner de fora
    const r = spawnSync(process.execPath, ['--test', ...TESTES.map((f) => `.claude/hooks/${f}`)], { cwd: raiz, encoding: 'utf8', env: ambiente, maxBuffer: 64 * 1024 * 1024 });
    return { r, estado };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

/** A suíte da cópia tem de ter saído verde e rodado de verdade. */
function confere({ r }, quando) {
  const falhas = (r.stdout.match(/^✖ .*$/gm) ?? []).slice(0, 8).join('\n');
  assert.equal(r.status, 0, `um teste quebrou ${quando}:\n${falhas}\n${r.stderr.slice(-1200)}`);
  assert.ok(Number(/^ℹ tests (\d+)/m.exec(r.stdout)?.[1] ?? 0) > 60, `a cópia rodou poucos testes:\n${r.stdout.slice(-600)}`);
}

test('com os alvos no piso, os testes que leem o pipeline.json de verdade continuam verdes', { timeout: 300_000 }, () => {
  confere(rodaNaCopia(), 'com os alvos no piso (um par cravado?)');
});

test('com os alvos no piso e o neto virado (ligado se o arquivo não o tem, desligado se tem), os mesmos testes continuam verdes', { timeout: 300_000 }, () => {
  const feito = rodaNaCopia(inverterNeto);
  confere(feito, `com o neto ${feito.estado} e os alvos no piso (um teste cravado no estado do arquivo: a chave neto, a entrada dele, o Agent(...) das tools, a profundidade do settings.json?)`);
});
