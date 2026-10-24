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


// ---------- legado: opcional e ancorado (pipeline.json: "lgpd": { "legadoAte": "<sha>" }) ----------

const FORTES = ['cpf_literal', 'cartao_literal', 'chave_conhecida', 'chave_privada'];

test('as regras fortes (cpf, cartão, chave) são as sem supressão, existem, e nunca viram legado', () => {
  for (const id of FORTES) assert.equal(regra(id).semSupressao, true, id);
  assert.deepEqual(regras.filter((r) => r.semSupressao === true).map((r) => r.id).sort(), [...FORTES].sort());
  for (const id of FORTES) {
    const r = regra(id);
    const texto = preencher(r.pega[0]);
    const rel = CAMINHO[r.arquivos] ?? CAMINHO.codigo;
    const achados = marcarLegado(varrer(texto, rel, [r]), texto, texto, rel);
    assert.ok(achados.length > 0, `${id}: achou`);
    assert.equal(achados.some((a) => a.legado === true), false, `${id}: o texto de antes era igual e mesmo assim bloqueia`);
  }
});

test('legado: o achado de um trecho que já estava no texto âncora não bloqueia; trecho novo, sim; sem âncora não há legado', () => {
  const tel = regra('telefone_literal').pega[0];
  const ancora = `const a = 1;\n${tel}\n`;
  const depois = `const b = 2;\nconst a = 1;\n${tel}\n// ${tel}\n`;
  const achados = marcarLegado(varrer(depois, CAMINHO.todos), depois, ancora, CAMINHO.todos);
  assert.deepEqual(achados.map((a) => [a.linha, a.legado === true]), [[3, true], [4, false]]);
  assert.equal(marcarLegado(varrer(depois, CAMINHO.todos), depois, null, CAMINHO.todos).filter((a) => a.legado).length, 0, 'arquivo novo ou sem âncora: nenhum legado');
  const texto = relatorio(achados);
  assert.match(texto, /1 achado\(s\) que bloqueiam/);
  assert.match(texto, /Legado: 1 achado/);
});

