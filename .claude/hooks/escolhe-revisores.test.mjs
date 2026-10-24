// O escolhe-revisores.mjs: o diff do git vira a lista de revisores obrigatórios (sempre, gatilhos, comportamento).
// A escolha (`escolher`, `formatar`, `interpretarDiff`) é testada dentro do processo, com o diff montado à mão (`em`/`texto`);
// um git de verdade numa pasta temporária e a linha de comando ficam só onde o git ou a linha de comando é o que se testa
// (nomes difíceis, binário, merge-base, --trabalho, a regra do head e da base, opções, erros). Os gatilhos um a um estão em
// escolhe-revisores.gatilhos.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO, lerAgentes, lerNiveis, lerPastas, lerRevisao, par, revisaoDeObjeto } from './config.mjs';
import { escolher, formatar, interpretarDiff, unirRevisao } from './escolhe-revisores.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(AQUI, 'escolhe-revisores.mjs');
const RAIZ = join(AQUI, '..', '..');
const config = () => ({ agentes: lerAgentes().valor, niveis: lerNiveis().valor, revisao: lerRevisao().valor, pastas: lerPastas().valor });
const nomes = (lista) => lista.map((r) => r.nome).sort();
const SEMPRE = ['revisor-arquitetura', 'ponytail-review'];
const PIPELINE = readFileSync(ARQUIVO, 'utf8');
/** O par de um agente fixo como o pipeline.json de verdade diz agora: o ajuste automático muda esses pares, então o teste não os crava. */
const nivel = (nome) => par(lerAgentes().valor[nome]);
const GRANT = 'grant execute on function f() to authenticated;\n';

// ---------- dentro do processo: o diff montado à mão ----------

const linhasDe = (t) => {
  const l = t.split('\n');
  if (l.at(-1) === '') l.pop();
  return l;
};
/**
 * O diff de `antes` para `depois` (arquivos { caminho: texto }) como o interpretarDiff o devolveria: só os caminhos de `depois`
 * e de `apagar`; linha nova = a que não estava em `antes`, removida = a que não está mais em `depois`.
 */
function diffDe(antes, depois, apagar = []) {
  const saida = [];
  for (const caminho of [...Object.keys(depois), ...apagar]) {
    const a = linhasDe(antes[caminho] ?? '');
    const d = apagar.includes(caminho) ? [] : linhasDe(depois[caminho]);
    const restoA = [...a];
    const novas = [];
    d.forEach((texto, i) => {
      const k = restoA.indexOf(texto);
      if (k === -1) novas.push({ n: i + 1, texto });
      else restoA.splice(k, 1);
    });
    saida.push({ caminho, binario: false, linhas: novas, removidas: restoA.map((texto) => ({ n: a.indexOf(texto) + 1, texto })) });
  }
  return saida;
}
/** A escolha para a mudança de `antes` para `depois` (o mesmo objeto que o --json imprime). */
const em = (antes, depois, { apagar = [], ...opcoes } = {}) => escolher(diffDe(antes, depois, apagar), config(), opcoes);
const texto = (antes, depois, { apagar = [], ...opcoes } = {}) => formatar(em(antes, depois, { apagar, ...opcoes }), 'HEAD~1', 'HEAD');
const seguranca = (r) => r.obrigatorios.find((x) => x.nome === 'revisor-seguranca');

// ---------- num git de verdade ----------

/** Um repositório git temporário (com o pipeline.json de verdade na base): `commits` é uma lista de { arquivos, apagar?, branch? }; o 1º é a base. Devolve { raiz, git }. */
function repositorio(commits) {
  const raiz = mkdtempSync(join(tmpdir(), 'revisores-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', '-c', 'core.autocrlf=false', ...args], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  commits.forEach(({ arquivos = {}, apagar = [], branch }, i) => {
    if (branch !== undefined) git('switch', '-q', '-c', branch);
    grava(raiz, { ...(i === 0 ? { 'README.md': 'x\n', '.claude/pipeline.json': PIPELINE } : {}), ...arquivos });
    for (const a of apagar) rmSync(join(raiz, a));
    git('add', '-A');
    git('commit', '-q', '-m', `c${i}`);
  });
  return { raiz, git };
}
function grava(raiz, arquivos) {
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), conteudo);
  }
}
/** Um diff de HEAD~1 para HEAD de `antes` para `depois`. */
const doisCommits = (antes, depois, apagar = []) => repositorio([{ arquivos: antes }, { arquivos: depois, apagar }]);
function rodar(raiz, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: raiz, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: () => JSON.parse(r.stdout) };
}
const com = (r, fn) => {
  try {
    fn(r);
  } finally {
    rmSync(r.raiz, { recursive: true, force: true });
  }
};

// ---------- a escolha ----------

test('uma migration com grant: arquitetura e ponytail (sempre) mais a segurança, pelos gatilhos banco e permissao, com arquivo e linha', () => {
  const saida = em({}, { 'packages/db/migrations/20261101000000_x.sql': `create table t (id int);\n${GRANT}` });
  assert.deepEqual(nomes(saida.obrigatorios), [...SEMPRE, 'revisor-seguranca', 'qa'].sort(), 'migration é código: sempre, segurança e o qa pelo caminho');
  const seg = seguranca(saida);
  assert.equal(seg.nivel, nivel('revisor-seguranca'));
  assert.ok(seg.motivos.some((m) => m.gatilho === 'banco' && m.arquivo === 'packages/db/migrations/20261101000000_x.sql' && m.por === 'caminho'));
  assert.ok(seg.motivos.some((m) => m.gatilho === 'permissao' && m.linha === 2 && /grant/.test(m.por)), 'a linha 2 tem o grant');
});

