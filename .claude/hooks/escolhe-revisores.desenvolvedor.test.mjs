// A exceção da D8.8 no escolhe-revisores: a mudança só na parte do projeto do .claude/agents/desenvolvedor.md não aciona o
// config_pipeline pelo caminho. Dentro do processo (escolher com os textos anexados à mão) e num git de verdade
// (base...head e --trabalho). Qualquer outra mudança nesse arquivo, ou texto que falta, segue acionando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO, lerPastas, lerRevisao } from './config.mjs';
import { lerAgentes, lerNiveis } from './papeis.mjs';
import { escolher, soParteDoProjeto } from './escolhe-revisores.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(AQUI, 'escolhe-revisores.mjs');
const CAMINHO = '.claude/agents/desenvolvedor.md';
const AGENTE = readFileSync(join(AQUI, '..', 'agents', 'desenvolvedor.md'), 'utf8');
const PIPELINE = readFileSync(ARQUIVO, 'utf8');
const cfg = { agentes: lerAgentes().valor, niveis: lerNiveis().valor, revisao: lerRevisao().valor, pastas: lerPastas().valor };

const FIM_DO_PROJETO = '<!-- projeto:fim -->';
const comProjeto = (texto, item) => texto.replace(FIM_DO_PROJETO, `- ${item}\n${FIM_DO_PROJETO}`);
const DEPOIS = comProjeto(AGENTE, 'Rodar `npm run checar:rapido` antes de commitar.');

const arquivo = (extra = {}) => ({ caminho: CAMINHO, status: 'M', binario: false, linhas: [], removidas: [], textoAntes: AGENTE, textoDepois: DEPOIS, ...extra });
const motivosConfig = (a) => escolher([a], cfg, { esforco: 'alto' }).obrigatorios.flatMap((r) => r.motivos).filter((m) => m.gatilho === 'config_pipeline');

// ---------- dentro do processo ----------

test('só a parte do projeto mudou: o config_pipeline não dispara pelo caminho', () => {
  assert.equal(soParteDoProjeto(arquivo()), true);
  assert.deepEqual(motivosConfig(arquivo()), []);
});

test('mudou o cabeçalho, a parte fixa, o bloco regras ou um marcador: o config_pipeline dispara', () => {
  const mudancas = {
    cabecalho: AGENTE.replace('model: sonnet', 'model: opus'),
    fixa: AGENTE.replace('- A menor mudança completa', '- Uma mudança ainda maior'),
    regras: AGENTE.replace('nunca em código, chat, log ou URL', 'sempre em código'),
    marcadorDoProjeto: AGENTE.replace('<!-- projeto:inicio -->', '<!-- projeto:inicio  -->'),
    marcadorDasRegras: AGENTE.replace('<!-- regras:fim -->', ''),
    depoisDoProjeto: `${AGENTE}texto solto depois dos marcadores\n`,
  };
  for (const [nome, mudado] of Object.entries(mudancas)) {
    const a = arquivo({ textoDepois: comProjeto(mudado, 'item novo do projeto') });
    assert.equal(soParteDoProjeto(a), false, nome);
    assert.ok(motivosConfig(a).some((m) => m.arquivo === CAMINHO && m.por === 'caminho'), nome);
  }
});

test('criado, apagado, renomeado ou binário: o config_pipeline dispara', () => {
  const variantes = {
    criado: arquivo({ status: 'A', textoAntes: undefined }),
    apagado: arquivo({ status: 'D', textoDepois: undefined }),
    renomeadoPara: arquivo({ renomeadoPara: 'docs/x.md' }),
    renomeadoDe: arquivo({ renomeadoDe: '.claude/agents/dev.md' }),
    binario: arquivo({ binario: true }),
  };
  for (const [nome, a] of Object.entries(variantes)) {
    assert.equal(soParteDoProjeto(a), false, nome);
    assert.ok(motivosConfig(a).length > 0, nome);
  }
});

test('falta um dos textos, os dois são iguais, o texto não divide ou o caminho é outro: o config_pipeline dispara', () => {
  for (const [nome, a] of Object.entries({
    semAntes: arquivo({ textoAntes: undefined }),
    semDepois: arquivo({ textoDepois: undefined }),
    antesNulo: arquivo({ textoAntes: null }),
    iguais: arquivo({ textoDepois: AGENTE }),
    semMarcadores: arquivo({ textoAntes: 'a\n', textoDepois: 'b\n' }),
    outroAgente: arquivo({ caminho: '.claude/agents/qa.md' }),
    caixaDiferente: arquivo({ caminho: '.claude/agents/Desenvolvedor.md' }),
  })) {
    assert.equal(soParteDoProjeto(a), false, nome);
    assert.ok(motivosConfig(a).length > 0, nome);
  }
});

