// O gerador dos pares (D11), sincroniza-pares.mjs: o repositório de verdade em dia, as funções puras de cada alvo (cabeçalhos,
// settings.json, tabela) e o disco (idempotência, recusa sem gravar nada, --conferir, temporário + rename), sempre num projeto
// temporário copiado do de verdade, com dado inventado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO } from './config.mjs';
import { cabecalho } from './desenvolvedor.mjs';
import { lerPapeis, orquestrador, papel, versoes } from './papeis.mjs';
import { CHAVES_DO_ENV, cabecalhoDe, conferirLocal, envDe, montar, settingsDe, tabela, tabelaDe } from './sincroniza-pares.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLAUDE = join(AQUI, '..');
const RAIZ = join(CLAUDE, '..');
const GERADOR = join(AQUI, 'sincroniza-pares.mjs');
const P = lerPapeis().valor;
const DADOS = () => JSON.parse(readFileSync(ARQUIVO, 'utf8'));
const roda = (raiz, ...args) => spawnSync(process.execPath, [GERADOR, '--raiz', raiz, ...args], { encoding: 'utf8' });
const ler = (raiz, ...partes) => readFileSync(join(raiz, ...partes), 'utf8');
const gravar = (raiz, texto, ...partes) => writeFileSync(join(raiz, ...partes), texto);

/** Um projeto temporário com o que o gerador lê e regrava, copiado do de verdade; `mexer(raiz)` o desvia antes do teste. */
function comProjeto(fn, mexer = () => {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'pares-'));
  try {
    cpSync(join(CLAUDE, 'agents'), join(raiz, '.claude', 'agents'), { recursive: true });
    for (const rel of ['pipeline.json', 'settings.json', join('skills', 'pipeline', 'SKILL.md')]) {
      mkdirSync(dirname(join(raiz, '.claude', rel)), { recursive: true });
      cpSync(join(CLAUDE, rel), join(raiz, '.claude', rel));
    }
    mexer(raiz);
    fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
/** Troca o pipeline.json do projeto por `muda(dados)` aplicado à cópia (o formato de uma linha por entrada deixa de valer, de propósito). */
const mudaConfig = (muda) => (raiz) => {
  const d = DADOS();
  muda(d);
  gravar(raiz, JSON.stringify(d, null, 2), '.claude', 'pipeline.json');
};
/** Tudo o que o gerador pode regravar, como `{ caminho relativo: texto }`. */
function retrato(raiz) {
  const alvos = ['.claude/settings.json', '.claude/skills/pipeline/SKILL.md', ...readdirSync(join(raiz, '.claude', 'agents')).map((f) => `.claude/agents/${f}`)];
  return Object.fromEntries(alvos.map((a) => [a, ler(raiz, ...a.split('/'))]));
}
const linhasQueMudam = (antes, depois) => {
  const a = antes.split('\n');
  const b = depois.split('\n');
  return a.length !== b.length ? null : a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean);
};

// ---------- o repositório de verdade ----------

test('o repositório de verdade está em dia com o pipeline.json (rode: node .claude/hooks/sincroniza-pares.mjs)', () => {
  const r = roda(RAIZ, '--conferir');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /em dia/);
});

test('o gerador cobre todo agente do pipeline.json que tem arquivo, o orquestrador, o settings.json e a skill', () => {
  const alvos = montar(RAIZ, P).map((s) => s.arquivo.slice(RAIZ.length + 1));
  for (const nome of [...Object.keys(P.agentes), 'orquestrador']) assert.ok(alvos.includes(join('.claude', 'agents', `${nome}.md`)), nome);
  assert.ok(alvos.includes(join('.claude', 'settings.json')));
  assert.ok(alvos.includes(join('.claude', 'skills', 'pipeline', 'SKILL.md')));
});

test('o cabeçalho do desenvolvedor, no arquivo de verdade, é o cabecalho(entrada) do pipeline.json', () => {
  const texto = readFileSync(join(CLAUDE, 'agents', 'desenvolvedor.md'), 'utf8');
  assert.ok(texto.startsWith(cabecalho(papel(P, 'agentes', 'desenvolvedor'))));
});

// ---------- os cabeçalhos ----------