test('uma tela pura: arquitetura, ponytail, o revisor-tela e o qa (a tela está em src/); --sem-comportamento tira o qa e o motivo aparece', () => {
  const antes = { 'src/x/Tela.jsx': 'export default function T() { return null; }\n' };
  const depois = { 'src/x/Tela.jsx': 'export default function T() { return <p>oi</p>; }\n', 'src/x/tela.css': '.a { color: red; }\n' };
  const t = texto(antes, depois);
  assert.ok(t.includes(`revisor-arquitetura  ${nivel('revisor-arquitetura')}\n`));
  assert.ok(t.includes(`qa  ${nivel('qa')}\n      comportamento: toca src/x/`));
  assert.ok(t.includes(`revisor-tela  ${nivel('revisor-tela')}\n      gatilho tela: src/x/Tela.jsx (caminho)`));
  assert.doesNotMatch(t, /revisor-seguranca|revisor-lgpd/);
  const sem = em(antes, depois, { semComportamento: 'só CSS e texto, sem lógica' });
  assert.deepEqual(nomes(sem.obrigatorios), [...SEMPRE, 'revisor-tela'].sort());
  assert.deepEqual(sem.dispensados, [{ nome: 'qa', motivo: 'só CSS e texto, sem lógica' }]);
  assert.match(texto(antes, depois, { semComportamento: 'só CSS' }), /Dispensado[\s\S]*qa: só CSS/);
});

test('código fora das pastas do produto (.claude/hooks): o qa fica condicional e --comportamento o torna obrigatório', () => {
  const saida = em({ '.claude/hooks/x.mjs': 'a\n' }, { '.claude/hooks/x.mjs': 'b\n' });
  assert.deepEqual(nomes(saida.condicionais), ['qa']);
  const forcado = em({ '.claude/hooks/x.mjs': 'a\n' }, { '.claude/hooks/x.mjs': 'b\n' }, { comportamento: true });
  assert.ok(nomes(forcado.obrigatorios).includes('qa'));
  assert.deepEqual(forcado.condicionais, []);
});

test('mudar um dado pessoal (cpf): LGPD e segurança, pelo gatilho dado_pessoal; o trecho achado nunca é repetido na saída', () => {
  const t = texto({ 'src/contatos/x.js': 'export const a = 1;\n' }, { 'src/contatos/x.js': "export const a = 1;\nexport const q = 'select cpf from pessoas';\n" });
  assert.ok(t.includes(`revisor-lgpd  ${nivel('revisor-lgpd')}\n      gatilho dado_pessoal: src/contatos/x.js:2 (conteudo /cpf/)`));
  assert.ok(t.includes(`revisor-seguranca  ${nivel('revisor-seguranca')}\n      gatilho dado_pessoal`));
  assert.doesNotMatch(t, /select cpf/, 'a linha do diff não vai para a saída');
});

test('markdown, arquivo de teste e linha apagada sem gatilho de remoção não acionam gatilho de conteúdo; só documentação: nenhum revisor', () => {
  assert.deepEqual(em({ 'docs/z.md': 'a\n' }, { 'docs/z.md': 'grant e cpf e security definer\n' }).obrigatorios, []);
  const testes = em({ 'src/x/a.test.mjs': 'a\n', 'src/__tests__/b.js': 'a\n', '.claude/hooks/x.test.mjs': 'a\n' },
    { 'src/x/a.test.mjs': "const cpf = 'x';\n", 'src/__tests__/b.js': 'const celular = 1;\n', '.claude/hooks/x.test.mjs': 'const celular = 1;\n' });
  assert.ok(!nomes(testes.obrigatorios).includes('revisor-lgpd'), 'a linha de teste não aciona o gatilho de conteúdo');
  const apagada = em({ 'src/lib/y.js': 'const cpf = 1;\n' }, { 'src/lib/y.js': 'const outro = 1;\n' });
  assert.ok(nomes(apagada.obrigatorios).includes('revisor-lgpd'), 'apagar uma linha de dado pessoal também chama a LGPD (dado_pessoal conta remoção: tirar o campo, a anonimização ou a purga é mudança de tratamento)');
});

test('um .sql fora das pastas de trabalho (docs/) conta pelo conteúdo e pelo gatilho banco', () => {
  const saida = em({ 'docs/schema-x.sql': '-- a\n' }, { 'docs/schema-x.sql': 'create policy p on t using (true);\n' });
  assert.deepEqual(nomes(saida.obrigatorios), [...SEMPRE, 'revisor-seguranca'].sort(), '.sql é código em qualquer lugar: o sempre também chama');
  assert.ok(seguranca(saida).motivos.some((m) => m.gatilho === 'permissao' && m.linha === 1));
});

