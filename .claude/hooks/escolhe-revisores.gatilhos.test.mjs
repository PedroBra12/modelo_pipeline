// Os gatilhos genéricos do pipeline.json (permissao, rede_rota, banco, dado_pessoal, tela, ignorar_conteudo, documentação), o aviso
// do confere-lgpd e a mídia binária. Tudo dentro do processo: escolher() com um diff montado à mão, sem git (a linha de comando tem os testes dela).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerAgentes, lerNiveis, lerPastas, lerRevisao } from './config.mjs';
import { escolher } from './escolhe-revisores.mjs';

const cfg = { agentes: lerAgentes().valor, niveis: lerNiveis().valor, revisao: lerRevisao().valor, pastas: lerPastas().valor };
/** Um arquivo do diff com as linhas adicionadas (e as removidas) dadas; o número da linha é a posição (1, 2, ...). */
const arq = (caminho, adicionadas = [], removidas = []) => ({
  caminho, binario: false,
  linhas: adicionadas.map((texto, i) => ({ n: i + 1, texto })),
  removidas: removidas.map((texto, i) => ({ n: i + 1, texto })),
});
const chama = (arquivos, nome, gatilho) => {
  const r = escolher(arquivos, cfg).obrigatorios.find((x) => x.nome === nome);
  return r !== undefined && (gatilho === undefined || r.motivos.some((m) => m.gatilho === gatilho));
};
const nomesDe = (arquivos) => escolher(arquivos, cfg).obrigatorios.map((r) => r.nome).sort();
const linha = (l, gatilho, revisor = 'revisor-seguranca', caminho = 'src/x/dados.ts') => chama([arq(caminho, [l])], revisor, gatilho);

// ---------- permissao ----------

test('permissao: pelo caminho (auth e auth-*, papéis, cargos, rbac, acl, guards, sessão, middleware, proxy, login, jwt), com ou sem extensão', () => {
  for (const c of ['src/auth/x.ts', 'src/lib/auth.ts', 'src/lib/auth-utils.ts', 'src/auth-helpers.ts', 'src/auth_x/y.ts', 'src/papeis.js', 'src/roles/x.ts', 'src/role/x.ts', 'src/cargos/x.ts', 'src/rbac.ts', 'src/acl/x.ts', 'src/policies/x.ts', 'src/policy.ts',
    'src/guards/x.ts', 'src/guard.ts', 'src/sessao.ts', 'src/sessions/x.ts', 'src/session.ts', 'src/middleware.ts', 'proxy.js', 'src/login/page.ts', 'src/jwt.ts', 'src/permissoes/x.ts', 'src/permissions.ts']) {
    assert.ok(chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'permissao'), c);
  }
  for (const c of ['src/x/papelaria.ts', 'src/x/progress.ts', 'src/x/oauth.ts', 'src/x/unauth.ts']) assert.ok(!chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'permissao'), `${c} não é permissão`);
});

test('permissao: pelo conteúdo (policy, grant, revoke, security definer, autoriz, forbidden, permiss, papel/papéis, roles, .role, is_admin); role="button", 403 e 401 soltos não chamam', () => {
  for (const l of ['create policy p on t using (true);', 'alter policy p on t', 'alter table t enable row level security;', 'security definer', 'grant select on t to x;', 'revoke all on t from x;',
    'if (!autorizado) return;', 'throw forbidden()', 'class Unauthorized {}', 'const permissions = ["a"]', 'const permissao = 1', 'const papel = "admin"', 'const papéis = []', 'const roles = ["a"]', 'export const policies = []',
    "if (user.role === 'admin') return;", 'const r = session.role;', 'if (is_admin) {}', 'if (isAdmin(user)) {}', 'WHERE is_admin = true']) {
    assert.ok(linha(l, 'permissao'), l);
  }
  for (const l of ['<div role="button">', 'const n = 403;', 'status: 401', 'const role = 1;', 'supabase.auth.getUser()', 'const authenticated = true;', 'const admin = 1;']) {
    assert.ok(!chama([arq('src/x/Tela.tsx', [l])], 'revisor-seguranca', 'permissao'), `${l} não é permissão`);
  }
});

test('permissao: o .claude/ não aciona o gatilho pelo conteúdo (o config_pipeline já chama a segurança por lá)', () => {
  const r = escolher([arq('.claude/hooks/x.mjs', ['const permissao = 1; grant select'])], cfg).obrigatorios.find((x) => x.nome === 'revisor-seguranca');
  assert.ok(r.motivos.every((m) => m.gatilho === 'config_pipeline'), JSON.stringify(r.motivos));
  assert.ok(linha('grant select', 'permissao'));
});

