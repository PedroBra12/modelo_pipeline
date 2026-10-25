// Guarda dos subagentes (hook PreToolUse da ferramenta Agent): nenhum subagente herda o modelo do chat principal e o
// padrão é o sonnet. Os agentes fixos rodam no modelo, no esforço e nas ferramentas de `agentes` no .claude/pipeline.json,
// que o cabeçalho de .claude/agents/<nome>.md repete; acima do TETO (aqui no código) a chamada pede a confirmação do
// usuário. Só passam com o `subagent_type` igual ao `name:` do cabeçalho e sem outro arquivo em .claude/agents que possa
// responder pelo mesmo nome. O orquestrador só roda como agente do chat principal, então como subagente se nega, e o
// chat principal só delega em opus xhigh (D3): outro esforço ou modelo nega, par ilegível pede confirmação, e o subagente
// que chama a ferramenta Agent (a entrada traz agent_id) se nega. Fora
// dos agentes fixos, a chamada traz model e effort (o cabeçalho não preenche), outro opus pede a confirmação do usuário,
// o esforço só vai de low a high e o haiku se nega. Pipeline.json ausente ou ilegível nega, em JSON.
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// dentro do try: um config.mjs quebrado (conflito de merge) não pode deixar o hook sair sem negar
let config = null;
let falhaDoConfig = null;
try {
  config = await import('./config.mjs');
} catch (erro) {
  falhaDoConfig = erro;
}

const AGENTES = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'agents');
const CAMPOS = ['name', 'model', 'effort', 'tools'];

/**
 * O teto dos agentes fixos: o modelo (trecho do nome), o esforço máximo e as ferramentas exatas. O `pipeline.json` pode
 * descer abaixo do teto (o ajuste automático); acima dele a chamada pede a confirmação do usuário (D2).
 */