test('legado: a chave é o trecho achado inteiro com os espaços normalizados, não a última linha', () => {
  const r = regra('pii_para_ia');
  const base = r.pega.find((p) => !p.includes('\n')) ?? r.pega[0];
  const ancora = `${base}\n`;
  // o mesmo trecho com outro recuo e mais código na linha: continua o mesmo achado
  const mexida = `   ${base}   // comentário novo\n`;
  assert.equal(marcarLegado(varrer(mexida, CAMINHO.codigo, [r]), mexida, ancora, CAMINHO.codigo).every((a) => a.legado === true), true);
  const tel = regra('telefone_literal');
  const a2 = `x = "${tel.pega[0]}";\n`;
  const d2 = `y = "${tel.pega[0]}"; // ok\n`;
  assert.equal(marcarLegado(varrer(d2, CAMINHO.todos, [tel]), d2, a2, CAMINHO.todos).every((a) => a.legado === true), true, 'a linha mudou ao redor, o trecho é o mesmo');
  const outro = `y = "${tel.pega[0].replace('90000', '91111')}";\n`;
  assert.equal(marcarLegado(varrer(outro, CAMINHO.todos, [tel]), outro, a2, CAMINHO.todos).some((a) => a.legado === true), false, 'outro número é outro trecho');
  const achado = varrer(d2, CAMINHO.todos, [tel])[0];
  assert.equal(typeof achado.trecho, 'string');
  assert.doesNotMatch(relatorio([achado]), new RegExp(achado.trecho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'o trecho fica só em memória: nunca vai para a saída');
});

test('legado: o trecho vale quantas vezes aparecia na âncora; a cópia bloqueia', () => {
  const tel = regra('telefone_literal').pega[0];
  const ancora = `${tel}\n`;
  const depois = `${tel}\nconst a = 1;\n${tel}\n`;
  const achados = marcarLegado(varrer(depois, CAMINHO.todos), depois, ancora, CAMINHO.todos);
  assert.deepEqual(achados.map((a) => [a.linha, a.legado === true]), [[1, true], [3, false]]);
});

test('legado no Edit: o orçamento é o da âncora menos o que fica no arquivo fora do trecho trocado', () => {
  const tel = regra('telefone_literal').pega[0];
  const novo = `${tel}\n`;
  const rel = CAMINHO.todos;
  assert.equal(marcarLegado(varrer(novo, rel), novo, `${tel}\n`, rel, { resto: '# fora\n' }).every((a) => a.legado), true, 'o old_string tinha a linha: trocá-la mantém o legado');
  assert.equal(marcarLegado(varrer(novo, rel), novo, `${tel}\n`, rel, { resto: `# fora\n${tel}\n` }).some((a) => a.legado), false, 'a linha ainda está fora do old_string: a cópia bloqueia');
});

test('legado: o binário e a regra de caminho só são legado com o arquivo igual', () => {
  const binario = regras.find((r) => r.binario === true);
  assert.ok(binario, 'regra de binário');
  const rel = 'docs/base.bin';
  assert.equal(marcarLegado(varrer('PK\0velho', rel, [binario]), 'PK\0velho', 'PK\0velho', rel).every((a) => a.legado), true);
  assert.equal(marcarLegado(varrer('PK\0novo', rel, [binario]), 'PK\0novo', 'PK\0velho', rel).some((a) => !a.legado), true, 'conteúdo novo no mesmo caminho bloqueia');
});

test('legado: o texto âncora é varrido pelo caminho dele (do teste para o código não é legado)', () => {
  const r = regras.find((x) => x.arquivos === 'codigo' && x.nivel !== 'medio' && x.regex !== undefined && !FORTES.includes(x.id));
  assert.ok(r, 'regra de código que bloqueia');
  const texto = preencher(r.pega[0]);
  assert.ok(varrer(texto, CAMINHO.codigo, [r]).length > 0);
  assert.equal(varrer(texto, CAMINHO.todos, [r]).length, 0, 'regra de código não vale em teste');
  assert.equal(marcarLegado(varrer(texto, CAMINHO.codigo, [r]), texto, texto, CAMINHO.todos).some((a) => !a.legado), true);
  assert.equal(marcarLegado(varrer(texto, CAMINHO.codigo, [r]), texto, texto, CAMINHO.codigo).every((a) => a.legado), true);
});

test('config: legadoAteDoTexto aceita a chave ausente, o sha curto ou inteiro; recusa o resto', async () => {
  const { legadoAteDoTexto } = await import('./config.mjs');
  assert.deepEqual(legadoAteDoTexto('{}'), { valor: null, erro: null });
  assert.deepEqual(legadoAteDoTexto('{ "lgpd": {} }'), { valor: null, erro: null });
  assert.deepEqual(legadoAteDoTexto('{ "lgpd": { "legadoAte": "abc1234" } }'), { valor: 'abc1234', erro: null });
  assert.equal(legadoAteDoTexto(`﻿{ "lgpd": { "legadoAte": "${'a'.repeat(40)}" } }`).erro, null, 'BOM');
  for (const ruim of ['"lgpd": 3', '"lgpd": { "legadoAte": 5 }', '"lgpd": { "legadoAte": "HEAD" }', '"lgpd": { "legadoAte": "abc" }', '"lgpd": { "legadoAte": "main" }']) {
    assert.match(legadoAteDoTexto(`{ ${ruim} }`).erro, /lgpd/, ruim);
  }
  assert.match(legadoAteDoTexto('{ quebrado').erro, /lgpd|JSON|json/);
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
const semHooks = ['-c', 'core.hooksPath='];
/** Commita a dívida de antes e ancora o legado nesse commit (o pipeline.json com a chave entra no commit seguinte). */
function ancorar(base, git) {
  git('add', '-A');
  assert.equal(git(...semHooks, 'commit', '-q', '-m', 'docs: antes do pipeline').ok, true);
  const sha = git('rev-parse', 'HEAD').saida.trim();
  mkdirSync(join(base, '.claude'), { recursive: true });
  writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ lgpd: { legadoAte: sha } }));
  git('add', '-A');
  assert.equal(git(...semHooks, 'commit', '-q', '-m', 'ancora o legado').ok, true);
  return sha;
}

test('sem a chave lgpd.legadoAte não há legado nenhum: a linha antiga também bloqueia (o caso do modelo)', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato\n${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'docs: antes').ok, true);
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja\n${tel}\n`);
    git('add', '-A');
    const r = git('commit', '-q', '-m', 'docs: título');
    assert.equal(r.ok, false, r.saida);
    assert.match(r.saida, /telefone_literal/);
    assert.doesNotMatch(r.saida, /Legado/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('com a chave, o legado é o texto naquele commit: a linha antiga passa (também renomeada, também depois de outro commit); mexer nela ou trazer outra, não', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato\n${tel}\n`);
    ancorar(base, git);

    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja\n${tel}\n`);
    git('add', '-A');
    const outraLinha = git('commit', '-q', '-m', 'docs: título');
    assert.equal(outraLinha.ok, true, outraLinha.saida);
    assert.match(outraLinha.saida, /Legado: 1 achado/);

    git('mv', 'docs/contato.md', 'docs/loja.md');
    const renomeado = git('commit', '-q', '-m', 'docs: renomeia');
    assert.equal(renomeado.ok, true, renomeado.saida);

    writeFileSync(join(base, 'docs', 'loja.md'), `# contato da loja\n${tel}\n${tel}\n`);
    git('add', '-A');
    const copia = git('commit', '-q', '-m', 'docs: copia');
    assert.equal(copia.ok, false, 'a cópia da linha bloqueia');

    writeFileSync(join(base, 'docs', 'loja.md'), `# contato da loja\n${tel.replace('90000', '91111')}\n`);
    git('add', '-A');
    const mexida = git('commit', '-q', '-m', 'docs: outro número');
    assert.equal(mexida.ok, false, 'o trecho mexido tem de sair limpo');
    assert.match(mexida.saida, /telefone_literal/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o legado lê a chave do HEAD: o commit que a põe (ou a muda) no próprio pipeline.json não perdoa nada', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'docs: antes').ok, true);
    const sha = git('rev-parse', 'HEAD').saida.trim();
    mkdirSync(join(base, '.claude'), { recursive: true });
    writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ lgpd: { legadoAte: sha } }));
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel} (ramal)\n`);
    git('add', '-A');
    const r = git('commit', '-q', '-m', 'ancora e mexe junto');
    assert.equal(r.ok, false, 'a chave ainda não está no HEAD: o que muda no mesmo commit bloqueia');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('chave inválida ou de um commit que não existe: sem legado (e um aviso), nunca mais permissivo', () => {
  const tel = regra('telefone_literal').pega[0];
  for (const chave of [{ legadoAte: 'HEAD' }, { legadoAte: 'abcdef1234' }]) {
    const { base, git } = repositorio();
    try {
      writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
      mkdirSync(join(base, '.claude'), { recursive: true });
      writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ lgpd: chave }));
      git('add', '-A');
      assert.equal(git(...semHooks, 'commit', '-q', '-m', 'antes').ok, true);
      writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n# a mais\n`);
      git('add', '-A');
      const r = git('commit', '-q', '-m', 'docs: mexe');
      assert.equal(r.ok, false, JSON.stringify(chave));
      assert.match(r.saida, /legadoAte/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
});