test('permissao: a linha de permissão removida também chama a segurança', () => {
  assert.ok(chama([arq('src/x/dados.ts', [], ['if (!autorizado) return;'])], 'revisor-seguranca', 'permissao'));
  assert.ok(chama([arq('src/x/dados.ts', [], ['if (user.role !== "admin") return;'])], 'revisor-seguranca', 'permissao'));
});

// ---------- rede_rota ----------

test('rede_rota: api/, server/, servidor/, routes/, controllers/, handlers/, route.* e actions/ (server action) chamam a segurança pelo caminho', () => {
  for (const c of ['src/api/x.ts', 'pages/api/y.js', 'src/server/x.ts', 'src/servidor/x.ts', 'src/routes/x.ts', 'src/route/x.ts', 'src/controllers/x.ts', 'src/controller/x.ts', 'src/handlers/x.ts',
    'src/app/x/route.ts', 'app/y/route.js', 'src/app/z/route.tsx', 'route.mjs',
    'src/actions/x.ts', 'src/action/x.ts', 'src/acoes/x.ts', 'src/app/clientes/actions.ts', 'src/app/clientes/actions.js', 'src/acoes.ts', 'actions.tsx']) {
    assert.ok(chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'rede_rota'), c);
  }
  for (const c of ['src/x/router.ts', 'src/x/route-helper.ts', 'src/x/transactions.ts', 'src/reactions/x.ts', 'src/x/actions.json', 'src/x/interactions.ts']) {
    assert.ok(!chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'rede_rota'), `${c} não é rota`);
  }
});

test('rede_rota: fetch, axios, process.env, import.meta.env, "use server", Cache-Control, service_role, Deno.env e auth.admin chamam a segurança', () => {
  for (const l of ["const d = await fetch('/x');", "import axios from 'axios';", 'const k = process.env.K;', 'const k = import.meta.env.VITE_K;', "'use server';", '"use server"', "res.setHeader('Cache-Control', 'no-store');",
    "const r = 'service_role';", 'const k = Deno.env.get("K");', 'await supabase.auth.admin.listUsers();', 'client.auth.admin.deleteUser(id)']) {
    assert.ok(linha(l, 'rede_rota'), l);
  }
  for (const l of ['const a = 1;', 'supabase.auth.getUser()', 'const admin = 1;', 'const env = 1;']) assert.ok(!linha(l, 'rede_rota'), `${l} não é rede`);
  assert.ok(chama([arq('src/x/dados.ts', [], ["const d = await fetch('/x');"])], 'revisor-seguranca', 'rede_rota'), 'a remoção também');
});

// ---------- banco ----------

test('banco: .sql, migrations/ e schema.prisma pelo caminho', () => {
  for (const c of ['db/001.sql', 'db/migrations/001.ts', 'migration/002.js', 'prisma/schema.prisma', 'schema.prisma']) assert.ok(chama([arq(c, ['x'])], 'revisor-seguranca', 'banco'), c);
  assert.ok(!chama([arq('src/x/prisma.ts', ['x'])], 'revisor-seguranca', 'banco'));
});

test('banco: o filtro de consulta preso a quem chama (o receptor de .from( (client, db, sb, knex, trx, tx, admin), .where( de consulta, where: {, .eq(\', .rpc() chama a segurança, e tirá-lo também', () => {
  for (const l of ["await supabase.from('clientes').select()", 'client.from("t")', 'db.from(t)', 'sb.from(`t`)', "knex.from('t')", 'trx.from("t")', 'tx.from(t)', 'admin.from("t")',
    'knex("t").where("id", id)', '  .where(eq(t.dono, id))', 'await db.select().from(t).where(eq(t.id, 1))', 'query.where({ id })', 'q.where(and(a, b))', 'qb.where(`id = ${id}`)', 'db.where(x)',
    'findMany({ where: { dono: id } })', 'where: {', "db.eq('dono', id)", 'x.eq(`dono`, id)', 'await sb.rpc("f")', 'db.rpc(f)']) {
    assert.ok(linha(l, 'banco'), l);
    assert.ok(chama([arq('src/x/dados.ts', [], [l])], 'revisor-seguranca', 'banco'), `removida: ${l}`);
  }
  for (const l of ['const x = Array.from(y);', "const b = Buffer.from('abc');", 'Observable.from(xs)', 'this.from(x)', 'const where: Foo = {};', 'type Q = { where: Foo }', 'const where = 1;', 'return elsewhere(x);', 'const a = { from: 1 };', 'list.where()', 'lodash.where(x)', 'arr.eq(1)', 'const m = new Map(); m.from(x)']) {
    assert.ok(!linha(l, 'banco'), `${l} não é consulta`);
  }
});

