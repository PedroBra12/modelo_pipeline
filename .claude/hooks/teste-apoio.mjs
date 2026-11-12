// Apoio dos testes (não é teste): monta um projeto numa pasta temporária com os hooks copiados e um pipeline.json
// que o teste escolhe, para o teste não depender do .claude/pipeline.json de verdade.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentesFixos, lerPapeis } from './papeis.mjs';
import { cabecalhoDe, tabelaDe } from './sincroniza-pares.mjs';

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
 * Os papéis do pipeline.json de verdade (`lerPapeis`), sem o neto (`semNeto`) e com os pares do `EXEMPLO`: o estado de partida do D2. Os testes da guarda,
 * que montam o cabeçalho na mão, partem dele, não dos pares do arquivo (o ajuste automático os desce até o piso).
 */
export function papeisDeExemplo() {
  const { valor, erro } = lerPapeis();
  if (erro !== null) throw new Error(erro);
  const p = semNeto(valor);
  for (const secao of Object.keys(EXEMPLO)) {
    for (const [nome, texto] of Object.entries(EXEMPLO[secao])) [p[secao][nome].model, p[secao][nome].effort] = texto.split(':');
  }
  return p;
}

// ---------- o neto ligado e desligado numa cópia do projeto (D11) ----------

/** O `leitor.md` do neto, como o orquestrador o liga: o cabeçalho bate com a entrada `LEITOR_ENTRADA`. Fixture, não lido do projeto. */
export const LEITOR_MD = `---
name: leitor
description: Neto de leitura deste projeto (D11). Só um subagente o chama, nunca o chat principal. Busca no repositório onde está um fato (código, teste, doc) e devolve os arquivos e as linhas exatas. Só lê; não julga, não edita e não abre outro agente.
tools: Read, Grep, Glob
model: haiku
effort: low
---

Você é o **leitor**, o neto de leitura (D11). Um subagente (revisor, \`qa\`, \`desenvolvedor\`, \`designer-ui\`) te pede para achar **onde** algo está no repositório, e você devolve os ponteiros para ele ler.

## Regras que não se negociam

1. **Só localize e aponte:** não interprete regra, não julgue se o código está certo, não proponha mudança e não edite nada.
2. **Busque com \`Grep\` e \`Glob\` antes de \`Read\`:** ache o símbolo, o termo ou o nome do arquivo com \`Grep\` (com número de linha) e só use \`Read\` em janelas curtas (30 a 60 linhas) para confirmar que o trecho responde.
3. **Ignore \`.claude/worktrees/\` e \`node_modules/\`**, a menos que o pedido cite o caminho de um worktree: aí busque só dentro dele.
4. **Não ache, diga:** se não achou, diga onde procurou; não invente arquivo nem linha.

## Saída

Em português, até 15 linhas, só os ponteiros:
- **Onde:** \`<caminho>:<linha início>-<linha fim>\` — o que está ali (1 linha).
- **Também citado em:** outros \`<caminho>:<linha>\`, se houver.
- **Não achei:** o que faltou e onde procurou.
`;
/** A linha da entrada do neto em `agentes` (uma entrada por linha, como o ajuste exige). */
export const LEITOR_ENTRADA = '    "leitor": { "model": "haiku", "effort": "low", "tools": "Read, Grep, Glob", "tarefa": "neto (D11): só um subagente o chama; acha no repositório onde um fato está e aponta arquivo e linha" }';
/** Os agentes que ganham `Agent(<neto>)` nas `tools` quando o neto liga (o `leitor-docs` não). */
const COM_NETO = ['revisor-seguranca', 'revisor-arquitetura', 'qa', 'revisor-tela', 'designer-ui', 'desenvolvedor'];

/** Os itens de `tools` (`Read`, `Agent(leitor)`...) sem os de `Agent`. */
const semAgent = (tools) => tools.split(',').map((t) => t.trim()).filter((t) => t !== '' && !/^Agent(\(.*\))?$/.test(t)).join(', ');

/**
 * O objeto do pipeline.json (ou os papéis de `lerPapeis`) sem o neto: sem a chave, sem a entrada dele em `agentes` e sem o
 * `Agent(...)` das `tools`. É o estado "sem neto" de um teste, qualquer que seja o do arquivo de verdade. A cópia é nossa.
 */
export function semNeto(dados) {
  const d = structuredClone(dados);
  if (d.neto !== undefined) delete d.agentes[d.neto];
  delete d.neto;
  for (const e of Object.values(d.agentes)) e.tools = semAgent(e.tools);
  return d;
}

