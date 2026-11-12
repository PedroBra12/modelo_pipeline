// O lançador preso da impeccable (D35 (6)): o verbo de fora e a URL são recusados, o motor só roda se a plataforma está na
// tabela e o SHA-256 do arquivo bate, dentro de uma caixa (`sandbox-exec`) sem rede e sem a pasta dos segredos locais, e o
// ambiente do filho leva as chaves, o IMPECCABLE_BIN e o IMPECCABLE_SELF. O processo filho e o disco entram por injeção: o
// binário de verdade não roda aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAVES_DESLIGADAS, MOTORES, PASTA_DA_SKILL, SANDBOX_EXEC, SELF, VERBOS, ambienteDoFilho, caminhoDoMotor, lancar, perfilDaCaixa } from './impeccable.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'impeccable.mjs');
const CASA = '/casa/inventada';
const BYTES = Buffer.from('motor inventado');
const SHA = createHash('sha256').update(BYTES).digest('hex');
const MOTOR = join(CASA, '.impeccable', 'bin', '0.1.11', 'impeccable');

/** Um executor falso que anota o que recebeu e nunca roda nada. */
function falso(resposta = { status: 0 }) {
  const chamadas = [];
  return { chamadas, executar: (comando, args, opcoes) => (chamadas.push({ comando, args, opcoes }), resposta) };
}
/** As opções do caso feliz: macOS arm64, o motor e o sandbox-exec existem, e o arquivo tem os bytes do hash da tabela de teste. */
const com = (extra = {}) => ({
  casa: CASA,
  plataforma: 'darwin',
  arquitetura: 'arm64',
  existe: () => true,
  ler: () => BYTES,
  ambiente: {},
  motores: { 'darwin-arm64': { versao: '0.1.11', sha256: SHA } },
  ...extra,
});

test('só context e detect: qualquer outro 1º argumento (ou nenhum) é recusado em português e o filho não roda', () => {
  assert.deepEqual(VERBOS, ['context', 'detect']);
  for (const args of [[], ['live'], ['pin', 'pin', 'x'], ['hooks', 'on'], ['update'], ['engine-probe'], ['--help'], ['CONTEXT'], ['--target', 'context'], ['']]) {
    const f = falso();
    const r = lancar(args, { ...com(), executar: f.executar });
    assert.equal(r.codigo, 2, JSON.stringify(args));
    assert.match(r.erro, /verbo recusado: só context e detect/, JSON.stringify(args));
    assert.equal(f.chamadas.length, 0, `${JSON.stringify(args)} não pode rodar o motor`);
  }
});

test('D: o detect não recebe URL: todo argumento com :// sai 2 e o filho não roda', () => {
  for (const args of [['detect', 'https://exemplo.invalid'], ['detect', '--json', 'http://127.0.0.1:4300/x'], ['detect', 'a.tsx', 'file:///etc/passwd'], ['context', '--target=https://exemplo.invalid/x'], ['detect', 'ftp://x']]) {
    const f = falso();
    const r = lancar(args, { ...com(), executar: f.executar });
    assert.equal(r.codigo, 2, JSON.stringify(args));
    assert.match(r.erro, /URL recusada/, JSON.stringify(args));
    assert.equal(f.chamadas.length, 0, `${JSON.stringify(args)} não pode rodar o motor`);
  }
  // o que não é URL passa
  const f = falso();
  assert.equal(lancar(['detect', '--json', 'apps/web/componentes/templates.tsx'], { ...com(), executar: f.executar }).codigo, 0);
});

test('B: a tabela é fechada e por plataforma: hoje só darwin-arm64, com a versão e o SHA-256 colhidos', () => {
  assert.deepEqual(Object.keys(MOTORES), ['darwin-arm64']);
  assert.deepEqual(MOTORES['darwin-arm64'], { versao: '0.1.11', sha256: '7427918d6e75507401a1b7b691eefe58a7c01a2fc63b712016ffc5a0ac1c05e6' });
  assert.ok(Object.isFrozen(MOTORES));
});

test('B: a plataforma fora da tabela sai 3 com a frase do motor ausente, sem ler o arquivo nem rodar nada', () => {
  for (const [plataforma, arquitetura] of [['darwin', 'x64'], ['linux', 'x64'], ['win32', 'x64'], ['linux', 'arm64']]) {
    const f = falso();
    let leu = 0;
    const r = lancar(['context'], { ...com({ plataforma, arquitetura, ler: () => (leu++, BYTES) }), executar: f.executar });
    assert.equal(r.codigo, 3, `${plataforma}-${arquitetura}`);
    assert.match(r.erro, /motor ausente: leia o PRODUCT\.md e o DESIGN\.md direto/);
    assert.match(r.erro, new RegExp(`${plataforma}-${arquitetura}`));
    assert.equal(f.chamadas.length, 0);
    assert.equal(leu, 0);
  }
});