// ---------- dado_pessoal ----------

test('dado_pessoal: o nome composto também chama (data_nascimento, cliente_cpf, email_hmac, rg, cnpj, documento, whatsapp, endereço, endereço de entrega, anonimizar, purgar, cep, phone)', () => {
  for (const l of ['data_nascimento date', 'cliente_cpf text', 'email_hmac text', 'const cpf = 1', 'const userEmail = 1', 'e_mail', 'celular', 'telefone', 'phoneNumber', 'send(whatsapp)', 'endereço', 'endereco', 'anonimizar(x)', 'purgarDados()', 'cnpj', 'cliente_cnpj', 'cnpjEmpresa', 'cep',
    'rg', 'rg_numero', 'cliente_rg', 'const documento = 1', 'documentoFiscal', 'shipping_address', 'billingAddress', 'home_address text', 'postal_address', 'street_address', 'emailAddress', 'address_line2', 'addressLine1']) {
    assert.ok(linha(l, 'dado_pessoal', 'revisor-lgpd'), l);
    assert.ok(linha(l, 'dado_pessoal', 'revisor-seguranca'), `segurança: ${l}`);
  }
  for (const l of ['const sig = hmac(secret);', 'color: rgb(0, 0, 0)', 'accept(x)', 'except', 'purple', 'const ip address = 1', 'logger.info("ip address", ip)', 'const ipAddress = req.ip;', 'mac_address', 'const org = 1;', 'documentation', 'const rgba = 1', 'burg', 'const address = x;']) {
    assert.ok(!linha(l, 'dado_pessoal', 'revisor-lgpd'), `${l} não é dado pessoal`);
  }
});

test('dado_pessoal: a linha removida também chama a LGPD (tirar o campo, a anonimização ou a purga muda o tratamento)', () => {
  assert.ok(chama([arq('src/x/dados.ts', [], ['await anonimizar(cliente)'])], 'revisor-lgpd', 'dado_pessoal'));
  assert.ok(chama([arq('db/migrations/1.sql', [], ['alter table t drop column data_nascimento;'])], 'revisor-lgpd', 'dado_pessoal'));
});

// ---------- tela ----------

test('tela: arquivo de tela chama o revisor-tela, mas o de teste, de spec e de story não', () => {
  for (const c of ['src/x/Tela.tsx', 'src/x/Tela.jsx', 'src/test-utils/Botao.tsx', 'src/x/estilo.css', 'apps/web/page.vue', 'src/x/Tela.module.css']) assert.ok(chama([arq(c, ['x'])], 'revisor-tela', 'tela'), c);
  for (const c of ['src/x/Tela.test.tsx', 'src/x/Tela.spec.jsx', 'src/x/Tela.stories.tsx', 'src/x/Tela.stories.jsx', 'src/x/Botao.test.vue', 'packages/ui/Botao.stories.svelte', 'src/x/estilo.test.css']) {
    assert.ok(!chama([arq(c, ['x'])], 'revisor-tela', 'tela'), `${c} é teste ou story`);
  }
});

// ---------- ignorar_conteudo ----------

test('ignorar_conteudo: .md, .test/.spec/.cy, __tests__, __mocks__ e tests/ não acionam gatilho de conteúdo; o gatilho de caminho continua valendo', () => {
  for (const c of ['docs/a.md', 'src/x/a.test.ts', 'src/x/a.spec.tsx', 'cypress/a.cy.js', 'src/__tests__/a.ts', 'src/__mocks__/a.ts', 'tests/a.ts', 'test/a.ts', 'src/x/a.test.mjs']) {
    assert.ok(!chama([arq(c, ['const cpf = 1; grant select; fetch("x"); q.where(1)'])], 'revisor-lgpd'), `${c} não aciona o conteúdo`);
  }
  assert.ok(chama([arq('src/x/a.ts', ['const cpf = 1'])], 'revisor-lgpd'));
  assert.ok(chama([arq('tests/auth/x.ts', ['const a = 1'])], 'revisor-seguranca', 'permissao'), 'o caminho auth/ vale em teste');
});

// ---------- documentação e lockfile ----------