test('o corte de motivos: no máximo 3 por revisor, com a contagem do resto', () => {
  const linhas = Array.from({ length: 6 }, (_, i) => `grant select on t${i} to authenticated;`).join('\n');
  const antes = {};
  const depois = { 'packages/db/migrations/20261101000000_x.sql': `${linhas}\n` };
  const seg = seguranca(em(antes, depois));
  assert.equal(seg.motivos.length, 3);
  assert.ok(seg.total > 3);
  assert.match(texto(antes, depois), /e mais \d+ motivo\(s\)/);
});

test('a linha de autorização removida chama o revisor-seguranca (permissao conta remoção), em src/lib/ e em src/api/', () => {
  const saida = em({ 'src/lib/x.js': 'if (!autorizado) return new Response(null, { status: 403 });\nconst a = 1;\n', 'src/api/y/route.js': "const a = await fetch('x');\n" }, { 'src/lib/x.js': 'const a = 1;\n', 'src/api/y/route.js': 'const a = 1;\n' });
  const seg = seguranca(saida);
  assert.ok(seg, 'segurança chamada');
  assert.ok(seg.motivos.some((m) => m.gatilho === 'permissao' && m.arquivo === 'src/lib/x.js' && m.linha === 1 && /removida/.test(m.por)));
  assert.ok(seg.motivos.some((m) => m.gatilho === 'rede_rota' && m.arquivo === 'src/api/y/route.js'));
});

test('o lgpd-ignora vale em todo arquivo e em toda forma de comentário (a regex é a do confere-lgpd): teste, __tests__ e markdown chamam o revisor-lgpd', () => {
  const t = ['lgpd-ignora:', 'celular', '-- dado inventado para o teste'].join(' '); // montado: este arquivo não pode ser, ele mesmo, uma supressão
  const formas = [`// ${t}`, ` * ${t}`, `/** ${t} */`, `-- ${t}`, `# ${t}`, `<!-- ${t} -->`];
  for (const caminho of ['src/__tests__/x.js', 'src/x/y.test.mjs', 'docs/z.md', '.claude/hooks/w.test.mjs']) {
    const lgpd = em({ [caminho]: 'a\n' }, { [caminho]: `${formas.join('\n')}\n` }).obrigatorios.find((r) => r.nome === 'revisor-lgpd');
    const linhas = lgpd?.motivos.filter((m) => m.gatilho === 'lgpd_ignora' && m.arquivo === caminho).map((m) => m.linha);
    assert.deepEqual(linhas, [1, 2, 3], caminho); // o corte mostra 3 motivos; as seis linhas casam
    assert.equal(lgpd.total >= formas.length, true, `${caminho}: as ${formas.length} formas casam`);
  }
  assert.ok(!nomes(em({ 'src/lib/y.js': 'a\n' }, { 'src/lib/y.js': '// lgpd-ignora: regra_x\n' }).obrigatorios).includes('revisor-lgpd'), 'sem o "-- motivo" não é supressão do confere-lgpd');
});

test('mudar o .claude/pipeline.json chama a segurança e a arquitetura; a regex dele não aciona o dado_pessoal', () => {
  const real = JSON.parse(PIPELINE);
  const saida = em({ '.claude/pipeline.json': JSON.stringify(real, null, 2) }, { '.claude/pipeline.json': JSON.stringify({ ...real, nota: 'celular cpf' }, null, 2) });
  assert.deepEqual(nomes(saida.obrigatorios), [...SEMPRE, 'revisor-seguranca'].sort(), 'o .json é código: o sempre chama');
  assert.ok(seguranca(saida).motivos.every((m) => m.gatilho === 'config_pipeline'));
  assert.ok(!nomes(saida.obrigatorios).includes('revisor-lgpd'));
});

test('escolher: um revisor que não existe no pipeline.json é erro, não omissão', () => {
  const cfg = config();
  cfg.revisao = { ...cfg.revisao, sempre: ['fantasma'] };
  assert.throws(() => escolher([{ caminho: 'src/lib/x.js', linhas: [], removidas: [] }], cfg), /revisor fantasma \(sempre\) não existe/);
});

test('formatar mostra o intervalo, os níveis do pipeline.json e o corte', () => {
  const r = escolher([{ caminho: 'src/auth/papeis.js', linhas: [{ n: 3, texto: 'x' }], removidas: [] }], config());
  const t = formatar(r, 'a', 'b');
  assert.match(t, /Revisores de a\.\.b: 1 arquivo\(s\) de código\./);
  assert.match(t, /gatilho permissao: src\/auth\/papeis\.js \(caminho\)/);
  assert.match(t, /Obrigatórios \(lance todos; pode acrescentar, nunca tirar\)/);
});

test('o .claude/ fica fora do conteúdo do dado_pessoal: mexer nos hooks e no pipeline não chama o revisor-lgpd, mas mexer na regra do confere-lgpd chama', () => {
  const saida = em({ '.claude/hooks/x.mjs': 'a\n' }, { '.claude/hooks/x.mjs': "const q = 'celular cpf';\n" });
  assert.ok(!nomes(saida.obrigatorios).includes('revisor-lgpd'), 'palavra de dado pessoal em código do pipeline não é dado pessoal');
  assert.ok(nomes(saida.obrigatorios).includes('revisor-seguranca'), 'o config_pipeline chama a segurança');
  for (const caminho of ['.claude/hooks/lgpd-regras.mjs', '.claude/hooks/config.mjs', '.claude/hooks/confere-lgpd.mjs', '.claude/hooks/confere-lgpd.test.mjs', '.claude/agents/revisor-lgpd.md']) {
    const lgpd = em({ [caminho]: 'a\n' }, { [caminho]: 'b\n' }).obrigatorios.find((r) => r.nome === 'revisor-lgpd');
    assert.ok(lgpd?.motivos.some((m) => m.gatilho === 'lgpd_regras' && m.arquivo === caminho), caminho);
  }
});