test('a exceção é só do config_pipeline e só por caminho: o resto do pacote dispara como sempre', () => {
  const junto = escolher([arquivo(), { caminho: '.claude/hooks/x.mjs', status: 'M', binario: false, linhas: [], removidas: [] }], cfg, { esforco: 'alto' });
  const motivos = junto.obrigatorios.flatMap((r) => r.motivos).filter((m) => m.gatilho === 'config_pipeline');
  assert.deepEqual([...new Set(motivos.map((m) => m.arquivo))], ['.claude/hooks/x.mjs'], 'o hook ainda aciona; o agente, não');
});

// ---------- num git de verdade ----------

// o -c de cada git abaixo desliga os hooks do repositório temporário (o do projeto não roda dentro dele)
const SEM_HOOKS = ['-c', 'core.hooks' + 'Path=', '-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];

function repositorio(base) {
  const raiz = mkdtempSync(join(tmpdir(), 'revisores-dev-'));
  const git = (...args) => execFileSync('git', [...SEM_HOOKS, ...args], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const grava = (arquivos) => {
    for (const [caminho, conteudo] of Object.entries(arquivos)) {
      mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
      writeFileSync(join(raiz, caminho), conteudo);
    }
  };
  git('init', '-q', '-b', 'main');
  grava({ 'README.md': 'x\n', '.claude/pipeline.json': PIPELINE, [CAMINHO]: base });
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('switch', '-q', '-c', 'trabalho');
  return { raiz, git, grava };
}
const rodar = (raiz, ...args) => JSON.parse(spawnSync(process.execPath, [SCRIPT, ...args, '--esforco', 'alto', '--json'], { cwd: raiz, encoding: 'utf8' }).stdout);
const disparou = (saida) => saida.obrigatorios.some((r) => r.motivos.some((m) => m.gatilho === 'config_pipeline'));
const confirma = (git, mensagem) => {
  git('add', '-A');
  git('commit', '-q', '-m', mensagem);
};
const com = (r, fn) => {
  try {
    fn(r);
  } finally {
    rmSync(r.raiz, { recursive: true, force: true });
  }
};

test('git de verdade, base...head: só a parte do projeto não dispara, nem com a main andando; o cabeçalho dispara', () => {
  com(repositorio(AGENTE), ({ raiz, git, grava }) => {
    grava({ [CAMINHO]: DEPOIS });
    confirma(git, 'projeto');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), false);
    // a main anda (muda a parte fixa lá): o merge-base segue sendo o ponto de saída do branch
    git('switch', '-q', 'main');
    grava({ [CAMINHO]: AGENTE.replace('- A menor mudança completa', '- Outra coisa') });
    confirma(git, 'main anda');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), false, 'a diferença da main não entra na conta');
  });
  com(repositorio(AGENTE), ({ raiz, git, grava }) => {
    grava({ [CAMINHO]: comProjeto(AGENTE.replace('effort: medium', 'effort: high'), 'x') });
    confirma(git, 'cabecalho');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), true);
  });
});

test('git de verdade, base...head: apagar, renomear e criar o arquivo dispara', () => {
  com(repositorio(AGENTE), ({ raiz, git }) => {
    git('rm', '-q', CAMINHO);
    git('commit', '-q', '-m', 'apaga');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), true, 'apagado');
  });
  com(repositorio(AGENTE), ({ raiz, git }) => {
    git('mv', CAMINHO, 'docs-dev.md');
    git('commit', '-q', '-m', 'renomeia');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), true, 'renomeado');
  });
  com(repositorio('# outro\n'), ({ raiz, git, grava }) => {
    grava({ [CAMINHO]: DEPOIS });
    confirma(git, 'conteúdo novo sobre um texto que não divide');
    assert.equal(disparou(rodar(raiz, 'main', 'trabalho')), true, 'o texto antes não divide em partes');
  });
});

test('git de verdade, --trabalho: a árvore contra o HEAD (commitado ou não)', () => {
  com(repositorio(AGENTE), ({ raiz, grava, git }) => {
    grava({ [CAMINHO]: DEPOIS });
    assert.equal(disparou(rodar(raiz, '--trabalho')), false, 'parte do projeto, sem commit');
    git('add', '-A');
    assert.equal(disparou(rodar(raiz, '--trabalho')), false, 'parte do projeto, no índice');
    grava({ [CAMINHO]: DEPOIS.replace('model: sonnet', 'model: opus') });
    assert.equal(disparou(rodar(raiz, '--trabalho')), true, 'cabeçalho mudou na árvore');
    grava({ [CAMINHO]: AGENTE });
    assert.equal(disparou(rodar(raiz, '--trabalho')), false, 'sem mudança nenhuma não há o que disparar');
  });
  com(repositorio(AGENTE), ({ raiz }) => {
    rmSync(join(raiz, CAMINHO));
    assert.equal(disparou(rodar(raiz, '--trabalho')), true, 'apagado na árvore');
  });
});
