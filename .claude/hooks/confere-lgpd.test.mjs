import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALIDADORES, cpfValido, digitosCpf, regras, relatorio, varrer } from './confere-lgpd.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const CAMINHO = {
  todos: 'src/contatos/exemplo.test.ts', // dado literal vale até em teste
  codigo: 'src/contatos/exemplo.ts',
  sql: 'db/migracoes/202610160000_exemplo.sql',
  config: 'compose.yaml',
};
// nenhum CPF válido fica escrito, nem aqui; este nasce na hora
const CPF = (() => {
  const d = `987654321${digitosCpf('987654321')}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
})();
const preencher = (t) => t.replaceAll('<cpf>', CPF);
const regra = (id) => {
  const r = regras.find((x) => x.id === id);
  assert.ok(r, `regra ${id}`);
  return r;
};
const ids = (achados) => achados.filter((a) => !a.suprimido).map((a) => a.regra.id);

test('toda regra está completa e tem exemplo dos dois lados', () => {
  assert.ok(regras.length > 0, 'as regras não carregaram');
  assert.equal(new Set(regras.map((r) => r.id)).size, regras.length, 'id repetido');
  for (const r of regras) {
    assert.ok(['critico', 'alto', 'medio'].includes(r.nivel), `${r.id}: nivel`);
    assert.ok(['todos', 'codigo', 'sql', 'config'].includes(r.arquivos), `${r.id}: arquivos`);
    assert.equal([r.regex, r.caminho, r.binario].filter((x) => x !== undefined).length, 1, `${r.id}: regex, caminho ou binario`);
    assert.ok(r.validador === undefined || r.validador in VALIDADORES, `${r.id}: validador`);
    for (const campo of ['artigo', 'problema', 'correcao']) assert.ok(typeof r[campo] === 'string' && r[campo] !== '', `${r.id}: ${campo}`);
    assert.ok(r.pega.length > 0 && r.passa.length > 0, `${r.id}: exemplos`);
  }
});

// regra de caminho e de binário: o exemplo é o caminho; o binário é um texto com "\0"
const rodar = (r, ex) =>
  r.caminho !== undefined ? varrer('', ex, [r]) : r.binario === true ? varrer('\0', ex, [r]) : varrer(preencher(ex), CAMINHO[r.arquivos], [r]);

for (const r of regras) {
  test(`${r.id}: pega o que deve e deixa passar o resto`, () => {
    for (const ex of r.pega) assert.ok(ids(rodar(r, ex)).length > 0, `não pegou: ${ex}`);
    for (const ex of r.passa) assert.deepEqual(ids(rodar(r, ex)), [], `pegou: ${ex}`);
  });
}

test('CPF: só com os dígitos certos', () => {
  assert.equal(digitosCpf('529982247'), '25');
  assert.equal(cpfValido(CPF), true);
  assert.equal(cpfValido(CPF.replace(/\d$/, (d) => String((Number(d) + 1) % 10))), false);
  assert.equal(cpfValido('111.111.111-11'), false);
});

test('dado literal vale em teste e em doc; regra de código não vale em teste', () => {
  assert.deepEqual(ids(varrer(regra('telefone_literal').pega[0], 'docs/exemplo.md')), ['telefone_literal']);
  const log = regra('log_de_objeto_pessoal').pega[0];
  assert.deepEqual(ids(varrer(log, 'src/contatos/mescla.test.ts')), []);
  assert.ok(ids(varrer(log, 'src/contatos/rotas/mescla.ts')).includes('log_de_objeto_pessoal'));
});

test('supressão só com a regra certa e um motivo', () => {
  const so = (texto) => ids(varrer(texto, CAMINHO.codigo, [regra('log_de_objeto_pessoal')]));
  const log = 'logger.info(contato);';
  assert.deepEqual(so(`${log} // lgpd-ignora: log_de_objeto_pessoal -- aqui contato é o nome do tipo`), []);
  assert.deepEqual(so(`// lgpd-ignora: log_de_objeto_pessoal -- aqui contato é o nome do tipo\n${log}`), []);
  assert.deepEqual(so(`${log} // lgpd-ignora: log_de_objeto_pessoal`), ['log_de_objeto_pessoal']);
  assert.deepEqual(so(`${log} // lgpd-ignora: pii_na_url -- um motivo que não é desta regra`), ['log_de_objeto_pessoal']);
  assert.deepEqual(so(`foo(); // lgpd-ignora: log_de_objeto_pessoal -- na linha de código não vale para a de baixo\n${log}`), ['log_de_objeto_pessoal']);
  const cpf = `const cpf = '${CPF}'; // lgpd-ignora: cpf_literal -- é o CPF de teste da semente`;
  assert.deepEqual(ids(varrer(cpf, CAMINHO.codigo, [regra('cpf_literal')])), ['cpf_literal'], 'CPF não se suprime');
});

test('suprimir uma coluna ou um campo não esconde o vizinho', () => {
  const sql = [
    'create table app.leads (',
    '  id uuid not null,',
    '  cep text, -- lgpd-ignora: coluna_pessoal_em_tabela -- CEP da loja, não da pessoa',
    '  celular text',
    ');',
  ].join('\n');
  const achados = varrer(sql, CAMINHO.sql, [regra('coluna_pessoal_em_tabela')]);
  assert.deepEqual(achados.map((a) => [a.linha, a.suprimido]), [[3, true], [4, false]]);
  const ia = 'await ia.escrever({\n  celular, // lgpd-ignora: pii_para_ia -- teste com a IA falsa\n  email: contato.email,\n});';
  assert.deepEqual(varrer(ia, CAMINHO.codigo, [regra('pii_para_ia')]).map((a) => [a.linha, a.suprimido]), [[2, true], [3, false]]);
});