test('o .claude/ não aciona a permissao nem o dado_pessoal pelo conteúdo: a linha de permissão e a de celular ali ficam com o config_pipeline', () => {
  const saida = em({ '.claude/hooks/z.mjs': 'a\n' }, { '.claude/hooks/z.mjs': `const celular = 1;\n${GRANT}` });
  assert.ok(nomes(saida.obrigatorios).includes('revisor-seguranca'), 'o config_pipeline chama a segurança');
  assert.ok(!nomes(saida.obrigatorios).includes('revisor-lgpd'));
  assert.ok(seguranca(saida).motivos.every((m) => m.gatilho === 'config_pipeline'));
});

test('um branch que afrouxa o ignorar do dado_pessoal pede o revisor-lgpd uma vez; com a regra já na base, não pede mais', () => {
  const real = JSON.parse(PIPELINE);
  const velha = structuredClone(real);
  velha.revisao.gatilhos.find((g) => g.nome === 'dado_pessoal').ignorar = [];
  const arquivos = diffDe({ '.claude/hooks/x.mjs': 'a\n' }, { '.claude/hooks/x.mjs': "const q = 'celular cpf';\n" });
  const doBranch = { ...config(), revisao: unirRevisao(revisaoDeObjeto(velha.revisao).valor, revisaoDeObjeto(real.revisao).valor) };
  const lgpd = escolher(arquivos, doBranch).obrigatorios.find((r) => r.nome === 'revisor-lgpd');
  assert.ok(lgpd?.motivos.some((m) => m.gatilho === 'dado_pessoal'), 'a base não ignorava o .claude/: afrouxar a regra no mesmo branch não cala o gatilho');
  const jaNaBase = { ...config(), revisao: unirRevisao(revisaoDeObjeto(real.revisao).valor, revisaoDeObjeto(real.revisao).valor) };
  assert.ok(!nomes(escolher(arquivos, jaNaBase).obrigatorios).includes('revisor-lgpd'), 'com a regra já na base, o próximo branch não pede');
});

test('um ignorar que cala um gatilho de proteção, no gatilho ou no global, é recusado já na leitura do revisao', () => {
  for (const [rotulo, muda, esperado] of [
    ['ignorar "." no permissao', (r) => { r.gatilhos.find((g) => g.nome === 'permissao').ignorar = ['.']; }, /permissao: um ignorar casa com src\/x\/servidor\.ts/],
    ['ignorar_conteudo "." global', (r) => { r.ignorar_conteudo.push('.'); }, /um ignorar casa com/],
    ['ignorar do dado_pessoal sobre src/x', (r) => { r.gatilhos.find((g) => g.nome === 'dado_pessoal').ignorar = ['^src/x/']; }, /dado_pessoal: um ignorar casa com src\/x\/dados\.ts/],
    ['ignorar do permissao sobre src/api', (r) => { r.gatilhos.find((g) => g.nome === 'permissao').ignorar = ['^src/api/']; }, /permissao: um ignorar casa com src\/api\/x\/route\.ts/],
    ['ignorar do banco sobre db/', (r) => { r.gatilhos.find((g) => g.nome === 'banco').ignorar = ['^db/']; }, /banco: um ignorar casa com db\/migrations\/20260101000000_x\.sql/],
    ['ignorar do rede_rota', (r) => { r.gatilhos.find((g) => g.nome === 'rede_rota').ignorar = ['^src/']; }, /rede_rota: um ignorar casa com src\/x\/servidor\.ts/],
  ]) {
    const j = JSON.parse(PIPELINE);
    muda(j.revisao);
    assert.match(revisaoDeObjeto(j.revisao).erro, esperado, rotulo);
  }
});

test('cada regex de caminho de cada gatilho casa com ao menos um arquivo do repositório (ou com um exemplo genérico do modelo)', () => {
  // Os caminhos genéricos do modelo (pastas que o modelo ainda não tem: src/, db/): cada um tem de casar com um exemplo.
  // O projeto que soma caminhos dele no pipeline.json é pego aqui se um deles não casar com arquivo nenhum do repositório.
  const EXEMPLOS_DO_MODELO = [
    'src/auth/sessao.ts', 'src/x/permissoes.ts', 'src/x/papeis.ts', 'src/middleware.ts', 'db/migrations/20260101000000_x.sql', 'src/api/x/route.ts',
    'src/servidor/x.ts', 'src/routes/x.ts', 'src/controllers/x.ts', 'src/handlers/x.ts', 'src/app/x/route.ts', 'src/x/Tela.jsx', 'src/actions/x.ts', 'src/app/clientes/actions.ts',
    'src/roles/x.ts', 'src/cargos/x.ts', 'src/rbac/x.ts', 'src/acl/x.ts', 'src/policies/x.ts', 'src/guards/x.ts', 'src/sessoes/x.ts', 'src/login/x.ts', 'src/jwt.ts', 'src/permissoes/x.ts',
    'prisma/schema.prisma', 'db/migrations/1_x.ts', 'apps/web/x.tsx', 'packages/ui/x.vue', 'src/x/y.svelte', 'src/x/y.css', 'src/x/y.scss', 'src/index.html', 'src/x/y.ts',
  ];
  const doRepositorio = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const arquivos = [...doRepositorio, ...EXEMPLOS_DO_MODELO];
  const { gatilhos, comportamento_caminhos: porCaminho } = lerRevisao().valor;
  for (const g of gatilhos) {
    for (const re of g.caminhos) assert.ok(arquivos.some((a) => re.test(a)), `gatilho ${g.nome}: ${re.source} não casa com nenhum arquivo`);
  }
  for (const re of porCaminho) assert.ok(arquivos.some((a) => re.test(a)), `comportamento_caminhos: ${re.source}`);
});