test('cabecalhoDe: troca só model, effort e tools do agente, nada mais, e o orquestrador segue niveis.orquestracao', () => {
  const qa = readFileSync(join(CLAUDE, 'agents', 'qa.md'), 'utf8');
  const p = structuredClone(P);
  p.agentes.qa.model = 'opus';
  p.agentes.qa.effort = 'xhigh';
  p.agentes.qa.tools = 'Read, Grep';
  const depois = cabecalhoDe(p, 'qa', qa);
  assert.deepEqual(linhasQueMudam(qa, depois).map(([a, b]) => [a.split(':')[0], b]), [['tools', 'tools: Read, Grep'], ['model', 'model: opus'], ['effort', 'effort: xhigh']]);
  assert.equal(cabecalhoDe(P, 'qa', depois), qa, 'volta ao de antes com o pipeline.json de antes');

  const orq = readFileSync(join(CLAUDE, 'agents', 'orquestrador.md'), 'utf8');
  const q = structuredClone(P);
  q.niveis.orquestracao.effort = 'high';
  assert.deepEqual(linhasQueMudam(orq, cabecalhoDe(q, 'orquestrador', orq)), [['effort: xhigh', 'effort: high']]);
  assert.equal(cabecalhoDe(P, 'orquestrador', orq), orq, 'sem tools no orquestrador, e nada mais muda');
});

test('cabecalhoDe: o do desenvolvedor sai inteiro do cabecalho(entrada), e o corpo fica como está', () => {
  const texto = readFileSync(join(CLAUDE, 'agents', 'desenvolvedor.md'), 'utf8');
  const corpo = texto.slice(texto.indexOf('\n---\n') + 5);
  const p = structuredClone(P);
  p.agentes.desenvolvedor.effort = 'high';
  p.agentes.desenvolvedor.tools = 'Read, Edit, Write, Bash, Grep, Glob';
  const depois = cabecalhoDe(p, 'desenvolvedor', texto.replace('effort: medium', 'effort: low').replace('omitClaudeMd: true\n', 'omitClaudeMd: true\nextra: 1\n'));
  assert.equal(depois, cabecalho(papel(p, 'agentes', 'desenvolvedor')) + corpo);
  assert.match(depois, /^effort: high$/m);
  assert.doesNotMatch(depois, /extra:/);
});

test('cabecalhoDe recusa o que não dá para gerar: sem cabeçalho, sem a linha model:, name diferente, agente fora do pipeline.json', () => {
  assert.throws(() => cabecalhoDe(P, 'qa', 'sem cabeçalho\n'), /cabeçalho/);
  assert.throws(() => cabecalhoDe(P, 'qa', '---\nname: qa\neffort: high\ntools: Read\n---\ncorpo\n'), /linha model:/);
  assert.throws(() => cabecalhoDe(P, 'qa', '---\nname: qa\nmodel: sonnet\ntools: Read\n---\ncorpo\n'), /linha effort:/);
  assert.throws(() => cabecalhoDe(P, 'qa', '---\nname: qa\nmodel: sonnet\neffort: high\n---\ncorpo\n'), /linha tools:/);
  assert.throws(() => cabecalhoDe(P, 'fantasma', '---\nname: fantasma\nmodel: a\neffort: b\ntools: c\n---\n'), /não está em agentes/);
});

test('cabecalhoDe mantém o fim de linha do arquivo (CRLF) e o texto depois do cabeçalho', () => {
  const crlf = '---\r\nname: qa\r\nmodel: haiku\r\neffort: low\r\ntools: Read\r\n---\r\ncorpo\r\n';
  const depois = cabecalhoDe(P, 'qa', crlf);
  assert.equal(depois, `---\r\nname: qa\r\nmodel: ${P.agentes.qa.model}\r\neffort: ${P.agentes.qa.effort}\r\ntools: ${P.agentes.qa.tools}\r\n---\r\ncorpo\r\n`);
});

// ---------- o settings.json ----------

test('envDe: as 4 chaves, em texto, com a versão de cada família e a profundidade 1 sem o neto, 2 com ele', () => {
  const v = versoes(P);
  assert.deepEqual(envDe(P), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: v.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: v.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: v.haiku,
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1',
  });
  assert.deepEqual(Object.keys(envDe(P)), CHAVES_DO_ENV);
  assert.equal(envDe({ ...P, neto: { model: 'haiku', effort: 'low' } }).CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, '2');
});

