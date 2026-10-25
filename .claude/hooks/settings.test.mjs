// O .claude/settings.json liga as guardas: se alguém apagar a entrada de um hook, o teste fica vermelho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXOS } from './config.mjs';

const SETTINGS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'settings.json'), 'utf8'));

/** O hook PreToolUse que roda o script, com o matcher da entrada dele. */
function entradaDo(script) {
  for (const entrada of SETTINGS.hooks?.PreToolUse ?? []) {
    for (const hook of entrada.hooks ?? []) {
      if (typeof hook.command === 'string' && hook.command.includes(`/hooks/${script}`)) return { matcher: entrada.matcher.split('|'), hook };
    }
  }
  return undefined;
}

test('o matcher Agent chama a guarda-agentes, e Bash e PowerShell chamam a guarda-git, os dois com onFailure block', () => {
  const agentes = entradaDo('guarda-agentes.mjs');
  assert.ok(agentes, 'falta a entrada da guarda-agentes');
  assert.deepEqual(agentes.matcher, ['Agent']);
  assert.equal(agentes.hook.onFailure, 'block');
  const git = entradaDo('guarda-git.mjs');
  assert.ok(git, 'falta a entrada da guarda-git');
  assert.ok(git.matcher.includes('Bash') && git.matcher.includes('PowerShell'), `matcher ${git.matcher}`);
  assert.equal(git.hook.onFailure, 'block');
});

test('o matcher de edição chama a guarda-git-arquivos, com onFailure block, nas quatro ferramentas de escrita', () => {
  const arquivos = entradaDo('guarda-git-arquivos.mjs');
  assert.ok(arquivos, 'falta a entrada da guarda-git-arquivos');
  assert.deepEqual(arquivos.matcher.sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
  assert.equal(arquivos.hook.onFailure, 'block');
});

test('todo hook do settings.json aponta para um script que existe, e o PostToolUse e o Stop estão ligados', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const comandos = Object.values(SETTINGS.hooks ?? {}).flatMap((entradas) => entradas.flatMap((e) => (e.hooks ?? []).map((h) => h.command)));
  assert.ok(comandos.length >= 5, `comandos: ${comandos.length}`);
  for (const comando of comandos) {
    const script = /\/hooks\/([\w.-]+\.mjs)/.exec(comando)?.[1];
    assert.ok(script, comando);
    assert.ok(existsSync(join(aqui, script)), `${script} não existe`);
  }
  assert.ok(comandos.some((c) => c.includes('/hooks/confere-lgpd.mjs')), 'falta o confere-lgpd');
  assert.ok(comandos.some((c) => c.includes('/hooks/marca-alterado.mjs')), 'falta o marca-alterado');
  assert.ok(comandos.some((c) => c.includes('/hooks/portao.mjs')), 'falta o portao');
});

test('toda sessão abre como o agente orquestrador, em xhigh (D3), e o esforço é o do nível orquestracao do config.mjs', () => {
  assert.equal(SETTINGS.agent, 'orquestrador');
  assert.equal(SETTINGS.effortLevel, FIXOS.niveis.orquestracao.split(':')[1]);
  assert.equal(SETTINGS.effortLevel, 'xhigh');
  assert.equal(SETTINGS.model, FIXOS.niveis.orquestracao.split(':')[0], 'o model do projeto vence o do usuário (que pode ser haiku)');
  assert.equal(SETTINGS.model, 'opus');
  assert.ok(existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents', `${SETTINGS.agent}.md`)), 'o agente existe em .claude/agents');
});
