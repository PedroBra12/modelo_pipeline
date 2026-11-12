// Guarda dos subagentes (hook PreToolUse da ferramenta Agent): nenhum subagente herda o modelo do chat principal e o
// padrão é o sonnet. Os agentes fixos rodam no modelo, no esforço e nas ferramentas de `agentes` no .claude/pipeline.json,
// que o cabeçalho de .claude/agents/<nome>.md repete; acima do teto da entrada (o `teto` no pipeline.json, lido só pelo
// papeis.mjs, D11) a chamada pede a confirmação do usuário. Só passam com o `subagent_type` igual ao `name:` do cabeçalho e sem outro arquivo em .claude/agents que possa
// responder pelo mesmo nome. O orquestrador só roda como agente do chat principal, então como subagente se nega, e o
// chat principal só delega em opus xhigh (D45): outro esforço ou modelo nega e par ilegível pede confirmação. Chat principal
// é só a chamada sem agent_id e com agent_type ausente ou orquestrador (D11); toda outra chamada de Agent é de subagente e só
// passa se o pipeline.json tem a chave `neto` e a chamada abre esse agente (sem isolation, no par dele), uma vez só: o neto
// não abre outro. Os papéis se leem antes de qualquer decisão: arquivo inválido nega todos. Quando o pipeline.json da árvore
// difere do da main (git show main:, senão origin/main) em par, piso, teto, ferramentas ou neto, ou o git não deixa comparar,
// a chamada pede a confirmação do usuário (D11); o deny vence. O cabeçalho de .claude/agents/*.md só tem as chaves da lista
// fechada (name, description, model, effort, tools e, no desenvolvedor, omitClaudeMd): chave a mais nega os agentes. Fora
// dos agentes fixos, a chamada traz model e effort (o cabeçalho não preenche), outro opus pede a confirmação do usuário,
// o esforço só vai de low a high e o haiku se nega. Pipeline.json ausente ou ilegível nega, em JSON. Para todo subagente,
// o que vai a ele (o pedido mais os arquivos fora do repositório que o pedido cita por caminho) tem teto de 50 mil
// tokens, estimados pelo tamanho ÷ 3: acima disso nega (D60). O subagente com isolation worktree nasce da main, e o
// pedido ou o pacote tem de dizer o 1º passo, git switch -c (ou git checkout -b), senão nega (D63). O esforço do
// pipeline em .claude/estado/esforco (D64: rapido, medio ou alto) é obrigatório antes de delegar (sem ele só passa o
// leitor-docs) e barra na guarda os agentes que aquele esforço não roda: rapido nega todos os revisores e o qa; medio
// nega revisor-arquitetura e revisor-lgpd; valor inválido nega.
// O agente de código é o desenvolvedor (D8): com isolation worktree só ele passa, e só com isolation worktree, effort da
// chamada de low a high, model ausente ou sonnet, o agente sem problema no desenvolvedor.mjs (cabeçalho exato,
// marcadores, tetos, lint) e, no projeto já adotado, com a parte do projeto preenchida; arquivo que não lê nega.
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// dentro do try: um papeis.mjs ou config.mjs quebrado (conflito de merge) não pode deixar o hook sair sem negar
let papeis = null;
let falhaDoPapeis = null;
try {
  papeis = await import('./papeis.mjs');
} catch (erro) {
  falhaDoPapeis = erro;
}
// idem para o desenvolvedor.mjs: sem ele a guarda não confere o agente de código, então tudo nega
let desenvolvedor = null;
let falhaDoDesenvolvedor = null;
try {
  desenvolvedor = await import('./desenvolvedor.mjs');
} catch (erro) {
  falhaDoDesenvolvedor = erro;
}

const AGENTES = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'agents');
const RAIZ_DO_PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** As chaves que o cabeçalho de `.claude/agents/*.md` pode ter (D11, lista fechada); `omitClaudeMd` só no `desenvolvedor.md`. */
export const CHAVES_DO_CABECALHO = ['name', 'description', 'model', 'effort', 'tools'];
const CHAVE_SO_DO_DESENVOLVEDOR = 'omitClaudeMd';

/** Roda só como agente do chat principal (`claude --agent orquestrador`), nunca como subagente. */
export const SO_NO_CHAT = 'orquestrador';
/** O agente de código (D8): o único que roda com isolation worktree, e o único com o esforço na chamada. */
export const CODIGO = 'desenvolvedor';

