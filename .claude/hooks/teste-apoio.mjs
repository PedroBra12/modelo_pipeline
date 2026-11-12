// Apoio dos testes (não é teste): monta um projeto numa pasta temporária com os hooks copiados e um pipeline.json
// que o teste escolhe, para o teste não depender do .claude/pipeline.json de verdade.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentesFixos, lerPapeis } from './papeis.mjs';
import { tabelaDe } from './sincroniza-pares.mjs';

export const HOOKS = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PADRAO = {
  repositorio: 'acme/app',
  portaoRapido: 'checar:rapido',
  pastasDeTrabalho: ['^(apps|packages|src)/[^/]+(?=/)', '^\\.claude/hooks(?=/)'],
};

/** Grava .claude/pipeline.json no projeto: um objeto vira JSON; um texto vai como está. */
export function escreverConfig(projeto, config) {
  mkdirSync(join(projeto, '.claude'), { recursive: true });
  writeFileSync(join(projeto, '.claude', 'pipeline.json'), typeof config === 'string' ? config : JSON.stringify(config, null, 2));
}

/** Copia os hooks (sem testes nem .md) para <projeto>/.claude/hooks e grava o pipeline.json. Devolve a pasta dos hooks copiados. */
export function copiarHooks(projeto, config = CONFIG_PADRAO) {
  const destino = join(projeto, '.claude', 'hooks');
  cpSync(HOOKS, destino, {
    recursive: true,
    filter: (origem) => !/\.test\.mjs$/.test(origem) && !/\.md$/.test(origem) && basename(origem) !== 'teste-apoio.mjs',
  });
  escreverConfig(projeto, config);
  return destino;
}

/**
 * O estado de exemplo dos pares (o do começo do D2). Os testes da conta e do ajuste partem dele, não dos pares do
 * pipeline.json de verdade: o ajuste automático muda esses pares, e um teste que os crava quebraria o pre-commit.
 */
export const EXEMPLO = {
  agentes: { 'revisor-seguranca': 'opus:xhigh', 'revisor-arquitetura': 'opus:high', qa: 'sonnet:high', 'revisor-tela': 'sonnet:high', 'leitor-docs': 'haiku:low', 'designer-ui': 'sonnet:high' },
  niveis: { leve: 'sonnet:low', medio: 'sonnet:medium', 'codigo-seguranca': 'sonnet:high', 'revisao-ponytail': 'sonnet:high', autoanalise: 'sonnet:medium', orquestracao: 'opus:xhigh', forte: 'opus:high' },
};

/**
 * Põe a cópia de um projeto (`raiz`) nos pares de `pares` (`{ agentes: { nome: 'modelo:esforço' }, niveis: {...} }`): o
 * pipeline.json, o cabeçalho de cada agente e a tabela da skill pipeline, de uma vez.
 */
export function fixarPares(raiz, pares) {
  const arquivo = join(raiz, '.claude', 'pipeline.json');
  let json = readFileSync(arquivo, 'utf8');
  for (const secao of Object.keys(pares)) {
    for (const [chave, valor] of Object.entries(pares[secao])) {
      const [model, effort] = valor.split(':');
      const re = new RegExp(`("${chave}": \\{ "model": ")[a-z]+(", "effort": ")[a-z]+(")`);
      if (!re.test(json)) throw new Error(`${chave} não está no pipeline.json da cópia`);
      json = json.replace(re, `$1${model}$2${effort}$3`);
      const md = join(raiz, '.claude', 'agents', `${chave}.md`);
      if (secao === 'agentes' && existsSync(md)) {
        writeFileSync(md, readFileSync(md, 'utf8').replace(/^model:.*$/m, `model: ${model}`).replace(/^effort:.*$/m, `effort: ${effort}`));
      }
    }
  }
  writeFileSync(arquivo, json);
  const skill = join(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md');
  writeFileSync(skill, tabelaDe(lerPapeis(arquivo).valor, readFileSync(skill, 'utf8')));
}

/** Põe a cópia de um projeto no estado de `EXEMPLO`. */
export const fixarExemplo = (raiz) => fixarPares(raiz, EXEMPLO);

/**
 * Os pisos do projeto, como `fixarPares` os recebe: o `piso` de cada entrada que tem (o `desenvolvedor` fica de fora: o cabeçalho
 * dele é gerado e a chamada traz o esforço). É o fim da descida do ajuste automático, de onde um teste que crava um par quebra.
 */
export function pisosDoProjeto() {
  const { valor: p, erro } = lerPapeis();
  if (erro !== null) throw new Error(erro);
  const pisos = (entradas) => Object.fromEntries(Object.entries(entradas).filter(([, e]) => e.piso !== undefined).map(([nome, e]) => [nome, e.piso]));
  return { agentes: pisos(agentesFixos(p)), niveis: pisos(p.niveis) };
}

/**
 * Os papéis do pipeline.json de verdade (`lerPapeis`) com os pares do `EXEMPLO`: o estado de partida do D2. Os testes da guarda,
 * que montam o cabeçalho na mão, partem dele, não dos pares do arquivo (o ajuste automático os desce até o piso).
 */
export function papeisDeExemplo() {
  const { valor, erro } = lerPapeis();
  if (erro !== null) throw new Error(erro);
  const p = structuredClone(valor);
  for (const secao of Object.keys(EXEMPLO)) {
    for (const [nome, texto] of Object.entries(EXEMPLO[secao])) [p[secao][nome].model, p[secao][nome].effort] = texto.split(':');
  }
  return p;
}

const REPOSITORIOS_DA_MAIN = [];
process.on('exit', () => {
  for (const pasta of REPOSITORIOS_DA_MAIN) rmSync(pasta, { recursive: true, force: true });
});

/**
 * O ambiente (`{ GIT_DIR }`) que faz o `git show main:.claude/pipeline.json` da guarda-agentes (D11) ler `conteudo`: um repositório
 * temporário cujo branch `main` tem só esse `.claude/pipeline.json`. O teste de ponta a ponta da guarda passa o texto do arquivo de
 * verdade (ou da cópia que roda) para a árvore e a main serem iguais; para provar a confirmação, passa outro. Apagado ao fim do processo.
 */
export function ambienteDaMain(conteudo) {
  const pasta = mkdtempSync(join(tmpdir(), 'main-'));
  REPOSITORIOS_DA_MAIN.push(pasta);
  const env = { ...process.env };
  for (const nome of Object.keys(env)) if (/^GIT_/.test(nome)) delete env[nome];
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: pasta, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };
  git('init', '-q', '-b', 'main');
  mkdirSync(join(pasta, '.claude'));
  writeFileSync(join(pasta, '.claude', 'pipeline.json'), conteudo);
  git('add', '.claude/pipeline.json');
  git('commit', '-q', '-m', 'main');
  return { GIT_DIR: join(pasta, '.git') };
}