test('os gatilhos de caminho não valem para documentação (.md, docs/), menos o config_pipeline e o lgpd_regras, que cobrem os .md de .claude/ de propósito', () => {
  for (const c of ['docs/login.md', 'docs/auth/x.md', 'docs/api/x.md', 'docs/servidor/x.txt', 'docs/migrations/001.sql', 'docs/schema.prisma', 'src/auth/README.md', 'src/api/LEIAME.md', 'src/routes/x.md', 'README.md', 'docs/guards/a.css', 'docs/ui/Tela.tsx']) {
    const r = escolher([arq(c, ['x'])], cfg);
    assert.ok(!r.obrigatorios.some((x) => x.motivos.some((m) => m.por === 'caminho')), `${c}: documentação não dispara gatilho de caminho`);
  }
  for (const c of ['.claude/agents/qa.md', '.claude/agents/revisor-lgpd.md', '.claude/skills/pipeline/SKILL.md']) {
    assert.ok(chama([arq(c, ['x'])], 'revisor-seguranca', 'config_pipeline') || c.includes('skills/pipeline'), c);
  }
  assert.ok(chama([arq('.claude/agents/revisor-lgpd.md', ['x'])], 'revisor-lgpd', 'lgpd_regras'), 'o lgpd_regras cobre o .md');
  assert.ok(chama([arq('.claude/agents/qa.md', ['x'])], 'revisor-seguranca', 'config_pipeline'), 'o config_pipeline cobre o .md');
  assert.ok(chama([arq('src/auth/x.ts', ['x'])], 'revisor-seguranca', 'permissao'), 'o código segue valendo');
  assert.ok(!chama([arq('docs/login.md', ['grant select'])], 'revisor-seguranca', 'permissao'), 'e o conteúdo do .md já não valia');
});

test('lockfile não é código: sozinho não chama o sempre, o qa nem gatilho nenhum de caminho', () => {
  for (const c of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'apps/web/package-lock.json']) {
    const r = escolher([arq(c, ['"x": "1"'])], cfg);
    assert.equal(r.codigo, 0, c);
    assert.deepEqual(r.obrigatorios.filter((x) => x.nome === 'ponytail-review' || x.nome === 'revisor-arquitetura'), [], c);
  }
  assert.equal(escolher([arq('package.json', ['"x": "1"'])], cfg).codigo, 1);
});

// ---------- o aviso do confere-lgpd ----------

test('um aviso do confere-lgpd (médio) chama o revisor-lgpd, com o motivo "confere-lgpd: <regra>"; o suprimido e o que passa, não', () => {
  const r = escolher([arq('src/x.ts', ['const a = 1;', "const perfil = { religiao: 'x' };"])], cfg);
  const lgpd = r.obrigatorios.find((x) => x.nome === 'revisor-lgpd');
  assert.ok(lgpd, 'religião num src/x.ts: campo sensível');
  const m = lgpd.motivos.find((x) => x.gatilho === 'confere-lgpd');
  assert.equal(m.arquivo, 'src/x.ts');
  assert.equal(m.linha, 2, 'a linha é a do diff');
  assert.equal(m.por, 'campo_sensivel_no_codigo');
  assert.ok(!r.obrigatorios.some((x) => x.nome === 'revisor-seguranca' && x.motivos.some((y) => y.gatilho === 'confere-lgpd')), 'só a LGPD');
  const supressao = ['lgpd-ignora:', 'campo_sensivel_no_codigo', '-- vem de um enum fechado do teste'].join(' '); // montado: este arquivo não pode ser, ele mesmo, uma supressão
  assert.ok(!chama([arq('src/x.ts', [`const perfil = { religiao: 'x' }; // ${supressao}`])], 'revisor-lgpd', 'confere-lgpd'), 'suprimido');
  assert.ok(!chama([arq('src/x.ts', ['const a = 1;'])], 'revisor-lgpd'));
  assert.ok(chama([arq('src/x.ts', ["import * as Sentry from '@sentry/node';"])], 'revisor-lgpd', 'confere-lgpd'), 'telemetria de fora (médio)');
});

test('o aviso do confere-lgpd não repete o trecho achado na saída de formatar', async () => {
  const { formatar } = await import('./escolhe-revisores.mjs');
  const texto = formatar(escolher([arq('src/x.ts', ["const perfil = { religiao: 'segredo-do-teste' };"])], cfg), 'a', 'b');
  assert.match(texto, /confere-lgpd: campo_sensivel_no_codigo/);
  assert.doesNotMatch(texto, /segredo-do-teste/);
});

// ---------- mídia binária ----------

