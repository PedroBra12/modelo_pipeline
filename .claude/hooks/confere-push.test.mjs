// O confere-push como função e como hook pre-push num git de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avaliarPush } from './confere-push.mjs';
import { CONFIGURE, MARCADOR } from './config.mjs';
import { CONFIG_PADRAO, copiarHooks } from './teste-apoio.mjs';

const URL = 'https://github.com/acme/app.git';
const REPO = { valor: 'acme/app', erro: null };
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);
const ancestral = () => true;
const naoAncestral = () => false;
const avaliar = (url, linhas, anc) => avaliarPush(url, linhas, anc, REPO);

test('libera o push que só anda para frente no repositório configurado', () => {
  assert.equal(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral), null);
  assert.equal(avaliar('git@github.com:acme/app.git', [`refs/heads/pr/y ${A} refs/heads/pr/y ${ZERO}`], naoAncestral), null);
  assert.equal(avaliar('https://github.com/acme/app', [], ancestral), null);
  assert.equal(avaliar('https://github.com/Acme/App', [], ancestral), null, 'o GitHub não distingue a caixa');
});

test('nega outro destino, apagar e forçar', () => {
  assert.notEqual(avaliar('https://github.com/acme/outro-repo.git', [`refs/heads/main ${A} refs/heads/main ${B}`], ancestral), null);
  assert.notEqual(avaliar('https://github.com/outra-conta/app.git', [], ancestral), null);
  assert.notEqual(avaliar('https://github.com/acme/appX', [], ancestral), null);
  assert.notEqual(avaliar('https://example.com/acme/app.git', [], ancestral), null);
  assert.match(avaliar('/tmp/remoto.git', [], ancestral) ?? '', /não é o repositório do projeto \(acme\/app\)/);
  assert.notEqual(avaliar(URL, [`(delete) ${ZERO} refs/heads/pr/a ${A}`], ancestral), null);
  assert.notEqual(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], naoAncestral), null);
  assert.notEqual(avaliar(URL, ['refs/heads/main'], ancestral), null);
});

test('nega o push para a main do GitHub e deixa o de pr/x', () => {
  const main = avaliar(URL, [`refs/heads/main ${A} refs/heads/main ${B}`], ancestral);
  assert.match(main ?? '', /a main só anda pelo merge do PR no GitHub/);
  assert.match(avaliar(URL, [`refs/heads/main ${A} refs/heads/main ${ZERO}`], ancestral) ?? '', /a main só anda/, 'a main nova também');
  assert.match(avaliar(URL, [`(delete) ${ZERO} refs/heads/main ${A}`], ancestral) ?? '', /apagaria/, 'apagar vem antes da main');
  assert.match(avaliar(URL, [`refs/heads/f ${A} refs/heads/main ${B}`], ancestral) ?? '', /a main só anda/, 'a ref remota é que vale');
  assert.equal(avaliar(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral), null);
  assert.equal(avaliar(URL, [`refs/heads/main ${A} refs/heads/pr/x ${ZERO}`], ancestral), null);
});

test('repositório no marcador, ausente ou ilegível: nega todo push, mesmo para a URL certa, e manda configurar', () => {
  const marcador = avaliarPush(URL, [`refs/heads/pr/x ${A} refs/heads/pr/x ${B}`], ancestral, { valor: null, erro: CONFIGURE });
  assert.equal(marcador, CONFIGURE);
  assert.equal(avaliarPush(URL, [], ancestral, { valor: null, erro: `${CONFIGURE} (o campo repositorio falta)` })?.startsWith(CONFIGURE), true);
});

/** Um projeto temporário com os hooks copiados, um remoto local (bare) e um commit no branch pr/teste. */
function projeto(base, config) {
  const git = (pasta, ...args) => spawnSync('git', args, { cwd: pasta, encoding: 'utf8' });
  const remoto = join(base, 'remoto.git');
  const raiz = join(base, 'repo');
  mkdirSync(raiz);
  const hooks = copiarHooks(raiz, config);
  git(base, 'init', '-q', '--bare', remoto);
  git(raiz, 'init', '-q', '-b', 'pr/teste');
  for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com'], ['core.hooksPath', join(hooks, 'git')]]) git(raiz, 'config', k, v);
  writeFileSync(join(raiz, 'a.txt'), 'a\n');
  git(raiz, 'add', 'a.txt');
  git(raiz, 'commit', '-q', '--no-verify', '-m', 'a');
  git(raiz, 'remote', 'add', 'origin', remoto);
  return { git, raiz, remoto };
}