test('B: o hash que não bate sai 3 e não roda nada (o arquivo trocado não é o motor da tabela)', () => {
  const f = falso();
  const r = lancar(['detect', '--json', 'x.tsx'], { ...com({ ler: () => Buffer.from('outro binário') }), executar: f.executar });
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /motor ausente: leia o PRODUCT\.md e o DESIGN\.md direto/);
  assert.match(r.erro, /SHA-256/);
  assert.equal(f.chamadas.length, 0, 'hash diferente: nada roda');
});

test('B: o motor ausente sai com erro e a frase pedida, sem rodar nem baixar nada', () => {
  const f = falso();
  const r = lancar(['detect', '--json', 'x.tsx'], { ...com({ existe: (c) => c !== MOTOR }), executar: f.executar });
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /motor ausente: leia o PRODUCT\.md e o DESIGN\.md direto/);
  assert.match(r.erro, /nunca baixa/);
  assert.equal(f.chamadas.length, 0, 'sem o arquivo, nada roda (nem o lançador da skill, que baixaria)');
  // o arquivo que existe mas não se lê também é motor ausente
  const g = falso();
  const s = lancar(['context'], { ...com({ ler: () => { throw new Error('EACCES'); } }), executar: g.executar });
  assert.equal(s.codigo, 3);
  assert.equal(g.chamadas.length, 0);
});

test('B: sem o sandbox-exec na máquina, sai 3 e o motor não roda solto', () => {
  const f = falso();
  const r = lancar(['context'], { ...com({ existe: (c) => c !== SANDBOX_EXEC }), executar: f.executar });
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /motor ausente: leia o PRODUCT\.md e o DESIGN\.md direto/);
  assert.match(r.erro, /sandbox-exec/);
  assert.equal(f.chamadas.length, 0);
  assert.equal(SANDBOX_EXEC, '/usr/bin/sandbox-exec');
});

test('B e C: o motor roda pelo sandbox-exec, com o perfil que nega a rede e a pasta dos segredos, e o filho recebe as chaves, o IMPECCABLE_BIN e o IMPECCABLE_SELF', () => {
  const f = falso({ status: 0 });
  const existiu = [];
  const r = lancar(['detect', '--json', 'apps/web/x.tsx'], { ...com({ existe: (c) => (existiu.push(c), true) }), executar: f.executar });
  assert.deepEqual(r, { codigo: 0, erro: null });
  assert.deepEqual(existiu.sort(), [MOTOR, SANDBOX_EXEC].sort(), 'só olha o caminho preso e o sandbox-exec, nenhum outro candidato');
  assert.equal(f.chamadas.length, 1);
  const [chamada] = f.chamadas;
  assert.equal(chamada.comando, SANDBOX_EXEC);
  assert.equal(chamada.args[0], '-p');
  assert.equal(chamada.args[1], perfilDaCaixa(CASA));
  assert.deepEqual(chamada.args.slice(2), [MOTOR, 'detect', '--json', 'apps/web/x.tsx']);
  assert.ok(!('shell' in chamada.opcoes) || chamada.opcoes.shell === false, 'sem shell');
  const env = chamada.opcoes.env;
  assert.equal(env.IMPECCABLE_BIN, MOTOR);
  assert.equal(env.IMPECCABLE_SKILL_DIR, PASTA_DA_SKILL);
  assert.equal(env.IMPECCABLE_SELF, 'node .claude/hooks/impeccable.mjs');
  for (const chave of ['IMPECCABLE_NO_UPDATE_CHECK', 'IMPECCABLE_NO_TELEMETRY', 'IMPECCABLE_NO_STALENESS_CHECK', 'DO_NOT_TRACK']) {
    assert.equal(env[chave], '1', chave);
  }
  assert.deepEqual(Object.keys(CHAVES_DESLIGADAS).sort(), ['DO_NOT_TRACK', 'IMPECCABLE_NO_STALENESS_CHECK', 'IMPECCABLE_NO_TELEMETRY', 'IMPECCABLE_NO_UPDATE_CHECK']);
});