test('o binário roda só as regras de caminho e de binário do confere-lgpd: a imagem nova chama o revisor-lgpd (regra de print) e não dispara gatilho de conteúdo', () => {
  const binario = (caminho) => ({ caminho, binario: true, linhas: [], removidas: [] });
  for (const c of ['src/public/a.png', 'src/x/b.jpg', 'src/x/c.jpeg', 'src/x/d.gif', 'src/x/e.webp', 'src/x/O.PNG', 'docs/print.png']) {
    const r = escolher([binario(c)], cfg);
    assert.deepEqual(r.obrigatorios.map((x) => x.nome), ['revisor-lgpd'], `${c}: só a LGPD`);
    assert.deepEqual(r.obrigatorios[0].motivos.map((m) => [m.gatilho, m.por]), [['confere-lgpd', 'imagem_no_repositorio']], c);
  }
  // o ícone, a fonte, o pdf e o vídeo não têm regra de caminho nem são binário desconhecido: nada os chama
  for (const c of ['src/x/f.ico', 'src/x/h.woff', 'src/x/i.woff2', 'src/x/j.ttf', 'src/x/k.otf', 'src/x/m.mp4', 'src/x/n.webm']) {
    assert.deepEqual(escolher([binario(c)], cfg).obrigatorios, [], c);
  }
  // o pdf cai na regra de arquivo de dados do confere-lgpd (o conteúdo não se confere, e pode ser a base de clientes)
  assert.deepEqual(escolher([binario('src/x/l.pdf')], cfg).obrigatorios.map((x) => [x.nome, x.motivos.map((m) => m.por)]), [['revisor-lgpd', ['arquivo_de_dados']]]);
  // o avif não está no "fora" do binario_desconhecido do confere-lgpd: quem o usa põe a extensão lá (a regra diz como)
  assert.deepEqual(escolher([binario('src/x/g.avif')], cfg).obrigatorios.map((x) => x.motivos.map((m) => m.por)), [['binario_desconhecido']]);
});

test('o outro binário em pasta de trabalho continua disparando os gatilhos de conteúdo, e o do confere-lgpd (binário desconhecido) também', () => {
  const binario = (caminho) => ({ caminho, binario: true, linhas: [], removidas: [] });
  const r = escolher([binario('src/x/dados.dat')], cfg);
  assert.deepEqual(r.obrigatorios.map((x) => x.nome).sort(), ['revisor-lgpd', 'revisor-seguranca']);
  assert.ok(r.obrigatorios.find((x) => x.nome === 'revisor-lgpd').motivos.some((m) => m.gatilho === 'confere-lgpd' && m.por === 'binario_desconhecido'));
  assert.deepEqual(nomesDe([binario('docs/dados.dat')]), ['revisor-lgpd'], 'fora da pasta de trabalho só a regra do confere-lgpd');
});

// ---------- erros com a mensagem certa ----------

test('revisor com nome errado em qualquer lugar do revisao é recusado ao carregar, mesmo que o gatilho não dispare neste diff', () => {
  const sem = [arq('docs/a.md')];
  const com = (muda) => { const c = structuredClone(cfg); muda(c.revisao); return c; }; // o structuredClone copia os RegExp
  assert.throws(() => escolher(sem, com((r) => { r.gatilhos.find((g) => g.nome === 'banco').revisores = ['revisor-seguranca', 'revisor-segurança']; })), /revisor-segurança.*gatilho banco|gatilho banco.*revisor-segurança/);
  assert.throws(() => escolher(sem, com((r) => { r.sempre = ['revisor-arquitetura', 'fantasma']; })), /fantasma/);
  assert.throws(() => escolher(sem, com((r) => { r.comportamento = ['qaa']; })), /qaa/);
  assert.doesNotThrow(() => escolher(sem, cfg));
});

test('mexer no legadoAte (em qualquer arquivo) chama o revisor-lgpd pelo gatilho lgpd_regras', () => {
  for (const c of ['.claude/pipeline.json', 'src/x/dados.ts']) {
    assert.ok(chama([arq(c, ['  "lgpd": { "legadoAte": "abc1234" }'])], 'revisor-lgpd', 'lgpd_regras'), c);
  }
  assert.ok(chama([arq('.claude/pipeline.json', [], ['  "lgpd": { "legadoAte": "abc1234" }'])], 'revisor-lgpd', 'lgpd_regras') === false, 'a linha removida não conta (o gatilho não tem remocoes)');
  assert.ok(!chama([arq('docs/a.md', ['legadoAte'])], 'revisor-lgpd', 'lgpd_regras'), 'documentação não');
});