const tiraAspas = (v) => v?.replace(/^(["'])(.*)\1$/, '$2');
const cabecalhoDe = (arquivo) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(arquivo, 'utf8'))?.[1] ?? '';
/** O valor do campo na 1ª ocorrência: uma palavra só, ou a linha inteira em `tools`. */
const valor = (cabecalho, nome) => new RegExp(`^${nome}:[ \\t]*${nome === 'tools' ? '(\\S.*?)' : '(\\S+)'}[ \\t\\r]*$`, 'm').exec(cabecalho)?.[1];
const conjunto = (tools) => (tools === undefined ? undefined : tools.split(',').map((t) => t.trim()).sort().join(','));

/**
 * O que há de errado no cabeçalho de `.claude/agents/<arquivo>`: linha que não é `chave: valor` (um YAML aninhado ou com chave entre
 * aspas esconderia a chave), chave fora da lista fechada (D11: `mcpServers`, `hooks`, `permissionMode`, `memory`, `skills`…) ou chave
 * repetida. Texto, ou undefined.
 */
function problemaDasChaves(arquivo, cabecalho) {
  const permitidas = [...CHAVES_DO_CABECALHO, ...(arquivo === `${CODIGO}.md` ? [CHAVE_SO_DO_DESENVOLVEDOR] : [])];
  const vistas = new Set();
  for (const linha of cabecalho.split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    const chave = /^([A-Za-z][\w-]*):(?:\s|$)/.exec(linha)?.[1];
    if (chave === undefined) return `${arquivo}: linha do cabeçalho fora do formato "chave: valor" (${linha.trim().slice(0, 40)}); o cabeçalho só aceita ${permitidas.join(', ')}`;
    if (!permitidas.includes(chave)) return `${arquivo}: o cabeçalho tem a chave ${chave}, fora da lista fechada (${permitidas.join(', ')}; D11)`;
    if (vistas.has(chave)) return `${arquivo}: o campo ${chave}: aparece mais de uma vez no cabeçalho`;
    vistas.add(chave);
  }
  return undefined;
}

/** O que há de errado na pasta de agentes para liberar o fixo `tipo`: arquivo `.md` fora da lista (em qualquer subpasta), cabeçalho com chave a mais (de qualquer agente) ou 2º arquivo com o mesmo `name:`. */
function problemaDaPasta(tipo, pasta, p) {
  const permitidos = new Set([...papeis.nomesDeAgentes(p), SO_NO_CHAT, CODIGO].map((k) => `${k}.md`));
  for (const rel of readdirSync(pasta, { recursive: true })) {
    const nome = String(rel);
    if (!nome.toLowerCase().endsWith('.md') || statSync(join(pasta, nome)).isDirectory()) continue;
    if (!permitidos.has(nome)) return `${nome} está em .claude/agents e não é um agente conhecido da guarda`;
    const dasChaves = problemaDasChaves(nome, cabecalhoDe(join(pasta, nome)));
    if (dasChaves !== undefined) return dasChaves;
    if (nome !== `${tipo}.md` && tiraAspas(valor(cabecalhoDe(join(pasta, nome)), 'name')) === tipo) {
      return `${nome} também tem name: ${tipo}`;
    }
  }
  return undefined;
}

/**
 * name, model, effort e tools do frontmatter de .claude/agents/<tipo>.md (campo ausente = undefined), mais `problema`
 * quando o cabeçalho tem campo repetido ou a pasta tem arquivo que pode responder pelo mesmo nome. Nada se o arquivo
 * não existe. Erro de leitura sobe (quem chama nega). `p` são os papéis do pipeline.json (padrão: os do arquivo do projeto).
 */
export function lerCabecalhoDoArquivo(tipo, pasta = AGENTES, p = papeisDoProjeto()) {
  if (!/^[\w-]+$/.test(tipo)) return undefined;
  const arquivo = join(pasta, `${tipo}.md`);
  if (!existsSync(arquivo)) return undefined;
  const cabecalho = cabecalhoDe(arquivo);
  const repetido = [...CHAVES_DO_CABECALHO, CHAVE_SO_DO_DESENVOLVEDOR].find((nome) => (cabecalho.match(new RegExp(`^${nome}:`, 'gm')) ?? []).length > 1);
  const problema = repetido === undefined ? problemaDaPasta(tipo, pasta, p) : `o campo ${repetido}: aparece mais de uma vez no cabeçalho`;
  return { name: valor(cabecalho, 'name'), model: valor(cabecalho, 'model'), effort: valor(cabecalho, 'effort'), tools: valor(cabecalho, 'tools'), problema };
}

/** Os papéis do pipeline.json do projeto (`papeis.lerPapeis`); lança o erro de leitura (quem chama nega). Só os padrões e o hook usam. */
function papeisDoProjeto() {
  const { valor, erro } = papeis.lerPapeis();
  if (erro !== null) throw new Error(`pipeline.json ilegível: ${erro}`);
  return valor;
}

/** "low, medium ou high". */
const enumera = (lista) => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} ou ${lista.at(-1)}`);
const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined);
const nega = (motivo) => ({ decisao: 'deny', motivo });
const passa = { decisao: null, motivo: null };

/** A chamada de um agente fixo: o cabeçalho tem de ser o do pipeline.json (`vigente`) e a chamada não pode pedir outro modelo ou esforço. */
function decidirFixo(tipo, bruto, entrada, cabecalho, vigente) {
  if (bruto !== tipo || cabecalho?.name !== tipo) {
    return nega(`${tipo}: o subagent_type tem de ser igual ao name do cabeçalho de .claude/agents/${tipo}.md, sem mudar a caixa`);
  }
  if (cabecalho.problema !== undefined) return nega(`${tipo}: ${cabecalho.problema}`);
  if (vigente === undefined) return nega(`${tipo}: falta em agentes no .claude/pipeline.json`);
  const model = texto(entrada?.model) ?? texto(cabecalho.model);
  const effort = texto(entrada?.effort) ?? texto(cabecalho.effort);
  const doCabecalho = texto(cabecalho.model)?.includes(vigente.model) === true && texto(cabecalho.effort) === vigente.effort && conjunto(cabecalho.tools) === conjunto(vigente.tools);
  if (!doCabecalho || model === undefined || !model.includes(vigente.model) || effort !== vigente.effort) {
    return nega(`${tipo} roda em ${vigente.model} e ${vigente.effort}, com ${vigente.tools}, e o cabeçalho tem de dizer o mesmo: chame sem model/effort ou com model: "${vigente.model}", effort: "${vigente.effort}"`);
  }
  if (papeis.faixa(`${vigente.model}:${vigente.effort}`, vigente) !== 'dentro') {
    const onde = { acima: `acima do teto da guarda (${vigente.teto})`, abaixo: `abaixo do piso (${vigente.piso})`, fora: `de outro modelo que o da faixa (${vigente.piso} a ${vigente.teto})` };
    return { decisao: 'ask', motivo: `${tipo}: o pipeline.json pede ${vigente.model} ${vigente.effort}, ${onde[papeis.faixa(`${vigente.model}:${vigente.effort}`, vigente)]}; confirme` };
  }
  return passa;
}

// ---------- o desenvolvedor (D8) ----------

/**
 * O agente, o CLAUDE.md e o docs/arquitetura.md do projeto, mais o leitor `ajuste(data)`, para a `problemas` do
 * desenvolvedor.mjs. Erro de leitura dos três primeiros sobe. O `ajuste` só lê `docs/pipeline/ajustes/<data>-desenvolvedor.md`
 * de uma data AAAA-MM-DD citada e devolve `null` se a data é inválida ou o arquivo não existe ou não lê (a guarda nega).
 */
export function lerFontesDoDesenvolvedor(raiz = RAIZ_DO_PROJETO) {
  const ler = (...rel) => readFileSync(join(...rel), 'utf8');
  const ajuste = (data) => {
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
    try {
      return ler(raiz, 'docs', 'pipeline', 'ajustes', `${data}-desenvolvedor.md`);
    } catch {
      return null;
    }
  };
  return { agente: ler(AGENTES, `${CODIGO}.md`), fontes: { 'CLAUDE.md': ler(raiz, 'CLAUDE.md'), 'docs/arquitetura.md': ler(raiz, 'docs', 'arquitetura.md'), ajuste } };
}

/** A chamada do `desenvolvedor`: tudo o que a D8 manda conferir, nesta ordem. `lerFontes` é o `lerFontesDoDesenvolvedor`. */
function decidirDesenvolvedor(bruto, entrada, cabecalho, lerFontes, vigente) {
  if (desenvolvedor === null) return nega(`${CODIGO}: desenvolvedor.mjs ilegível: ${falhaDoDesenvolvedor instanceof Error ? falhaDoDesenvolvedor.message : falhaDoDesenvolvedor}`);
  if (bruto !== CODIGO || cabecalho?.name !== CODIGO) {
    return nega(`${CODIGO}: o subagent_type tem de ser igual ao name do cabeçalho de .claude/agents/${CODIGO}.md, sem mudar a caixa`);
  }
  if (cabecalho.problema !== undefined) return nega(`${CODIGO}: ${cabecalho.problema}`);
  if (vigente === undefined) return nega(`${CODIGO}: falta em agentes no .claude/pipeline.json`);
  if (entrada?.isolation !== 'worktree') return nega(`${CODIGO} só roda com isolation: "worktree" (D8)`);
  const effort = texto(entrada?.effort);
  if (effort === undefined || papeis.faixa(`${vigente.model}:${effort}`, vigente) !== 'dentro') {
    const aceitos = papeis.esforcosDe(vigente);
    return nega(`${CODIGO}: passe effort ${enumera(aceitos)} na chamada (o do cabeçalho não vale; ${papeis.esforcosNegados(aceitos)} não, D8)`);
  }
  const model = texto(entrada?.model);
  if (model !== undefined && model !== vigente.model) return nega(`${CODIGO} roda só em ${vigente.model}: tire o model "${model}" da chamada (D8)`);
  let lidos;
  try {
    lidos = lerFontes();
  } catch (e) {
    return nega(`${CODIGO}: não deu para ler o agente, o CLAUDE.md ou o docs/arquitetura.md (${e instanceof Error ? e.message : e})`);
  }
  const achados = desenvolvedor.problemas(lidos.agente, lidos.fontes, vigente);
  if (achados.length > 0) return nega(`${CODIGO}: ${achados.join('; ')}`);
  if (desenvolvedor.adotado(lidos.fontes['CLAUDE.md']) && desenvolvedor.vazia(lidos.agente)) {
    return nega(`${CODIGO}: preencha a parte do projeto (skill \`pipeline\`, seção 2; \`node .claude/hooks/ajusta-pipeline.mjs --sincronizar-desenvolvedor\`)`);
  }
  return passa;
}