test('settingsDe: model, effortLevel e env do pipeline.json; o resto (hooks inclusive) igual, com recuo de 2, fim de linha e \\n final', () => {
  const real = readFileSync(join(CLAUDE, 'settings.json'), 'utf8');
  const antes = JSON.parse(real);
  const sujo = { ...antes, model: 'haiku', effortLevel: 'low', env: { PIPELINE_GUARDA_GIT: '0', ANTHROPIC_DEFAULT_OPUS_MODEL: 'x' } };
  for (const [eol, final] of [['\n', true], ['\r\n', true], ['\n', false], ['\r\n', false]]) {
    const texto = JSON.stringify(sujo, null, 2).replace(/\n/g, eol) + (final ? eol : '');
    const depois = settingsDe(P, texto);
    const novo = JSON.parse(depois);
    assert.deepEqual(novo.hooks, antes.hooks);
    assert.equal(novo.model, orquestrador(P).model);
    assert.equal(novo.effortLevel, orquestrador(P).effort);
    assert.deepEqual(novo.env, envDe(P), 'o PIPELINE_GUARDA_GIT some');
    assert.equal(novo.agent, antes.agent);
    assert.equal(depois.endsWith(eol), final);
    assert.equal(/\r/.test(depois), eol === '\r\n');
    assert.equal(/(^|[^\r])\n/.test(depois), eol === '\n', 'um fim de linha só');
    assert.equal(depois, JSON.stringify(novo, null, 2).replace(/\n/g, eol) + (final ? eol : ''), 'recuo de 2');
    assert.equal(settingsDe(P, depois), depois, 'idempotente');
  }
});

test('settingsDe: o env novo entra logo depois do effortLevel; o env que já existe fica onde está', () => {
  const sem = JSON.stringify({ agent: 'x', model: 'a', effortLevel: 'b', hooks: {} }, null, 2);
  assert.deepEqual(Object.keys(JSON.parse(settingsDe(P, sem))), ['agent', 'model', 'effortLevel', 'env', 'hooks']);
  const com = JSON.stringify({ env: {}, agent: 'x', hooks: {} }, null, 2);
  assert.deepEqual(Object.keys(JSON.parse(settingsDe(P, com))), ['env', 'agent', 'model', 'effortLevel', 'hooks']);
});

test('settingsDe recusa o que não é um objeto JSON', () => {
  assert.throws(() => settingsDe(P, '{ não é json'), /não é JSON válido/);
  assert.throws(() => settingsDe(P, '[]'), /objeto JSON/);
  assert.throws(() => settingsDe(P, 'null'), /objeto JSON/);
});

test('conferirLocal: o env só com as 4 chaves passa; chave a mais, disableAllHooks, env que não é objeto ou JSON ruim recusam', () => {
  assert.doesNotThrow(() => conferirLocal('{}'));
  assert.doesNotThrow(() => conferirLocal(JSON.stringify({ permissions: { allow: [] }, env: { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '2' } })));
  assert.throws(() => conferirLocal(JSON.stringify({ env: { PIPELINE_GUARDA_GIT: '0' } })), /PIPELINE_GUARDA_GIT/);
  assert.throws(() => conferirLocal(JSON.stringify({ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'x', OUTRA: '1' } })), /OUTRA/);
  assert.throws(() => conferirLocal(JSON.stringify({ disableAllHooks: true })), /disableAllHooks/);
  assert.throws(() => conferirLocal(JSON.stringify({ disableAllHooks: false })), /disableAllHooks/);
  assert.throws(() => conferirLocal(JSON.stringify({ env: 'x' })), /env/);
  assert.throws(() => conferirLocal('{ ruim'), /não é JSON válido/);
  assert.throws(() => conferirLocal('[]'), /objeto JSON/);
});

// ---------- a tabela da skill ----------

