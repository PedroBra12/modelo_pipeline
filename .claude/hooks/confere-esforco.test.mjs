// O confere-esforco (D11): o esforço `rapido` não muda o pipeline. Funções puras e `conferir` num git de verdade; o hook pre-commit
// de ponta a ponta fica no pre-commit.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVO } from './config.mjs';
import { MENSAGEM, caminhosDoConfigPipeline, conferir, motivoDoRapido } from './confere-esforco.mjs';

const CAMINHOS = caminhosDoConfigPipeline();

test('os caminhos do gatilho config_pipeline: pipeline.json, agents, hooks, settings, CLAUDE.md, commands e as skills do pipeline; não o código', () => {
  const casa = (a) => CAMINHOS.some((re) => re.test(a));
  for (const a of ['.claude/pipeline.json', '.claude/agents/qa.md', '.claude/hooks/guarda-git.mjs', '.claude/hooks/git/pre-commit', '.claude/settings.json', '.claude/settings.local.json', 'CLAUDE.md', '.claude/commands/rapido.md', '.claude/skills/pipeline/SKILL.md', '.Claude/Pipeline.json']) {
    assert.equal(casa(a), true, a);
  }
  for (const a of ['src/x.ts', 'apps/web/app/page.tsx', 'docs/decisoes.md', 'README.md', 'sub/CLAUDE.md', '.claude/estado/esforco', 'docs/pipeline.json']) assert.equal(casa(a), false, a);
});

test('os caminhos do gatilho no pipeline.json somam aos do piso; o pipeline.json que não lê deixa só o piso', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'confere-esforco-json-'));
  try {
    const j = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
    j.revisao.gatilhos.find((g) => g.nome === 'config_pipeline').caminhos.push('^extra-do-projeto/');
    const bom = join(pasta, 'bom.json');
    writeFileSync(bom, JSON.stringify(j));
    const casa = (caminhos, a) => caminhos.some((re) => re.test(a));
    assert.equal(casa(caminhosDoConfigPipeline(bom), 'extra-do-projeto/x.md'), true);
    assert.equal(casa(caminhosDoConfigPipeline(bom), '.claude/pipeline.json'), true);
    assert.equal(casa(CAMINHOS, 'extra-do-projeto/x.md'), false, 'o do projeto de verdade não tem esse');
    const ruim = join(pasta, 'ruim.json');
    writeFileSync(ruim, '{ quebrado');
    assert.equal(casa(caminhosDoConfigPipeline(ruim), '.claude/pipeline.json'), true, 'sem ler o JSON o piso cobre sozinho');
    assert.equal(casa(caminhosDoConfigPipeline(ruim), 'extra-do-projeto/x.md'), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('motivoDoRapido: só recusa com o rapido em alguma raiz e um arquivo do índice no gatilho', () => {
  const mensagem = motivoDoRapido(['rapido'], ['src/x.ts', '.claude/pipeline.json'], CAMINHOS);
  assert.ok(mensagem.startsWith(MENSAGEM), mensagem);
  assert.match(mensagem, /o esforço rapido não muda o pipeline: grave medio ou alto/);
  assert.match(mensagem, /config_pipeline: \.claude\/pipeline\.json$/);
  assert.notEqual(motivoDoRapido(['medio', 'rapido'], ['CLAUDE.md'], CAMINHOS), null, 'rapido em uma das raízes basta');
  for (const esforcos of [['medio'], ['alto'], ['<ausente>'], ['<ilegível>'], ['xyz'], [], ['medio', '<ausente>']]) {
    assert.equal(motivoDoRapido(esforcos, ['.claude/pipeline.json'], CAMINHOS), null, esforcos.join());
  }
  assert.equal(motivoDoRapido(['rapido'], ['src/x.ts', 'docs/a.md'], CAMINHOS), null, 'rapido sem nenhum arquivo do gatilho');
  assert.equal(motivoDoRapido(['rapido'], [], CAMINHOS), null);
  const muitos = motivoDoRapido(['rapido'], Array.from({ length: 8 }, (_, i) => `.claude/hooks/a${i}.mjs`), CAMINHOS);
  assert.match(muitos, /e mais 3$/, 'a lista tem limite');
});

/** Um repositório git temporário com o índice de `arquivos` (nomes), o `.claude/estado/esforco` de `esforco` (ou nenhum) e o ambiente dado. */
function repositorio(arquivos, esforco) {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'confere-esforco-git-')));
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: raiz, encoding: 'utf8' });
  git('init', '-q', '-b', 'trabalho');
  for (const a of arquivos) {
    mkdirSync(join(raiz, a, '..'), { recursive: true });
    writeFileSync(join(raiz, a), 'x\n');
    git('add', '--', a);
  }
  if (esforco !== undefined) {
    mkdirSync(join(raiz, '.claude', 'estado'), { recursive: true });
    writeFileSync(join(raiz, '.claude', 'estado', 'esforco'), `${esforco}\n`);
  }
  return { raiz, git, limpar: () => rmSync(raiz, { recursive: true, force: true }) };
}
const SEM_ESFORCO = { PATH: process.env.PATH };