test('a configuração é a união da base com o head: um branch não se avalia pela regra que ele mesmo afrouxou', () => {
  const real = JSON.parse(PIPELINE);
  const rigida = structuredClone(real);
  rigida.revisao.gatilhos.find((g) => g.nome === 'banco').conteudo.push('segredo_especial');
  const afrouxada = structuredClone(real);
  afrouxada.revisao.ignorar_conteudo.push('^src/public/');
  afrouxada.revisao.gatilhos.find((g) => g.nome === 'permissao').ignorar = ['^src/public/'];
  const a = revisaoDeObjeto(rigida.revisao).valor;
  const b = revisaoDeObjeto(afrouxada.revisao).valor;
  const uniao = unirRevisao(a, b);
  const arquivos = diffDe({ 'src/public/x.js': 'a\n' }, { 'src/public/x.js': `a\n${GRANT}` });
  const seg = seguranca(escolher(arquivos, { ...config(), revisao: uniao }));
  assert.ok(seg.motivos.some((m) => m.arquivo === 'src/public/x.js' && m.gatilho === 'permissao'), 'o ^src/public/ que o head passou a ignorar (global e no gatilho) não vale: a base não ignorava');
  assert.ok(uniao.gatilhos.find((g) => g.nome === 'banco').conteudo.some((re) => re.source === 'segredo_especial'), 'soma o conteúdo da base');
  assert.ok(!uniao.ignorar.some((re) => re.source === '^src/public/'), 'o que só um lado ignora, ninguém ignora');
  assert.deepEqual(uniao.gatilhos.find((g) => g.nome === 'permissao').ignorar, [], 'o ignorar do gatilho também é a interseção');
  assert.deepEqual(uniao.gatilhos.find((g) => g.nome === 'dado_pessoal').ignorar.map((re) => re.source).sort(), ['^\\.claude\\/'].sort(), 'o que os dois ignoram continua ignorado');
});

test('o gatilho tela: um arquivo de tela (.jsx, .tsx, .vue, .svelte, .css, .scss, .html) de src/, apps/ ou packages/ tocado, criado ou apagado, chama o revisor-tela; código sem tela e o que está fora dessas pastas não chamam (D3)', () => {
  const chamaTela = (r) => nomes(r.obrigatorios).includes('revisor-tela');
  for (const caminho of ['src/x/Tela.jsx', 'src/x/tela.css', 'src/globals.css', 'src/[modulo]/page.jsx', 'apps/web/Tela.tsx', 'packages/ui/Botao.vue', 'src/x/Cartao.svelte', 'src/x/estilo.scss', 'src/index.html']) {
    assert.ok(chamaTela(em({ [caminho]: 'a\n' }, { [caminho]: 'b\n' })), `mexido: ${caminho}`);
    assert.ok(chamaTela(em({}, { [caminho]: 'b\n' })), `criado: ${caminho}`);
    assert.ok(chamaTela(em({ [caminho]: 'a\n' }, {}, { apagar: [caminho] })), `apagado: ${caminho}`);
  }
  const tela = em({}, { 'src/x/Tela.jsx': 'b\n' }).obrigatorios.find((r) => r.nome === 'revisor-tela');
  assert.deepEqual(tela.motivos.map((m) => [m.gatilho, m.por, m.arquivo]), [['tela', 'caminho', 'src/x/Tela.jsx']]);
  for (const caminho of ['src/campanhas/acoes.js', 'src/api/lista/route.js', 'src/x/servidor.js', 'scripts/Tela.jsx', 'public/tela.css', 'docs/tela.css', 'src/x/tela.md']) {
    assert.ok(!chamaTela(em({ [caminho]: 'a\n' }, { [caminho]: 'b\n' })), caminho);
  }
});

