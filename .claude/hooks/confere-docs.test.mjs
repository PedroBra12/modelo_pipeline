import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lerPastas } from './config.mjs';
import { conferir, unidadeDe } from './confere-docs.mjs';
import { CONFIG_PADRAO, escreverConfig } from './teste-apoio.mjs';

/** As pastas de trabalho vindas de um pipeline.json de verdade, numa pasta temporária. */
function pastasDe(config) {
  const raiz = mkdtempSync(join(tmpdir(), 'confere-docs-config-'));
  try {
    escreverConfig(raiz, config);
    const r = lerPastas(join(raiz, '.claude', 'pipeline.json'));
    assert.equal(r.erro, null);
    return r.valor;
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
const PASTAS = pastasDe(CONFIG_PADRAO);

const AGENTS = `# contatos
Faz:          contatos e ficha
Não faz:      disparos
Depende de:   nada
Como testar:  npm test -w packages/contatos
Arquivos:     \`indice.ts\`
`;

function repo(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'confere-docs-'));
  for (const [rel, conteudo] of Object.entries({ 'README.md': '# repo\n', ...arquivos })) {
    mkdirSync(join(raiz, dirname(rel)), { recursive: true });
    writeFileSync(join(raiz, rel), conteudo);
  }
  return raiz;
}

const PASTA_OK = {
  'packages/contatos/AGENTS.md': AGENTS,
  'packages/contatos/indice.ts': 'export {}',
  'packages/contatos/dominio/mescla.ts': 'export {}',
};

