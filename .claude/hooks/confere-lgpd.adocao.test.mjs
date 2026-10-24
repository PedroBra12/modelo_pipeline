// A adoção do pipeline e o que depende dela no legado do confere-lgpd: o legadoAte preso à adoção (pela ordem do histórico, não pela data), só poder
// recuar ou sair, o trecho achado como chave. Em arquivo à parte do confere-lgpd.legado.test.mjs: cada caso monta um git de verdade, e o node --test os roda em paralelo.
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
const gravaPipelineSimples = (base, legadoAte) => {
  mkdirSync(join(base, '.claude'), { recursive: true });
  writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ lgpd: { legadoAte } }));
};

// ---------- legadoAte: ancestral do HEAD, e só pode recuar ----------

const sha = (git, ref = 'HEAD') => git('rev-parse', ref).saida.trim();
const gravaPipeline = (base, legadoAte, extra = {}) => {
  mkdirSync(join(base, '.claude'), { recursive: true });
  writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ ...extra, ...(legadoAte === undefined ? {} : { lgpd: { legadoAte } }) }));
};
/** Um teste verde em .claude/hooks do repositório de teste: o commit que toca .claude/ roda o node --test e precisa de ao menos um. */
const comTesteVerde = (base, git) => {
  mkdirSync(join(base, '.claude', 'hooks'), { recursive: true });
  writeFileSync(join(base, '.claude', 'hooks', 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
  git('add', '-A');
  assert.equal(git(...semHooks, 'commit', '-q', '-m', 'um teste verde').ok, true);
};

test('o legadoAte é preso à adoção: tirar a chave e pô-la de volta num commit mais novo não adianta a âncora', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato\n${tel}\n`);
    const divida = ancorar(base, git);
    const adocao = ancorar.adocao;
    const pipeline = (legadoAte, extra = {}) => writeFileSync(join(base, '.claude', 'pipeline.json'), JSON.stringify({ ...extra, ...(legadoAte === undefined ? {} : { lgpd: { legadoAte } }) }));
    // na adoção a chave vale: mexer no título mantém a dívida de antes perdoada
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja\n${tel}\n`);
    git('add', '-A');
    let r = gate(base, git, 'docs: título');
    assert.equal(r.ok, true, r.saida);
    const maisNovo = git('rev-parse', 'HEAD').saida.trim(); // depois da adoção
    // tirar a chave (livre) ...
    pipeline(undefined);
    git('add', '-A');
    r = gate(base, git, 'tira a chave');
    assert.equal(r.ok, true, r.saida);
    // ... e pô-la de volta apontando para um commit mais novo que a adoção: o commit passa (não havia valor de antes), mas a âncora não vale
    pipeline(maisNovo);
    git('add', '-A');
    r = gate(base, git, 'põe a chave de volta, mais nova');
    assert.equal(r.ok, true, r.saida);
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja toda\n${tel}\n`);
    git('add', '-A');
    r = gate(base, git, 'docs: outro título');
    assert.equal(r.ok, false, 'a âncora mais nova que a adoção não perdoa a dívida');
    assert.match(r.saida, /telefone_literal/);
    assert.match(r.saida, /legadoAte.*adoção/);
    // a própria adoção vale (igual a ela), e a dívida (ancestral dela) também; a chave só recua (adocao -> divida), nunca avança
    git('reset', '-q', '--hard', 'HEAD');
    for (const valor of [undefined, adocao, divida]) {
      pipeline(valor);
      git('add', '-A');
      r = gate(base, git, `chave ${valor === undefined ? 'fora' : valor.slice(0, 7)}`);
      assert.equal(r.ok, true, r.saida);
      if (valor === undefined) continue;
      writeFileSync(join(base, 'docs', 'contato.md'), `# contato ${valor.slice(0, 7)}
${tel}
`);
      git('add', '-A');
      r = gate(base, git, `docs: título com a âncora ${valor.slice(0, 7)}`);
      assert.equal(r.ok, true, `a âncora ${valor.slice(0, 7)} é da adoção ou anterior: vale. ${r.saida}`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('sem o hook no histórico (o pipeline ainda não foi adotado) o legadoAte não vale', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato\n${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'dívida').ok, true);
    gravaPipelineSimples(base, git('rev-parse', 'HEAD').saida.trim());
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'chave sem adoção').ok, true);
    writeFileSync(join(base, 'docs', 'contato.md'), `# contato da loja\n${tel}\n`);
    git('add', '-A');
    const r = gate(base, git, 'docs: título');
    assert.equal(r.ok, false);
    assert.match(r.saida, /legadoAte.*adoção/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
test('legadoAte que não é ancestral do HEAD (outro branch, outro histórico) não vale: sem legado e um aviso', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    git(...semHooks, 'commit', '-q', '--allow-empty', '-m', 'base');
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    git(...semHooks, 'commit', '-q', '-m', 'dívida');
    git('switch', '-q', '-c', 'pr/outro', 'HEAD~1');
    mkdirSync(join(base, 'docs'), { recursive: true });
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n# outro\n`);
    git('add', '-A');
    git(...semHooks, 'commit', '-q', '-m', 'dívida do outro lado');
    const forasteiro = sha(git);
    git('switch', '-q', 'pr/teste');
    gravaPipeline(base, forasteiro);
    git('add', '-A');
    git(...semHooks, 'commit', '-q', '-m', 'chave');
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n# a mais\n`);
    git('add', '-A');
    const r = gate(base, git, 'mexe');
    assert.equal(r.ok, false, 'o commit forasteiro não ancora o legado');
    assert.match(r.saida, /telefone_literal/);
    assert.match(r.saida, /legadoAte.*ancestral/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o pre-commit recusa o legadoAte novo que não é ancestral do valor de antes: ele só pode recuar ou sair', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    comTesteVerde(base, git);
    const velho = sha(git);
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    const ancora = ancorar(base, git); // a dívida e, no commit seguinte, a chave
    writeFileSync(join(base, 'docs', 'outra.md'), '# nada\n');
    git('add', '-A');
    assert.equal(gate(base, git, 'docs: outra').ok, true);
    const adiante = sha(git);
    for (const [rotulo, valor, extra, passa] of [['avançar', adiante, {}, false], ['ficar', ancora, { nota: 1 }, true], ['recuar', velho, {}, true], ['sair', undefined, {}, true]]) {
      gravaPipeline(base, valor, extra);
      git('add', '-A');
      const r = gate(base, git, `chave: ${rotulo}`);
      assert.equal(r.ok, passa, `${rotulo}: ${r.saida}`);
      if (!passa) assert.match(r.saida, /legadoAte só pode recuar/);
      git('reset', '-q', '--hard', passa ? 'HEAD~1' : 'HEAD'); // volta ao estado de antes para o próximo caso
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a primeira vez que o legadoAte entra no pipeline.json não é recusada (não havia valor de antes)', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    comTesteVerde(base, git);
    writeFileSync(join(base, 'docs', 'contato.md'), `${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'dívida').ok, true);
    gravaPipeline(base, sha(git));
    git('add', '-A');
    const r = gate(base, git, 'ancora o legado');
    assert.equal(r.ok, true, r.saida);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a adoção é a adição do hook que é ancestral das outras, não a de data mais antiga: o commit com a data forjada não adianta a âncora', () => {
  const tel = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    const comData = (data, ...args) => {
      const r = spawnSync('git', args, { cwd: base, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: data, GIT_COMMITTER_DATE: data } });
      return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
    };
    const contato = join(base, 'docs', 'contato.md');
    writeFileSync(contato, `# contato\n${tel}\n`);
    ancorar(base, git); // a dívida e, no commit seguinte, a adoção (a adição real do hook)
    writeFileSync(contato, `# contato x\n${tel}\n`);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'x, depois da adoção').ok, true);
    const x = sha(git);
    // um lado do histórico tira o hook e o repõe com a data de 2000: é a "adição de data mais antiga", mas não é ancestral da adoção real
    git('switch', '-q', '-c', 'lado');
    git('rm', '-q', '.claude/hooks/confere-lgpd.mjs');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'tira o hook').ok, true);
    poeMarcaDaAdocao(base);
    git('add', '-A');
    assert.equal(comData('2000-01-01T00:00:00', ...semHooks, 'commit', '-q', '-m', 'repõe o hook, com data antiga').ok, true);
    git('switch', '-q', 'pr/teste');
    writeFileSync(join(base, 'docs', 'outra.md'), '# outra\n');
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'outra').ok, true);
    // o merge muda o hook de um jeito que não é o de nenhum dos pais: sem isso a simplificação do histórico do git esconde um dos lados
    git(...semHooks, 'merge', '--no-ff', '--no-commit', 'lado');
    writeFileSync(join(base, ...MARCA_DA_ADOCAO), '// o hook que a adoção traz, ajustado no merge\n');
    git('add', '-A');
    const junta = git(...semHooks, 'commit', '-q', '-m', 'junta');
    assert.equal(junta.ok, true, junta.saida);
    const adicoes = git('log', '--diff-filter=A', '--format=%H', '--', '.claude/hooks/confere-lgpd.mjs').saida.trim().split('\n');
    assert.equal(adicoes.length, 2, 'as duas adições aparecem no log: a real e a de data antiga');
    assert.equal(git('log', '-1', '--format=%H', adicoes.at(-1)).saida.trim(), adicoes.at(-1));
    assert.notEqual(adicoes.at(-1), ancorar.adocao, 'a última do log (a de data mais antiga) não é a adoção real: é a forjada');
    // tira a chave e a põe de volta apontando para o X (posterior à adoção real, anterior à adição forjada)
    gravaPipeline(base, undefined);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'tira a chave').ok, true);
    gravaPipeline(base, x);
    git('add', '-A');
    assert.equal(git(...semHooks, 'commit', '-q', '-m', 'põe a chave no x').ok, true);
    writeFileSync(contato, `# contato y\n${tel}\n`);
    git('add', '-A');
    const r = gate(base, git, 'docs: título');
    assert.equal(r.ok, false, 'a adoção é a real (ancestral de todas); o x é posterior a ela');
    assert.match(r.saida, /legadoAte.*adoção/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('mexer na linha que tem a dívida sem mudar o trecho achado continua legado; mudar o trecho bloqueia', () => {
  const tel = regra('telefone_literal');
  const linha = tel.pega[0]; // o exemplo da própria regra (rótulo, DDD, número com hífen)
  const rel = 'docs/contato.md';
  const ancora = `# contato
${linha}
`;
  const casos = [
    ['troca o rótulo da linha', linha.replace('celular', 'fone da loja'), true],
    ['põe um comentário depois', `${linha} // ramal 12`, true],
    ['reindenta e troca o rótulo', `    telefone: ${linha.slice(linha.indexOf("'"))}`, true],
    ['muda os dígitos do trecho', linha.replace('90000-0000', '91111-0000'), false],
    ['muda o DDD do trecho', linha.replace('(62)', '(11)'), false],
    ['copia a linha', `${linha}
${linha}`, false],
  ];
  for (const [rotulo, nova, passa] of casos) {
    const texto = `# contato
${nova}
`;
    const achados = marcarLegado(varrer(texto, rel, [tel]), texto, ancora, rel);
    assert.ok(achados.length > 0, `${rotulo}: achou`);
    assert.equal(achados.every((x) => x.legado === true), passa, rotulo);
  }
});

test('o mesmo, de ponta a ponta no pre-commit: o rótulo trocado passa, o número mudado bloqueia', () => {
  const linha = regra('telefone_literal').pega[0];
  const { base, git } = repositorio();
  try {
    const contato = join(base, 'docs', 'contato.md');
    writeFileSync(contato, `# contato
${linha}
`);
    ancorar(base, git);
    for (const [rotulo, nova, passa] of [['troca o rótulo', linha.replace('celular', 'fone da loja'), true], ['muda os dígitos', linha.replace('90000-0000', '91111-0000'), false]]) {
      writeFileSync(contato, `# contato
${nova}
`);
      git('add', '-A');
      const r = gate(base, git, `docs: ${rotulo}`);
      assert.equal(r.ok, passa, `${rotulo}: ${r.saida}`);
      if (!passa) assert.match(r.saida, /telefone_literal/);
      git('reset', '-q', '--hard', passa ? 'HEAD~1' : 'HEAD');
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
