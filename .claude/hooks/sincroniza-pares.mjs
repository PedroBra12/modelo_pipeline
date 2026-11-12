// O gerador dos pares (D11): regrava, a partir do .claude/pipeline.json (lido só pelo `papeis.mjs`), tudo o que antes se
// copiava à mão: o `model`, o `effort` e o `tools` dos cabeçalhos de .claude/agents/ (o do `desenvolvedor` inteiro, pelo
// `cabecalho` do desenvolvedor.mjs; o `orquestrador.md` só `model` e `effort`, do nível `orquestracao`), o `model`, o
// `effortLevel` e o `env` do .claude/settings.json e a tabela da seção 7 da skill `pipeline`. Uso:
//   node .claude/hooks/sincroniza-pares.mjs [--conferir] [--raiz <pasta>]
// Falha fechado: monta tudo em memória, valida, e só então grava, cada arquivo por temporário na mesma pasta + rename, e só o
// que mudou. Com `--conferir` não grava: sai 0 se tudo está em dia e 1 listando o que diverge. O `settings.local.json`, se
// existir, com `env` de chave fora das 4 do gerador ou com `disableAllHooks`, é recusado (o gerador não o regrava).
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { lerPapeis, nomesDeAgentes, orquestrador, papel, versoes, agentesFixos, DESENVOLVEDOR } from './papeis.mjs';
import { cabecalho } from './desenvolvedor.mjs';

const RAIZ_PADRAO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMANDO = 'node .claude/hooks/sincroniza-pares.mjs';
const ORQUESTRADOR = 'orquestrador';
/** As únicas chaves que o gerador deixa no `env` do settings.json. */
export const CHAVES_DO_ENV = [
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH',
];
const MARCA_INICIO = 'tabela-agentes:inicio';
const INICIO = `<!-- ${MARCA_INICIO} (gerada por sincroniza-pares.mjs; não edite) -->`;
const FIM = '<!-- tabela-agentes:fim -->';

const caminhos = (raiz) => ({
  config: join(raiz, '.claude', 'pipeline.json'),
  agentes: join(raiz, '.claude', 'agents'),
  settings: join(raiz, '.claude', 'settings.json'),
  local: join(raiz, '.claude', 'settings.local.json'),
  skill: join(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md'),
});

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------- os cabeçalhos de .claude/agents/ ----------

const CABECALHO = /^(---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/;

function trocarLinha(corpo, chave, valor, onde) {
  const re = new RegExp(`^${chave}:[^\\r\\n]*`, 'm');
  if (!re.test(corpo)) throw new Error(`${onde}: o cabeçalho não tem a linha ${chave}:`);
  return corpo.replace(re, () => `${chave}: ${valor}`);
}

/**
 * O texto de `.claude/agents/<nome>.md` com o cabeçalho do pipeline.json `p`: as linhas `model:`, `effort:` e `tools:` da
 * entrada de `agentes` (o do `desenvolvedor` inteiro, pelo `cabecalho`), ou `model:` e `effort:` do nível `orquestracao` se o
 * nome é `orquestrador`. Nada fora dessas linhas muda. Pura. Lança se o cabeçalho falta, ou se o `name:` mudaria.
 */
export function cabecalhoDe(p, nome, texto) {
  const onde = `.claude/agents/${nome}.md`;
  const m = CABECALHO.exec(texto);
  if (m === null) throw new Error(`${onde}: o arquivo não começa com um cabeçalho --- ... ---`);
  let depois;
  if (nome === DESENVOLVEDOR) {
    depois = cabecalho(papel(p, 'agentes', nome)).replace(/\n$/, '') + texto.slice(m[0].length);
  } else {
    const entrada = nome === ORQUESTRADOR ? orquestrador(p) : papel(p, 'agentes', nome);
    if (entrada === undefined) throw new Error(`${onde}: ${nome} não está em agentes no pipeline.json`);
    let corpo = trocarLinha(trocarLinha(m[2], 'model', entrada.model, onde), 'effort', entrada.effort, onde);
    if (nome !== ORQUESTRADOR) corpo = trocarLinha(corpo, 'tools', entrada.tools, onde);
    depois = m[1] + corpo + m[3] + texto.slice(m[0].length);
  }
  const antes = /^name:[^\r\n]*/m.exec(m[2])?.[0];
  const agora = /^name:[^\r\n]*/m.exec(CABECALHO.exec(depois)?.[2] ?? '')?.[0];
  if (antes === undefined || antes !== agora) throw new Error(`${onde}: o name: do cabeçalho não pode mudar (${antes} -> ${agora})`);
  return depois;
}

// ---------- o settings.json ----------

/** O valor de `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`: "1" sem o `neto` no pipeline.json, "2" com ele (D11.4). */
const profundidade = (p) => (p.neto === undefined ? '1' : '2');

/** O `env` do settings.json: só as 4 chaves do gerador, em texto. */
export function envDe(p) {
  const v = versoes(p);
  return {
    ANTHROPIC_DEFAULT_OPUS_MODEL: v.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: v.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: v.haiku,
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: profundidade(p),
  };
}

/** O objeto com `chave` posta em `valor`: no lugar, se já existe; senão logo depois de `apos` (ou no fim). */
function comChave(objeto, chave, valor, apos) {
  if (Object.hasOwn(objeto, chave)) return { ...objeto, [chave]: valor };
  const saida = {};
  let posto = false;
  for (const [k, v] of Object.entries(objeto)) {
    saida[k] = v;
    if (k === apos) {
      saida[chave] = valor;
      posto = true;
    }
  }
  if (!posto) saida[chave] = valor;
  return saida;
}

/**
 * O texto do settings.json com `model` e `effortLevel` do orquestrador e o `env` do gerador. O resto fica igual (`hooks`
 * profundamente), com o recuo de 2 espaços e o fim de linha e o `\n` final do arquivo. Pura. Lança se o arquivo não é um
 * objeto JSON, ou se a saída não passa na conferência (JSON, `hooks` iguais, `env` só nas 4 chaves, em texto).
 */
export function settingsDe(p, texto) {
  let antes;
  try {
    antes = JSON.parse(texto);
  } catch (e) {
    throw new Error(`.claude/settings.json não é JSON válido: ${e.message}`);
  }
  if (!ehObjeto(antes)) throw new Error('.claude/settings.json tem de ser um objeto JSON');
  const o = orquestrador(p);
  let novo = comChave(antes, 'model', o.model, 'agent');
  novo = comChave(novo, 'effortLevel', o.effort, 'model');
  novo = comChave(novo, 'env', envDe(p), 'effortLevel');
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const final = /\n$/.test(texto) ? eol : '';
  const depois = JSON.stringify(novo, null, 2).replace(/\n/g, eol) + final;
  conferirSettings(antes, depois, p);
  return depois;
}

/** Lança se o texto novo do settings.json não é o que o gerador promete. */
function conferirSettings(antes, texto, p) {
  let depois;
  try {
    depois = JSON.parse(texto);
  } catch (e) {
    throw new Error(`.claude/settings.json gerado não é JSON válido: ${e.message}`);
  }
  if (!isDeepStrictEqual(depois.hooks, antes.hooks)) throw new Error('.claude/settings.json: o gerador mudaria o `hooks`');
  const esperado = envDe(p);
  if (!ehObjeto(depois.env) || !isDeepStrictEqual(Object.keys(depois.env).sort(), [...CHAVES_DO_ENV].sort()) || Object.values(depois.env).some((v) => typeof v !== 'string')) {
    throw new Error('.claude/settings.json: o `env` gerado tem de ter só as 4 chaves do gerador, em texto');
  }
  if (!isDeepStrictEqual(depois.env, esperado)) throw new Error('.claude/settings.json: o `env` gerado difere do pipeline.json');
  const resto = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !['model', 'effortLevel', 'env'].includes(k)));
  if (!isDeepStrictEqual(resto(depois), resto(antes))) throw new Error('.claude/settings.json: o gerador mudaria uma chave que não é dele');
}

