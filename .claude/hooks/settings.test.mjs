// O .claude/settings.json liga as guardas: se alguém apagar a entrada de um hook, o teste fica vermelho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerPapeis, orquestrador, versoes } from './papeis.mjs';
import { envDe } from './sincroniza-pares.mjs';

const ORQUESTRADOR = orquestrador(lerPapeis().valor);
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

test('o matcher de edição chama a guarda-pasta-agentes (D8.7), com onFailure block, nas quatro ferramentas de escrita, ao lado da guarda-git-arquivos', () => {
  const pasta = entradaDo('guarda-pasta-agentes.mjs');
  assert.ok(pasta, 'falta a entrada da guarda-pasta-agentes');
  assert.deepEqual(pasta.matcher.sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
  assert.equal(pasta.hook.onFailure, 'block');
  assert.equal(pasta.hook.type, 'command');
  assert.match(pasta.hook.command, /^node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/guarda-pasta-agentes\.mjs"$/);
  assert.deepEqual(pasta.matcher.sort(), entradaDo('guarda-git-arquivos.mjs').matcher.sort());
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

test('toda sessão abre como o agente orquestrador, em xhigh (D3), e o esforço é o do nível orquestracao do pipeline.json', () => {
  assert.equal(SETTINGS.agent, 'orquestrador');
  assert.equal(SETTINGS.effortLevel, ORQUESTRADOR.effort);
  assert.equal(SETTINGS.effortLevel, 'xhigh');
  assert.equal(SETTINGS.model, ORQUESTRADOR.model, 'o model do projeto vence o do usuário (que pode ser haiku)');
  assert.equal(SETTINGS.model, 'opus');
  assert.ok(existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents', `${SETTINGS.agent}.md`)), 'o agente existe em .claude/agents');
});

test('o env do settings.json é o do pipeline.json (D11): as 3 versões de modelo e a profundidade, só essas 4 chaves, em texto', () => {
  const p = lerPapeis().valor;
  const v = versoes(p);
  assert.deepEqual(Object.keys(SETTINGS.env ?? {}).sort(), [
    'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH',
  ]);
  assert.equal(SETTINGS.env.ANTHROPIC_DEFAULT_OPUS_MODEL, v.opus);
  assert.equal(SETTINGS.env.ANTHROPIC_DEFAULT_SONNET_MODEL, v.sonnet);
  assert.equal(SETTINGS.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, v.haiku);
  // "1" enquanto o pipeline.json não tem o `neto`, "2" quando tiver (a rodada que liga o neto)
  assert.equal(SETTINGS.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, p.neto === undefined ? '1' : '2');
  for (const valor of Object.values(SETTINGS.env)) assert.equal(typeof valor, 'string');
  assert.deepEqual(SETTINGS.env, envDe(p), 'rode: node .claude/hooks/sincroniza-pares.mjs');
});
