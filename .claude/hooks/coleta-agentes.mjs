// Não é hook: só leitura, sem rede. A autoanálise (D44, D63) tira os números dos subagentes do disco, não da memória do
// orquestrador, que se perde no compact. Lê a pasta `tasks/` da sessão (ex.: /private/tmp/claude-501/<projeto>/<sessão>/tasks/):
// cada subagente tem um `<agentId>.output` em JSONL. Só vale como transcrição de agente o arquivo cuja 1ª linha JSON tem
// `agentId`: os `b*.output` são saídas de Bash (texto, ou JSON sem `agentId`) e se pulam.
//   node .claude/hooks/coleta-agentes.mjs <pasta> [--desde <ISO>] [--json]
// Por agente: agentId, modelo, tokens (a soma das 4 partes do ÚLTIMO `usage`, o `subagent_tokens` da notificação), minutos
// (último `timestamp` − primeiro, 1 casa), início, fim, pedidos (as mensagens `user` que não são resultado de ferramenta; mais
// de uma quer dizer que o agente foi retomado) e a 1ª linha do 1º pedido (100 caracteres). No fim, o total de agentes e de tokens.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARTES = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
const CORTE = 100;

/** O texto de uma mensagem `user` se ela é um pedido (texto), ou null se é só resultado de ferramenta. */
function textoDoPedido(mensagem) {
  const c = mensagem?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c) || c.length === 0 || c.some((x) => x?.type === 'tool_result')) return null;
  const textos = c.filter((x) => x?.type === 'text' && typeof x.text === 'string').map((x) => x.text);
  return textos.length === 0 ? null : textos.join('\n');
}

/** Um agente a partir das linhas JSONL de um `.output`; null se a 1ª linha JSON não tem `agentId` ou se não há `timestamp` (não é transcrição). */
export function lerAgente(texto) {
  let agentId;
  let primeira = true;
  let modelo;
  let usage;
  let inicio;
  let fim;
  const pedidos = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    let j;
    try {
      j = JSON.parse(linha);
    } catch {
      continue;
    }
    if (typeof j !== 'object' || j === null) continue;
    if (primeira) {
      if (typeof j.agentId !== 'string' || j.agentId === '') return null;
      agentId = j.agentId;
      primeira = false;
    }
    const t = typeof j.timestamp === 'string' ? Date.parse(j.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      if (inicio === undefined || t < inicio) inicio = t;
      if (fim === undefined || t > fim) fim = t;
    }
    if (j.type === 'assistant') {
      if (typeof j.message?.model === 'string' && j.message.model !== '' && !j.message.model.startsWith('<')) modelo = j.message.model;
      if (typeof j.message?.usage === 'object' && j.message.usage !== null) usage = j.message.usage;
    } else if (j.type === 'user') {
      const pedido = textoDoPedido(j.message);
      if (pedido !== null) pedidos.push(pedido);
    }
  }
  if (inicio === undefined) return null;
  return {
    agentId,
    modelo: modelo ?? null,
    tokens: usage === undefined ? 0 : PARTES.reduce((s, p) => s + (Number(usage[p]) || 0), 0),
    minutos: Math.round(((fim - inicio) / 60000) * 10) / 10,
    inicio: new Date(inicio).toISOString(),
    fim: new Date(fim).toISOString(),
    pedidos: pedidos.length,
    primeiroPedido: (pedidos[0] ?? '').split(/\r?\n/).find((l) => l.trim() !== '')?.trim().slice(0, CORTE) ?? '',
  };
}

/** Os agentes da pasta (os `.output` que são JSONL com transcrição), do início mais antigo ao mais novo; `desde` (ISO) filtra pelo início. */
export function coletar(pasta, { desde } = {}) {
  const limite = desde === undefined ? undefined : Date.parse(desde);
  if (limite !== undefined && Number.isNaN(limite)) throw new Error(`--desde não é uma data ISO: ${desde}`);
  const agentes = [];
  for (const nome of readdirSync(pasta).sort()) {
    if (!nome.endsWith('.output')) continue;
    const a = lerAgente(readFileSync(join(pasta, nome), 'utf8'));
    if (a === null || (limite !== undefined && Date.parse(a.inicio) < limite)) continue;
    agentes.push(a);
  }
  return agentes.sort((x, y) => x.inicio.localeCompare(y.inicio));
}

export const total = (agentes) => ({ agentes: agentes.length, tokens: agentes.reduce((s, a) => s + a.tokens, 0) });

/** O texto: duas linhas por agente e o total no fim. */
export function formatar(agentes) {
  const linhas = agentes.flatMap((a) => [
    `${a.agentId}  ${a.modelo ?? '?'}  ${a.tokens} tokens  ${a.minutos} min  ${a.inicio} .. ${a.fim}  pedidos: ${a.pedidos}${a.pedidos > 1 ? ' (retomado)' : ''}`,
    `  ${a.primeiroPedido}`,
  ]);
  const t = total(agentes);
  return [...linhas, `total: ${t.agentes} agentes, ${t.tokens} tokens`].join('\n');
}

function principal(argv) {
  const o = { pasta: undefined, desde: undefined, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') o.json = true;
    else if (argv[i] === '--desde') o.desde = argv[++i];
    else if (o.pasta === undefined && !argv[i].startsWith('--')) o.pasta = argv[i];
    else throw new Error(`argumento inesperado: ${argv[i]}`);
  }
  if (o.pasta === undefined || (argv.includes('--desde') && o.desde === undefined)) throw new Error('uso: node .claude/hooks/coleta-agentes.mjs <pasta> [--desde <ISO>] [--json]');
  const agentes = coletar(o.pasta, { desde: o.desde });
  process.stdout.write(`${o.json ? JSON.stringify(agentes, null, 2) : formatar(agentes)}\n`);
}

// realpath dos dois lados: no macOS o /tmp é /private/tmp, e o import.meta.url vem resolvido
const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`coleta-agentes: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
}
