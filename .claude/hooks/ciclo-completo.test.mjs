// O ajuste automático desce os pares até o piso. Os quatro testes que leem o pipeline.json de verdade têm de continuar
// verdes com todos os alvos no piso; senão um teste que crava um par quebraria no 1º ajuste e o pre-commit recusaria o commit.
// Numa cópia só do que esses quatro testes leem (não o projeto inteiro), com cabeçalhos e tabela sincronizados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PISOS } from './config.mjs';
import { fixarPares } from './teste-apoio.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUATRO = ['config.test.mjs', 'guarda-agentes.test.mjs', 'ajusta-pipeline.test.mjs', 'settings.test.mjs'];

test('com os alvos no piso, os testes que leem o pipeline.json de verdade continuam verdes', { timeout: 300_000 }, () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ciclo-'));
  try {
    for (const rel of ['.claude', 'docs/pipeline', 'CLAUDE.md', 'AGENTS.md']) {
      if (!existsSync(join(RAIZ, rel))) continue;
      mkdirSync(dirname(join(raiz, rel)), { recursive: true });
      cpSync(join(RAIZ, rel), join(raiz, rel), { recursive: true });
    }
    fixarPares(raiz, PISOS);
    const { NODE_TEST_CONTEXT, ...ambiente } = process.env; // o node --test filho não pode se achar um filho do runner de fora
    const r = spawnSync(process.execPath, ['--test', ...QUATRO.map((f) => `.claude/hooks/${f}`)], { cwd: raiz, encoding: 'utf8', env: ambiente, maxBuffer: 64 * 1024 * 1024 });
    const falhas = (r.stdout.match(/^✖ .*$/gm) ?? []).slice(0, 8).join('\n');
    assert.equal(r.status, 0, `um teste quebrou com os alvos no piso (um par cravado?):\n${falhas}\n${r.stderr.slice(-1200)}`);
    assert.ok(Number(/^ℹ tests (\d+)/m.exec(r.stdout)?.[1] ?? 0) > 60, `a cópia rodou poucos testes:\n${r.stdout.slice(-600)}`);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
