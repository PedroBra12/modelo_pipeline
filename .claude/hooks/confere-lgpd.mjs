// Confere dado pessoal (LGPD) com as regras de lgpd-regras.mjs, portadas do otto (metricasboss/otto).
// - Hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit (sem argumento): nega a edição com achado crítico ou alto.
//   Não vê o que o shell escreve: isso só o pre-commit pega.
// - Hook pre-commit do git (`--indice`, de git/pre-commit): confere o conteúdo em preparo de cada arquivo do commit,
//   inclusive o que foi escrito pelo shell; recusa com achado crítico ou alto e mostra os avisos e as supressões.
// - À mão: `node .claude/hooks/confere-lgpd.mjs <arquivo ou pasta>...` lista tudo, avisos e supressões inclusive.
// O relatório nunca repete o trecho achado: ele pode ser o próprio dado pessoal.
// Falha fechado: regra que não carrega nega toda edição e recusa todo commit, até ser corrigida (pelo shell).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NIVEIS = { critico: 'crítico', alto: 'alto', medio: 'médio' };
const ORDEM = { critico: 0, alto: 1, medio: 2 };
const bloqueia = (a) => !a.suprimido && a.regra.nivel !== 'medio';
const IGNORADO = /(^|\/)(\.git|node_modules|dist|coverage|\.next)(\/|$)|^\.claude\/estado(\/|$)|^\.claude\/hooks\/lgpd-regras\.mjs$/;
const CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql|json|ya?ml)$/i;
const CONFIG = /(^|\/)\.env(\.[\w.-]+)?$|(^|\/)dockerfile$|\.(ya?ml|toml|sh|ps1|http|ini|conf|properties)$/i;
const TESTE = /(^|\/)(testes?|tests|__tests__|fixtures)\/|\.(test|spec)\.\w+$/i;
const SUPRESSAO = /lgpd-ignora:\s*([\w ,]+?)\s*--\s*\S.{9,}/;
const SO_COMENTARIO = /^\s*(\/\/|--|#|\/?\*|<!--)/; // a supressão na linha de cima só vale se a linha é só comentário
const DDD = new Set(
  ('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 ' +
    '61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99').split(' '),
);
// os domínios de e-mail inventado: os reservados das RFC 2606 e 6761
const RESERVADO = /(^|\.)(example\.(com|net|org)|localhost)$|\.(example|test|invalid|localhost)$/i;

/** Os dois dígitos verificadores do CPF, a partir dos nove primeiros. */
export function digitosCpf(nove) {
  const d = [...nove].map(Number);
  for (const n of [9, 10]) d.push(((d.slice(0, n).reduce((soma, x, i) => soma + x * (n + 1 - i), 0) * 10) % 11) % 10);
  return d.slice(9).join('');
}

export function cpfValido(texto) {
  const d = texto.replace(/\D/g, '');
  return d.length === 11 && !/^(\d)\1+$/.test(d) && digitosCpf(d.slice(0, 9)) === d.slice(9);
}

function luhn(texto) {
  const d = [...texto.replace(/\D/g, '')].reverse().map(Number);
  return d.reduce((soma, x, i) => soma + (i % 2 === 1 ? (x * 2 > 9 ? x * 2 - 9 : x * 2) : x), 0) % 10 === 0;
}

/** Confere o trecho achado: true = é achado mesmo. */
export const VALIDADORES = {
  cpf: cpfValido,
  luhn,
  ddd: (t) => {
    const d = t.replace(/\D/g, '');
    return DDD.has(d.length >= 12 && d.startsWith('55') ? d.slice(2, 4) : d.slice(0, 2));
  },
  email_real: (t) => !/^git@/i.test(t) && !RESERVADO.test(t.slice(t.lastIndexOf('@') + 1)), // git@host é o endereço SSH
  sem_consentimento: (t) => !/consent[\w.]*\s*\(/i.test(t),
};

const compilar = (r) => ({
  ...r,
  re: r.regex === undefined ? null : new RegExp(r.regex, r.maiusculas === true ? 'gm' : 'gim'),
  caminhoRe: r.caminho === undefined ? null : new RegExp(r.caminho, 'i'),
  foraRe: r.fora === undefined ? null : new RegExp(r.fora, 'i'),
});

// dentro do try: uma regra quebrada não pode deixar o hook sair sem negar
export let regras = [];
let falhaDasRegras = null;
try {
  regras = (await import('./lgpd-regras.mjs')).REGRAS.map(compilar);
} catch (erro) {
  falhaDasRegras = erro;
}

function vale(regra, rel) {
  if (IGNORADO.test(rel) || regra.foraRe?.test(rel)) return false;
  if (regra.arquivos === 'todos') return true;
  if (regra.arquivos === 'config') return CONFIG.test(rel);
  if (TESTE.test(rel)) return false;
  return regra.arquivos === 'sql' ? /\.sql$/i.test(rel) : CODIGO.test(rel);
}

function suprimida(linhas, n, regra) {
  if (regra.semSupressao === true) return false;
  const candidatas = [linhas[n - 1], SO_COMENTARIO.test(linhas[n - 2] ?? '') ? linhas[n - 2] : undefined];
  return candidatas.some((l) => l?.match(SUPRESSAO)?.[1].split(',').map((s) => s.trim()).includes(regra.id) === true);
}

/**
 * Os achados de um arquivo, com os suprimidos marcados (`suprimido: true`), para o relatório e o revisor-lgpd.
 * `rel`: o caminho relativo à raiz do repositório, com "/". Texto com "\0" é binário: só as regras de caminho e de binário.
 */
export function varrer(texto, rel, lista = regras) {
  const binario = texto.includes('\0');
  const conteudo = binario ? '' : texto.replace(/\r\n?/g, '\n');
  const linhas = conteudo.split('\n');
  // nas regras de SQL, o comentário vira espaço (do mesmo tamanho): um ";" nele não encerra a instrução
  const semComentario = /\.sql$/i.test(rel) ? conteudo.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')) : conteudo;
  const achados = [];
  for (const regra of lista) {
    if (!vale(regra, rel)) continue;
    if (regra.binario === true || regra.caminhoRe !== null) {
      if (regra.binario === true ? binario : regra.caminhoRe.test(rel)) achados.push({ regra, arquivo: rel, linha: 1, suprimido: false });
      continue;
    }
    const alvo = regra.arquivos === 'sql' ? semComentario : conteudo;
    const vistas = new Set();
    let pos = 0;
    let linha = 1;
    for (const m of alvo.matchAll(regra.re)) {
      const trecho = m[0].replace(/\n+$/, '');
      if (trecho === '') continue;
      if (regra.validador !== undefined && !VALIDADORES[regra.validador](m[0])) continue;
      // a linha conta a partir do achado anterior; no trecho de várias linhas, o problema está na última
      for (const fim = m.index + trecho.length - 1; pos < fim; pos++) if (alvo.charCodeAt(pos) === 10) linha++;
      if (vistas.has(linha)) continue;
      vistas.add(linha);
      achados.push({ regra, arquivo: rel, linha, suprimido: suprimida(linhas, linha, regra) });
    }
  }
  return achados.sort((a, b) => ORDEM[a.regra.nivel] - ORDEM[b.regra.nivel] || a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);
}

export function relatorio(achados) {
  const ativos = achados.filter((a) => !a.suprimido);
  const suprimidos = achados.filter((a) => a.suprimido);
  const bloqueiam = ativos.filter(bloqueia).length;
  const item = (a) =>
    `- ${a.arquivo}:${a.linha} [${NIVEIS[a.regra.nivel]}] ${a.regra.id}: ${a.regra.problema} (${a.regra.artigo}). ` +
    `Correção: ${a.regra.correcao}.${a.regra.semSupressao === true ? ' Não se suprime.' : ''}`;
  return [
    `confere-lgpd: ${bloqueiam} achado(s) que bloqueiam, ${ativos.length - bloqueiam} aviso(s) e ${suprimidos.length} supressão(ões).`,
    ...ativos.map(item),
    ...(suprimidos.length === 0 ? [] : ['Suprimidos (o revisor-lgpd confere o motivo de cada um):', ...suprimidos.map((a) => `- ${a.arquivo}:${a.linha} ${a.regra.id}`)]),
    'Falso positivo: na linha (ou num comentário na linha de cima), "lgpd-ignora: <regra> -- <motivo>". O revisor-lgpd confere cada supressão.',
  ].join('\n');
}

/** Lê o texto como o git guarda: UTF-16 com BOM vira texto; o resto, UTF-8. */
function decodificar(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return bytes.toString('utf8');
}

function negar(motivo) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } }));
}

