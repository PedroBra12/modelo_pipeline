// Confere dado pessoal (LGPD) com as regras de lgpd-regras.mjs, portadas do otto (metricasboss/otto).
// - Hook PreToolUse em Edit, Write, MultiEdit e NotebookEdit (sem argumento): nega a edição com achado crítico ou alto.
//   Não vê o que o shell escreve: isso só o pre-commit pega.
// - Hook pre-commit do git (`--indice`, de git/pre-commit): confere o conteúdo em preparo de cada arquivo do commit,
//   inclusive o que foi escrito pelo shell; recusa com achado crítico ou alto e mostra os avisos e as supressões.
// - À mão: `node .claude/hooks/confere-lgpd.mjs [--todos] <arquivo ou pasta>...` lista os arquivos do git (os
//   ignorados ficam de fora), avisos e supressões inclusive.
// Legado, opcional e ancorado: só existe com "lgpd": { "legadoAte": "<sha>" } no pipeline.json do HEAD (sem a chave não há
// legado nenhum). Com ela, o achado de um trecho que o arquivo já tinha naquele commit (seguido pelos renomes até o HEAD) não
// bloqueia, só é contado (`--todos` o lista). A chave do legado é o trecho achado inteiro, com os espaços normalizados, só em
// memória. As regras fortes (CPF, cartão, chave, chave privada) nunca viram legado. Trecho novo ou copiado bloqueia.
// O relatório nunca repete o trecho achado: ele pode ser o próprio dado pessoal.
// Falha fechado: regra que não carrega nega toda edição e recusa todo commit, até ser corrigida (pelo shell).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NIVEIS = { critico: 'crítico', alto: 'alto', medio: 'médio' };
const ORDEM = { critico: 0, alto: 1, medio: 2 };
const bloqueia = (a) => !a.suprimido && a.legado !== true && a.regra.nivel !== 'medio';
const IGNORADO = /(^|\/)(\.git|node_modules|dist|coverage|\.next)(\/|$)|^\.claude\/estado(\/|$)|^\.claude\/hooks\/lgpd-regras\.mjs$/;
const CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql|json|ya?ml)$/i;
const CONFIG = /(^|\/)\.env(\.[\w.-]+)?$|(^|\/)dockerfile$|\.(ya?ml|toml|sh|ps1|http|ini|conf|properties)$/i;
const TESTE = /(^|\/)(testes?|tests|__tests__|fixtures)\/|\.(test|spec)\.\w+$/i;
const SO_COMENTARIO = /^\s*(\/\/|--|#|\/?\*|<!--)/; // a supressão na linha de cima só vale se a linha é só comentário
// o que nunca vira legado: CPF, cartão e chave (as regras sem supressão); um teste confere que são estas
export const FORTES = new Set(['cpf_literal', 'cartao_literal', 'chave_conhecida', 'chave_privada']);
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

// dentro do try: uma regra quebrada, ou um config.mjs quebrado (conflito de merge), não pode deixar o hook sair sem negar
export let regras = [];
let SUPRESSAO = /(?!)/; // a regex da supressão vem do config.mjs; sem ela nada se suprime
let legadoAteDoTexto = () => ({ valor: null, erro: null });
let falhaDasRegras = null;
try {
  ({ SUPRESSAO, legadoAteDoTexto } = await import('./config.mjs'));
  regras = (await import('./lgpd-regras.mjs')).REGRAS.map(compilar);
} catch (erro) {
  falhaDasRegras = erro;
}

/** As regras carregaram? (O escolhe-revisores falha fechado se não: sem elas a revisão de LGPD não vale.) */
export const regrasCarregaram = () => falhaDasRegras === null;

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
      if (regra.binario === true ? binario : regra.caminhoRe.test(rel)) achados.push({ regra, arquivo: rel, linha: 1, suprimido: false, trecho: null });
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
      achados.push({ regra, arquivo: rel, linha, suprimido: suprimida(linhas, linha, regra), trecho: m[0].replace(/\s+/g, ' ').trim() });
    }
  }
  return achados.sort((a, b) => ORDEM[a.regra.nivel] - ORDEM[b.regra.nivel] || a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);
}

// a regra e o trecho achado, com os espaços normalizados: o mesmo achado, onde quer que a linha esteja (só em memória; nunca vai para a saída)
const chave = (a) => `${a.regra.id}\0${a.trecho}`;
const contar = (texto, rel) => {
  const vezes = new Map();
  for (const a of varrer(texto, rel)) if (a.trecho !== null) vezes.set(chave(a), (vezes.get(chave(a)) ?? 0) + 1);
  return vezes;
};