test('--sem-tela "<motivo>" tira só o revisor-tela (texto, cópia, renome): o motivo vai para "Dispensado"; o qa e os outros ficam; a opção sem efeito é avisada (D3)', () => {
  const tela = [{ 'src/x/Tela.jsx': 'a\n' }, { 'src/x/Tela.jsx': 'b\n' }];
  assert.ok(nomes(em(...tela).obrigatorios).includes('revisor-tela'), 'sem a opção ele é obrigatório');
  const saida = em(...tela, { semTela: 'só troca de texto da tela' });
  assert.deepEqual(nomes(saida.obrigatorios), [...SEMPRE, 'qa'].sort(), 'só o revisor-tela sai; o qa continua obrigatório');
  assert.deepEqual(saida.dispensados, [{ nome: 'revisor-tela', motivo: 'só troca de texto da tela' }]);
  const t = texto(...tela, { semTela: 'só renome' });
  assert.match(t, /Dispensado[\s\S]*revisor-tela: só renome/);
  assert.doesNotMatch(t, /^ {2}- revisor-tela /m);
  const os2 = em(...tela, { semTela: 'só texto', semComportamento: 'só texto' });
  assert.deepEqual(os2.dispensados.map((d) => d.nome).sort(), ['qa', 'revisor-tela']);
  const semTelaNoDiff = em({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n' }, { semTela: 'x' });
  assert.deepEqual(semTelaNoDiff.dispensados, [], 'sem tela no diff não há o que dispensar');
  assert.deepEqual(semTelaNoDiff.semEfeito, [{ nome: 'revisor-tela', opcao: '--sem-tela' }]);
  assert.match(texto({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n' }, { semTela: 'x' }), /revisor-tela não era obrigatório: --sem-tela sem efeito/);
  assert.doesNotMatch(texto({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n' }), /sem efeito/, 'sem a opção não há aviso');
  assert.doesNotMatch(texto(...tela, { semTela: 'x' }), /sem efeito/, 'com tela no diff a opção teve efeito');
  assert.deepEqual(em(...tela, { semTela: 'x' }).semEfeito, []);
  const doc = [{ 'docs/z.md': 'a\n' }, { 'docs/z.md': 'b\n' }];
  assert.match(texto(...doc, { semComportamento: 'só texto' }), /qa não era obrigatório: --sem-comportamento sem efeito/, 'sem código não há qa a dispensar');
  assert.deepEqual(em(...doc, { semComportamento: 'x' }).semEfeito, [{ nome: 'qa', opcao: '--sem-comportamento' }]);
  assert.doesNotMatch(texto({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n' }, { semComportamento: 'x' }), /sem efeito/, 'com código o qa foi dispensado');
});

test('código é qualquer arquivo com extensão de código em qualquer lugar do repositório, não só nas pastasDeTrabalho; o resto não chama o sempre', () => {
  for (const caminho of ['src/index.ts', 'db/migrations/001.sql', 'package.json', 'scripts/build.py', 'deploy/ci.yml', 'infra/main.go', 'web/estilo.css', 'web/index.html', 'prisma/schema.prisma', 'bin/x.sh', 'Cargo.toml']) {
    const saida = em({}, { [caminho]: 'x\n' });
    assert.ok(SEMPRE.every((n) => nomes(saida.obrigatorios).includes(n)), `${caminho}: é código`);
    assert.equal(saida.codigo, 1, caminho);
  }
  for (const caminho of ['README.md', 'docs/a.md', 'logo.svg', 'LICENSE', 'data/lista.txt', 'fonte.woff2']) {
    const saida = em({}, { [caminho]: 'y\n' });
    assert.deepEqual(saida.obrigatorios, [], `${caminho}: não é código`);
    assert.equal(saida.codigo, 0, caminho);
  }
});

// ---------- o diff: nomes difíceis, linhas que parecem cabeçalho, aspas, binário, base e árvore de trabalho ----------

test('interpretarDiff: cabeçalho com o nome entre aspas (diff fabricado) casa pela lista de nomes; o número da linha nova e o da velha', () => {
  const diff = [
    'diff --git "a/src/lib/\\303\\251.js" "b/src/lib/\\303\\251.js"', 'index 1..2 100644', '--- "a/src/lib/\\303\\251.js"', '+++ "b/src/lib/\\303\\251.js"',
    '@@ -1,0 +5,2 @@', '+um', '+dois', '@@ -9 +20 @@', '-velho', '+novo',
    'diff --git a/src/lib/b.js b/src/lib/b.js', 'deleted file mode 100644', '--- a/src/lib/b.js', '+++ /dev/null', '@@ -3 +0,0 @@', '-x', '\\ No newline at end of file',
    'diff --git a/src/public/i.png b/src/public/i.png', 'Binary files a/src/public/i.png and b/src/public/i.png differ',
  ].join('\n');
  const arquivos = interpretarDiff(diff, ['src/lib/é.js', 'src/lib/b.js', 'src/public/i.png']);
  assert.deepEqual(arquivos.map((a) => a.caminho), ['src/lib/é.js', 'src/lib/b.js', 'src/public/i.png']);
  assert.deepEqual(arquivos[0].linhas, [{ n: 5, texto: 'um' }, { n: 6, texto: 'dois' }, { n: 20, texto: 'novo' }]);
  assert.deepEqual(arquivos[0].removidas, [{ n: 9, texto: 'velho' }]);
  assert.deepEqual(arquivos[1].removidas, [{ n: 3, texto: 'x' }]);
  assert.deepEqual([arquivos[2].binario, arquivos[0].binario], [true, false]);
  assert.throws(() => interpretarDiff(diff, ['src/lib/é.js']), /não batem/, 'cabeçalhos a mais que nomes');
  assert.throws(() => interpretarDiff(diff, []), /não batem/, 'diff não vazio sem nenhum arquivo lido');
  assert.deepEqual(interpretarDiff('', []), []);
});

test('um diretório com " b/" no nome e um arquivo com espaço: o caminho sai certo, com a linha do grant (git de verdade)', () => {
  com(doisCommits({}, { 'src/lib/x b/y z.js': `// a\n${GRANT}` }), ({ raiz }) => {
    const seg = rodar(raiz, 'HEAD~1', 'HEAD', '--json').json().obrigatorios.find((r) => r.nome === 'revisor-seguranca');
    assert.deepEqual(seg.motivos.map((m) => [m.arquivo, m.linha]), [['src/lib/x b/y z.js', 2]]);
  });
});

test('uma linha adicionada que começa com "++" (parece cabeçalho) conta, e a numeração das seguintes continua (git de verdade)', () => {
  com(doisCommits({}, { 'src/lib/z.js': `ok\n++ ${GRANT}fim ${GRANT}` }), ({ raiz }) => {
    const seg = rodar(raiz, 'HEAD~1', 'HEAD', '--json').json().obrigatorios.find((r) => r.nome === 'revisor-seguranca');
    assert.deepEqual(seg.motivos.map((m) => m.linha), [2, 3]);
  });
});

test('um binário numa pasta de trabalho aciona os gatilhos de conteúdo (não dá para olhar dentro dele); a imagem só pela regra de print (git de verdade)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'revisores-bin-'));
  com({ raiz }, () => {
    const git = (...a) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'core.hooksPath=', '-c', 'core.autocrlf=false', ...a], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q', '-b', 'main');
    grava(raiz, { 'README.md': 'x\n', '.claude/pipeline.json': PIPELINE });
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    mkdirSync(join(raiz, 'src', 'public'), { recursive: true });
    writeFileSync(join(raiz, 'src', 'public', 'dados.bin'), Buffer.from([0, 1, 2, 0, 255]));
    writeFileSync(join(raiz, 'src', 'public', 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 1, 2, 0, 255]));
    git('add', '-A');
    git('commit', '-q', '-m', 'head');
    const saida = rodar(raiz, 'HEAD~1', 'HEAD', '--json').json();
    assert.deepEqual(nomes(saida.obrigatorios), ['revisor-lgpd', 'revisor-seguranca'], 'o .bin não é código (sem o sempre nem o qa), mas não se lê');
    const motivos = saida.obrigatorios.flatMap((r) => r.motivos);
    assert.ok(motivos.some((m) => /binário/.test(m.por) && m.arquivo === 'src/public/dados.bin'));
    assert.ok(!saida.obrigatorios.find((r) => r.nome === 'revisor-seguranca').motivos.some((m) => m.arquivo === 'src/public/logo.png'), 'o logo.png binário não dispara gatilho de conteúdo (a segurança não o vê)');
    assert.ok(saida.obrigatorios.find((r) => r.nome === 'revisor-lgpd').total >= 3, 'a LGPD vê o .bin (gatilho e binário desconhecido) e a imagem (regra de print)');
  });
});

test('a base é o merge-base: o que só a main adiantada mudou não entra (git de verdade)', () => {
  const r = repositorio([{ arquivos: { 'src/lib/a.js': 'a\n' } }, { branch: 'trabalho', arquivos: { 'src/lib/b.js': 'b\n' } }]);
  com(r, ({ raiz, git }) => {
    git('switch', '-q', 'main');
    grava(raiz, { 'packages/db/migrations/20261101000000_x.sql': GRANT });
    git('add', '-A');
    git('commit', '-q', '-m', 'main adiantada');
    const saida = rodar(raiz, 'main', 'trabalho', '--json').json();
    assert.deepEqual(nomes(saida.obrigatorios), [...SEMPRE, 'qa'].sort(), 'a migration da main não é da tarefa');
    const dois = rodar(raiz, 'trabalho', 'main', '--json').json();
    assert.ok(nomes(dois.obrigatorios).includes('revisor-seguranca'), 'no sentido contrário a migration é a mudança');
  });
});

test('--trabalho olha a árvore: o que ainda não foi commitado, inclusive arquivo novo (git de verdade)', () => {
  com(repositorio([{ arquivos: { 'src/lib/a.js': 'a\n' } }]), ({ raiz }) => {
    assert.equal(rodar(raiz, '--trabalho', '--json').json().obrigatorios.length, 0, 'árvore limpa: nada');
    grava(raiz, { 'src/lib/a.js': `a\n${GRANT}`, 'packages/db/migrations/20261101000000_n.sql': 'create table t (id int);\n' });
    const saida = rodar(raiz, '--trabalho', '--json').json();
    assert.ok(seguranca(saida).motivos.some((m) => m.arquivo === 'src/lib/a.js' && m.linha === 2), 'a edição não commitada');
    assert.ok(seguranca(saida).motivos.some((m) => m.gatilho === 'banco'), 'o arquivo novo, ainda fora do git');
  });
});

test('--trabalho pula o item novo que não é arquivo (repositório aninhado, link quebrado ou para pasta) em vez de morrer com EISDIR', () => {
  com(repositorio([{ arquivos: { 'src/lib/a.js': 'a\n' } }]), ({ raiz }) => {
    const aninhado = join(raiz, 'vendor', 'outro');
    mkdirSync(aninhado, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: aninhado });
    writeFileSync(join(aninhado, 'x.txt'), 'x\n');
    grava(raiz, { 'src/lib/b.js': `b\n${GRANT}` });
    const r = rodar(raiz, '--trabalho', '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(seguranca(r.json()).motivos.some((m) => m.arquivo === 'src/lib/b.js'), 'o arquivo novo de verdade continua entrando');
  });
});

test('a linha de comando: opções, regra do head e da base, erros e saída (um git de verdade, poucas chamadas)', () => {
  const real = JSON.parse(PIPELINE);
  const semTela = structuredClone(real);
  semTela.revisao.gatilhos = semTela.revisao.gatilhos.filter((g) => g.nome !== 'tela');
  const semSempre = structuredClone(real);
  semSempre.revisao.sempre = [];
  com(doisCommits({ 'src/x/Tela.jsx': 'a\n' }, { 'src/x/Tela.jsx': 'b\n' }), ({ raiz }) => {
    const r = rodar(raiz, 'HEAD~1', 'HEAD');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(`revisor-tela  ${nivel('revisor-tela')}\n      gatilho tela: src/x/Tela.jsx (caminho)`));
    const sem = rodar(raiz, 'HEAD~1', 'HEAD', '--sem-tela', 'só renome', '--sem-comportamento', 'só texto', '--json');
    assert.equal(sem.status, 0, sem.stderr);
    assert.deepEqual(sem.json().dispensados.map((d) => d.nome).sort(), ['qa', 'revisor-tela']);
    for (const args of [['--sem-tela'], ['--sem-tela', '--json'], ['--sem-tela', '  '], ['--sem-comportamento'], ['--inventada']]) {
      assert.equal(rodar(raiz, 'HEAD~1', 'HEAD', ...args).status, 2, args.join(' '));
    }
    assert.match(rodar(raiz, 'HEAD~1', 'HEAD', '--sem-tela').stderr, /--sem-tela pede o motivo/);
    for (const args of [[], ['--output=x', 'HEAD'], ['HEAD~1'], ['-x', 'HEAD']]) {
      const e = rodar(raiz, ...args);
      assert.equal(e.status, 2, args.join(' '));
      assert.match(e.stderr, /escolhe-revisores: /);
    }
  });
  com(doisCommits({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': `a\n${GRANT}` }), ({ raiz }) => {
    writeFileSync(join(raiz, '.claude', 'pipeline.json'), '{ quebrado');
    const git = rodar(raiz, 'HEAD~1', 'HEAD', '--json');
    assert.equal(git.status, 0, git.stderr);
    assert.ok(nomes(git.json().obrigatorios).includes('revisor-seguranca'), 'sem --trabalho a regra é a do git em <head>, nunca a do disco');
    const arvore = rodar(raiz, '--trabalho', '--json');
    assert.equal(arvore.status, 2);
    assert.match(arvore.stderr, /da árvore/);
  });
  com(doisCommits({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n', '.claude/pipeline.json': JSON.stringify(semTela) }), ({ raiz }) => {
    const r = rodar(raiz, 'HEAD~1', 'HEAD');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /o gatilho tela falta/);
    assert.match(r.stderr, /branch anterior à regra: traga a main \(git merge main\)/);
  });
  com(doisCommits({ 'src/lib/x.js': 'a\n' }, { 'src/lib/x.js': 'b\n', '.claude/pipeline.json': JSON.stringify(semSempre) }), ({ raiz }) => {
    const r = rodar(raiz, 'HEAD~1', 'HEAD');
    assert.equal(r.status, 2, 'o head que afrouxa abaixo do piso do código não se avalia');
    assert.match(r.stderr, /não podem ficar vazios/);
    assert.doesNotMatch(r.stderr, /traga a main/, 'outro erro de piso não acrescenta a dica');
  });
});

test('referência que não existe: "a referência <x> não existe"; a main que ainda não existe diz como criá-la; o nome com cara de opção continua sendo inválido', () => {
  com(doisCommits({}, { 'src/lib/x.js': 'a\n' }), ({ raiz, git }) => {
    const r = rodar(raiz, 'naoexiste', 'HEAD');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /escolhe-revisores: a referência naoexiste não existe\s*$/);
    assert.doesNotMatch(r.stderr, /fatal|bad revision|unknown revision/);
    const outroLado = rodar(raiz, 'HEAD~1', 'tambem-nao');
    assert.match(outroLado.stderr, /a referência tambem-nao não existe/);
    assert.equal(rodar(raiz, 'HEAD~1', 'HEAD').status, 0, 'as que existem seguem');
    git('branch', '-m', 'main', 'trabalho');
    const semMain = rodar(raiz, 'main', 'HEAD');
    assert.equal(semMain.status, 2);
    assert.match(semMain.stderr, /a referência main não existe/);
    assert.match(semMain.stderr, /crie a main pelo GitHub e traga com git pull, ver README/);
    assert.doesNotMatch(rodar(raiz, 'naoexiste', 'HEAD').stderr, /README/, 'a dica é só da main');
    assert.match(rodar(raiz, 'origin/main', 'HEAD').stderr, /crie a main pelo GitHub/, 'origin/main também');
  });
});