test('conferir num git de verdade: lê o esforço do arquivo (no checkout principal) ou do PIPELINE_ESFORCO e olha o índice', () => {
  const rapido = repositorio(['.claude/pipeline.json', 'src/x.ts'], 'rapido');
  try {
    assert.match(conferir(rapido.raiz, { ...SEM_ESFORCO, CLAUDE_PROJECT_DIR: rapido.raiz }).motivo, /rapido não muda o pipeline.*\.claude\/pipeline\.json/);
    assert.match(conferir(rapido.raiz, { ...SEM_ESFORCO, CLAUDE_PROJECT_DIR: '' }).motivo, /rapido não muda o pipeline/, 'o cwd também é raiz (o pai do diretório comum do git)');
    assert.equal(conferir(rapido.raiz, { ...SEM_ESFORCO, PIPELINE_ESFORCO: 'medio' }).motivo, null, 'a variável vence o arquivo');
    assert.match(conferir(rapido.raiz, { ...SEM_ESFORCO, PIPELINE_ESFORCO: 'RAPIDO ' }).motivo, /rapido/, 'caixa e espaço');
  } finally {
    rapido.limpar();
  }
  const medio = repositorio(['.claude/pipeline.json'], 'medio');
  try {
    assert.equal(conferir(medio.raiz, { ...SEM_ESFORCO }).motivo, null);
    assert.match(conferir(medio.raiz, { ...SEM_ESFORCO, PIPELINE_ESFORCO: 'rapido' }).motivo, /rapido/, 'a variável rapido vence o arquivo medio');
  } finally {
    medio.limpar();
  }
  const semArquivo = repositorio(['.claude/pipeline.json']);
  try {
    assert.equal(conferir(semArquivo.raiz, { ...SEM_ESFORCO }).motivo, null, 'sem esforço gravado não recusa');
  } finally {
    semArquivo.limpar();
  }
  const fora = repositorio(['src/x.ts', 'docs/a.md'], 'rapido');
  try {
    assert.equal(conferir(fora.raiz, { ...SEM_ESFORCO }).motivo, null, 'rapido sem arquivo do gatilho');
  } finally {
    fora.limpar();
  }
});

test('conferir: com o rapido e o git que não lista o índice, recusa (falha fechado); sem o rapido não precisa do git para o índice', () => {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'confere-esforco-sem-git-')));
  try {
    assert.equal(conferir(raiz, { PATH: raiz }).motivo, null, 'sem esforço o git nem é chamado');
    const r = conferir(raiz, { PATH: raiz, PIPELINE_ESFORCO: 'rapido' });
    assert.match(r.motivo, /não deu para listar o índice do commit/);
    const naoERepo = conferir(raiz, { PATH: process.env.PATH, PIPELINE_ESFORCO: 'rapido' });
    assert.match(naoERepo.motivo, /não deu para listar o índice do commit/, 'fora de um repositório o diff falha');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