/**
 * Lança se o `.claude/settings.local.json` (texto) tem `disableAllHooks` ou um `env` com chave fora das 4 do gerador: ele
 * venceria o settings.json sem que o gerador o regrave. Ilegível ou de forma estranha também recusa (não dá para provar que é inofensivo).
 */
export function conferirLocal(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new Error(`.claude/settings.local.json não é JSON válido (${e.message}): o gerador não sabe o que ele muda e recusa`);
  }
  if (!ehObjeto(dados)) throw new Error('.claude/settings.local.json tem de ser um objeto JSON: o gerador recusa');
  if (Object.hasOwn(dados, 'disableAllHooks')) throw new Error('.claude/settings.local.json tem `disableAllHooks`: ele desliga os hooks do pipeline; tire a chave (o gerador recusa e não o regrava)');
  if (!Object.hasOwn(dados, 'env')) return;
  if (!ehObjeto(dados.env)) throw new Error('.claude/settings.local.json: o `env` tem de ser um objeto; o gerador recusa');
  const fora = Object.keys(dados.env).filter((k) => !CHAVES_DO_ENV.includes(k));
  if (fora.length > 0) throw new Error(`.claude/settings.local.json tem no \`env\` a chave ${fora.join(', ')}, fora das 4 do gerador (${CHAVES_DO_ENV.join(', ')}); tire-a (o gerador recusa e não o regrava)`);
}

// ---------- a tabela da seção 7 da skill ----------

/** A tabela de modelo e esforço da seção 7 da skill `pipeline`, gerada do pipeline.json, em LF e entre as marcas. */
export function tabela(p) {
  const linhas = ['| Quem | Tarefa | `model` | `effort` |', '|---|---|---|---|'];
  for (const [chave, e] of Object.entries(p.niveis)) linhas.push(`| nível \`${chave}\` | ${e.tarefa ?? ''} | \`${e.model}\` | \`${e.effort}\` |`);
  for (const [chave, e] of Object.entries(agentesFixos(p))) linhas.push(`| agente \`${chave}\` (\`.claude/agents/\`) | ${e.tarefa ?? ''} | \`${e.model}\` | \`${e.effort}\` |`);
  return `${INICIO}\n${linhas.join('\n')}\n${FIM}`;
}