test('B: o perfil da caixa nega a rede e a leitura e a escrita da pasta dos segredos locais, e escapa o que viria na casa', () => {
  const perfil = perfilDaCaixa(CASA);
  assert.match(perfil, /\(deny network\*\)/);
  assert.match(perfil, /\(deny file\* \(subpath "\/casa\/inventada\/\.disparador-local"\)\)/);
  assert.ok(perfil.indexOf('(allow default)') < perfil.indexOf('(deny network*)'), 'o deny vem depois do allow, que senão o allow o vence');
  // uma casa com aspas ou barra invertida não escapa da string do perfil
  const torta = perfilDaCaixa('/c"asa\\x');
  assert.ok(torta.includes('"/c\\"asa\\\\x/.disparador-local"'), torta);
});

test('o ambiente do filho é mínimo: o segredo do processo e as chaves da impeccable que vieram de fora não passam, e as quatro valem mesmo se de fora vierem desligadas', () => {
  const deFora = { PATH: '/bin', HOME: CASA, OPENAI_API_KEY: 'segredo-inventado', GITHUB_TOKEN: 'x', IMPECCABLE_DOWNLOAD_BASE: 'https://exemplo.invalido', IMPECCABLE_BIN: '/outro/motor', IMPECCABLE_SELF: '/outro/lancador', IMPECCABLE_NO_TELEMETRY: '0', DO_NOT_TRACK: '0' };
  const env = ambienteDoFilho('/motor', deFora, '/skill');
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, CASA);
  assert.equal(env.IMPECCABLE_BIN, '/motor', 'o IMPECCABLE_BIN de fora não vence o preso');
  assert.equal(env.IMPECCABLE_SELF, SELF, 'o IMPECCABLE_SELF de fora não vence o preso');
  assert.equal(env.IMPECCABLE_NO_TELEMETRY, '1');
  assert.equal(env.DO_NOT_TRACK, '1');
  for (const nome of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'IMPECCABLE_DOWNLOAD_BASE']) assert.ok(!(nome in env), nome);
});

test('o código de saída do motor passa, e o filho que nem sobe (error) vira motor ausente', () => {
  assert.deepEqual(lancar(['context'], { ...com(), executar: falso({ status: 7 }).executar }), { codigo: 7, erro: null });
  assert.equal(lancar(['context'], { ...com(), executar: falso({ status: null }).executar }).codigo, 1, 'morto por sinal: não é zero');
  const r = lancar(['context'], { ...com(), executar: falso({ error: new Error('ENOENT') }).executar });
  assert.equal(r.codigo, 3);
  assert.match(r.erro, /motor ausente/);
});

test('o caminho do motor é um só: <casa>/.impeccable/bin/<versão>/impeccable', () => {
  assert.equal(caminhoDoMotor('0.1.11', CASA), MOTOR);
});

test('a versão da tabela é a do scripts/VERSION da skill copiada (o arquivo não decide, só confere)', () => {
  const v = readFileSync(join(PASTA_DA_SKILL, 'scripts', 'VERSION'), 'utf8').trim();
  assert.equal(MOTORES['darwin-arm64'].versao, v);
});

test('A: a cópia da skill não traz o lançador original (que baixa do GitHub) nem o JavaScript do comando live', () => {
  const scripts = join(PASTA_DA_SKILL, 'scripts');
  assert.ok(!existsSync(join(scripts, 'impeccable')), 'scripts/impeccable');
  assert.ok(!existsSync(join(scripts, 'impeccable.cmd')), 'scripts/impeccable.cmd');
  const nomes = readdirSync(scripts);
  assert.deepEqual(nomes.filter((n) => /^live-browser|^modern-screenshot/.test(n)), []);
});

test('de ponta a ponta, sem motor (HOME vazio): o verbo de fora e a URL saem 2 e o motor ausente sai 3, com a mensagem no stderr', () => {
  const rodar = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/pasta/sem/motor', USERPROFILE: '/pasta/sem/motor' } });
  const recusado = rodar('live');
  assert.equal(recusado.status, 2);
  assert.match(recusado.stderr, /verbo recusado/);
  const url = rodar('detect', 'https://exemplo.invalid');
  assert.equal(url.status, 2);
  assert.match(url.stderr, /URL recusada/);
  const ausente = rodar('context');
  assert.equal(ausente.status, 3);
  assert.match(ausente.stderr, /motor ausente: leia o PRODUCT\.md e o DESIGN\.md direto/);
  assert.equal(ausente.stdout, '');
});
