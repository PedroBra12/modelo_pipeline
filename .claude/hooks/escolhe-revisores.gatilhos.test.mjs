// Os gatilhos genéricos do pipeline.json (permissao, rede_rota, banco, dado_pessoal, ignorar_conteudo), o aviso do confere-lgpd
// e a mídia binária. Tudo dentro do processo: escolher() com um diff montado à mão, sem git (a linha de comando tem os testes dela).
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

// ---------- permissao ----------

test('permissao: pelo caminho (auth, papéis, cargos, rbac, acl, guards, sessão, middleware, proxy, login, jwt), com ou sem extensão', () => {
  for (const c of ['src/auth/x.ts', 'src/lib/auth.ts', 'src/papeis.js', 'src/roles/x.ts', 'src/role/x.ts', 'src/cargos/x.ts', 'src/rbac.ts', 'src/acl/x.ts', 'src/policies/x.ts', 'src/policy.ts',
    'src/guards/x.ts', 'src/guard.ts', 'src/sessao.ts', 'src/sessions/x.ts', 'src/session.ts', 'src/middleware.ts', 'proxy.js', 'src/login/page.ts', 'src/jwt.ts', 'src/permissoes/x.ts', 'src/permissions.ts']) {
    assert.ok(chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'permissao'), c);
  }
  for (const c of ['src/x/papelaria.ts', 'src/author/x.ts', 'src/x/progress.ts']) assert.ok(!chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'permissao'), `${c} não é permissão`);
});

test('permissao: pelo conteúdo (policy, grant, revoke, security definer, autoriz, forbidden, permiss, papel/papéis, roles); role="button", 403 e 401 soltos não chamam', () => {
  for (const l of ['create policy p on t using (true);', 'alter policy p on t', 'alter table t enable row level security;', 'security definer', 'grant select on t to x;', 'revoke all on t from x;',
    'if (!autorizado) return;', 'throw forbidden()', 'class Unauthorized {}', 'const permissions = ["a"]', 'const permissao = 1', 'const papel = "admin"', 'const papéis = []', 'const roles = ["a"]', 'export const policies = []']) {
    assert.ok(chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'permissao'), l);
  }
  for (const l of ['<div role="button">', 'const n = 403;', 'status: 401', 'const role = 1;', 'supabase.auth.getUser()', 'const authenticated = true;']) {
    assert.ok(!chama([arq('src/x/Tela.tsx', [l])], 'revisor-seguranca', 'permissao'), `${l} não é permissão`);
  }
});

test('permissao: o .claude/ não aciona o gatilho pelo conteúdo (o config_pipeline já chama a segurança por lá)', () => {
  const r = escolher([arq('.claude/hooks/x.mjs', ['const permissao = 1; grant select'])], cfg).obrigatorios.find((x) => x.nome === 'revisor-seguranca');
  assert.ok(r.motivos.every((m) => m.gatilho === 'config_pipeline'), JSON.stringify(r.motivos));
  assert.ok(chama([arq('src/x/dados.ts', ['grant select'])], 'revisor-seguranca', 'permissao'));
});

test('permissao: a linha de permissão removida também chama a segurança', () => {
  assert.ok(chama([arq('src/x/dados.ts', [], ['if (!autorizado) return;'])], 'revisor-seguranca', 'permissao'));
});

// ---------- rede_rota ----------

test('rede_rota: api/, server/, servidor/, routes/, controllers/, handlers/ e route.* chamam a segurança pelo caminho', () => {
  for (const c of ['src/api/x.ts', 'pages/api/y.js', 'src/server/x.ts', 'src/servidor/x.ts', 'src/routes/x.ts', 'src/route/x.ts', 'src/controllers/x.ts', 'src/controller/x.ts', 'src/handlers/x.ts',
    'src/app/x/route.ts', 'app/y/route.js', 'src/app/z/route.tsx', 'route.mjs']) {
    assert.ok(chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'rede_rota'), c);
  }
  for (const c of ['src/x/router.ts', 'src/x/route-helper.ts']) assert.ok(!chama([arq(c, ['const a = 1;'])], 'revisor-seguranca', 'rede_rota'), `${c} não é rota`);
});

test('rede_rota: fetch, axios, process.env, import.meta.env, "use server" e Cache-Control chamam; Deno.env e service_role soltos, não', () => {
  for (const l of ["const d = await fetch('/x');", "import axios from 'axios';", 'const k = process.env.K;', 'const k = import.meta.env.VITE_K;', "'use server';", '"use server"', "res.setHeader('Cache-Control', 'no-store');"]) {
    assert.ok(chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'rede_rota'), l);
  }
  for (const l of ['const k = Deno.env.get("K");', "const r = 'service_role';"]) assert.ok(!chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'rede_rota'), `${l} não é mais gatilho`);
  assert.ok(chama([arq('src/x/dados.ts', [], ["const d = await fetch('/x');"])], 'revisor-seguranca', 'rede_rota'), 'a remoção também');
});

// ---------- banco ----------