// ---------- o teto do que vai ao subagente (D60) ----------

/** O teto, em tokens, do pedido mais os arquivos fora do repositório que ele cita (D60). */
export const TETO_TOKENS = 50000;
/** Quantos caracteres (ou bytes) valem um token na estimativa. */
export const CARACTERES_POR_TOKEN = 3;
// caminho absoluto no texto: começa em "/" depois de algo que não é de caminho (nem de caminho relativo, URL ou `../`) e
// vai até espaço, aspas, crase, parêntese ou <>. Qualquer outro caractere vale (acento inclusive). Limite: o caminho com espaço se corta no espaço.
const CAMINHO_NO_TEXTO = /(?<![\p{L}\p{N}_.~)\]-])\/[^\s"'`()<>]+/gu;

/** Tira do fim do caminho a pontuação do texto (`.`, `,`, `;`, `:`) e o `:linha` ou `:linha-linha`, até não mudar mais. */
function semOFim(caminho) {
  let atual = caminho;
  for (;;) {
    const novo = atual.replace(/[.,;:]+$/, '').replace(/:\d+(?:-\d+)?$/, '');
    if (novo === atual) return atual;
    atual = novo;
  }
}

/** Os caminhos absolutos do texto, sem repetir, sem a pontuação nem o `:linha` do fim. */
export function caminhosCitados(texto) {
  const achados = new Set();
  for (const [bruto] of texto.matchAll(CAMINHO_NO_TEXTO)) achados.add(semOFim(bruto));
  return [...achados].filter((c) => c.length > 1);
}

/**
 * O arquivo em `citado` que conta para o teto: `{ real, bytes }` (o caminho resolvido pelo `realpath`), ou null se não
 * existe, é pasta ou fica dentro da raiz do projeto (o arquivo do repositório é leitura do próprio agente). Erro de
 * leitura = null. `raiz` e o `realpath` valem dos dois lados: no macOS o /tmp é /private/tmp.
 */
export function tamanhoDoArquivo(citado, raiz = RAIZ_DO_PROJETO) {
  try {
    const real = realpathSync(citado);
    const estado = statSync(real);
    if (!estado.isFile()) return null;
    const dentro = realpathSync(raiz);
    if (real === dentro || real.startsWith(dentro + sep)) return null;
    return { real, bytes: estado.size };
  } catch {
    return null;
  }
}

/** Nega o pedido que, com os arquivos fora do repositório que ele cita, passa do teto. `lerTamanho(caminho)` é o `tamanhoDoArquivo`. */
export function decidirTeto(entrada, lerTamanho = tamanhoDoArquivo) {
  const prompt = typeof entrada?.prompt === 'string' ? entrada.prompt : '';
  const vistos = new Map();
  for (const citado of caminhosCitados(prompt)) {
    const arquivo = lerTamanho(citado);
    if (arquivo !== null && arquivo !== undefined && !vistos.has(arquivo.real)) vistos.set(arquivo.real, arquivo.bytes);
  }
  const bytes = [...vistos.values()].reduce((t, b) => t + b, 0);
  const tokens = Math.ceil((prompt.length + bytes) / CARACTERES_POR_TOKEN);
  if (tokens <= TETO_TOKENS) return passa;
  return nega(`o que vai ao subagente estima ${tokens} tokens (pedido de ${prompt.length} caracteres e ${vistos.size} arquivo(s) fora do repositório com ${bytes} bytes, tamanho ÷ ${CARACTERES_POR_TOKEN}), acima do teto de ${TETO_TOKENS} (D60). Resuma para a função deste agente; num revisor com diff grande, passe o mapa (arquivos, linhas, o que mudou) e deixe que ele leia o código`);
}

// ---------- o worktree nasce da main (D63) ----------

const PRIMEIRO_PASSO = /\bgit\s+(?:switch\s+-c|checkout\s+-b)\b/;

/** O texto de um arquivo (até 2 MB), ou '' se não lê. */
export function textoDoArquivo(real) {
  try {
    return readFileSync(real, 'utf8').slice(0, 2 * 1024 * 1024);
  } catch {
    return '';
  }
}

/**
 * O subagente com `isolation: worktree` nasce da `main`, não do branch da tarefa (D63): o pedido, ou um arquivo de pacote
 * (os que o teto lê: caminho absoluto fora do repositório, 1º nível), tem de dizer o 1º passo, `git switch -c` ou
 * `git checkout -b`. Sem `isolation: worktree` não muda nada. Limite: a frase só se confere, não o branch que ela nomeia.
 */
export function decidirWorktree(entrada, lerTamanho = tamanhoDoArquivo, lerTexto = textoDoArquivo) {
  if (entrada?.isolation !== 'worktree') return passa;
  const prompt = typeof entrada?.prompt === 'string' ? entrada.prompt : '';
  if (PRIMEIRO_PASSO.test(prompt)) return passa;
  for (const citado of caminhosCitados(prompt)) {
    const arquivo = lerTamanho(citado);
    if (arquivo !== null && arquivo !== undefined && PRIMEIRO_PASSO.test(lerTexto(arquivo.real))) return passa;
  }
  return nega('o worktree do agente nasce da main (D63): diga no pedido ou no pacote o 1º passo, `git switch -c <branch> <branch da tarefa>` (ou `... main`)');
}

// ---------- o esforço do pipeline em .claude/estado/esforco (D64) ----------

export const ESFORCOS_PIPELINE = new Set(['rapido', 'medio', 'alto']);
export const FORA_DO_RAPIDO = new Set(['revisor-seguranca', 'revisor-arquitetura', 'revisor-tela', 'qa']);
export const FORA_DO_MEDIO = new Set(['revisor-arquitetura']);

/**
 * O esforço do pipeline em `.claude/estado/esforco` (ou `env.PIPELINE_ESFORCO`): `'rapido'`, `'medio'`, `'alto'`,
 * `'<ausente>'` se o arquivo não existe ou está vazio, ou o texto inválido (para quem decide negar fechado).
 */
export function lerEsforcoDoEstado(raiz = process.env.CLAUDE_PROJECT_DIR ?? RAIZ_DO_PROJETO, env = process.env) {
  const daEnv = texto(env?.PIPELINE_ESFORCO);
  if (daEnv !== undefined) return daEnv;
  const arquivo = join(raiz, '.claude', 'estado', 'esforco');
  if (!existsSync(arquivo)) return '<ausente>';
  try {
    return texto(readFileSync(arquivo, 'utf8')) ?? '<ausente>';
  } catch {
    return '<ilegível>';
  }
}

/**
 * Nega os agentes que não cabem no esforço do pipeline (D64): sem `.claude/estado/esforco` (`'<ausente>'`) só o
 * `leitor-docs` passa; `rapido` nega todos os revisores (fixos e `ponytail-review`) e o `qa`; `medio` nega
 * `revisor-arquitetura` e `revisor-lgpd`; `alto` e `undefined` (chamada interna sem o 6º argumento) deixam passar;
 * qualquer outro valor nega fechado.
 */
export function decidirEsforcoPipeline(entrada, esforco) {
  if (esforco === undefined) return passa;
  const tipo = texto(entrada?.subagent_type);
  if (esforco === '<ausente>') {
    return tipo === 'leitor-docs'
      ? passa
      : nega('defina primeiro o esforço do pipeline em .claude/estado/esforco (rapido, medio ou alto, D64) antes de delegar');
  }
  if (!ESFORCOS_PIPELINE.has(esforco)) {
    return nega(`o esforço do pipeline em .claude/estado/esforco é inválido: "${esforco}" (use rapido, medio ou alto, D64)`);
  }
  if (esforco === 'rapido') {
    if (tipo !== undefined && FORA_DO_RAPIDO.has(tipo)) {
      return nega(`esforço rapido (D64): ${tipo} não roda no rápido (sem revisores nem qa; mude .claude/estado/esforco se o usuário pediu outro esforço)`);
    }
    if (/\bponytail-review\b/i.test(`${entrada?.description ?? ''} ${entrada?.prompt ?? ''}`)) {
      return nega('esforço rapido (D64): ponytail-review não roda no rápido (sem revisores nem qa; mude .claude/estado/esforco se o usuário pediu outro esforço)');
    }
  } else if (esforco === 'medio' && tipo !== undefined && FORA_DO_MEDIO.has(tipo)) {
    return nega(`esforço medio (D64): ${tipo} só roda no esforço alto, D12 (mude .claude/estado/esforco para alto se o usuário pediu)`);
  }
  return passa;
}

/**
 * O que fazer com a chamada de subagente. `lerCabecalho(tipo)` devolve o cabeçalho do agente fixo (ver lerCabecalhoDoArquivo),
 * ou nada. `p` são os papéis do pipeline.json (`papeis.lerPapeis`; padrão: os do arquivo do projeto). `lerTamanho` mede um arquivo citado no pedido (ver `tamanhoDoArquivo`) e `lerTexto` o lê (a regra do worktree).
 * O esforço do pipeline (D64), o teto de tokens e a regra do worktree valem para todo subagente que passou nas outras regras, e o deny deles vence o ask.
 */
export function decidirAgente(entrada, lerCabecalho, p = papeisDoProjeto(), lerTamanho = tamanhoDoArquivo, lerTexto = textoDoArquivo, esforco = undefined, lerFontes = lerFontesDoDesenvolvedor) {
  const doTipo = decidirTipo(entrada, lerCabecalho, p, lerFontes);
  return doTipo.decisao === 'deny'
    ? doTipo
    : juntarDecisoes(doTipo, decidirEsforcoPipeline(entrada, esforco), decidirTeto(entrada, lerTamanho), decidirWorktree(entrada, lerTamanho, lerTexto));
}

function decidirTipo(entrada, lerCabecalho, p, lerFontes) {
  const bruto = entrada?.subagent_type;
  const tipo = texto(bruto);
  if (tipo === 'fork') return nega('fork herda o modelo do chat principal; use um subagente com model');
  if (tipo === SO_NO_CHAT) {
    return nega(`${SO_NO_CHAT} roda só como agente do chat principal (claude --agent ${SO_NO_CHAT}), nunca como subagente: um subagente não abre outro e este seria um opus xhigh com todas as ferramentas, sem confirmação`);
  }
  if (entrada?.isolation === 'worktree' && tipo !== CODIGO) return nega('com isolation: "worktree" só passa o `desenvolvedor` (D8); chame-o, com effort, e não o general-purpose, o tipo ausente nem outro');
  if (tipo === CODIGO) return decidirDesenvolvedor(bruto, entrada, lerCabecalho(CODIGO), lerFontes, papeis.papel(p, 'agentes', CODIGO));
  if (tipo !== undefined && papeis.papel(p, 'agentes', tipo) !== undefined) return decidirFixo(tipo, bruto, entrada, lerCabecalho(tipo), papeis.papel(p, 'agentes', tipo));
  // o arquivo de um agente que o pipeline.json não tem (tirado do JSON, o arquivo ficou) não passa por comum
  if (tipo !== undefined && lerCabecalho(tipo) !== undefined) return nega(`${tipo}: falta em agentes no .claude/pipeline.json`);
  return decidirComum(entrada, papeis.comum(p));
}

/** A chamada comum (general-purpose, Explore, Plan, tipo ausente): model e effort na chamada, o que `comum` do pipeline.json aceita. */
function decidirComum(entrada, c) {
  const model = texto(entrada?.model);
  const effort = texto(entrada?.effort);
  if (effort !== undefined && !c.esforcos.includes(effort)) return nega(`effort "${effort}" não vale: use ${enumera(c.esforcos)} (${papeis.esforcosNegados(c.esforcos)} não)`);
  if (model === undefined || effort === undefined) return nega(`passe model e effort; o padrão é ${c.passa[0]}`);
  if (c.confirma.some((m) => model.includes(m))) {
    const motivo = typeof entrada?.description === 'string' ? entrada.description : '(sem description)';
    return { decisao: 'ask', motivo: `subagente em ${model}: um ${c.passa[0]} não resolveria? Motivo dado: ${motivo}` };
  }
  if (model.includes('haiku') && !c.passa.includes('haiku')) return nega('haiku só vale no leitor-docs');
  if (c.passa.some((m) => model.includes(m))) return passa;
  return nega(`model "${model}" desconhecido: passe ${c.passa.join(' ou ')}`);
}

// ---------- o chat principal em opus xhigh (D45) ----------

const SEM_PAR = { model: undefined, effort: undefined };
/** Quanto do fim do registro da sessão se lê: ele passa de 1 MB e o hook tem 10 s. */
const JANELA_DO_REGISTRO = 4 * 1024 * 1024;

/**
 * O chat principal tem de estar no par do nível `orquestracao` do pipeline.json (opus xhigh, D11). `par` é `{ model,
 * efforts }` (`parDoChat`): esforço ou modelo conhecido e errado nega, com o comando que corrige; o que não deu para
 * ler pede a confirmação do usuário.
 */
export function decidirOrquestrador(par, p = papeisDoProjeto()) {
  const { model: modeloEsperado, effort: esforcoEsperado } = papeis.orquestrador(p);
  const model = texto(par?.model);
  const efforts = (Array.isArray(par?.efforts) ? par.efforts : []).map(texto).filter((e) => e !== undefined);
  const effort = efforts.find((e) => e !== esforcoEsperado) ?? efforts[0];
  const erros = [];
  if (effort !== undefined && effort !== esforcoEsperado) erros.push(`o esforço do chat principal é ${effort} (digite /effort ${esforcoEsperado})`);
  if (model !== undefined && !model.includes(modeloEsperado)) erros.push(`o modelo do chat principal é ${model} (digite /model ${modeloEsperado})`);
  if (erros.length > 0) return nega(`o orquestrador roda sempre em ${modeloEsperado} ${esforcoEsperado} (D45): ${erros.join('; ')}`);
  if (model === undefined || effort === undefined) return { decisao: 'ask', motivo: `não deu para ler o modelo ou o esforço do chat principal; confirme que o chat está em ${modeloEsperado} ${esforcoEsperado}, D45` };
  return passa;
}

const PESO = { deny: 2, ask: 1 };
const dado = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
/**
 * Chat principal (D11) é a chamada SEM `agent_id` cujo `agent_type`, se vier, não é o nome de um agente de `agentes` do
 * pipeline.json (`p`): o `agent_id` só vem na entrada de um subagente, e o `agent_type` vem também no chat principal, que nem
 * sempre é o `orquestrador` (a sessão em segundo plano chega com outro tipo, e a regra "ausente ou orquestrador" travou o chat).
 * Assim, a chamada aninhada de um agente fixo que chegasse sem `agent_id` segue tratada como subagente. Valor que não é texto
 * (`agent_id: 7`, `agent_type: 7`) conta como subagente: na dúvida é subagente.
 */
export const ehChatPrincipal = (entrada, p) => {
  if (dado(entrada?.agent_id)) return false;
  const tipo = entrada?.agent_type;
  if (!dado(tipo)) return true;
  if (typeof tipo !== 'string') return false;
  return !papeis.nomesDeAgentes(p).includes(tipo);
};

/**
 * A chamada de Agent feita por um subagente (D11): só passa o neto, o agente que `neto` do pipeline.json nomeia, uma vez só.
 * Sem `neto` nega; quem chama já ser o neto nega; só `subagent_type` igual ao neto, sem `isolation`, `model` (se vier) da família da
 * entrada e `effort` (se vier) igual ao dela. Depois vale o que vale para o fixo (cabeçalho contra o JSON), o teto de tokens e o esforço do
 * pipeline; o par do chat principal (`decidirOrquestrador`) não é de quem chama e não roda aqui.
 */
function decidirDoNeto(entrada, dados, p, lerCabecalho, lerTamanho, esforco) {
  const nome = papeis.neto(p);
  if (nome === undefined) return nega('subagente não abre subagente: só o chat principal, o orquestrador, delega (D11)');
  if (entrada?.agent_type === nome) return nega(`o neto (${nome}) não abre outro agente: um nível só (D11)`);
  if (dados?.subagent_type !== nome) return nega(`o subagente só abre o neto "${nome}" (D11): subagent_type tem de ser ${nome}, sem mudar a caixa`);
  const vigente = papeis.papel(p, 'agentes', nome);
  if (dados.isolation !== undefined) return nega(`o neto ${nome} não roda com isolation (D11)`);
  if (dados.model !== undefined && texto(dados.model)?.includes(vigente.model) !== true) return nega(`o neto ${nome} roda em ${vigente.model}: tire o model da chamada ou passe "${vigente.model}" (D11)`);
  if (dados.effort !== undefined && texto(dados.effort) !== vigente.effort) return nega(`o neto ${nome} roda em ${vigente.effort}: tire o effort da chamada ou passe "${vigente.effort}" (D11)`);
  return juntarDecisoes(decidirFixo(nome, dados.subagent_type, dados, lerCabecalho(nome), vigente), decidirEsforcoPipeline(dados, esforco), decidirTeto(dados, lerTamanho));
}

/**
 * A decisão da chamada de subagente (ver `decidirDoNeto`), ou `null` se quem chama é o chat principal (D11, `ehChatPrincipal`):
 * aí segue para o `decidirOrquestrador` e o `decidirAgente`. `entrada` é a entrada inteira do hook e `dados` o `tool_input`.
 */
export function decidirChamador(entrada, dados, p, lerCabecalho = () => undefined, lerTamanho = tamanhoDoArquivo, esforco = undefined) {
  return ehChatPrincipal(entrada, p) ? null : decidirDoNeto(entrada, dados, p, lerCabecalho, lerTamanho, esforco);
}

// ---------- o pipeline.json contra a main (D11) ----------

const ARQUIVO_NA_MAIN = '.claude/pipeline.json';
const REFS_DA_MAIN = ['main', 'origin/main'];
const MAXIMO_DE_MUDANCAS = 12;

/**
 * O texto do pipeline.json da `main` (`git show main:.claude/pipeline.json`; se a ref não existir, a `origin/main`), com o git rodando
 * na raiz do projeto, sem shell e com timeout curto: `{ texto }` ou `{ erro }`. O git que não roda (ou estoura o tempo) não tenta a
 * 2ª ref. `rodar` é o `spawnSync`.
 */
export function lerPipelineDaMain(raiz = RAIZ_DO_PROJETO, rodar = spawnSync) {
  const falhas = [];
  for (const ref of REFS_DA_MAIN) {
    const r = rodar('git', ['show', `${ref}:${ARQUIVO_NA_MAIN}`], { cwd: raiz, encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024, shell: false, windowsHide: true });
    if (r.error) return { erro: `o git não rodou (${r.error.code ?? r.error.message})` };
    if (r.status === 0 && typeof r.stdout === 'string') return { texto: r.stdout };
    falhas.push(`${ref}: ${String(r.stderr ?? '').trim().split('\n')[0] || `git saiu com ${r.status}`}`);
  }
  return { erro: `${REFS_DA_MAIN.join(' e ')} não têm o ${ARQUIVO_NA_MAIN} (${falhas.join('; ')})` };
}

/**
 * O pipeline.json da árvore (`p`, já lido pelo `papeis`) contra o da main: igual passa; diferente em par, piso, teto, ferramentas, neto,
 * famílias, escada ou comum pede a confirmação do usuário, com o resumo do que mudou; o git que falha, a ref ausente nas duas ou o da main
 * inválido também pedem (nunca passa calado). `lerDaMain` devolve `{ texto }` ou `{ erro }` (padrão: `lerPipelineDaMain`).
 */
export function decidirContraAMain(p, lerDaMain = lerPipelineDaMain) {
  const pede = (motivo) => ({ decisao: 'ask', motivo });
  const { texto: json, erro } = lerDaMain();
  if (erro !== undefined) return pede(`não deu para comparar o pipeline.json com o da main (${erro}); confirme o pipeline.json desta árvore`);
  let dados;
  try {
    dados = JSON.parse(json);
  } catch {
    return pede('o pipeline.json da main não é JSON válido: não deu para compará-lo com o desta árvore; confirme');
  }
  const { valor: daMain, erro: invalido } = papeis.papeisDeObjeto(dados);
  if (invalido !== null) return pede(`o pipeline.json da main é inválido (${invalido}): não deu para compará-lo com o desta árvore; confirme`);
  const achados = papeis.mudancas(daMain, p);
  if (achados.length === 0) return passa;
  const resumo = achados.length > MAXIMO_DE_MUDANCAS ? [...achados.slice(0, MAXIMO_DE_MUDANCAS), `e mais ${achados.length - MAXIMO_DE_MUDANCAS}`] : achados;
  return pede(`o pipeline.json desta árvore difere do da main (${resumo.join('; ')}); confirme`);
}

/** Junta decisões: deny vence ask, que vence passar; as de mesmo peso somam os motivos. */
export function juntarDecisoes(...decisoes) {
  const peso = (d) => PESO[d.decisao] ?? 0;
  const topo = Math.max(...decisoes.map(peso));
  if (topo === 0) return passa;
  const doTopo = decisoes.filter((d) => peso(d) === topo);
  return { decisao: doTopo[0].decisao, motivo: doTopo.map((d) => d.motivo).join('; ') };
}

/**
 * O modelo e o esforço da última linha do assistente do chat principal num registro JSONL de sessão (`message.model` e
 * `effort`). Pula a linha quebrada (o corte do fim do arquivo), a de subagente (`isSidechain`) e a mensagem sintética.
 */
export function lerParDoRegistro(conteudo) {
  const linhas = typeof conteudo === 'string' ? conteudo.split(/\r?\n/) : [];
  for (let i = linhas.length - 1; i >= 0; i -= 1) {
    let linha;
    try {
      linha = JSON.parse(linhas[i]);
    } catch {
      continue;
    }
    const model = linha?.message?.model;
    if (linha?.type !== 'assistant' || linha.isSidechain === true || typeof model !== 'string' || model === '' || model.startsWith('<')) continue;
    return { model, effort: typeof linha.effort === 'string' ? linha.effort : undefined };
  }
  return SEM_PAR;
}

/** Lê o fim do registro em `caminho` (só os últimos `bytes`). Qualquer falha de leitura dá o par desconhecido, nunca exceção. */
export function lerRegistroDoArquivo(caminho, bytes = JANELA_DO_REGISTRO) {
  if (typeof caminho !== 'string' || caminho === '') return SEM_PAR;
  let fd;
  try {
    fd = openSync(caminho, 'r');
    const { size } = fstatSync(fd);
    const inicio = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - inicio);
    let lidos = 0;
    while (lidos < buffer.length) {
      const n = readSync(fd, buffer, lidos, buffer.length - lidos, inicio + lidos);
      if (n === 0) break;
      lidos += n;
    }
    return lerParDoRegistro(buffer.subarray(0, lidos).toString('utf8'));
  } catch {
    return SEM_PAR;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * O par do chat principal a partir da entrada do hook: `{ model, efforts }`. O modelo vem do registro (`transcript_path`).
 * Com `effort.level` na entrada só ele vale; sem ele valem todos os que existem, `CLAUDE_EFFORT` e o do registro (quem
 * decide nega se qualquer um não for o esperado). `lerRegistro` que falha dá par desconhecido.
 */
export function parDoChat(entrada, env = {}, lerRegistro = lerRegistroDoArquivo) {
  let doRegistro = SEM_PAR;
  try {
    doRegistro = lerRegistro(entrada?.transcript_path) ?? SEM_PAR;
  } catch {
    doRegistro = SEM_PAR;
  }
  const nivel = texto(entrada?.effort?.level);
  const efforts = nivel !== undefined ? [nivel] : [...new Set([texto(env?.CLAUDE_EFFORT), texto(doRegistro.effort)].filter((e) => e !== undefined))];
  return { model: texto(doRegistro.model), efforts };
}

function saida(decisao, motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decisao,
      permissionDecisionReason: `Guarda dos subagentes do projeto: ${motivo}`,
    },
  }));
}

