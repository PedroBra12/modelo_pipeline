import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALIDADORES, cpfValido, digitosCpf, marcarLegado, regras, relatorio, varrer } from './confere-lgpd.mjs';

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

test('o config.mjs quebrado nega toda edição no confere-lgpd, menos a do próprio config.mjs (para consertar)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'confere-lgpd-cfg-'));
  try {
    mkdirSync(join(raiz, '.claude', 'hooks'), { recursive: true });
    for (const f of ['confere-lgpd.mjs', 'lgpd-regras.mjs']) cpSync(join(AQUI, f), join(raiz, '.claude', 'hooks', f));
    writeFileSync(join(raiz, '.claude', 'hooks', 'config.mjs'), '<<<<<<< HEAD\n=======\n>>>>>>> outro\n');
    const roda = (arquivo) => {
      const r = spawnSync(process.execPath, [join(raiz, '.claude', 'hooks', 'confere-lgpd.mjs')], {
        input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(raiz, arquivo), new_string: 'const a = 1;' } }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
      });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
    };
    assert.equal(roda('lib/x.js')?.permissionDecision, 'deny');
    assert.equal(roda('.claude/hooks/config.mjs'), null, 'o config.mjs se conserta pelo Edit');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
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

test('legado: o achado numa linha que já estava igual antes não bloqueia; linha nova ou mexida, sim', () => {
  const tel = regra('telefone_literal').pega[0];
  const antes = `const a = 1;\n${tel}\n`;
  const depois = `const b = 2;\nconst a = 1;\n${tel}\n// ${tel}\n`; // a linha de antes desceu, e uma nova entrou
  const achados = marcarLegado(varrer(depois, CAMINHO.todos), depois, [antes], CAMINHO.todos);
  assert.deepEqual(achados.map((a) => [a.linha, a.legado === true]), [[3, true], [4, false]]);
  assert.deepEqual(marcarLegado(varrer(depois, CAMINHO.todos), depois, [], CAMINHO.todos).filter((a) => a.legado).length, 0, 'arquivo novo não tem legado');
  const texto = relatorio(achados);
  assert.match(texto, /1 achado\(s\) que bloqueiam/);
  assert.match(texto, /Legado: 1 achado/);
});

test('legado: a linha vale quantas vezes aparecia antes; a ocorrência a mais bloqueia', () => {
  const tel = regra('telefone_literal').pega[0];
  const antes = `${tel}\n`;
  const depois = `${tel}\nconst a = 1;\n${tel}\n`; // a mesma linha, copiada
  const achados = marcarLegado(varrer(depois, CAMINHO.todos), depois, [antes], CAMINHO.todos);
  assert.deepEqual(achados.map((a) => [a.linha, a.legado === true]), [[1, true], [3, false]]);
  // vários textos de antes (HEAD e MERGE_HEAD): vale o que mais a tinha, sem somar
  const dois = marcarLegado(varrer(depois, CAMINHO.todos), depois, [antes, antes], CAMINHO.todos);
  assert.equal(dois.filter((a) => a.legado).length, 1);
});

test('legado: o binário e a regra de caminho só são legado com o arquivo igual', () => {
  const binario = regras.find((r) => r.binario === true);
  assert.ok(binario, 'regra de binário');
  const rel = 'docs/base.bin';
  const igual = marcarLegado(varrer('PK\0velho', rel, [binario]), 'PK\0velho', ['PK\0velho'], rel);
  assert.equal(igual.every((a) => a.legado), true);
  const trocado = marcarLegado(varrer('PK\0novo', rel, [binario]), 'PK\0novo', ['PK\0velho'], rel);
  assert.equal(trocado.some((a) => !a.legado), true, 'conteúdo novo no mesmo caminho bloqueia');
});

test('legado: o texto de antes é varrido pelo caminho de antes (git mv de teste para código bloqueia)', () => {
  const r = regras.find((x) => x.arquivos === 'codigo' && x.nivel !== 'medio' && x.regex !== undefined);
  assert.ok(r, 'regra de código que bloqueia');
  const texto = preencher(r.pega[0]);
  assert.ok(varrer(texto, CAMINHO.codigo, [r]).length > 0);
  assert.equal(varrer(texto, CAMINHO.todos, [r]).length, 0, 'regra de código não vale em teste');
  const movido = marcarLegado(varrer(texto, CAMINHO.codigo, [r]), texto, [texto], CAMINHO.todos);
  assert.equal(movido.some((a) => !a.legado), true, 'do teste para o código não é legado');
  const ficou = marcarLegado(varrer(texto, CAMINHO.codigo, [r]), texto, [texto], CAMINHO.codigo);
  assert.equal(ficou.every((a) => a.legado), true);
});