/** O objeto do pipeline.json (ou os papéis) com o neto `leitor` ligado, como o orquestrador o liga, qualquer que seja o estado do arquivo. */
export function comNeto(dados) {
  const d = semNeto(dados);
  d.agentes.leitor = { model: 'haiku', effort: 'low', tools: 'Read, Grep, Glob', tarefa: 'neto (D11): acha onde um fato está' };
  d.neto = 'leitor';
  for (const nome of COM_NETO) d.agentes[nome].tools = `${d.agentes[nome].tools}, Agent(leitor)`;
  return d;
}

/**
 * Copia os agentes de `origem` (`.claude/agents/` de verdade) para `destino` com o cabeçalho de cada um gerado do pipeline.json `p`
 * (`cabecalhoDe`): o teste que roda a guarda sobre um `p` com ou sem o neto precisa dos cabeçalhos que dizem o mesmo, e um
 * `.md` de agente que `p` não tem (o `leitor.md` com o neto desligado em `p`) a guarda recusa: ele não vai para a cópia.
 */
export function copiarAgentesPara(origem, destino, p) {
  cpSync(origem, destino, { recursive: true });
  for (const arquivo of readdirSync(destino)) {
    const nome = arquivo.replace(/\.md$/, '');
    const caminho = join(destino, arquivo);
    if (nome !== 'orquestrador' && !Object.hasOwn(p.agentes, nome)) rmSync(caminho, { recursive: true, force: true });
    else writeFileSync(caminho, cabecalhoDe(p, nome, readFileSync(caminho, 'utf8')));
  }
}

/** `texto.replace(re, troca)` que lança se `re` não acha nada (a cópia mudou de forma: o teste tem de ser ajustado). */
function trocar(texto, re, troca, onde) {
  if (!re.test(texto)) throw new Error(`a cópia do pipeline.json não tem ${onde}`);
  return texto.replace(re, troca);
}

/** Roda o `sincroniza-pares.mjs` da cópia nela (cabeçalhos, settings.json e tabela); lança se falha. */
function sincronizarCopia(raiz) {
  const r = spawnSync(process.execPath, [join(raiz, '.claude', 'hooks', 'sincroniza-pares.mjs'), '--raiz', raiz], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sincroniza-pares na cópia: ${r.stderr}${r.stdout}`);
}

/** O neto de uma cópia do projeto (o nome, ou `undefined` sem a chave). */
function netoDaCopia(raiz) {
  const { valor, erro } = lerPapeis(join(raiz, '.claude', 'pipeline.json'));
  if (erro !== null) throw new Error(erro);
  return valor.neto;
}

/** Liga o neto `leitor` numa cópia do projeto que não o tem: a chave, a entrada, o `Agent(leitor)`, o `leitor.md` e o gerador. */
export function ligarNeto(raiz) {
  const arquivo = join(raiz, '.claude', 'pipeline.json');
  let json = readFileSync(arquivo, 'utf8');
  json = trocar(json, /^( *"comum": .*\n)/m, (_, linha) => `${linha}  "neto": "leitor",\n`, 'a linha "comum"');
  json = trocar(json, /^( *"leitor-docs": .*\n)/m, (_, linha) => `${linha}${LEITOR_ENTRADA},\n`, 'a entrada "leitor-docs"');
  for (const nome of COM_NETO) {
    json = trocar(json, new RegExp(`^( *"${nome}": \\{[^\\n]*"tools": "[^"\\n]*)"`, 'm'), (_, ate) => `${ate}, Agent(leitor)"`, `a entrada "${nome}" com tools`);
  }
  writeFileSync(arquivo, json);
  writeFileSync(join(raiz, '.claude', 'agents', 'leitor.md'), LEITOR_MD);
  sincronizarCopia(raiz);
}

/** Desliga o neto numa cópia que o tem: tira a chave, a entrada dele, o `Agent(...)` das `tools` e o `.md`, e roda o gerador. */
export function desligarNeto(raiz) {
  const nome = netoDaCopia(raiz);
  if (nome === undefined) return;
  const arquivo = join(raiz, '.claude', 'pipeline.json');
  let json = readFileSync(arquivo, 'utf8');
  json = trocar(json, /^ *"neto": .*\n/m, '', 'a chave "neto"');
  json = trocar(json, new RegExp(`^ *"${nome}": \\{.*\\},?\\n`, 'm'), '', `a entrada "${nome}"`);
  json = json.replace(/,(\s*\n\s*\})/g, '$1').replace(/, Agent(\([^)]*\))?(?=[",])/g, '');
  writeFileSync(arquivo, json);
  rmSync(join(raiz, '.claude', 'agents', `${nome}.md`), { force: true });
  sincronizarCopia(raiz);
}

/** Vira o neto da cópia ao contrário do que ela tem: liga se não tem, desliga se tem. Devolve o estado de agora: `'ligado'` ou `'desligado'`. */
export function inverterNeto(raiz) {
  if (netoDaCopia(raiz) === undefined) {
    ligarNeto(raiz);
    return 'ligado';
  }
  desligarNeto(raiz);
  return 'desligado';
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
