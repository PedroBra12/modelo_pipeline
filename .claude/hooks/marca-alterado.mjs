// Hook PostToolUse (Edit, Write, MultiEdit, NotebookEdit): anota o arquivo de código alterado,
// para o portão do Stop (portao.mjs) saber que há o que conferir. Nunca bloqueia.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODIGO = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.sql', '.json']);
const FORA = /^(\.claude|docs|node_modules|\.git|dist|coverage|\.next)(\/|$)/;

/** Caminho relativo à raiz se o arquivo é código do produto; senão, null. */
export function relevante(raiz, caminho) {
  const rel = relative(raiz, resolve(raiz, caminho)).replaceAll('\\', '/');
  if (rel === '' || rel.startsWith('..') || FORA.test(rel)) return null;
  return CODIGO.has(extname(rel).toLowerCase()) ? rel : null;
}

async function principal() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  const dados = JSON.parse(entrada);
  const caminho = dados.tool_input?.file_path ?? dados.tool_input?.notebook_path;
  if (typeof caminho !== 'string') return;
  const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const rel = relevante(raiz, caminho);
  if (rel === null) return;
  const estado = join(raiz, '.claude', 'estado');
  const lista = join(estado, 'alterados.txt');
  mkdirSync(estado, { recursive: true });
  const ja = existsSync(lista) ? readFileSync(lista, 'utf8').split('\n') : [];
  if (!ja.includes(rel)) appendFileSync(lista, `${rel}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