/** A raiz do repositório git do arquivo (vale no worktree), ou null fora de um repositório. */
function raizDoArquivo(caminho) {
  let pasta = dirname(caminho);
  while (!existsSync(pasta) && dirname(pasta) !== pasta) pasta = dirname(pasta);
  try {
    return execFileSync('git', ['-C', pasta, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

async function comoHook() {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let ti;
  try {
    ti = JSON.parse(entrada).tool_input;
  } catch {
    ti = undefined;
  }
  const caminho = ti?.file_path ?? ti?.notebook_path;
  if (typeof caminho !== 'string') return negar('confere-lgpd: entrada ilegível, e a edição não passou pela conferência de LGPD.');
  const projeto = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const absoluto = resolve(projeto, caminho);
  // sem git (fora do PATH, GIT_DIR errado), o projeto vale como raiz: a guarda erra para o lado de bloquear
  const raiz = raizDoArquivo(absoluto) ?? (dentro(projeto, absoluto) ? projeto : null);
  if (raiz === null || !dentro(raiz, absoluto)) return; // fora de um repositório: nada vai para o commit
  const rel = relative(raiz, absoluto).replaceAll('\\', '/');
  if (falhaDasRegras !== null) {
    if (rel === '.claude/hooks/lgpd-regras.mjs') return; // deixa consertar a regra quebrada
    throw falhaDasRegras;
  }
  const novos = [ti.content, ti.new_string, ti.new_source, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])];
  const achados = varrer(novos.filter((t) => typeof t === 'string').join('\n'), rel).filter(bloqueia);
  if (achados.length > 0) negar(`${relatorio(achados)}\nNo Edit, a linha é a do trecho editado, não a do arquivo.`);
}

function dentro(pasta, caminho) {
  const r = relative(pasta, caminho);
  return r !== '' && r !== '..' && !r.startsWith(`..${'\\'}`) && !r.startsWith('../') && !isAbsolute(r);
}

const git = (raiz, ...args) => execFileSync('git', ['-C', raiz, ...args], { maxBuffer: 256 * 1024 * 1024 });
const raizDoGit = () => execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function terminar(achados, saida) {
  saida.write(achados.length === 0 ? 'confere-lgpd: nada achado.\n' : `${relatorio(achados)}\n`);
  return achados.some(bloqueia) ? 1 : 0;
}

function comoPreCommit() {
  const raiz = raizDoGit();
  const nomes = git(raiz, '-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z')
    .toString('utf8').split('\0').filter(Boolean);
  const achados = nomes.filter((rel) => !IGNORADO.test(rel)).flatMap((rel) => varrer(decodificar(git(raiz, 'show', `:${rel}`)), rel));
  if (achados.length === 0) return 0;
  if (achados.some(bloqueia)) process.stderr.write('Commit recusado pelo confere-lgpd.\n');
  return terminar(achados, process.stderr);
}

function* arquivos(raiz, abs) {
  const rel = relative(raiz, abs).replaceAll('\\', '/');
  if (IGNORADO.test(rel)) return;
  if (statSync(abs).isDirectory()) for (const nome of readdirSync(abs)) yield* arquivos(raiz, join(abs, nome));
  else yield rel;
}

function aMao(alvos) {
  const raiz = raizDoGit();
  const achados = alvos.flatMap((alvo) => [...arquivos(raiz, resolve(alvo))]).flatMap((rel) => varrer(decodificar(readFileSync(join(raiz, rel))), rel));
  return terminar(achados, process.stdout);
}

const mensagem = (erro) => (erro instanceof Error ? erro.message : String(erro));
const mesmoArquivo = (a, b) => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    try {
      await comoHook();
    } catch (erro) {
      negar(`confere-lgpd falhou (${mensagem(erro)}), e a edição não passou pela conferência de LGPD. Corrija pelo shell.`);
    }
  } else {
    try {
      if (falhaDasRegras !== null) throw falhaDasRegras;
      process.exitCode = args[0] === '--indice' ? comoPreCommit() : aMao(args);
    } catch (erro) {
      process.stderr.write(`confere-lgpd: não consegui conferir: ${mensagem(erro)}\n`);
      process.exitCode = 1;
    }
  }
}