const caso = (nome, arquivos, commit, mensagem, esperado, apagados = [], pastas = PASTAS) =>
  test(nome, () => {
    const raiz = repo(arquivos);
    try {
      const problemas = conferir({ raiz, arquivos: commit, apagados, mensagem, pastas });
      if (esperado === null) assert.deepEqual(problemas, []);
      else assert.ok(problemas.some((p) => p.includes(esperado)), `esperava "${esperado}" em ${JSON.stringify(problemas)}`);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

test('acha a pasta de trabalho de cada arquivo, pelas regex da configuração', () => {
  assert.equal(unidadeDe('packages/contatos/dominio/x.ts', PASTAS), 'packages/contatos');
  assert.equal(unidadeDe('apps/api/src/x.ts', PASTAS), 'apps/api');
  assert.equal(unidadeDe('src/ia/cliente.ts', PASTAS), 'src/ia');
  assert.equal(unidadeDe('.claude/hooks/portao.mjs', PASTAS), '.claude/hooks');
  assert.equal(unidadeDe('docs/plano.md', PASTAS), null);
  assert.equal(unidadeDe('.claude/skills/pipeline/SKILL.md', PASTAS), null);
  assert.equal(unidadeDe('apps/AGENTS.md', PASTAS), null, 'pasta que só agrupa');
  assert.equal(unidadeDe('db/migrar.ts', PASTAS), null, 'db não está na configuração padrão');
});

test('as pastas de trabalho vêm da configuração: outra lista, outras pastas', () => {
  const outras = pastasDe({ ...CONFIG_PADRAO, pastasDeTrabalho: ['^servicos/[^/]+(?=/)', '^db(?=/)'] });
  assert.equal(unidadeDe('servicos/cobranca/x.ts', outras), 'servicos/cobranca');
  assert.equal(unidadeDe('db/migrar.ts', outras), 'db');
  assert.equal(unidadeDe('packages/contatos/x.ts', outras), null);
});

caso('pasta em dia passa', PASTA_OK, Object.keys(PASTA_OK), 'contatos: mescla', null);
caso('pasta sem AGENTS.md é recusada', { 'apps/api/src/x.ts': '' }, ['apps/api/src/x.ts'], 'm', 'apps/api não tem AGENTS.md');
caso('AGENTS.md sem as partes do modelo', { 'packages/docker/AGENTS.md': 'Faz: sobe o banco\n', 'packages/docker/x.mjs': '' },
  ['packages/docker/AGENTS.md', 'packages/docker/x.mjs'], 'm', 'não tem: Não faz:, Como testar:');
caso('AGENTS.md com as partes em negrito passa', { 'packages/a/AGENTS.md': '**Faz:** a\n**Não faz**: b\nComo testar: c\n', 'packages/a/x.mjs': '' },
  ['packages/a/AGENTS.md', 'packages/a/x.mjs'], 'm', null);
caso('o que era exigido só de módulo não é mais: Depende de, Expõe, Capacidades e Tabelas ficam a critério do projeto',
  { 'packages/a/AGENTS.md': 'Faz: a\nNão faz: b\nComo testar: c\n', 'packages/a/modulo.ts': "depende: ['x']", 'packages/a/capacidades.ts': "'a:ler'", 'packages/a/banco/migracoes/1_a.sql': 'create table a.t (id int);' },
  ['packages/a/AGENTS.md', 'packages/a/modulo.ts', 'packages/a/capacidades.ts', 'packages/a/banco/migracoes/1_a.sql'], 'm', null);
caso('código mudou e o AGENTS.md não, sem declarar', PASTA_OK, ['packages/contatos/dominio/mescla.ts'], 'contatos: mescla', 'Docs-conferidos: packages/contatos/AGENTS.md');
caso('código mudou e o AGENTS.md foi conferido', PASTA_OK, ['packages/contatos/dominio/mescla.ts'],
  'contatos: mescla\n\nDocs-conferidos: packages/contatos/AGENTS.md', null);
caso('AGENTS.md cita arquivo que sumiu', { ...PASTA_OK, 'packages/contatos/AGENTS.md': `${AGENTS}Também: \`fila.ts\`\n` },
  Object.keys(PASTA_OK), 'm', 'cita `fila.ts`');
caso('link quebrado num .md do commit', { 'docs/a.md': 'veja [b](b.md) e [c](https://example.com)' }, ['docs/a.md'], 'm', 'o link "b.md"');
caso('link que existe passa', { 'docs/a.md': 'veja [b](b.md#parte)', 'docs/b.md': '' }, ['docs/a.md'], 'm', null);
caso('AGENTS.md de pasta que só agrupa passa', { 'apps/AGENTS.md': 'Faz: hosts\n' }, ['apps/AGENTS.md'], 'm', null);
caso('arquivo citado em subpasta conta', { ...PASTA_OK, 'packages/contatos/AGENTS.md': `${AGENTS}Regra: \`mescla.ts\`, \`process.env\`\n` },
  Object.keys(PASTA_OK), 'm', null);
caso('arquivo apagado que o AGENTS.md ainda cita', { ...PASTA_OK, 'packages/contatos/AGENTS.md': `${AGENTS}Fila: \`fila.ts\`\n` },
  [], 'contatos: tira a fila', 'cita `fila.ts`', ['packages/contatos/fila.ts']);
caso('Docs-conferidos de outra pasta com o mesmo começo não vale', { ...PASTA_OK, 'packages/conta/AGENTS.md': AGENTS.replace('# contatos', '# conta'), 'packages/conta/x.ts': '' },
  ['packages/conta/x.ts'], 'conta: x\n\nDocs-conferidos: packages/contatos/AGENTS.md', 'Docs-conferidos: packages/conta/AGENTS.md');
caso('link de exemplo em bloco de código e em skill de terceiro não conta',
  { 'docs/a.md': 'texto\n```md\n[x](nao-existe.md)\n```\n', '.claude/skills/x/SKILL.md': '[y](../fora/SKILL.md)' },
  ['docs/a.md', '.claude/skills/x/SKILL.md'], 'm', null);
caso('link com % solto vira link quebrado, sem derrubar a checagem', { 'docs/a.md': '[x](50%.md)' }, ['docs/a.md'], 'm', 'o link "50%.md"');

const GERADO_OK = { 'packages/banco/AGENTS.md': 'Faz: banco\nNão faz: x\nComo testar: y\nGerado: `tipos.ts`\n', 'packages/banco/gerado/tipos.ts': 'export {}', 'packages/banco/src/cliente.ts': 'export {}' };
caso('só arquivo gerado mudou: não pede Docs-conferidos', GERADO_OK, ['packages/banco/gerado/tipos.ts'], 'banco: regera', null);
caso('gerado apagado também não pede', GERADO_OK, [], 'banco: regera', null, ['packages/banco/gerado/velho.ts']);
caso('gerado e código na mesma pasta: continua pedindo', GERADO_OK, ['packages/banco/gerado/tipos.ts', 'packages/banco/src/cliente.ts'], 'banco: regera',
  'Docs-conferidos: packages/banco/AGENTS.md');
caso('gerado novo, que o AGENTS.md não cita, continua pedindo', { ...GERADO_OK, 'packages/banco/gerado/novo.ts': 'export {}' }, ['packages/banco/gerado/novo.ts'], 'banco: regera',
  'Docs-conferidos: packages/banco/AGENTS.md');
caso('gerado em pasta sem AGENTS.md continua recusado', { 'packages/novo/gerado/x.ts': '' }, ['packages/novo/gerado/x.ts'], 'm', 'packages/novo não tem AGENTS.md');
caso('AGENTS.md que cita arquivo sumido continua recusado com gerado no commit', { ...GERADO_OK, 'packages/banco/AGENTS.md': 'Faz: banco\nNão faz: x\nComo testar: y\n`fila.ts`\n' },
  ['packages/banco/gerado/tipos.ts'], 'm', 'cita `fila.ts`');
caso('.jsx é código: mudou, pede Docs-conferidos', { ...PASTA_OK, 'packages/contatos/tela.jsx': 'export {}' }, ['packages/contatos/tela.jsx'], 'contatos: tela',
  'Docs-conferidos: packages/contatos/AGENTS.md');
caso('arquivo da raiz citado sem caminho passa; o que não existe em lugar nenhum, não',
  { ...PASTA_OK, 'DESIGN.md': '# design', 'packages/contatos/AGENTS.md': `${AGENTS}Tela: \`DESIGN.md\`, \`proxy.js\`\n` },
  Object.keys(PASTA_OK), 'm', 'cita `proxy.js`');
caso('arquivo da raiz citado sem caminho passa', { ...PASTA_OK, 'DESIGN.md': '# design', 'packages/contatos/AGENTS.md': `${AGENTS}Tela: \`DESIGN.md\`\n` },
  Object.keys(PASTA_OK), 'm', null);
for (const extensao of ['py', 'go', 'rb', 'vue', 'svelte', 'css', 'scss', 'html', 'sh', 'yml', 'yaml', 'toml', 'prisma']) {
  caso(`.${extensao} é código (a lista única do config.mjs): mudou, pede Docs-conferidos`, { ...PASTA_OK, [`packages/contatos/x.${extensao}`]: 'x' }, [`packages/contatos/x.${extensao}`], 'contatos: muda',
    'Docs-conferidos: packages/contatos/AGENTS.md');
}
caso('.txt e .png não são código: não pedem Docs-conferidos', { ...PASTA_OK, 'packages/contatos/lista.txt': 'x', 'packages/contatos/logo.png': 'x' }, ['packages/contatos/lista.txt', 'packages/contatos/logo.png'], 'contatos: muda', null);
caso('AGENTS.md que cita um .py ou .yml que não existe é recusado, e o que existe passa',
  { ...PASTA_OK, 'packages/contatos/job.py': 'x', 'packages/contatos/AGENTS.md': `${AGENTS}Rotina: \`job.py\` e \`ci.yml\`\n` }, Object.keys(PASTA_OK), 'm', 'cita `ci.yml`');
