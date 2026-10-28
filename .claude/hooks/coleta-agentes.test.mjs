// O coleta-agentes.mjs: os números de cada subagente saem das transcrições em disco. JSONL inventado numa pasta temporária.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coletar, formatar, lerAgente, total } from './coleta-agentes.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'coleta-agentes.mjs');
const jsonl = (...linhas) => `${linhas.map((l) => JSON.stringify(l)).join('\n')}\n`;
const pedido = (ts, content, agentId) => ({ type: 'user', isSidechain: true, agentId, timestamp: ts, message: { role: 'user', content } });
const resposta = (ts, model, usage) => ({ type: 'assistant', timestamp: ts, message: { model, usage } });
const resultado = (ts) => ({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });

/** Dois agentes (o segundo foi retomado) e um arquivo de Bash que não é JSON. */
function pastaDeExemplo() {
  const pasta = mkdtempSync(join(tmpdir(), 'coleta-'));
  writeFileSync(join(pasta, 'aaa111.output'), jsonl(
    pedido('2026-10-28T14:00:00.000Z', 'Escreva o código.\nSegunda linha do pedido.', 'aaa111'),
    resposta('2026-10-28T14:01:00.000Z', 'claude-sonnet-5-5', { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 }),
    resultado('2026-10-28T14:02:00.000Z'),
    { type: 'attachment', timestamp: '2026-10-28T14:04:00.000Z' },
    resposta('2026-10-28T14:05:30.000Z', 'claude-sonnet-5-5', { input_tokens: 2, cache_creation_input_tokens: 1247, cache_read_input_tokens: 51850, output_tokens: 1414 }),
  ));
  writeFileSync(join(pasta, 'bbb222.output'), jsonl(
    pedido('2026-10-28T15:00:00.000Z', `${'x'.repeat(150)}\nresto`, 'bbb222'),
    resposta('2026-10-28T15:10:00.000Z', 'claude-opus-5-5', { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 }),
    pedido('2026-10-28T15:20:00.000Z', [{ type: 'text', text: 'Corrija o item 3.' }], 'bbb222'),
    resultado('2026-10-28T15:21:00.000Z'),
    resposta('2026-10-28T15:30:00.000Z', 'claude-opus-5-5', { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 }),
  ));
  writeFileSync(join(pasta, 'b9x8y7.output'), 'saída de bash\nnada de JSON\n');
  // saída de Bash que por acaso é JSON com timestamp: sem agentId na 1ª linha, não é transcrição de agente
  writeFileSync(join(pasta, 'b5k4m3.output'), jsonl({ timestamp: '2026-10-28T16:00:00.000Z', type: 'assistant', message: { model: 'x', usage: { input_tokens: 999 } } }));
  writeFileSync(join(pasta, 'LEIAME.txt'), 'não é .output');
  return pasta;
}
const com = (fn) => {
  const pasta = pastaDeExemplo();
  try {
    fn(pasta);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
};

test('lerAgente: tokens são a soma das 4 partes do último usage, minutos vão do 1º ao último timestamp, e o pedido é só o que não é resultado de ferramenta', () => {
  com((pasta) => {
    const [a, b] = coletar(pasta);
    assert.equal(a.agentId, 'aaa111');
    assert.equal(a.modelo, 'claude-sonnet-5-5');
    assert.equal(a.tokens, 2 + 1247 + 51850 + 1414, 'o 54513 da notificação, não o 1º usage');
    assert.equal(a.minutos, 5.5);
    assert.equal(a.inicio, '2026-10-28T14:00:00.000Z');
    assert.equal(a.fim, '2026-10-28T14:05:30.000Z');
    assert.equal(a.pedidos, 1);
    assert.equal(a.primeiroPedido, 'Escreva o código.');
    assert.equal(b.agentId, 'bbb222');
    assert.equal(b.tokens, 10);
    assert.equal(b.minutos, 30);
    assert.equal(b.pedidos, 2, 'o agente retomado tem mais de um pedido; o tool_result não conta');
    assert.equal(b.primeiroPedido.length, 100, 'a 1ª linha do 1º pedido é cortada em 100 caracteres');
  });
});

test('coletar: pula o arquivo de Bash (não JSON) e o que não é .output; o total soma agentes e tokens', () => {
  com((pasta) => {
    const agentes = coletar(pasta);
    assert.deepEqual(agentes.map((a) => a.agentId), ['aaa111', 'bbb222']);
    assert.deepEqual(total(agentes), { agentes: 2, tokens: 54513 + 10 });
    assert.match(formatar(agentes), /total: 2 agentes, 54523 tokens$/);
    assert.match(formatar(agentes), /bbb222 {2}claude-opus-5-5 {2}10 tokens {2}30 min .* pedidos: 2 \(retomado\)/);
  });
});

test('coletar --desde filtra pelo início do agente; data inválida é erro', () => {
  com((pasta) => {
    assert.deepEqual(coletar(pasta, { desde: '2026-10-28T14:30:00Z' }).map((a) => a.agentId), ['bbb222']);
    assert.deepEqual(coletar(pasta, { desde: '2026-10-28T16:00:00Z' }), []);
    assert.equal(coletar(pasta, { desde: '2026-10-28T14:00:00Z' }).length, 2, 'o início igual ao limite entra');
    assert.throws(() => coletar(pasta, { desde: 'ontem' }), /--desde não é uma data ISO/);
  });
});

test('lerAgente: linha quebrada no meio é pulada; sem timestamp, ou com a 1ª linha JSON sem agentId, não é agente', () => {
  assert.equal(lerAgente('{"type":"user"}\nlixo\n'), null);
  assert.equal(lerAgente(jsonl({ timestamp: '2026-10-28T14:00:00.000Z', type: 'user' }, pedido('2026-10-28T14:01:00.000Z', 'oi', 'zzz'))), null, 'o agentId tem de estar na 1ª linha JSON');
  const a = lerAgente(`lixo\n${jsonl(pedido('2026-10-28T14:00:00.000Z', 'oi', 'zzz'))}`);
  assert.equal(a.agentId, 'zzz');
  assert.equal(a.tokens, 0);
  assert.equal(a.modelo, null);
});

test('o script na linha de comando: texto, --json (um objeto por agente), --desde e erros de uso', () => {
  com((pasta) => {
    const rodar = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    const texto = rodar(pasta);
    assert.equal(texto.status, 0, texto.stderr);
    assert.match(texto.stdout, /^aaa111 {2}claude-sonnet-5-5 {2}54513 tokens {2}5\.5 min/);
    const json = JSON.parse(rodar(pasta, '--json', '--desde', '2026-10-28T14:30:00Z').stdout);
    assert.deepEqual(json.map((a) => [a.agentId, a.tokens, a.pedidos]), [['bbb222', 10, 2]]);
    assert.equal(rodar().status, 2);
    assert.match(rodar().stderr, /uso: /);
    assert.equal(rodar(pasta, '--desde').status, 2);
    assert.equal(rodar(join(pasta, 'nao-existe')).status, 2);
  });
});