test('o hook pre-push, num git de verdade: nega o remoto que não é o configurado, o marcador manda configurar, e o --no-verify do usuário passa', () => {
  const base = mkdtempSync(join(tmpdir(), 'confere-push-git-'));
  try {
    const { git, raiz, remoto } = projeto(base, CONFIG_PADRAO);
    const negado = git(raiz, 'push', 'origin', 'pr/teste');
    assert.notEqual(negado.status, 0);
    assert.match(negado.stderr, /confere-push: push para origin negado: o destino ".*" não é o repositório do projeto \(acme\/app\)/);
    assert.equal(git(remoto, 'rev-parse', '--verify', '-q', 'refs/heads/pr/teste').status, 1);
    assert.equal(git(raiz, 'push', '--no-verify', 'origin', 'pr/teste').status, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o hook pre-push, num git de verdade, com o repositorio no marcador: nega com "configure o repositorio em .claude/pipeline.json"', () => {
  for (const config of [{ ...CONFIG_PADRAO, repositorio: MARCADOR }, '{ lixo']) {
    const base = mkdtempSync(join(tmpdir(), 'confere-push-marcador-'));
    try {
      const { git, raiz, remoto } = projeto(base, config);
      const negado = git(raiz, 'push', 'origin', 'pr/teste');
      assert.notEqual(negado.status, 0);
      assert.match(negado.stderr, /configure o repositorio em \.claude\/pipeline\.json/);
      assert.equal(git(remoto, 'rev-parse', '--verify', '-q', 'refs/heads/pr/teste').status, 1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
});

// ---------- o confere-lgpd sobre o que sobe ----------

import { regras } from './confere-lgpd.mjs';

const TEL = regras.find((r) => r.id === 'telefone_literal').pega[0];

/** Um repositório com um remoto bare e o `origin/main` já subido; `antes` roda sobre a main antes de subir. Devolve o git, a raiz, os hooks e o hook do push. */
function comOrigemMain(base, { antes, semOrigemMain = false } = {}) {
  const git = (pasta, ...args) => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'core.autocrlf=false', ...args], { cwd: pasta, encoding: 'utf8' });
    return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}`.trim() };
  };
  const remoto = join(base, 'remoto.git');
  const raiz = join(base, 'repo');
  mkdirSync(raiz);
  const hooks = copiarHooks(raiz, CONFIG_PADRAO);
  git(base, 'init', '-q', '--bare', remoto);
  git(raiz, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'teste'], ['user.email', 'teste@example.com']]) git(raiz, 'config', k, v);
  mkdirSync(join(raiz, 'docs'));
  writeFileSync(join(raiz, 'a.txt'), 'a\n');
  git(raiz, 'add', 'a.txt'); // os hooks copiados só entram no repositório quando o teste os adota (add -A)
  git(raiz, 'commit', '-q', '-m', 'a');
  antes?.({ raiz, git: (...a) => git(raiz, ...a) });
  git(raiz, 'remote', 'add', 'origin', remoto);
  if (!semOrigemMain) git(raiz, 'push', '-q', 'origin', 'main');
  git(raiz, 'switch', '-q', '-c', 'pr/x');
  const sha = (ref = 'HEAD') => git(raiz, 'rev-parse', ref).saida;
  const commita = (rel, texto, msg = 'muda') => {
    mkdirSync(join(raiz, rel, '..'), { recursive: true });
    writeFileSync(join(raiz, rel), texto);
    git(raiz, 'add', '-A');
    assert.equal(git(raiz, 'commit', '-q', '-m', msg).ok, true);
    return sha();
  };
  /** O hook pre-push como o git o chama: remoto e URL nos argumentos, uma linha por ref na entrada. */
  const hook = (linhas) => spawnSync(process.execPath, [join(hooks, 'confere-push.mjs'), 'origin', URL], { cwd: raiz, input: `${linhas.join('\n')}\n`, encoding: 'utf8' });
  const linha = (local, remotoSha = ZERO, ref = 'refs/heads/pr/x') => `${ref} ${local} ${ref} ${remotoSha}`;
  return { git: (...a) => git(raiz, ...a), raiz, hooks, sha, commita, hook, linha };
}
const comBase = (opcoes, fn) => {
  const base = mkdtempSync(join(tmpdir(), 'confere-push-lgpd-'));
  try {
    fn(comOrigemMain(base, opcoes));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
};

test('push: dado pessoal nos arquivos da ref nega (ref nova: origin/main...local; ref que existe: remoto...local), sem repetir o trecho; o limpo, o que a ref não tocou, a tag e nada a subir passam; as regras quebradas negam', () => {
  // a dívida que já está no origin/main fica onde está: o arquivo que a ref não tocou não é conferido
  comBase({ antes: ({ raiz, git }) => { writeFileSync(join(raiz, 'docs', 'velho.md'), `${TEL}\n`); git('add', '-A'); git('commit', '-q', '-m', 'dívida'); } }, ({ commita, hook, linha, git, hooks }) => {
    const limpo = commita('docs/a.md', '# limpo\n');
    assert.equal(hook([linha(limpo)]).status, 0, 'ref nova limpa');
    assert.equal(hook([`refs/tags/v1 ${limpo} refs/tags/v1 ${ZERO}`]).status, 0, 'tag limpa');
    assert.equal(hook([]).status, 0, 'nada a subir');
    git('push', '-q', '--no-verify', 'origin', 'pr/x');
    assert.equal(hook([linha(limpo, limpo)]).status, 0, 'nada novo');
    const sujo = commita('docs/contato.md', `${TEL}\n`, 'contato');
    for (const rotulo of ['ref nova', 'ref que existe']) {
      const r = hook([rotulo === 'ref nova' ? linha(sujo) : linha(sujo, limpo)]);
      assert.equal(r.status, 1, rotulo);
      assert.match(r.stderr, /confere-push: push para origin negado/);
      assert.match(r.stderr, /telefone_literal/);
      assert.match(r.stderr, /docs\/contato\.md:1/);
      assert.doesNotMatch(r.stderr, /90000/, `${rotulo}: o número nunca vai para a saída`);
      assert.doesNotMatch(r.stderr, /velho\.md/, `${rotulo}: a dívida que a ref não tocou não entra`);
    }
    // o resto continua negado antes: apagar a ref e a main
    assert.equal(hook([`(delete) ${ZERO} refs/heads/pr/x ${limpo}`]).status, 1);
    assert.equal(hook([`refs/heads/main ${limpo} refs/heads/main ${ZERO}`]).status, 1);
    // as regras do confere-lgpd que não carregam negam o push (falha fechado)
    writeFileSync(join(hooks, 'lgpd-regras.mjs'), 'export const REGRAS = ;\n<<<<<<< HEAD\n');
    const quebrado = hook([linha(limpo)]);
    assert.equal(quebrado.status, 1);
    assert.match(quebrado.stderr, /confere-push: push para origin negado.*(regras|confere-lgpd)/s);
  });
});

test('push: sem origin/main a ref nova é conferida inteira (da árvore vazia): a dívida antiga também nega', () => {
  comBase({ semOrigemMain: true, antes: ({ raiz, git }) => { writeFileSync(join(raiz, 'docs', 'velho.md'), `${TEL}\n`); git('add', '-A'); git('commit', '-q', '-m', 'dívida'); } }, ({ commita, hook, linha }) => {
    const sujo = commita('docs/novo.md', '# novo\n');
    const r = hook([linha(sujo)]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /docs\/velho\.md/);
  });
});

test('push: o legadoAte do origin/main (a regra de quem já está lá) perdoa a dívida antiga no arquivo que a ref mexeu; a dívida nova e a chave mudada na própria ref, não', () => {
  comBase({
    antes: ({ raiz, git }) => {
      writeFileSync(join(raiz, 'docs', 'contato.md'), `# contato\n${TEL}\n`);
      git('add', '-A');
      git('commit', '-q', '-m', 'dívida de antes');
      const ancora = git('rev-parse', 'HEAD').saida;
      mkdirSync(join(raiz, '.claude'), { recursive: true });
      writeFileSync(join(raiz, '.claude', 'pipeline.json'), JSON.stringify({ ...CONFIG_PADRAO, lgpd: { legadoAte: ancora } }));
      git('add', '-A');
      git('commit', '-q', '-m', 'ancora');
    },
  }, ({ raiz, commita, hook, linha, git }) => {
    const titulo = commita('docs/contato.md', `# contato da loja\n${TEL}\n`, 'título');
    assert.equal(hook([linha(titulo)]).status, 0, 'a mesma linha de antes, com outro título');
    const copia = commita('docs/contato.md', `# contato da loja\n${TEL}\n${TEL}\n`, 'cópia');
    assert.equal(hook([linha(copia)]).status, 1, 'a cópia é dívida nova');
    const novo = commita('docs/novo.md', `${TEL}\n`, 'novo');
    assert.equal(hook([linha(novo)]).status, 1);
    git('reset', '-q', '--hard', titulo);
    writeFileSync(join(raiz, '.claude', 'pipeline.json'), JSON.stringify({ ...CONFIG_PADRAO, lgpd: { legadoAte: git('rev-parse', 'HEAD').saida } }));
    writeFileSync(join(raiz, 'docs', 'contato.md'), `# contato\n${TEL}\n${TEL}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', 'muda a chave e copia');
    assert.equal(hook([linha(git('rev-parse', 'HEAD').saida)]).status, 1, 'vale o pipeline.json da base, não o da ref');
  });
});

test('push: o legadoAte da base que não é ancestral da ref não vale', () => {
  comBase({
    antes: ({ raiz, git }) => {
      writeFileSync(join(raiz, 'docs', 'contato.md'), `${TEL}\n`);
      git('add', '-A');
      git('commit', '-q', '-m', 'dívida');
      git('switch', '-q', '-c', 'lateral', 'HEAD~1');
      mkdirSync(join(raiz, 'docs'), { recursive: true });
      writeFileSync(join(raiz, 'docs', 'contato.md'), `${TEL}\n# lateral\n`);
      git('add', '-A');
      git('commit', '-q', '-m', 'lateral');
      const lateral = git('rev-parse', 'HEAD').saida;
      git('switch', '-q', 'main');
      mkdirSync(join(raiz, '.claude'), { recursive: true });
      writeFileSync(join(raiz, '.claude', 'pipeline.json'), JSON.stringify({ ...CONFIG_PADRAO, lgpd: { legadoAte: lateral } }));
      git('add', '-A');
      git('commit', '-q', '-m', 'chave de outro histórico');
    },
  }, ({ commita, hook, linha }) => {
    const titulo = commita('docs/contato.md', `${TEL}\n# título\n`, 'título');
    const r = hook([linha(titulo)]);
    assert.equal(r.status, 1, 'sem legado, a linha antiga nega');
    assert.match(r.stderr, /telefone_literal/);
  });
});