/** O texto da skill com a tabela entre as marcas trocada pela gerada (e o marcador, pelo de hoje). Lança se as marcas faltam. */
export function tabelaDe(p, skill) {
  const marca = new RegExp(`<!-- ${MARCA_INICIO}[^>]*-->`).exec(skill);
  const b = skill.indexOf(FIM);
  if (marca === null || b === -1 || b < marca.index) throw new Error('SKILL.md sem as marcas da tabela (tabela-agentes:inicio e tabela-agentes:fim)');
  const a = marca.index;
  // o fim de linha é o que a skill já usa (CRLF ou LF): a tabela é gerada em LF e convertida, para o arquivo não ficar misturado
  const nl = skill.indexOf('\n', a);
  const eol = nl > 0 ? (skill[nl - 1] === '\r' ? '\r\n' : '\n') : (skill.includes('\r\n') ? '\r\n' : '\n');
  return skill.slice(0, a) + tabela(p).replace(/\n/g, eol) + skill.slice(b + FIM.length);
}

// ---------- o conjunto, e o disco ----------

/**
 * Tudo o que o gerador regrava num projeto `raiz`, para os papéis `p`: `[{ arquivo, antes, depois }]`, sem gravar nada.
 * Os cabeçalhos dos agentes que têm arquivo, o settings.json e a skill; o settings.json e a skill são obrigatórios. Lança com
 * a 1ª coisa que não confere (inclusive o `settings.local.json` recusado), e então nada se grava.
 */
export function montar(raiz, p) {
  const c = caminhos(raiz);
  if (existsSync(c.local)) conferirLocal(readFileSync(c.local, 'utf8'));
  const saidas = [];
  const de = (arquivo, gera) => {
    if (!existsSync(arquivo)) throw new Error(`${relative(raiz, arquivo)} não existe`);
    const antes = readFileSync(arquivo, 'utf8');
    saidas.push({ arquivo, antes, depois: gera(antes) });
  };
  for (const nome of [...nomesDeAgentes(p), ORQUESTRADOR]) {
    const arquivo = join(c.agentes, `${nome}.md`);
    if (existsSync(arquivo)) de(arquivo, (texto) => cabecalhoDe(p, nome, texto));
  }
  de(c.settings, (texto) => settingsDe(p, texto));
  de(c.skill, (texto) => tabelaDe(p, texto));
  return saidas;
}

/** Os arquivos de `saidas` que mudam. */
export const mudados = (saidas) => saidas.filter((s) => s.depois !== s.antes);

/** Grava cada arquivo que mudou por um temporário na mesma pasta e um `rename`. Devolve os caminhos gravados. */
export function gravar(saidas) {
  const feitos = [];
  for (const { arquivo, depois } of mudados(saidas)) {
    const temporario = `${arquivo}.tmp-${process.pid}`;
    try {
      writeFileSync(temporario, depois);
      renameSync(temporario, arquivo);
    } catch (e) {
      rmSync(temporario, { force: true });
      throw new Error(`não consegui gravar ${arquivo} (já gravados: ${feitos.join(', ') || 'nenhum'}): ${e.message}`);
    }
    feitos.push(arquivo);
  }
  return feitos;
}

/** Lê o pipeline.json da raiz e monta tudo; lança se o arquivo é inválido. */
export function montarDaRaiz(raiz) {
  const { valor: p, erro } = lerPapeis(caminhos(raiz).config);
  if (erro !== null) throw new Error(erro);
  return montar(raiz, p);
}

// ---------- linha de comando ----------

function opcoes(argv) {
  const o = { conferir: false, raiz: RAIZ_PADRAO };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--conferir') o.conferir = true;
    else if (argv[i] === '--raiz') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error('--raiz pede uma pasta');
      o.raiz = resolve(v);
      i += 1;
    } else throw new Error(`opção desconhecida: ${argv[i]} (uso: ${COMANDO} [--conferir] [--raiz <pasta>])`);
  }
  return o;
}

/** Roda o gerador; devolve `{ codigo, saida }`. Nunca grava com erro, e `--conferir` nunca grava. */
export function principal(argv) {
  try {
    const o = opcoes(argv);
    const saidas = montarDaRaiz(o.raiz);
    const mudam = mudados(saidas).map((s) => relative(o.raiz, s.arquivo));
    if (o.conferir) {
      if (mudam.length === 0) return { codigo: 0, saida: 'pares em dia com o pipeline.json' };
      return { codigo: 1, erro: `divergem do pipeline.json: ${mudam.join(', ')}; rode ${COMANDO}` };
    }
    gravar(saidas);
    return { codigo: 0, saida: mudam.length === 0 ? 'pares já estavam em dia com o pipeline.json' : `regravado: ${mudam.join(', ')}` };
  } catch (e) {
    return { codigo: 1, erro: `sincroniza-pares: ${e.message}` };
  }
}

const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  const r = principal(process.argv.slice(2));
  if (r.saida !== undefined) console.log(r.saida);
  if (r.erro !== undefined) console.error(r.erro);
  process.exitCode = r.codigo;
}