// um repositório de verdade numa pasta temporária, com os hooks do git deste projeto
function repositorio() {
  const base = mkdtempSync(join(tmpdir(), 'confere-lgpd-legado-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: base, encoding: 'utf8' });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
  };
  git('init', '-q', '-b', 'pr/teste');
  for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.autocrlf', 'false'], ['core.hooksPath', join(AQUI, 'git')]]) git('config', k, v);
  writeFileSync(join(base, 'README.md'), '# repo\n');
  mkdirSync(join(base, 'docs'));
  return { base, git };
}

test('legado no pre-commit: a linha antiga passa (também renomeada); mexer nela ou trazer outra, não', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato\n${tel}\n`);
    git('add', '-A');
    assert.equal(git('-c', 'core.hooksPath=', 'commit', '-q', '-m', 'docs: antes do pipeline').ok, true); // a dívida de antes

    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja\n${tel}\n`);
    git('add', '-A');
    const outraLinha = git('commit', '-q', '-m', 'docs: título');
    assert.equal(outraLinha.ok, true, outraLinha.saida);
    assert.match(outraLinha.saida, /Legado: 1 achado/);

    git('mv', 'docs/contato.md', 'docs/loja.md');
    const renomeado = git('commit', '-q', '-m', 'docs: renomeia');
    assert.equal(renomeado.ok, true, renomeado.saida);

    writeFileSync(join(base, 'docs', 'loja.md'), `# contato da loja\n${tel} (ramal)\n`);
    git('add', '-A');
    const mexida = git('commit', '-q', '-m', 'docs: ramal');
    assert.equal(mexida.ok, false, 'a linha mexida tem de sair limpa');
    assert.match(mexida.saida, /telefone_literal/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('legado no Edit e no Write: o que já está no arquivo passa; o novo, não', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base } = repositorio();
  try {
    const arquivo = join(base, 'docs', 'contato.md');
    writeFileSync(arquivo, `# contato\n${tel}\n`);
    assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: arquivo, content: `# contato da loja\n${tel}\n` } }), null);
    assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: '# contato', new_string: `# contato\n${tel}` } }), null);
    assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: 'x', new_string: `${tel} (ramal)` } })?.permissionDecision, 'deny');
    assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: join(base, 'docs', 'novo.md'), content: `${tel}\n` } })?.permissionDecision, 'deny');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('à mão: só os arquivos do git (o ignorado fica de fora) e o legado contado; --todos o lista', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  const aMao = (...args) => spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs'), ...args], { cwd: base, encoding: 'utf8' });
  try {
    writeFileSync(join(base, '.gitignore'), 'dados/\n');
    mkdirSync(join(base, 'dados'));
    writeFileSync(join(base, 'dados', 'banco.md'), `${tel}\n`);
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    git('-c', 'core.hooksPath=', 'commit', '-q', '-m', 'antes');
    const limpo = aMao('.');
    assert.equal(limpo.status, 0, limpo.stdout);
    assert.match(limpo.stdout, /Legado: 1 achado/);
    assert.doesNotMatch(limpo.stdout, /dados\/banco\.md/);
    assert.match(aMao('--todos', 'docs').stdout, /docs\/contato\.md:1 .*telefone_literal/);
    writeFileSync(join(base, 'docs', 'novo.md'), `${tel}\n`);
    const novo = aMao('docs');
    assert.equal(novo.status, 1, 'o arquivo novo, ainda fora do git, também conta');
    assert.match(novo.stdout, /docs\/novo\.md:1 .*telefone_literal/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('legado no pre-commit: git mv de teste para código leva a regra de código junto e bloqueia', () => {
  const r = regras.find((x) => x.arquivos === 'codigo' && x.nivel !== 'medio' && x.regex !== undefined);
  const { base, git } = repositorio();
  try {
    mkdirSync(join(base, 'src', 'contatos'), { recursive: true });
    writeFileSync(join(base, CAMINHO.todos), `${preencher(r.pega[0])}\n`);
    git('add', '-A');
    assert.equal(git('-c', 'core.hooksPath=', 'commit', '-q', '-m', 'teste antes do pipeline').ok, true);
    git('mv', CAMINHO.todos, CAMINHO.codigo);
    const movido = git('commit', '-q', '-m', 'move o teste para o código');
    assert.equal(movido.ok, false, 'no código, a regra vale e o achado é novo');
    assert.match(movido.saida, new RegExp(r.id));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