test('push: o legadoAte da base que é posterior à adoção do pipeline não vale (a âncora adiantada depois de tirar e pôr a chave)', () => {
  comBase({
    antes: ({ raiz, git }) => {
      git('add', '-A'); // o hook copiado entra aqui: esta é a adoção
      git('commit', '-q', '-m', 'adoção do pipeline');
      writeFileSync(join(raiz, 'docs', 'contato.md'), `# contato\n${TEL}\n`);
      git('add', '-A');
      git('commit', '-q', '-m', 'dívida depois da adoção');
      const adiantada = git('rev-parse', 'HEAD').saida;
      writeFileSync(join(raiz, '.claude', 'pipeline.json'), JSON.stringify({ ...CONFIG_PADRAO, lgpd: { legadoAte: adiantada } }));
      git('add', '-A');
      git('commit', '-q', '-m', 'chave adiantada');
    },
  }, ({ commita, hook, linha }) => {
    const titulo = commita('docs/contato.md', `# contato da loja\n${TEL}\n`, 'título');
    const r = hook([linha(titulo)]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /telefone_literal/);
  });
});

test('push: cada commit da ref é conferido contra o pai, não só a árvore final: o dado pessoal de um commit do meio, apagado depois, nega e o commit é nomeado', () => {
  comBase({}, ({ commita, hook, linha }) => {
    commita('docs/a.md', '# um\n');
    const meio = commita('docs/contato.md', `${TEL}\n`, 'contato');
    const fim = commita('docs/contato.md', '# apagado\n', 'apaga');
    const r = hook([linha(fim)]);
    assert.equal(r.status, 1, 'a árvore final está limpa, mas o commit do meio fica no histórico');
    assert.match(r.stderr, /telefone_literal/);
    assert.match(r.stderr, new RegExp(meio.slice(0, 10)), 'diz em que commit está');
    assert.doesNotMatch(r.stderr, /90000/);
  });
});