test('o git/pre-merge-commit também roda o confere-lgpd: o merge que traz dado pessoal é recusado', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'base').ok, true);
    git('switch', '-q', '-c', 'pr/outra');
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'dado pessoal').ok, true);
    git('switch', '-q', 'pr/teste');
    mkdirSync(join(base, 'docs'), { recursive: true });
    writeFileSync(join(base, 'docs', 'outro.md'), '# outro\n');
    git('add', '-A');
    assert.equal(git('commit', '-q', '-m', 'outro').ok, true);
    const merge = git('merge', '--no-ff', '-m', 'junta', 'pr/outra');
    assert.equal(merge.ok, false, merge.saida);
    assert.match(merge.saida, /telefone_literal/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('legado no Edit e no Write: com a chave, o que já está na âncora passa; a cópia e o novo, não; sem a chave nada passa', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  const sem = repositorio();
  try {
    const arquivo = join(base, 'docs', 'contato.md');
    writeFileSync(arquivo, `# contato\n${tel}\n`);
    ancorar(base, git);
    assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: arquivo, content: `# contato da loja\n${tel}\n` } }), null, 'reescrever o arquivo mantendo a linha');
    assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: `${tel}`, new_string: `${tel}\n# ramal` } }), null, 'o old_string tinha a linha: trocá-la mantém');
    assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: '# contato', new_string: `# contato\n${tel}` } })?.permissionDecision, 'deny', 'a cópia de uma linha que já está no arquivo bloqueia');
    assert.equal(hook({ tool_name: 'MultiEdit', tool_input: { file_path: arquivo, edits: [{ old_string: '# contato', new_string: `# c\n${tel}` }] } })?.permissionDecision, 'deny');
    assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: arquivo, old_string: 'x', new_string: `${tel} (ramal)` } })?.permissionDecision, 'deny');
    assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: join(base, 'docs', 'novo.md'), content: `${tel}\n` } })?.permissionDecision, 'deny');

    const arquivo2 = join(sem.base, 'docs', 'contato.md');
    writeFileSync(arquivo2, `# contato\n${tel}\n`);
    sem.git('add', '-A');
    sem.git(...semHooks, 'commit', '-q', '-m', 'antes');
    assert.equal(hook({ tool_name: 'Write', tool_input: { file_path: arquivo2, content: `# contato da loja\n${tel}\n` } })?.permissionDecision, 'deny', 'sem a chave não há legado');
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(sem.base, { recursive: true, force: true });
  }
});

test('à mão: só os arquivos do git (o ignorado fica de fora); com a chave o legado é contado e --todos o lista', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  const aMao = (...args) => spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs'), ...args], { cwd: base, encoding: 'utf8' });
  try {
    writeFileSync(join(base, '.gitignore'), 'dados/\n');
    mkdirSync(join(base, 'dados'));
    writeFileSync(join(base, 'dados', 'banco.md'), `${tel}\n`);
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    assert.equal(aMao('.').status, 1, 'sem a chave a linha antiga bloqueia');
    ancorar(base, git);
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
  const r = regras.find((x) => x.arquivos === 'codigo' && x.nivel !== 'medio' && x.regex !== undefined && !FORTES.includes(x.id));
  const { base, git } = repositorio();
  try {
    mkdirSync(join(base, 'src', 'contatos'), { recursive: true });
    writeFileSync(join(base, CAMINHO.todos), `${preencher(r.pega[0])}\n`);
    ancorar(base, git);
    git('mv', CAMINHO.todos, CAMINHO.codigo);
    const movido = git('commit', '-q', '-m', 'move o teste para o código');
    assert.equal(movido.ok, false, 'no código, a regra vale e o achado é novo');
    assert.match(movido.saida, new RegExp(r.id));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