/**
 * Marca `legado: true` no achado cujo trecho já estava no texto âncora (`ancora`: o texto do arquivo no commit de
 * `legadoAte`; null = arquivo novo ou sem legado: nada é legado; `relAncora`: o caminho dele naquele commit, que decide as
 * regras que valiam). O legado não bloqueia: quem mexe no trecho o corrige.
 * - Cada trecho vale quantas vezes aparecia na âncora: a cópia bloqueia. Com `resto` (o Edit: o arquivo em disco sem o
 *   trecho que a edição troca), o que ainda fica no arquivo gasta o orçamento antes de a edição receber a sua parte.
 * - As regras fortes (FORTES) nunca são legado. A regra de caminho e de binário não tem trecho: só é legado com o arquivo igual.
 */
export function marcarLegado(achados, texto, ancora, relAncora, { resto = '', relAgora = relAncora } = {}) {
  if (ancora === null || ancora === undefined) return achados;
  const orcamento = contar(ancora, relAncora);
  if (resto !== '') for (const [k, n] of contar(resto, relAgora)) orcamento.set(k, Math.max(0, (orcamento.get(k) ?? 0) - n));
  return achados.map((a) => {
    if (FORTES.has(a.regra.id)) return a;
    if (a.regra.binario === true || a.regra.caminhoRe !== null) return ancora === texto ? { ...a, legado: true } : a;
    const k = chave(a);
    const n = orcamento.get(k) ?? 0;
    if (n === 0) return a;
    orcamento.set(k, n - 1);
    return { ...a, legado: true };
  });
}

export function relatorio(achados, { todos = false } = {}) {
  const legado = achados.filter((a) => a.legado === true && !a.suprimido);
  const ativos = achados.filter((a) => !a.suprimido && a.legado !== true);
  const suprimidos = achados.filter((a) => a.suprimido);
  const bloqueiam = ativos.filter(bloqueia).length;
  const item = (a) =>
    `- ${a.arquivo}:${a.linha} [${NIVEIS[a.regra.nivel]}] ${a.regra.id}: ${a.regra.problema} (${a.regra.artigo}). ` +
    `Correção: ${a.regra.correcao}.${a.regra.semSupressao === true ? ' Não se suprime.' : ''}`;
  return [
    `confere-lgpd: ${bloqueiam} achado(s) que bloqueiam, ${ativos.length - bloqueiam} aviso(s) e ${suprimidos.length} supressão(ões).`,
    ...ativos.map(item),
    ...(legado.length === 0 ? [] : [
      `Legado: ${legado.length} achado(s) em trechos que já estavam assim em legadoAte; não bloqueiam, e o trecho mexido tem de sair limpo${todos ? ':' : ' (--todos lista).'}`,
      ...(todos ? legado.map(item) : []),
    ]),
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
    if (rel === '.claude/hooks/lgpd-regras.mjs' || rel === '.claude/hooks/config.mjs') return; // deixa consertar a regra ou o config quebrado
    throw falhaDasRegras;
  }
  const novos = [ti.content, ti.new_string, ti.new_source, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])];
  const texto = novos.filter((t) => typeof t === 'string').join('\n');
  const disco = existsSync(absoluto) && statSync(absoluto).isFile() ? decodificar(readFileSync(absoluto)) : null;
  const { ancora, relAncora } = ancoraDe(raiz, rel);
  // o que a edição troca sai do arquivo: o que fica no resto gasta o orçamento do legado (a cópia de uma linha antiga bloqueia)
  const edicoes = typeof ti.old_string === 'string' ? [ti] : Array.isArray(ti.edits) ? ti.edits : [];
  let resto = '';
  if (edicoes.length > 0 && disco !== null) {
    resto = disco;
    for (const e of edicoes) if (typeof e?.old_string === 'string' && e.old_string !== '') resto = e.replace_all === true ? resto.split(e.old_string).join('') : resto.replace(e.old_string, () => '');
  } else if (typeof ti.content !== 'string') resto = disco ?? ''; // NotebookEdit: o resto é o arquivo todo (menos legado, nunca mais)
  const achados = marcarLegado(varrer(texto, rel), texto, ancora, relAncora, { resto, relAgora: rel }).filter(bloqueia);
  if (achados.length > 0) negar(`${relatorio(achados)}\nNo Edit, a linha é a do trecho editado, não a do arquivo.`);
}

function dentro(pasta, caminho) {
  const r = relative(pasta, caminho);
  return r !== '' && r !== '..' && !r.startsWith(`..${'\\'}`) && !r.startsWith('../') && !isAbsolute(r);
}

const git = (raiz, ...args) => execFileSync('git', ['-C', raiz, ...args], { maxBuffer: 256 * 1024 * 1024 });
const raizDoGit = () => execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function terminar(achados, saida, opcoes) {
  saida.write(achados.length === 0 ? 'confere-lgpd: nada achado.\n' : `${relatorio(achados, opcoes)}\n`);
  return achados.some(bloqueia) ? 1 : 0;
}

const calado = { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] };