test('push: o merge da main que já está no origin/main não conta (só o que o merge resolveu de novo), e o commit raiz da ref é conferido', () => {
  comBase({}, ({ raiz, git, commita, hook, linha, sha }) => {
    commita('docs/a.md', '# a\n');
    git('switch', '-q', 'main');
    mkdirSync(join(raiz, 'docs'), { recursive: true });
    writeFileSync(join(raiz, 'docs', 'da-main.md'), `${TEL}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', 'dívida que já está na main');
    git('push', '-q', '--no-verify', 'origin', 'main');
    git('switch', '-q', 'pr/x');
    assert.equal(git('merge', '--no-ff', '-q', '-m', 'junta a main', 'main').ok, true);
    assert.equal(hook([linha(sha())]).status, 0, 'o merge traz o que o origin/main já tem');
    // um commit raiz (sem pai) numa ref nova, sem origin/main em comum, é conferido inteiro
    const sujo = join(raiz, '..', 'sujo.md');
    writeFileSync(sujo, `${TEL}\n`);
    const plumbing = (args, input) => spawnSync('git', args, { cwd: raiz, input, encoding: 'utf8' }).stdout.trim();
    const blob = plumbing(['hash-object', '-w', sujo]);
    const arvore = plumbing(['mktree'], `100644 blob ${blob}\tsujo.md\n`);
    const raizSuja = plumbing(['commit-tree', '-m', 'raiz com dado pessoal', arvore]);
    const r = hook([linha(raizSuja, ZERO, 'refs/heads/orfa')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sujo\.md/);
  });
});