test('banco: .sql, migrations/ e schema.prisma pelo caminho', () => {
  for (const c of ['db/001.sql', 'db/migrations/001.ts', 'migration/002.js', 'prisma/schema.prisma', 'schema.prisma']) assert.ok(chama([arq(c, ['x'])], 'revisor-seguranca', 'banco'), c);
  assert.ok(!chama([arq('src/x/prisma.ts', ['x'])], 'revisor-seguranca', 'banco'));
});

test('banco: o filtro de consulta no código (.where(, where:, .eq(\', .from(\', .rpc() chama a segurança, e tirá-lo também', () => {
  for (const l of ['q.where(eq(t.dono, id))', 'findMany({ where: { dono: id } })', "db.eq('dono', id)", "await sb.from('clientes').select()", 'await sb.rpc("f")', 'q.from("t")', 'x.eq(`dono`, id)']) {
    assert.ok(chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'banco'), l);
    assert.ok(chama([arq('src/x/dados.ts', [], [l])], 'revisor-seguranca', 'banco'), `removida: ${l}`);
  }
  for (const l of ['const where = 1;', 'return elsewhere(x);', 'arr.from(x)', 'const a = { from: 1 }']) assert.ok(!chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'banco'), `${l} não é consulta`);
});

// ---------- dado_pessoal ----------

test('dado_pessoal: o nome composto também chama (data_nascimento, cliente_cpf, email_hmac, whatsapp, endereço, anonimizar, purgar, cnpj, cep, rg, address, phone)', () => {
  for (const l of ['data_nascimento date', 'cliente_cpf text', 'email_hmac text', 'const cpf = 1', 'const userEmail = 1', 'e_mail', 'celular', 'telefone', 'phoneNumber', 'send(whatsapp)', 'endereço', 'endereco', 'address', 'anonimizar(x)', 'purgarDados()', 'cnpj', 'cep', 'rg']) {
    assert.ok(chama([arq('src/x/dados.ts', [l])], 'revisor-lgpd', 'dado_pessoal'), l);
    assert.ok(chama([arq('src/x/dados.ts', [l])], 'revisor-seguranca', 'dado_pessoal'), `segurança: ${l}`);
  }
  for (const l of ['const sig = hmac(secret);', 'color: rgb(0, 0, 0)', 'accept(x)', 'except', 'purple', 'telephone_pole'.replace('telephone_pole', 'x')]) {
    assert.ok(!chama([arq('src/x/dados.ts', [l])], 'revisor-lgpd', 'dado_pessoal'), `${l} não é dado pessoal`);
  }
});

test('dado_pessoal: a linha removida também chama a LGPD (tirar o campo, a anonimização ou a purga muda o tratamento)', () => {
  assert.ok(chama([arq('src/x/dados.ts', [], ['await anonimizar(cliente)'])], 'revisor-lgpd', 'dado_pessoal'));
  assert.ok(chama([arq('db/migrations/1.sql', [], ['alter table t drop column data_nascimento;'])], 'revisor-lgpd', 'dado_pessoal'));
});

// ---------- ignorar_conteudo ----------

test('ignorar_conteudo: .md, .test/.spec/.cy, __tests__, __mocks__ e tests/ não acionam gatilho de conteúdo; o gatilho de caminho continua valendo', () => {
  for (const c of ['docs/a.md', 'src/x/a.test.ts', 'src/x/a.spec.tsx', 'cypress/a.cy.js', 'src/__tests__/a.ts', 'src/__mocks__/a.ts', 'tests/a.ts', 'test/a.ts', 'src/x/a.test.mjs']) {
    assert.ok(!chama([arq(c, ['const cpf = 1; grant select; fetch("x"); q.where(1)'])], 'revisor-lgpd'), `${c} não aciona o conteúdo`);
  }
  assert.ok(chama([arq('src/x/a.ts', ['const cpf = 1'])], 'revisor-lgpd'));
  assert.ok(chama([arq('tests/auth/x.ts', ['const a = 1'])], 'revisor-seguranca', 'permissao'), 'o caminho auth/ vale em teste');
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

test('imagem, fonte, pdf e vídeo binários não contam como ilegíveis e não disparam gatilho de conteúdo; o outro binário em pasta de trabalho continua disparando', () => {
  const binario = (caminho) => ({ caminho, binario: true, linhas: [], removidas: [] });
  for (const c of ['src/public/a.png', 'src/x/b.jpg', 'src/x/c.jpeg', 'src/x/d.gif', 'src/x/e.webp', 'src/x/f.ico', 'src/x/g.avif', 'src/x/h.woff', 'src/x/i.woff2', 'src/x/j.ttf', 'src/x/k.otf', 'src/x/l.pdf', 'src/x/m.mp4', 'src/x/n.webm', 'src/x/O.PNG']) {
    assert.deepEqual(nomesDe([binario(c)]), [], `${c}: mídia`);
  }
  assert.deepEqual(nomesDe([binario('src/x/dados.sqlite')]), ['revisor-lgpd', 'revisor-seguranca'], 'o binário de outro tipo continua como antes');
  assert.deepEqual(nomesDe([binario('docs/dados.sqlite')]), [], 'fora da pasta de trabalho o binário de outro tipo não dispara');
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