export const TETO = {
  'revisor-seguranca': { model: 'opus', effort: 'xhigh', tools: 'Read, Grep, Glob' },
  'revisor-arquitetura': { model: 'opus', effort: 'high', tools: 'Read, Grep, Glob' },
  'revisor-lgpd': { model: 'opus', effort: 'high', tools: 'Read, Grep, Glob' },
  'leitor-docs': { model: 'haiku', effort: 'low', tools: 'Read, Grep, Glob' },
  qa: { model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
  'revisor-tela': { model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
};
/** Roda só como agente do chat principal (`claude --agent orquestrador`), nunca como subagente. */
export const SO_NO_CHAT = 'orquestrador';

const tiraAspas = (v) => v?.replace(/^(["'])(.*)\1$/, '$2');
const cabecalhoDe = (arquivo) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(arquivo, 'utf8'))?.[1] ?? '';
/** O valor do campo na 1ª ocorrência: uma palavra só, ou a linha inteira em `tools`. */
const valor = (cabecalho, nome) => new RegExp(`^${nome}:[ \\t]*${nome === 'tools' ? '(\\S.*?)' : '(\\S+)'}[ \\t\\r]*$`, 'm').exec(cabecalho)?.[1];
const conjunto = (tools) => (tools === undefined ? undefined : tools.split(',').map((t) => t.trim()).sort().join(','));

/** O que há de errado na pasta de agentes para liberar o fixo `tipo`: arquivo `.md` fora da lista (em qualquer subpasta) ou 2º arquivo com o mesmo `name:`. */
function problemaDaPasta(tipo, pasta) {
  const permitidos = new Set([...Object.keys(TETO), SO_NO_CHAT].map((k) => `${k}.md`));
  for (const rel of readdirSync(pasta, { recursive: true })) {
    const nome = String(rel);
    if (!nome.toLowerCase().endsWith('.md') || statSync(join(pasta, nome)).isDirectory()) continue;
    if (!permitidos.has(nome)) return `${nome} está em .claude/agents e não é um agente conhecido da guarda`;
    if (nome !== `${tipo}.md` && tiraAspas(valor(cabecalhoDe(join(pasta, nome)), 'name')) === tipo) {
      return `${nome} também tem name: ${tipo}`;
    }
  }
  return undefined;
}

/**
 * name, model, effort e tools do frontmatter de .claude/agents/<tipo>.md (campo ausente = undefined), mais `problema`
 * quando o cabeçalho tem campo repetido ou a pasta tem arquivo que pode responder pelo mesmo nome. Nada se o arquivo
 * não existe. Erro de leitura sobe (quem chama nega).
 */
export function lerCabecalhoDoArquivo(tipo, pasta = AGENTES) {
  if (!/^[\w-]+$/.test(tipo)) return undefined;
  const arquivo = join(pasta, `${tipo}.md`);
  if (!existsSync(arquivo)) return undefined;
  const cabecalho = cabecalhoDe(arquivo);
  const repetido = CAMPOS.find((nome) => (cabecalho.match(new RegExp(`^${nome}:`, 'gm')) ?? []).length > 1);
  const problema = repetido === undefined ? problemaDaPasta(tipo, pasta) : `o campo ${repetido}: aparece mais de uma vez no cabeçalho`;
  return { name: valor(cabecalho, 'name'), model: valor(cabecalho, 'model'), effort: valor(cabecalho, 'effort'), tools: valor(cabecalho, 'tools'), problema };
}

const ESFORCOS = new Set(['low', 'medium', 'high']);
const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined);
const nega = (motivo) => ({ decisao: 'deny', motivo });
const passa = { decisao: null, motivo: null };

const posto = (e) => config.ESCADA.indexOf(`${e.model}:${e.effort}`);
const acimaDoTeto = (vigente, teto) => (posto(teto) === -1 || posto(vigente) === -1 ? `${vigente.model}:${vigente.effort}` !== `${teto.model}:${teto.effort}` : posto(vigente) > posto(teto));

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
  const teto = TETO[tipo];
  if (conjunto(vigente.tools) !== conjunto(teto.tools)) return nega(`${tipo}: as ferramentas do pipeline.json (${vigente.tools}) não são as do teto da guarda (${teto.tools})`);
  if (acimaDoTeto(vigente, teto)) return { decisao: 'ask', motivo: `${tipo}: o pipeline.json pede ${vigente.model} ${vigente.effort}, acima do teto da guarda (${teto.model} ${teto.effort}); confirme` };
  return passa;
}

/** O que fazer com a chamada de subagente. `lerCabecalho(tipo)` devolve o cabeçalho do agente fixo (ver lerCabecalhoDoArquivo), ou nada. */
export function decidirAgente(entrada, lerCabecalho, agentes = TETO) {
  const bruto = entrada?.subagent_type;
  const tipo = texto(bruto);
  if (tipo === 'fork') return nega('fork herda o modelo do chat principal; use um subagente com model');
  if (tipo === SO_NO_CHAT) {
    return nega(`${SO_NO_CHAT} roda só como agente do chat principal (claude --agent ${SO_NO_CHAT}), nunca como subagente: um subagente não abre outro e este seria um opus xhigh com todas as ferramentas, sem confirmação`);
  }
  if (tipo !== undefined && Object.hasOwn(TETO, tipo)) return decidirFixo(tipo, bruto, entrada, lerCabecalho(tipo), agentes[tipo]);
  const model = texto(entrada?.model);
  const effort = texto(entrada?.effort);
  if (effort !== undefined && !ESFORCOS.has(effort)) return nega(`effort "${effort}" não vale: use low, medium ou high (xhigh e max não)`);
  if (model === undefined || effort === undefined) return nega('passe model e effort; o padrão é sonnet');
  if (model.includes('opus') || model.includes('fable')) {
    const motivo = typeof entrada?.description === 'string' ? entrada.description : '(sem description)';
    return { decisao: 'ask', motivo: `subagente em ${model}: um sonnet não resolveria? Motivo dado: ${motivo}` };
  }
  if (model.includes('haiku')) return nega('haiku só vale no leitor-docs');
  if (model.includes('sonnet')) return passa;
  return nega(`model "${model}" desconhecido: passe sonnet`);
}

// ---------- o chat principal em opus xhigh (D3) ----------

const SEM_PAR = { model: undefined, effort: undefined };
/** Quanto do fim do registro da sessão se lê: ele passa de 1 MB e o hook tem 10 s. */
const JANELA_DO_REGISTRO = 4 * 1024 * 1024;

/**
 * O chat principal tem de estar no par do nível `orquestracao` (`FIXOS` do config.mjs, opus xhigh). `par` é `{ model,
 * efforts }` (`parDoChat`): esforço ou modelo conhecido e errado nega, com o comando que corrige; o que não deu para
 * ler pede a confirmação do usuário.
 */
export function decidirOrquestrador(par) {
  const [modeloEsperado, esforcoEsperado] = config.FIXOS.niveis.orquestracao.split(':');
  const model = texto(par?.model);
  const efforts = (Array.isArray(par?.efforts) ? par.efforts : []).map(texto).filter((e) => e !== undefined);
  const effort = efforts.find((e) => e !== esforcoEsperado) ?? efforts[0];
  const erros = [];
  if (effort !== undefined && effort !== esforcoEsperado) erros.push(`o esforço do chat principal é ${effort} (digite /effort ${esforcoEsperado})`);
  if (model !== undefined && !model.includes(modeloEsperado)) erros.push(`o modelo do chat principal é ${model} (digite /model ${modeloEsperado})`);
  if (erros.length > 0) return nega(`o orquestrador roda sempre em ${modeloEsperado} ${esforcoEsperado} (D3): ${erros.join('; ')}`);
  if (model === undefined || effort === undefined) return { decisao: 'ask', motivo: `não deu para ler o modelo ou o esforço do chat principal; confirme que o chat está em ${modeloEsperado} ${esforcoEsperado}, D3` };
  return passa;
}

const PESO = { deny: 2, ask: 1 };
/**
 * A ferramenta `Agent` só vale para o chat principal: a entrada do hook de um subagente traz `agent_id` (o `agent_type` vem
 * também no chat aberto por `--agent`, então não separa). Sem `agent_id`, segue para a checagem do par.
 */
export function decidirChamador(entrada) {
  const id = entrada?.agent_id;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return nega('subagente não abre subagente: só o chat principal, o orquestrador, delega (D3)');
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
  if (falhaDoConfig !== null) return saida('deny', `config.mjs ilegível: ${falhaDoConfig instanceof Error ? falhaDoConfig.message : falhaDoConfig}`);
  const doChamador = decidirChamador(completo);
  if (doChamador !== null) return saida(doChamador.decisao, doChamador.motivo);
  let resultado;
  try {
    const { valor, erro } = config.lerAgentes();
    if (erro !== null) return saida('deny', `pipeline.json ilegível: ${erro}`);
    resultado = juntarDecisoes(decidirOrquestrador(parDoChat(completo, process.env)), decidirAgente(dados, lerCabecalhoDoArquivo, valor));
  } catch (e) {
    return saida('deny', `cabeçalho ilegível: não foi possível ler .claude/agents (${e instanceof Error ? e.message : e})`);
  }
  if (resultado.decisao !== null) saida(resultado.decisao, resultado.motivo);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