test('semente grande passa dentro do limite do hook', () => {
  const linhas = Array.from({ length: 20000 }, (_, i) => `${i},Pessoa ${i},pessoa${i}@loja.test,(20) 9${String(i).padStart(4, '0')}-0000`);
  const inicio = performance.now();
  assert.deepEqual(ids(varrer(linhas.join('\n'), 'local/sementes/contatos.csv')), []);
  assert.ok(performance.now() - inicio < 3000, 'a varredura ficou lenta demais para o hook');
});

test('as supressões aparecem no relatório, para o revisor-lgpd', () => {
  const achados = varrer('logger.info(contato); // lgpd-ignora: log_de_objeto_pessoal -- aqui contato é o nome do tipo', CAMINHO.codigo);
  assert.match(relatorio(achados), /1 supressão\(ões\)[\s\S]*Suprimidos[\s\S]*:1 log_de_objeto_pessoal/);
});

test('as regras presas a um projeto não existem mais: o modelo vale para qualquer pasta', () => {
  for (const id of ['canal_direto', 'ia_direta', 'whatsapp_nao_oficial', 'select_estrela_pii', 'coluna_pessoal_fora_do_pii', 'coluna_pessoal_sem_cifra']) {
    assert.equal(regras.some((r) => r.id === id), false, id);
  }
  const ia = regra('pii_para_ia').pega[0];
  for (const rel of ['src/ia/sugerir.ts', 'packages/ia/src/cliente.ts', 'integracoes/x/ler.ts']) assert.ok(ids(varrer(ia, rel)).includes('pii_para_ia'), rel);
  assert.equal(regra('telemetria_de_fora').nivel, 'medio', 'só avisa');
});

test('binário: o UTF-16 com BOM é lido como texto; o desconhecido bloqueia', () => {
  const fone = regra('telefone_literal').pega[0];
  const base = mkdtempSync(join(tmpdir(), 'confere-lgpd-utf16-'));
  try {
    const git = (...args) => spawnSync('git', args, { cwd: base, encoding: 'utf8' });
    git('init', '-q', '-b', 'pr/teste');
    writeFileSync(join(base, 'contatos.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${fone}\n`, 'utf16le')]));
    writeFileSync(join(base, 'semente.dat'), Buffer.from([0, 1, 2, 3]));
    git('add', '-A');
    const r = spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs'), '--indice'], { cwd: base, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /contatos\.txt:1 \[alto\] telefone_literal/);
    assert.match(r.stderr, /semente\.dat:1 \[alto\] binario_desconhecido/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o relatório não repete o trecho achado', () => {
  const texto = relatorio(varrer(`const cpf = '${CPF}';`, CAMINHO.codigo));
  assert.match(texto, /cpf_literal/);
  assert.ok(!texto.includes(CPF) && !texto.includes(CPF.replace(/\D/g, '')));
});

function hook(entrada, ambiente = {}) {
  const r = spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs')], {
    input: JSON.stringify(entrada),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: RAIZ, ...ambiente },
  });
  return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
}

test('hook do Edit e do Write: nega o crítico e o alto, deixa o médio e o que está fora do repositório', () => {
  const arquivo = join(RAIZ, 'modulos', 'nucleo', 'contatos', 'rotas', 'criar.ts');
  const negado = hook({ tool_name: 'Write', tool_input: { file_path: arquivo, content: regra('log_do_corpo').pega[0] } });
  assert.equal(negado?.permissionDecision, 'deny');
  assert.match(negado.permissionDecisionReason, /log_do_corpo/);
  const edits = [{ old_string: 'a', new_string: preencher(regra('cpf_literal').pega[0]) }];
  assert.equal(hook({ tool_name: 'MultiEdit', tool_input: { file_path: arquivo, edits } })?.permissionDecision, 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: 'a', new_string: regra('log_de_objeto_pessoal').passa[0] } }), null);
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: 'a', new_string: regra('log_de_ip').pega[0] } }), null, 'médio só avisa');
  assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: join(tmpdir(), 'fora.ts'), content: regra('log_do_corpo').pega[0] } }), null);
  assert.equal(hook('não é json')?.permissionDecision, 'deny', 'na dúvida, nega');
  const semGit = hook({ tool_name: 'Write', tool_input: { file_path: arquivo, content: regra('log_do_corpo').pega[0] } }, { GIT_DIR: join(tmpdir(), 'nao-existe') });
  assert.equal(semGit?.permissionDecision, 'deny', 'com o git quebrado, o projeto vale como raiz');
});

test('pre-commit recusa o commit com dado pessoal, num git de verdade', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-lgpd-git-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: base, encoding: 'utf8' });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  try {
    git('init', '-q', '-b', 'pr/teste');
    for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.autocrlf', 'false'], ['core.hooksPath', join(AQUI, 'git')]]) git('config', k, v);
    writeFileSync(join(base, 'README.md'), '# repo\n');
    mkdirSync(join(base, 'docs'));
    writeFileSync(join(base, 'docs', 'contato.md'), `${regra('telefone_literal').pega[0]}\n`);
    git('add', '-A');
    const recusado = git('commit', '-q', '-m', 'docs: contato');
    assert.equal(recusado.ok, false, 'o telefone devia barrar o commit');
    assert.match(recusado.saida, /telefone_literal/);

    writeFileSync(join(base, 'docs', 'contato.md'), `${regra('telefone_literal').passa[0]}\n`);
    git('add', '-A');
    const aceito = git('commit', '-q', '-m', 'docs: contato');
    assert.equal(aceito.ok, true, aceito.saida);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