test('tabelaDe: a tabela entre as marcas, o marcador de hoje (também no lugar do antigo), o fim de linha da skill e idempotente', () => {
  const skill = readFileSync(join(CLAUDE, 'skills', 'pipeline', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const lf = tabelaDe(P, skill);
  assert.equal(lf, skill, 'a skill de verdade está em dia');
  assert.match(lf, /<!-- tabela-agentes:inicio \(gerada por sincroniza-pares\.mjs; não edite\) -->/);
  const antigo = skill.replace(/<!-- tabela-agentes:inicio[^>]*-->/, '<!-- tabela-agentes:inicio (gerada por ajusta-pipeline.mjs --sincronizar-tabela; não edite) -->');
  assert.notEqual(antigo, skill);
  assert.equal(tabelaDe(P, antigo), skill, 'o marcador antigo vira o de hoje');
  const crlf = skill.replace(/\n/g, '\r\n');
  assert.equal(tabelaDe(P, crlf), crlf, 'CRLF fica CRLF, sem LF solto');
  assert.equal(/(^|[^\r])\n/.test(tabelaDe(P, crlf)), false);
  assert.equal(tabelaDe(P, tabelaDe(P, crlf)), crlf, 'idempotente');
  assert.throws(() => tabelaDe(P, 'sem marcas'), /sem as marcas/);
  for (const [nome, e] of Object.entries(P.agentes).filter(([nome]) => nome !== 'desenvolvedor')) assert.ok(tabela(P).includes(`| agente \`${nome}\` (\`.claude/agents/\`) | ${e.tarefa} | \`${e.model}\` | \`${e.effort}\` |`));
});

// ---------- o disco ----------

test('a 2ª execução não muda nada, nem o inode (só grava o que mudou, por temporário + rename), e não deixa temporário', () => {
  comProjeto((raiz) => {
    const sujo = readFileSync(join(CLAUDE, 'settings.json'), 'utf8').replace(/"effortLevel": "[^"]*"/, '"effortLevel": "low"');
    gravar(raiz, sujo, '.claude', 'settings.json');
    const antes = retrato(raiz);
    const r1 = roda(raiz);
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /regravado: \.claude[\\/]settings\.json\n$/, 'só o settings.json mudou');
    const depois = retrato(raiz);
    assert.deepEqual(Object.keys(depois).filter((k) => depois[k] !== antes[k]), ['.claude/settings.json']);
    assert.equal(depois['.claude/settings.json'], readFileSync(join(CLAUDE, 'settings.json'), 'utf8'));
    const inodes = () => Object.keys(depois).map((k) => statSync(join(raiz, ...k.split('/'))).ino);
    const antesDosInodes = inodes();
    const r2 = roda(raiz);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /já estavam em dia/);
    assert.deepEqual(retrato(raiz), depois);
    assert.deepEqual(inodes(), antesDosInodes, 'nenhum arquivo foi regravado');
    assert.deepEqual(readdirSync(join(raiz, '.claude')).filter((f) => f.includes('.tmp-')), []);
    assert.deepEqual(readdirSync(join(raiz, '.claude', 'agents')).filter((f) => f.includes('.tmp-')), []);
  });
});

