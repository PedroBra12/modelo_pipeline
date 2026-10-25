// O legado do confere-lgpd (opcional e ancorado em lgpd.legadoAte) e o que depende dele: o push, o Edit, o à-mão, o merge. Fica em arquivo
// à parte porque cada caso monta um git de verdade: o node --test os roda em paralelo com o resto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digitosCpf, marcarLegado, regras, relatorio, varrer } from './confere-lgpd.mjs';

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

function hook(entrada, ambiente = {}) {
  const r = spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs')], {
    input: JSON.stringify(entrada),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: RAIZ, ...ambiente },
  });
  return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
}

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
/**
 * O que o hook pre-commit decide para o que está no índice, rodando só o confere-lgpd (o mesmo que o git/pre-commit chama, sem pagar o
 * resto dos hooks de cada commit); se passa, faz o commit sem hooks para a história andar. Devolve { ok, saida } como o git().
 */
function gate(base, git, mensagem) {
  const r = spawnSync(process.execPath, [join(AQUI, 'confere-lgpd.mjs'), '--indice'], { cwd: base, encoding: 'utf8' });
  const saida = `${r.stdout}${r.stderr}`;
  if (r.status !== 0) return { ok: false, saida };
  const c = git(...semHooks, 'commit', '-q', '-m', mensagem);
  return { ok: c.ok, saida: `${saida}${c.saida}` };
}
/** O arquivo que marca a adoção do pipeline: o commit mais antigo que o adiciona é o teto do legadoAte. */
const MARCA_DA_ADOCAO = ['.claude', 'hooks', 'confere-lgpd.mjs'];
const poeMarcaDaAdocao = (base) => {
  mkdirSync(join(base, '.claude', 'hooks'), { recursive: true });
  writeFileSync(join(base, ...MARCA_DA_ADOCAO), '// o hook que a adoção traz\n');
};
/**
 * Commita a dívida de antes e ancora o legado nesse commit. O commit seguinte é a adoção: traz o hook (a marca), o pipeline.json e a
 * chave, e o legadoAte (a dívida) é ancestral dele. Devolve o sha da dívida; o da adoção fica em \`ancorar.adocao\`.
 */
function ancorar(base, git) {
  git('add', '-A');
  assert.equal(git(...semHooks, 'commit', '-q', '-m', 'docs: antes do pipeline').ok, true);
  const sha = git('rev-parse', 'HEAD').saida.trim();
  mkdirSync(join(base, '.claude'), { recursive: true });
  writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ lgpd: { legadoAte: sha } }));
  poeMarcaDaAdocao(base);
  git('add', '-A');
  assert.equal(git(...semHooks, 'commit', '-q', '-m', 'adoção do pipeline: o hook, o pipeline.json e a âncora').ok, true);
  ancorar.adocao = git('rev-parse', 'HEAD').saida.trim();
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
    const r = gate(base, git, 'docs: título');
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
    const outraLinha = gate(base, git, 'docs: título');
    assert.equal(outraLinha.ok, true, outraLinha.saida);
    assert.match(outraLinha.saida, /Legado: 1 achado/);

    git('mv', 'docs/contato.md', 'docs/loja.md');
    const renomeado = gate(base, git, 'docs: renomeia');
    assert.equal(renomeado.ok, true, renomeado.saida);

    writeFileSync(join(base, 'docs', 'loja.md'), `# contato da loja\n${tel}\n${tel}\n`);
    git('add', '-A');
    const copia = gate(base, git, 'docs: copia');
    assert.equal(copia.ok, false, 'a cópia da linha bloqueia');

    writeFileSync(join(base, 'docs', 'loja.md'), `# contato da loja\n${tel.replace('90000', '91111')}\n`);
    git('add', '-A');
    const mexida = gate(base, git, 'docs: outro número');
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
    const r = gate(base, git, 'ancora e mexe junto');
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
      const r = gate(base, git, 'docs: mexe');
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
    const movido = gate(base, git, 'move o teste para o código');
    assert.equal(movido.ok, false, 'no código, a regra vale e o achado é novo');
    assert.match(movido.saida, new RegExp(r.id));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('as regras de código valem em toda extensão da lista única do config.mjs (um .vue com segredo não passa), e não em .md nem .txt', async () => {
  const { EXTENSOES_DE_CODIGO } = await import('./config.mjs');
  const r = regra('senha_literal');
  const texto = preencher(r.pega[0]);
  for (const e of EXTENSOES_DE_CODIGO) assert.ok(ids(varrer(texto, `src/x/Comp.${e}`, [r])).includes('senha_literal'), `.${e}`);
  for (const e of ['md', 'txt', 'png']) assert.deepEqual(ids(varrer(texto, `src/x/Comp.${e}`, [r])), [], `.${e}`);
});