/** O sha completo de `lgpd.legadoAte`, lido do pipeline.json do HEAD (um commit que muda a chave não perdoa a si mesmo); null = sem legado. */
function legadoDoRepositorio(raiz) {
  let texto;
  try {
    texto = execFileSync('git', ['-C', raiz, 'show', 'HEAD:.claude/pipeline.json'], { ...calado, encoding: 'utf8' });
  } catch {
    return null; // sem HEAD ou sem pipeline.json commitado: sem legado
  }
  const { valor, erro } = legadoAteDoTexto(texto);
  if (erro !== null) process.stderr.write(`confere-lgpd: sem legado, ${erro}\n`);
  if (valor === null) return null;
  try {
    return execFileSync('git', ['-C', raiz, 'rev-parse', '-q', '--verify', `${valor}^{commit}`], { ...calado, encoding: 'utf8' }).trim();
  } catch {
    process.stderr.write(`confere-lgpd: sem legado, lgpd.legadoAte ${valor} não é um commit deste repositório\n`);
    return null;
  }
}

/** Nome de agora (no HEAD) → nome no commit da âncora, para os renomes feitos depois dela. */
function renomesDesde(raiz, sha) {
  const campos = execFileSync('git', ['-C', raiz, '-c', 'core.quotepath=false', 'diff', '--name-status', '-M', '-z', sha, 'HEAD'], calado).toString('utf8').split('\0');
  const mapa = new Map();
  for (let i = 0; i < campos.length && campos[i] !== ''; ) {
    if (/^[RC]/.test(campos[i])) { if (campos[i].startsWith('R')) mapa.set(campos[i + 2], campos[i + 1]); i += 3; }
    else i += 2;
  }
  return mapa;
}

const ancorasDoRepositorio = new Map();
/** O texto de `rel` (o nome no HEAD) no commit da âncora e o nome que ele tinha lá; { ancora: null } sem legado ou se o arquivo não existia. */
function ancoraDe(raiz, rel) {
  if (!ancorasDoRepositorio.has(raiz)) {
    const sha = legadoDoRepositorio(raiz);
    ancorasDoRepositorio.set(raiz, sha === null ? null : { sha, renomes: renomesDesde(raiz, sha) });
  }
  const dados = ancorasDoRepositorio.get(raiz);
  if (dados === null) return { ancora: null, relAncora: rel };
  const relAncora = dados.renomes.get(rel) ?? rel;
  try {
    return { ancora: decodificar(execFileSync('git', ['-C', raiz, 'show', `${dados.sha}:${relAncora}`], calado)), relAncora };
  } catch {
    return { ancora: null, relAncora }; // o arquivo não existia na âncora
  }
}

/** Confere o texto de cada arquivo contra a âncora. `pares`: [rel de agora, rel no HEAD (o nome antigo, se mudou neste commit)]. */
function conferirPares(raiz, pares, lerAgora) {
  return pares.filter(([rel]) => !IGNORADO.test(rel)).flatMap(([rel, relAntes]) => {
    const texto = decodificar(lerAgora(rel));
    const { ancora, relAncora } = ancoraDe(raiz, relAntes);
    return marcarLegado(varrer(texto, rel), texto, ancora, relAncora, { relAgora: rel });
  });
}

function comoPreCommit() {
  const raiz = raizDoGit();
  // com -z: "R100\0velho\0novo\0" no renomeado, "M\0nome\0" no resto
  const campos = git(raiz, '-c', 'core.quotepath=false', 'diff', '--cached', '--name-status', '-M', '--diff-filter=ACMRT', '-z')
    .toString('utf8').split('\0');
  const pares = [];
  for (let i = 0; i < campos.length && campos[i] !== ''; ) {
    const estado = campos[i];
    if (/^[RC]/.test(estado)) { pares.push([campos[i + 2], campos[i + 1]]); i += 3; }
    else { pares.push([campos[i + 1], campos[i + 1]]); i += 2; }
  }
  const achados = conferirPares(raiz, pares, (rel) => git(raiz, 'show', `:${rel}`));
  if (achados.length === 0) return 0;
  if (achados.some(bloqueia)) process.stderr.write('Commit recusado pelo confere-lgpd.\n');
  return terminar(achados, process.stderr);
}

function aMao(args) {
  const todos = args.includes('--todos');
  const alvos = args.filter((a) => a !== '--todos');
  const raiz = raizDoGit();
  // os arquivos do git sob os alvos, guardados ou novos; os ignorados (.env, o banco local) ficam de fora
  const nomes = git(raiz, '-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...alvos.map((a) => resolve(a)))
    .toString('utf8').split('\0').filter((rel) => rel !== '' && existsSync(join(raiz, rel)));
  const achados = conferirPares(raiz, [...new Set(nomes)].map((rel) => [rel, rel]), (rel) => readFileSync(join(raiz, rel)));
  return terminar(achados, process.stdout, { todos });
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