async function principal() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let completo;
  let dados;
  try {
    completo = JSON.parse(entrada);
    dados = completo.tool_input;
  } catch {
    dados = undefined;
  }
  if (typeof dados !== 'object' || dados === null) return saida('deny', 'entrada ilegível');
  if (falhaDoDesenvolvedor !== null) return saida('deny', `desenvolvedor.mjs ilegível: ${falhaDoDesenvolvedor instanceof Error ? falhaDoDesenvolvedor.message : falhaDoDesenvolvedor}`);
  if (falhaDoPapeis !== null) return saida('deny', `papeis.mjs ou config.mjs ilegível: ${falhaDoPapeis instanceof Error ? falhaDoPapeis.message : falhaDoPapeis}`);
  let resultado;
  try {
    // os papéis primeiro: com o arquivo inválido nega todo mundo, o neto inclusive
    const { valor: p, erro } = papeis.lerPapeis();
    if (erro !== null) return saida('deny', `pipeline.json ilegível: ${erro}`);
    const esforco = lerEsforcoDoEstado();
    const lerCabecalho = (tipo) => lerCabecalhoDoArquivo(tipo, AGENTES, p);
    resultado = decidirChamador(completo, dados, p, lerCabecalho, tamanhoDoArquivo, esforco)
      ?? juntarDecisoes(decidirOrquestrador(parDoChat(completo, process.env), p), decidirAgente(dados, lerCabecalho, p, tamanhoDoArquivo, textoDoArquivo, esforco));
    // o git só roda quando ainda cabe um ask: o deny já vence
    if (resultado.decisao !== 'deny') resultado = juntarDecisoes(resultado, decidirContraAMain(p));
  } catch (e) {
    return saida('deny', `cabeçalho ilegível: não foi possível ler .claude/agents (${e instanceof Error ? e.message : e})`);
  }
  if (resultado.decisao !== null) saida(resultado.decisao, resultado.motivo);
}

// realpath dos dois lados: no macOS o /tmp é /private/tmp, e o import.meta.url vem resolvido (o hook ficaria mudo, e mudo é "passou")
const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) await principal();
