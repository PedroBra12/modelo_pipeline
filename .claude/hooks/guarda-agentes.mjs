// Guarda dos subagentes (hook PreToolUse da ferramenta Agent): nenhum subagente herda o modelo do chat
// principal e o padrão é o sonnet. Os agentes fixos (tabela AGENTES_FIXOS) rodam no modelo, no esforço e nas
// ferramentas do cabeçalho, e só passam com o `subagent_type` igual ao `name:` do cabeçalho e sem outro arquivo em
// .claude/agents que possa responder pelo mesmo nome. O orquestrador só roda como agente do chat principal, então como
// subagente se nega. Fora dos agentes fixos, a chamada traz model e effort (o cabeçalho não preenche), outro opus pede
// a confirmação do usuário, o esforço só vai de low a high e o haiku se nega.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTES = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'agents');
const CAMPOS = ['name', 'model', 'effort', 'tools'];

/** Os agentes fixos: modelo (trecho do nome), esforço e ferramentas em que cada um roda. */
export const AGENTES_FIXOS = {
  'revisor-seguranca': { model: 'opus', effort: 'xhigh', tools: 'Read, Grep, Glob' },
  'revisor-arquitetura': { model: 'opus', effort: 'high', tools: 'Read, Grep, Glob' },
  'revisor-lgpd': { model: 'opus', effort: 'high', tools: 'Read, Grep, Glob' },
  'leitor-docs': { model: 'haiku', effort: 'low', tools: 'Read, Grep, Glob' },
  qa: { model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
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
  const permitidos = new Set([...Object.keys(AGENTES_FIXOS), SO_NO_CHAT].map((k) => `${k}.md`));
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

/** A chamada de um agente fixo: o cabeçalho tem de ser o da tabela e a chamada não pode pedir outro modelo ou esforço. */
function decidirFixo(tipo, bruto, entrada, cabecalho, fixo) {
  if (bruto !== tipo || cabecalho?.name !== tipo) {
    return nega(`${tipo}: o subagent_type tem de ser igual ao name do cabeçalho de .claude/agents/${tipo}.md, sem mudar a caixa`);
  }
  if (cabecalho.problema !== undefined) return nega(`${tipo}: ${cabecalho.problema}`);
  const model = texto(entrada?.model) ?? texto(cabecalho.model);
  const effort = texto(entrada?.effort) ?? texto(cabecalho.effort);
  const doCabecalho = texto(cabecalho.model)?.includes(fixo.model) === true && texto(cabecalho.effort) === fixo.effort && conjunto(cabecalho.tools) === conjunto(fixo.tools);
  if (doCabecalho && model !== undefined && model.includes(fixo.model) && effort === fixo.effort) return passa;
  return nega(`${tipo} roda em ${fixo.model} e ${fixo.effort}, com ${fixo.tools}, e o cabeçalho tem de dizer o mesmo: chame sem model/effort ou com model: "${fixo.model}", effort: "${fixo.effort}"`);
}

/** O que fazer com a chamada de subagente. `lerCabecalho(tipo)` devolve o cabeçalho do agente fixo (ver lerCabecalhoDoArquivo), ou nada. */
export function decidirAgente(entrada, lerCabecalho) {
  const bruto = entrada?.subagent_type;
  const tipo = texto(bruto);
  if (tipo === 'fork') return nega('fork herda o modelo do chat principal; use um subagente com model');
  if (tipo === SO_NO_CHAT) {
    return nega(`${SO_NO_CHAT} roda só como agente do chat principal (claude --agent ${SO_NO_CHAT}), nunca como subagente: um subagente não abre outro e este seria um opus xhigh com todas as ferramentas, sem confirmação`);
  }
  const fixo = tipo === undefined ? undefined : AGENTES_FIXOS[tipo];
  if (fixo !== undefined) return decidirFixo(tipo, bruto, entrada, lerCabecalho(tipo), fixo);
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
  let dados;
  try {
    dados = JSON.parse(entrada).tool_input;
  } catch {
    dados = undefined;
  }
  if (typeof dados !== 'object' || dados === null) return saida('deny', 'entrada ilegível');
  let resultado;
  try {
    resultado = decidirAgente(dados, lerCabecalhoDoArquivo);
  } catch {
    return saida('deny', 'cabeçalho ilegível: não foi possível ler .claude/agents');
  }
  if (resultado.decisao !== null) saida(resultado.decisao, resultado.motivo);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