test('o env com chave a mais (PIPELINE_GUARDA_GIT) sai na regravação, e os hooks ficam profundamente iguais', () => {
  comProjeto((raiz) => {
    const antes = JSON.parse(ler(raiz, '.claude', 'settings.json'));
    const r = roda(raiz);
    assert.equal(r.status, 0, r.stderr);
    const depois = JSON.parse(ler(raiz, '.claude', 'settings.json'));
    assert.deepEqual(depois.env, envDe(P));
    assert.ok(!('PIPELINE_GUARDA_GIT' in depois.env));
    assert.deepEqual(depois.hooks, antes.hooks);
    assert.deepEqual(depois.agent, antes.agent);
  }, (raiz) => {
    const s = JSON.parse(ler(raiz, '.claude', 'settings.json'));
    s.env = { PIPELINE_GUARDA_GIT: '0', ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-0-0', CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: 5 };
    gravar(raiz, `${JSON.stringify(s, null, 2)}\n`, '.claude', 'settings.json');
  });
});

for (const [titulo, local] of [
  ['env com chave fora das 4', { env: { PIPELINE_GUARDA_GIT: '0' } }],
  ['env com as 4 e mais uma', { env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'x', FOO: '1' } }],
  ['disableAllHooks', { disableAllHooks: true }],
]) {
  test(`o settings.local.json com ${titulo}: o gerador recusa (sai 1), diz a chave e não grava nada, nem o settings.local.json`, () => {
    comProjeto((raiz) => {
      const antes = retrato(raiz);
      const arquivoLocal = ler(raiz, '.claude', 'settings.local.json');
      for (const args of [[], ['--conferir']]) {
        const r = roda(raiz, ...args);
        assert.equal(r.status, 1, r.stdout);
        assert.match(r.stderr, /settings\.local\.json/);
        assert.match(r.stderr, new RegExp(Object.keys(local.env ?? local).at(-1)));
        assert.deepEqual(retrato(raiz), antes, 'nada gravado');
        assert.equal(ler(raiz, '.claude', 'settings.local.json'), arquivoLocal);
      }
    }, (raiz) => {
      gravar(raiz, JSON.stringify(local), '.claude', 'settings.local.json');
      gravar(raiz, ler(raiz, '.claude', 'settings.json').replace(/"model": "[^"]*"/, '"model": "haiku"'), '.claude', 'settings.json');
      gravar(raiz, ler(raiz, '.claude', 'agents', 'qa.md').replace(/^effort:.*$/m, 'effort: low'), '.claude', 'agents', 'qa.md');
    });
  });
}

test('o settings.local.json só com as 4 chaves do gerador (ou sem env) não impede a regravação, e o gerador não o regrava', () => {
  comProjeto((raiz) => {
    const local = ler(raiz, '.claude', 'settings.local.json');
    const r = roda(raiz);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(ler(raiz, '.claude', 'settings.local.json'), local);
  }, (raiz) => gravar(raiz, JSON.stringify({ permissions: { allow: [] }, env: { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' } }), '.claude', 'settings.local.json'));
});

for (const [titulo, ruim] of [
  ['JSON quebrado', '{ "familias": '],
  ['sem o desenvolvedor', JSON.stringify((() => { const d = DADOS(); delete d.agentes.desenvolvedor; return d; })())],
  ['par fora da escada', JSON.stringify((() => { const d = DADOS(); d.agentes.qa.effort = 'max'; return d; })())],
]) {
  test(`pipeline.json inválido (${titulo}): sai 1, diz o motivo e não grava nada`, () => {
    comProjeto((raiz) => {
      const antes = retrato(raiz);
      for (const args of [[], ['--conferir']]) {
        const r = roda(raiz, ...args);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /sincroniza-pares:/);
        assert.deepEqual(retrato(raiz), antes);
      }
    }, (raiz) => {
      gravar(raiz, ruim, '.claude', 'pipeline.json');
      gravar(raiz, ler(raiz, '.claude', 'settings.json').replace(/"effortLevel": "[^"]*"/, '"effortLevel": "low"'), '.claude', 'settings.json');
    });
  });
}

test('um cabeçalho que o gerador não sabe regravar (sem a linha effort:) derruba tudo: nenhum outro arquivo é gravado', () => {
  comProjeto((raiz) => {
    const antes = retrato(raiz);
    const r = roda(raiz);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /qa\.md.*effort:/);
    assert.deepEqual(retrato(raiz), antes, 'o settings.json e a skill, que mudariam, ficam como estavam');
  }, (raiz) => {
    gravar(raiz, ler(raiz, '.claude', 'agents', 'qa.md').replace(/^effort:.*\n/m, ''), '.claude', 'agents', 'qa.md');
    gravar(raiz, ler(raiz, '.claude', 'settings.json').replace(/"effortLevel": "[^"]*"/, '"effortLevel": "low"'), '.claude', 'settings.json');
  });
});

test('sem o settings.json ou sem a skill o gerador falha (não inventa o arquivo)', () => {
  for (const rel of [['settings.json'], ['skills', 'pipeline', 'SKILL.md']]) {
    comProjeto((raiz) => {
      const r = roda(raiz);
      assert.equal(r.status, 1);
      assert.match(r.stderr, new RegExp(rel.at(-1).replace('.', '\\.')));
      assert.equal(existsSync(join(raiz, '.claude', ...rel)), false);
    }, (raiz) => rmSync(join(raiz, '.claude', ...rel)));
  }
});

test('mudar um par no pipeline.json muda só a linha certa do cabeçalho (e a do settings, se for o orquestrador)', () => {
  const outro = (e, a, b) => (e === a ? b : a);
  const arq = { effort: outro(P.agentes['revisor-arquitetura'].effort, 'high', 'medium'), tools: `${P.agentes['designer-ui'].tools}, WebFetch`, orq: outro(P.niveis.orquestracao.effort, 'xhigh', 'high') };
  comProjeto((raiz) => {
    const antes = retrato(raiz);
    const r = roda(raiz);
    assert.equal(r.status, 0, r.stderr);
    const depois = retrato(raiz);
    const mudou = Object.keys(depois).filter((k) => depois[k] !== antes[k]);
    assert.deepEqual(mudou.sort(), ['.claude/agents/designer-ui.md', '.claude/agents/orquestrador.md', '.claude/agents/revisor-arquitetura.md', '.claude/settings.json', '.claude/skills/pipeline/SKILL.md']);
    assert.deepEqual(linhasQueMudam(antes['.claude/agents/revisor-arquitetura.md'], depois['.claude/agents/revisor-arquitetura.md']), [[`effort: ${P.agentes['revisor-arquitetura'].effort}`, `effort: ${arq.effort}`]]);
    assert.deepEqual(linhasQueMudam(antes['.claude/agents/designer-ui.md'], depois['.claude/agents/designer-ui.md']), [[`tools: ${P.agentes['designer-ui'].tools}`, `tools: ${arq.tools}`]]);
    assert.deepEqual(linhasQueMudam(antes['.claude/agents/orquestrador.md'], depois['.claude/agents/orquestrador.md']), [[`effort: ${P.niveis.orquestracao.effort}`, `effort: ${arq.orq}`]]);
    assert.equal(JSON.parse(depois['.claude/settings.json']).effortLevel, arq.orq);
    assert.match(depois['.claude/skills/pipeline/SKILL.md'], new RegExp(`\\| agente \`revisor-arquitetura\` .*\\| \`opus\` \\| \`${arq.effort}\` \\|`));
    assert.equal(roda(raiz, '--conferir').status, 0, 'e fica em dia');
  }, mudaConfig((d) => {
    d.agentes['revisor-arquitetura'].effort = arq.effort;
    d.agentes['revisor-arquitetura'].piso = 'opus:medium';
    d.agentes['revisor-arquitetura'].teto = 'opus:high';
    d.agentes['designer-ui'].tools = arq.tools;
    d.niveis.orquestracao.effort = arq.orq;
  }));
});

test('o cabeçalho do desenvolvedor gerado no disco é o cabecalho(entrada) do pipeline.json do projeto', () => {
  comProjeto((raiz) => {
    const r = roda(raiz);
    assert.equal(r.status, 0, r.stderr);
    const p = lerPapeis(join(raiz, '.claude', 'pipeline.json')).valor;
    assert.ok(ler(raiz, '.claude', 'agents', 'desenvolvedor.md').startsWith(cabecalho(papel(p, 'agentes', 'desenvolvedor'))));
    assert.match(ler(raiz, '.claude', 'agents', 'desenvolvedor.md'), /^effort: high$/m);
  }, mudaConfig((d) => { d.agentes.desenvolvedor.effort = 'high'; }));
});

test('--conferir não grava: sai 1 listando o que diverge e o comando, e 0 quando tudo está em dia', () => {
  comProjeto((raiz) => {
    const antes = retrato(raiz);
    const r = roda(raiz, '--conferir');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /\.claude[\\/]agents[\\/]qa\.md/);
    assert.match(r.stderr, /\.claude[\\/]settings\.json/);
    assert.doesNotMatch(r.stderr, /designer-ui/, 'só o que diverge');
    assert.match(r.stderr, /rode node \.claude\/hooks\/sincroniza-pares\.mjs/);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(roda(raiz).status, 0);
    assert.equal(roda(raiz, '--conferir').status, 0);
  }, (raiz) => {
    gravar(raiz, ler(raiz, '.claude', 'agents', 'qa.md').replace(/^model:.*$/m, 'model: haiku'), '.claude', 'agents', 'qa.md');
    gravar(raiz, ler(raiz, '.claude', 'settings.json').replace(/"model": "[^"]*"/, '"model": "sonnet"'), '.claude', 'settings.json');
  });
});

test('opção desconhecida, --raiz sem pasta: sai 1 sem gravar', () => {
  comProjeto((raiz) => {
    const antes = retrato(raiz);
    for (const args of [['--sincronizar-tabela'], ['--conferir=1'], ['--raiz']]) {
      const r = spawnSync(process.execPath, [GERADOR, ...(args[0] === '--raiz' ? args : ['--raiz', raiz, ...args])], { encoding: 'utf8' });
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /sincroniza-pares:/);
    }
    assert.deepEqual(retrato(raiz), antes);
  }, (raiz) => gravar(raiz, ler(raiz, '.claude', 'settings.json').replace(/"effortLevel": "[^"]*"/, '"effortLevel": "low"'), '.claude', 'settings.json'));
});

test('o ajusta-pipeline.mjs não tem mais o --sincronizar-tabela (o gerador é o sincroniza-pares.mjs)', () => {
  const texto = readFileSync(join(AQUI, 'ajusta-pipeline.mjs'), 'utf8');
  assert.doesNotMatch(texto, /sincronizar-tabela|comTabela|trocarCabecalho/);
  assert.match(texto, /--sincronizar-desenvolvedor/, 'o das regras fica');
});
