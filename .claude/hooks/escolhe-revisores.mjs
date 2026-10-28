// Escolhe os revisores de uma mudança de forma mecânica (D2): lê o diff do git, aplica a seção `revisao` do
// .claude/pipeline.json e imprime os revisores obrigatórios, com modelo, esforço e o motivo (gatilho, arquivo, linha).
// O orquestrador lança exatamente esses; pode acrescentar um, com o motivo no relatório, nunca tirar.
// Uso: node .claude/hooks/escolhe-revisores.mjs <base> <head> | --trabalho
//        [--esforco rapido|medio|alto] [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]
// `<base> <head>` compara do merge-base (base...head); `--trabalho` compara o HEAD com a árvore, inclusive o que ainda não foi commitado.
// Três esforços do pipeline (`rapido`, `medio` padrão e `alto`): `medio` tira `revisor-arquitetura` e `revisor-lgpd`; `rapido` tira todos os revisores e o `qa`.
// `sempre` pode ficar vazio; a regra `grande` (arquitetura e ponytail) só dispara na mudança grande, e o gatilho `tela`, com `layout`,
// só dispara com layout novo (arquivo criado ou apagado, declaração de layout no CSS, elemento, className ou style no JSX/TSX).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PISO_GATILHOS, ehArquivoDeCodigo, lerAgentes, lerNiveis, lerPastas, localizar, par, revisaoDeObjeto } from './config.mjs';
import { regrasCarregaram, varrer } from './confere-lgpd.mjs';

export const ESFORCOS_PIPELINE = new Set(['rapido', 'medio', 'alto']);
export const ESFORCO_PADRAO = 'medio';
export const FORA_DO_MEDIO = new Set(['revisor-arquitetura', 'revisor-lgpd']);
export const GATILHOS_BLOQUEADOS_NO_RAPIDO = new Set([
  'banco',
  'permissao',
  'dado_pessoal',
  'config_pipeline',
  'lgpd_ignora',
  'lgpd_regras',
  'confere-lgpd',
]);
const ARQUIVO_ESFORCO = '.claude/estado/esforco';

const REFERENCIA = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}:-]*$/; // nunca começa com "-": não vira opção do git
const SEM_DOIS_PONTOS = /\.\./; // "a..b" ou "a...b" num argumento só mudaria o alcance de `${base}...${head}` (duas pontas viram diff direto, sem merge-base)
const MAX_MOTIVOS = 3;
const ARQUIVO_NO_GIT = '.claude/pipeline.json';
const FLAGS_DIFF = ['-c', 'core.quotepath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/'];
const FLAGS_RENOMES = ['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/', '--name-status', '-z', '-M', '--diff-filter=R'];

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// ---------- o diff ----------

/**
 * O texto de `git diff -U0` vira `[{ caminho, status, binario, linhas, removidas, hunks }]` (`hunks` repete as linhas por hunk; linhas com o número da linha nova ou da velha;
 * `status` é `A` criado, `D` apagado ou `M` o resto).
 * O k-ésimo cabeçalho é o k-ésimo nome de `git diff --name-only -z`, então nome com espaço, " b/" ou aspas sai certo.
 */
export function interpretarDiff(texto, nomes) {
  const arquivos = [];
  let atual;
  let noHunk = false;
  let novo = 0;
  let velho = 0;
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('diff --git ')) {
      atual = { caminho: nomes[arquivos.length], status: 'M', binario: false, linhas: [], removidas: [], hunks: [] };
      arquivos.push(atual);
      noHunk = false;
    } else if (atual === undefined) {
      continue;
    } else if (linha.startsWith('@@')) {
      noHunk = true;
      atual.hunks.push({ linhas: [], removidas: [] });
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(linha);
      velho = Number(m?.[1] ?? 0);
      novo = Number(m?.[2] ?? 0);
    } else if (!noHunk) {
      if (/^(Binary files |GIT binary patch)/.test(linha)) atual.binario = true;
      if (linha.startsWith('new file mode ')) atual.status = 'A';
      if (linha.startsWith('deleted file mode ')) atual.status = 'D';
    } else if (linha.startsWith('+')) {
      atual.linhas.push({ n: novo, texto: linha.slice(1) });
      atual.hunks.at(-1).linhas.push(atual.linhas.at(-1));
      novo += 1;
    } else if (linha.startsWith('-')) {
      atual.removidas.push({ n: velho, texto: linha.slice(1) });
      atual.hunks.at(-1).removidas.push(atual.removidas.at(-1));
      velho += 1;
    }
  }
  if (arquivos.length !== nomes.length) throw new Error(`o diff e a lista de nomes não batem (${arquivos.length} cabeçalhos, ${nomes.length} nomes)`);
  return arquivos;
}

/** Os arquivos novos ainda fora do git (ls-files --others) como se fossem inteiros adicionados. */
function naoRastreados(cwd) {
  // só arquivo de verdade: o repositório aninhado e o link para pasta vêm como pasta (EISDIR), e o link quebrado não abre
  const ehArquivo = (caminho) => {
    try {
      return statSync(join(cwd, caminho)).isFile();
    } catch {
      return false;
    }
  };
  return git(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean).filter(ehArquivo).map((caminho) => {
    const bruto = readFileSync(join(cwd, caminho));
    if (bruto.includes(0)) return { caminho, status: 'A', binario: true, linhas: [], removidas: [] };
    const linhas = bruto.toString('utf8').split('\n');
    if (linhas.at(-1) === '') linhas.pop();
    return { caminho, status: 'A', binario: false, linhas: linhas.map((texto, i) => ({ n: i + 1, texto })), removidas: [] };
  });
}

/**
 * O renome (`R` do `--name-status -M -z`) vira um arquivo só para o layout: o novo fica `M` e leva em `removidasDoOrigem` as
 * linhas removidas do velho, e o velho leva `renomeadoPara` (o gatilho de layout o pula). Só o que mudou no conteúdo conta.
 */
export function juntarRenomes(arquivos, nameStatus) {
  const campos = nameStatus.split('\0').filter(Boolean);
  for (let i = 0; i < campos.length; i += 3) {
    if (!/^R\d*$/.test(campos[i])) continue;
    const velho = arquivos.find((a) => a.caminho === campos[i + 1] && a.status === 'D');
    const novo = arquivos.find((a) => a.caminho === campos[i + 2] && a.status === 'A');
    if (velho !== undefined && novo !== undefined) {
      novo.status = 'M';
      novo.removidasDoOrigem = velho.removidas;
      novo.renomeadoDe = velho.caminho;
      velho.renomeadoPara = novo.caminho;
    }
  }
  return arquivos;
}

/** Cada referência existe no repositório? Senão, a mensagem diz qual (e, se for a main, como criá-la), não o erro cru do git. */
export function conferirReferencias(refs, cwd = process.cwd()) {
  const lista = Array.isArray(refs) ? refs : [refs, cwd];
  const pasta = Array.isArray(refs) ? cwd : process.cwd();
  for (const ref of lista) {
    if (!REFERENCIA.test(ref ?? '') || SEM_DOIS_PONTOS.test(ref)) throw new Error(`referência do git inválida: ${ref}`);
    try {
      git(['rev-parse', '-q', '--verify', `${ref}^{commit}`], pasta);
    } catch {
      const semMain = /^(origin\/)?main$/.test(ref) ? ' (crie a main pelo GitHub e traga com git pull, ver README)' : '';
      throw new Error(`a referência ${ref} não existe${semMain}`);
    }
  }
}

/** O diff de `base...head`, ou do HEAD para a árvore (`trabalho`). */
export function lerDiff({ base, head, trabalho = false, cwd = process.cwd() }) {
  let alvo = ['HEAD'];
  if (!trabalho) {
    conferirReferencias([base, head], cwd);
    alvo = [`${base}...${head}`];
  } else {
    conferirReferencias(['HEAD'], cwd);
  }
  const nomes = git([...FLAGS_DIFF, '--name-only', '-z', ...alvo, '--'], cwd).split('\0').filter(Boolean);
  const arquivos = juntarRenomes(interpretarDiff(git([...FLAGS_DIFF, ...alvo, '--'], cwd), nomes), git([...FLAGS_RENOMES, ...alvo, '--'], cwd));
  return trabalho ? [...arquivos, ...naoRastreados(cwd)] : arquivos;
}

// ---------- a configuração: a união da base com o head ----------

const porFonte = (lista) => new Map(lista.map((re) => [re.source, re]));
const uniao = (a, b) => [...new Map([...porFonte(a), ...porFonte(b)]).values()];
const intersecao = (a, b) => { const fb = porFonte(b); return a.filter((re) => fb.has(re.source)); };

/**
 * Soma o `revisao` de dois lados (`a` = a base, `b` = o head): gatilhos e listas somam, e tudo o que se ignora (o
 * `ignorar_conteudo` global e o `ignorar` de cada gatilho) só vale se os dois lados ignoram, para o branch não calar o
 * gatilho que ele mesmo afrouxou.
 */
export function unirRevisao(a, b) {
  const gatilhos = new Map(a.gatilhos.map((g) => [g.nome, g]));
  for (const g of b.gatilhos) {
    const x = gatilhos.get(g.nome);
    gatilhos.set(g.nome, x === undefined ? g : {
      nome: g.nome,
      revisores: [...new Set([...x.revisores, ...g.revisores])],
      caminhos: uniao(x.caminhos, g.caminhos),
      conteudo: uniao(x.conteudo, g.conteudo),
      ignorar: intersecao(x.ignorar, g.ignorar),
      remocoes: x.remocoes || g.remocoes,
      todo_arquivo: x.todo_arquivo || g.todo_arquivo,
      layout: x.layout && g.layout, // a marca afrouxa o gatilho: só vale se os dois lados a têm, como o `ignorar`
    });
  }
  return {
    sempre: [...new Set([...a.sempre, ...b.sempre])],
    grande: a.grande == null || b.grande == null ? (a.grande ?? b.grande ?? null) : { revisores: [...new Set([...a.grande.revisores, ...b.grande.revisores])], gatilhos: [...new Set([...a.grande.gatilhos, ...b.grande.gatilhos])] },
    comportamento: [...new Set([...a.comportamento, ...b.comportamento])],
    comportamento_caminhos: uniao(a.comportamento_caminhos, b.comportamento_caminhos),
    comportamento_ignorar: intersecao(a.comportamento_ignorar ?? [], b.comportamento_ignorar ?? []), // afrouxa a obrigação do qa: só vale nos dois lados
    ignorar: intersecao(a.ignorar, b.ignorar),
    gatilhos: [...gatilhos.values()],
  };
}

/** O `revisao` em `texto` (o conteúdo de um pipeline.json). Com `pisos` (o head), o que não lê ou não cumpre os pisos do código é erro; sem eles (a base), vira null. */
function revisaoDoTexto(texto, rotulo, pisos) {
  let revisao;
  try {
    revisao = JSON.parse(texto.replace(/^\uFEFF/, '')).revisao;
    const r = revisaoDeObjeto(revisao, { pisos });
    if (r.erro === null) return r.valor;
    if (pisos) throw new Error(r.erro);
  } catch (e) {
    if (pisos) throw new Error(`${ARQUIVO_NO_GIT} ${rotulo}: ${e instanceof Error ? e.message : e}${dicaDoBranchAntigo(revisao)}`);
  }
  return null;
}

/** O `revisao` sem um gatilho do piso do código, ou sem a regra `grande`, é de um branch que saiu antes dela: a saída é trazer a main. */
const dicaDoBranchAntigo = (revisao) => (Array.isArray(revisao?.gatilhos) && (revisao.grande === undefined || Object.keys(PISO_GATILHOS).some((nome) => !revisao.gatilhos.some((g) => g?.nome === nome)))
  ? ' (branch anterior à regra: traga a main (git merge main))' : '');

/** O texto do pipeline.json no git em `ref`, ou null se ele não existe lá. */
function textoNoGit(ref, cwd) {
  try {
    return git(['show', `${ref}:${ARQUIVO_NO_GIT}`], cwd);
  } catch {
    return null;
  }
}

/**
 * A regra do head somada à da base: o `pipeline.json` do git em `<head>` (com `trabalho`, o da árvore) e o do git na base.
 * Head que não cumpre os pisos do código, ou que não existe, é erro, não omissão; a base é lida sem os pisos.
 */
export function carregarRevisao({ base, head, trabalho = false, cwd = process.cwd() }) {
  const doDisco = join(cwd, ARQUIVO_NO_GIT);
  const textoHead = trabalho ? (existsSync(doDisco) ? readFileSync(doDisco, 'utf8') : null) : textoNoGit(head, cwd);
  if (textoHead === null) throw new Error(`${ARQUIVO_NO_GIT} não existe ${trabalho ? 'na árvore' : `em ${head}`}`);
  const atual = revisaoDoTexto(textoHead, trabalho ? 'da árvore' : `em ${head}`, true);
  const textoBase = textoNoGit(trabalho ? 'HEAD' : base, cwd);
  const antes = textoBase === null ? null : revisaoDoTexto(textoBase, 'da base', false);
  return antes === null ? atual : unirRevisao(antes, atual);
}

// ---------- a escolha ----------

/** `.sql` só com comentário mudado: ao menos 1 linha mudada, todas vazias ou começando por `--`. Perde só o caminho: não aciona gatilho por caminho, não conta como código nem para o `grande`; o conteúdo dele os gatilhos de conteúdo ainda leem. */
const soComentarioSql = (a) => /\.sql$/i.test(a.caminho) && !a.binario && a.linhas.length + a.removidas.length > 0
  && [...a.linhas, ...a.removidas].every(({ texto }) => { const t = texto.trim(); return t === '' || t.startsWith('--'); });

// Código: a extensão está na lista única do config.mjs, em qualquer lugar do repositório. As pastasDeTrabalho só valem para o binário.
const ehCodigo = (caminho) => ehArquivoDeCodigo(caminho);
const binarioEmPasta = (caminho, pastas) => !/\.md$/i.test(caminho) && pastas.some((re) => re.test(caminho));
// imagem, fonte, pdf e vídeo: binário esperado, sem texto a ler. Não contam como ilegíveis nem disparam gatilho de conteúdo.
const MIDIA = /\.(png|jpe?g|gif|webp|ico|avif|woff2?|ttf|otf|pdf|mp4|webm)$/i;
// documentação não dispara gatilho de caminho (docs/login.md não é o código de login), menos nestes três: eles cobrem os .md de .claude/ e o .html da tela de propósito.
const COBRE_DOCUMENTACAO = new Set(['config_pipeline', 'lgpd_regras', 'tela']);
// Texto (md, mdx, txt, rst) e o que se publica como documento (imagem, svg, pdf, html). A regra de print do confere-lgpd segue valendo para a imagem.
export const ehDocumentacao = (caminho) => /\.(md|mdx|txt|rst|png|jpe?g|gif|webp|svg|pdf|html)$/i.test(caminho);

// ---------- o layout ----------

// As propriedades do CSS que mexem no layout. Uma lista basta: a cor, a sombra e o resto não disparam o `tela`.
const PROPRIEDADE_DE_LAYOUT = /^(display|position|inset(-[a-z-]+)?|top|right|bottom|left|float|clear|z-index|(min-|max-)?(width|height|inline-size|block-size)|margin(-[a-z-]+)?|padding(-[a-z-]+)?|gap|row-gap|column-gap|grid(-[a-z-]+)?|flex(-[a-z-]+)?|order|align-[a-z-]+|justify-[a-z-]+|place-[a-z-]+|overflow(-[a-z-]+)?|aspect-ratio|box-sizing|font(-size)?|line-height|white-space|transform|visibility|text-align|word-break|overflow-wrap|text-overflow|object-fit)$/;
const REGRA_DE_LAYOUT = /@(media|container|supports)\b/i;
// A variável `--nome: valor` vale como layout quando o valor é um tamanho (unidade ou calc, clamp, min, max); a de cor não.
const VALOR_DE_TAMANHO = /\d(?:px|rem|em|%|vw|vh|vmin|vmax|ch|fr)(?![\w%])|\b(?:calc|clamp|min|max)\(/i;
const VALOR_DE_COR = /^(?:#|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color|color-mix)a?\()/i;

/** As declarações de layout de uma linha de CSS, como `propriedade: valor` normalizado (minúsculas, espaço único). */
function declaracoesDeLayout(texto) {
  const limpo = texto.replace(/\/\*.*?\*\//g, '');
  const achadas = [];
  for (const m of limpo.matchAll(/(?<![\w.#-])(--[\w-]+|[a-z][a-z-]*)\s*:\s*([^;{}]*)/gi)) {
    const propriedade = m[1].toLowerCase();
    const valor = m[2].replace(/\s+/g, ' ').trim().toLowerCase();
    const delayout = propriedade.startsWith('--') ? VALOR_DE_TAMANHO.test(valor) && !VALOR_DE_COR.test(valor) : PROPRIEDADE_DE_LAYOUT.test(propriedade);
    if (delayout) achadas.push(`${propriedade}: ${valor}`);
  }
  return achadas;
}

/** O valor de `nome=` (aspas ou chaves balanceadas, até o fim da linha) em cada ocorrência da linha de JSX/TSX. */
function atributosDoJsx(texto, nome) {
  const achados = [];
  for (const m of texto.matchAll(new RegExp(`(?<![\\w-])${nome}\\s*=\\s*`, 'g'))) {
    const inicio = m.index + m[0].length;
    const c = texto[inicio];
    let valor;
    if (c === '"' || c === "'") {
      const fim = texto.indexOf(c, inicio + 1);
      valor = texto.slice(inicio + 1, fim === -1 ? undefined : fim);
    } else if (c === '{') {
      let fundo = 0;
      let fim = texto.length;
      for (let i = inicio; i < texto.length; i += 1) {
        if (texto[i] === '{') fundo += 1;
        if (texto[i] === '}') fundo -= 1;
        if (fundo === 0) { fim = i + 1; break; }
      }
      valor = texto.slice(inicio, fim);
    } else {
      valor = texto.slice(inicio).split(/[\s>]/)[0];
    }
    achados.push(`${nome}=${valor.replace(/\s+/g, ' ').trim()}`);
  }
  return achados;
}

const ATRIBUTOS_DE_LAYOUT = ['className', 'style', 'width', 'height', 'sizes', 'fill', 'hidden', 'viewBox'];

/** O esqueleto de uma linha de JSX/TSX: as tags (`<Nome`, `</Nome`, `<>`, `</>`) e os valores dos `ATRIBUTOS_DE_LAYOUT`. O texto entre as tags fica de fora. */
function esqueletoDoJsx(texto) {
  const tags = [...texto.matchAll(/<(\/?)([A-Za-z][\w.:-]*|(?=>))/g)].map((m) => `<${m[1]}${m[2]}`);
  return [...tags, ...ATRIBUTOS_DE_LAYOUT.flatMap((nome) => atributosDoJsx(texto, nome))];
}

/** O seletor de uma linha de CSS: o que vem antes do `{` (a regra de uma linha só também), ou a linha que acaba em `,`; null se não é seletor nem tem `@`. */
function seletorDe(texto) {
  const x = texto.trim();
  if (x.startsWith('@')) return null;
  const i = x.indexOf('{');
  if (i !== -1) return x.slice(0, i).trim().replace(/\s+/g, ' ');
  return x.endsWith(',') ? x.replace(/\s+/g, ' ') : null;
}

/** A 1ª linha em que o multiconjunto das chaves removidas difere do das adicionadas (`{ n, removida }`), ou null se são iguais. */
function primeiraDiferenca(removidas, adicionadas) {
  const sobra = new Map();
  for (const { chave } of removidas) sobra.set(chave, (sobra.get(chave) ?? 0) + 1);
  for (const item of adicionadas) {
    if ((sobra.get(item.chave) ?? 0) > 0) sobra.set(item.chave, sobra.get(item.chave) - 1);
    else return { n: item.n, removida: false };
  }
  for (const item of removidas) {
    if ((sobra.get(item.chave) ?? 0) > 0) return { n: item.n, removida: true };
  }
  return null;
}

/** Por que um arquivo do gatilho `tela` (com `layout`) mudou o layout: `{ por, linha?, removida? }`, ou null se só mudou o que não é layout. */
function motivoDeLayout(a) {
  if (a.renomeadoPara !== undefined) return null; // quem carrega o renome é o arquivo novo
  if (a.status === 'A') return { por: 'arquivo novo' };
  if (a.status === 'D') return { por: 'arquivo apagado' };
  const removidas = [...a.removidas, ...(a.removidasDoOrigem ?? [])];
  const css = /\.(s?css)$/i.test(a.caminho);
  const jsx = /\.[jt]sx$/i.test(a.caminho);
  if (a.binario || (!css && !jsx)) return { por: 'o arquivo mudou e não há leitor de layout para ele' };
  if (css) {
    const regra = [...a.linhas, ...removidas].find((l) => REGRA_DE_LAYOUT.test(l.texto));
    if (regra !== undefined) return { por: 'layout no CSS: @media, @container ou @supports', linha: regra.n, removida: !a.linhas.includes(regra) };
  }
  const chaves = (linhas) => linhas.flatMap(({ n, texto }) => (css ? declaracoesDeLayout(texto) : esqueletoDoJsx(texto)).map((chave) => ({ n, chave })));
  // o CSS se compara hunk a hunk: a declaração de layout que muda de lugar entre dois seletores mexe no layout, e o conjunto do arquivo inteiro não a veria
  const partes = css && a.removidasDoOrigem === undefined && a.hunks !== undefined ? a.hunks : [{ linhas: a.linhas, removidas }];
  const diferenca = partes.map((h) => primeiraDiferenca(chaves(h.removidas), chaves(h.linhas))).find((d) => d !== null) ?? null;
  if (diferenca === null && css) {
    // o seletor trocado (uma linha de seletor foi adicionada ou removida) com declaração de layout nas linhas mudadas
    const seletores = (linhas) => linhas.flatMap(({ n, texto }) => { const chave = seletorDe(texto); return chave === null ? [] : [{ n, chave }]; });
    const trocado = primeiraDiferenca(seletores(removidas), seletores(a.linhas));
    if (trocado !== null && (chaves(removidas).length > 0 || chaves(a.linhas).length > 0)) return { por: 'layout no CSS: seletor trocado com declaração de layout', linha: trocado.n, removida: trocado.removida };
  }
  if (diferenca === null) return null;
  return { por: css ? 'layout no CSS: declaração de layout mudou' : 'layout no JSX: tag, className ou style mudou', linha: diferenca.n, removida: diferenca.removida };
}

/** Os motivos pelos quais o gatilho dispara no diff (nunca repete o trecho achado: pode ser dado pessoal). */
function motivosDoGatilho(g, arquivos, ignorar, pastas) {
  const motivos = [];
  for (const a of arquivos) {
    const soComentario = soComentarioSql(a);
    if (!soComentario && g.caminhos.some((re) => re.test(a.caminho)) && (COBRE_DOCUMENTACAO.has(g.nome) || !ehDocumentacao(a.caminho))) {
      if (!g.layout) motivos.push({ gatilho: g.nome, arquivo: a.caminho, por: 'caminho' });
      else {
        const l = motivoDeLayout(a);
        if (l !== null) motivos.push({ gatilho: g.nome, arquivo: a.caminho, ...(l.linha === undefined ? {} : { linha: l.linha }), por: l.removida ? `${l.por}, linha removida` : l.por });
      }
    }
    if (g.conteudo.length === 0) continue;
    if (!g.todo_arquivo && [...ignorar, ...g.ignorar].some((re) => re.test(a.caminho))) continue;
    if (a.binario && MIDIA.test(a.caminho)) continue;
    if (a.binario && !g.todo_arquivo && binarioEmPasta(a.caminho, pastas)) motivos.push({ gatilho: g.nome, arquivo: a.caminho, por: 'binário: não dá para ler o conteúdo' });
    const olhar = (linhas, sufixo) => {
      for (const { n, texto } of linhas) {
        const re = g.conteudo.find((r) => r.test(texto));
        if (re !== undefined) motivos.push({ gatilho: g.nome, arquivo: a.caminho, linha: n, por: `conteudo /${re.source}/${sufixo}`, ...(soComentario ? { soComentario: true } : {}) });
      }
    };
    olhar(a.linhas, '');
    if (g.remocoes) olhar(a.removidas, ', linha removida');
  }
  return motivos;
}

const PREFIXO_APP = /^(?:(?:apps\/[^/]+\/)?(?:src\/)?app)\//;

/** A rota de um arquivo de `app/` (ou `src/app/`, `apps/<nome>/app/`): o 1º segmento de pasta fora dos grupos `(…)`; em `api/`, os dois primeiros; solto em `app/`, `/`. */
export function rotaDe(caminho) {
  const semPrefixo = caminho.replace(PREFIXO_APP, '');
  const pastas = semPrefixo.split('/').slice(0, -1).filter((p) => !/^\(.*\)$/.test(p));
  if (pastas.length === 0) return '/';
  return pastas[0] === 'api' ? pastas.slice(0, 2).join('/') : pastas[0];
}

/** Os motivos de a mudança ser grande: um gatilho da regra disparou, o diff toca 2 rotas de `app/` ou mais, ou um `AGENTS.md` foi criado. */
function motivosDaMudancaGrande(grande, dosGatilhos, arquivos, pastas) {
  const motivos = [];
  for (const nome of grande.gatilhos) {
    const primeiro = dosGatilhos.get(nome)?.find((m) => m.soComentario !== true && m.por !== 'binário: não dá para ler o conteúdo'); // o .sql só de comentário e o binário genérico não contam para o grande
    if (primeiro !== undefined) motivos.push({ gatilho: 'grande', arquivo: primeiro.arquivo, por: `o gatilho ${nome} disparou em ${onde(primeiro)}` });
  }
  const doApp = arquivos.filter((a) => PREFIXO_APP.test(a.caminho) && !/\.md$/i.test(a.caminho));
  const rotas = [...new Set(doApp.map((a) => rotaDe(a.caminho)))];
  if (rotas.length >= 2) motivos.push({ gatilho: 'grande', arquivo: doApp[0].caminho, por: `toca ${rotas.length} rotas de app/: ${rotas.slice(0, 5).join(', ')}${rotas.length > 5 ? ', ...' : ''}` });
  const pastaDe = (caminho) => caminho.slice(0, caminho.lastIndexOf('/') + 1);
  for (const a of arquivos) {
    const criado = a.status === 'A' || (a.renomeadoDe !== undefined && pastaDe(a.renomeadoDe) !== pastaDe(a.caminho));
    if (criado && /(^|\/)AGENTS\.md$/.test(a.caminho) && pastas.some((re) => re.test(a.caminho))) motivos.push({ gatilho: 'grande', arquivo: a.caminho, por: `${a.caminho} ${a.status === 'A' ? 'criado' : 'trocou de pasta'} (pasta de trabalho nova)` });
  }
  return motivos;
}

/**
 * O confere-lgpd nas linhas novas do diff: todo achado ativo (não suprimido), o aviso médio inclusive, chama o revisor-lgpd.
 * O texto é o das linhas adicionadas juntas (a linha do achado volta ao número da linha no arquivo); o trecho achado nunca sai daqui.
 * O binário (a mídia inclusive) roda o varrer com "\0": só as regras de caminho e de binário do confere-lgpd, sem gatilho de conteúdo.
 */
function motivosDoConfereLgpd(arquivos) {
  if (!regrasCarregaram()) throw new Error('as regras do confere-lgpd não carregaram (lgpd-regras.mjs ou config.mjs quebrado): sem elas a revisão de LGPD não vale');
  const motivos = [];
  for (const a of arquivos) {
    if (!a.binario && a.linhas.length === 0) continue;
    // só a remoção (D) não tem o que revisar; a adicionada, a mudada e a renomeada (git mv publica o print em outro lugar) custam uma revisão, de propósito
    if (a.binario && (a.status === 'D' || a.renomeadoPara !== undefined)) continue;
    // o binário não tem linha a ler: o "\0" faz o varrer aplicar só as regras de caminho e de binário (a imagem nova cai na de print)
    const achados = a.binario ? varrer('\0', a.caminho) : varrer(a.linhas.map((l) => l.texto).join('\n'), a.caminho);
    for (const achado of achados) {
      if (achado.suprimido) continue;
      const linha = a.binario ? undefined : a.linhas[Math.min(achado.linha, a.linhas.length) - 1].n;
      motivos.push({ gatilho: 'confere-lgpd', arquivo: a.caminho, ...(linha === undefined ? {} : { linha }), por: achado.regra.id });
    }
  }
  return motivos;
}

const itemDe = (nome, motivos, { agentes, niveis }) => {
  const onde = localizar(agentes, niveis, nome);
  if (onde === undefined) throw new Error(`revisor ${nome} não existe em agentes nem em niveis do pipeline.json`);
  return { nome, nivel: par((onde.secao === 'agentes' ? agentes : niveis)[onde.chave]), motivos };
};

/** Todo revisor citado em `sempre`, `comportamento`, `grande` e nos gatilhos existe em `agentes` ou `niveis` (erro de digitação não vira omissão). */
export function conferirRevisores(revisao, { agentes, niveis }) {
  const nomes = [
    ['sempre', revisao.sempre],
    ['comportamento', revisao.comportamento],
    ...(revisao.grande == null ? [] : [['grande', revisao.grande.revisores]]),
    ...revisao.gatilhos.map((g) => [`gatilho ${g.nome}`, g.revisores]),
  ];
  for (const [onde, lista] of nomes) {
    for (const nome of lista) if (localizar(agentes, niveis, nome) === undefined) throw new Error(`revisor ${nome} (${onde}) não existe em agentes nem em niveis do pipeline.json`);
  }
}

/**
 * Aplica `revisao` ao diff. Devolve `{ esforco, obrigatorios, condicionais, dispensados, semEfeito, codigo }`; cada revisor tem `nome`,
 * `nivel` ("modelo:esforço"), `motivos` (no máximo 3) e `total`. O `qa` é obrigatório quando o diff toca
 * `comportamento_caminhos` (ou com `comportamento`), fica condicional no resto do código e sai com `semComportamento`
 * (o motivo vai para `dispensados`). `semTela` tira só o `revisor-tela`, do mesmo jeito. Opção que não tirou nada
 * (sem tela no diff, ou sem código) vai para `semEfeito`. O `esforco` (`rapido`, `medio` padrão ou `alto`) filtra
 * por último: `medio` dispensa `revisor-arquitetura` e `revisor-lgpd`; `rapido` dispensa todos os revisores e o `qa`.
 */
export function escolher(todos, cfg, { comportamento = false, semComportamento, semTela, esforco = ESFORCO_PADRAO } = {}) {
  if (!ESFORCOS_PIPELINE.has(esforco)) throw new Error(`esforço do pipeline inválido: ${esforco} (use rapido, medio ou alto)`);
  const { revisao, pastas } = cfg;
  conferirRevisores(revisao, cfg);
  const arquivos = todos.filter((a) => !soComentarioSql(a)); // o que conta como código e como mudança grande
  const codigo = arquivos.filter((a) => ehCodigo(a.caminho));
  const porNome = new Map();
  const juntar = (nome, motivos) => {
    const item = porNome.get(nome) ?? itemDe(nome, [], cfg);
    item.motivos.push(...motivos);
    porNome.set(nome, item);
  };
  if (codigo.length > 0) {
    for (const nome of revisao.sempre) juntar(nome, [{ gatilho: 'sempre', arquivo: codigo[0].caminho, por: `código mudou (${codigo.length} arquivo${codigo.length === 1 ? '' : 's'})` }]);
  }
  const dosGatilhos = new Map();
  for (const g of revisao.gatilhos) {
    const motivos = motivosDoGatilho(g, todos, revisao.ignorar, pastas);
    dosGatilhos.set(g.nome, motivos);
    if (motivos.length > 0) for (const nome of g.revisores) juntar(nome, motivos);
  }
  const doConfereLgpd = motivosDoConfereLgpd(todos);
  if (doConfereLgpd.length > 0) juntar('revisor-lgpd', doConfereLgpd);
  if (revisao.grande != null) {
    const grande = motivosDaMudancaGrande(revisao.grande, dosGatilhos, arquivos, pastas);
    if (grande.length > 0) for (const nome of revisao.grande.revisores) juntar(nome, grande);
  }
  const resumir = (r) => ({ ...r, total: r.motivos.length, motivos: r.motivos.slice(0, MAX_MOTIVOS) });
  const obrigatorios = [...porNome.values()].map(resumir);
  const condicionais = [];
  const dispensados = [];
  const semEfeito = [];
  if (semTela !== undefined) {
    const i = obrigatorios.findIndex((r) => r.nome === 'revisor-tela');
    if (i !== -1) dispensados.push({ nome: obrigatorios.splice(i, 1)[0].nome, motivo: semTela });
    else semEfeito.push({ nome: 'revisor-tela', opcao: '--sem-tela' });
  }
  if (semComportamento !== undefined && codigo.length === 0) for (const nome of revisao.comportamento) semEfeito.push({ nome, opcao: '--sem-comportamento' });
  if (codigo.length > 0) {
    const tocado = codigo.find((a) => revisao.comportamento_caminhos.some((re) => re.test(a.caminho)) && !(revisao.comportamento_ignorar ?? []).some((re) => re.test(a.caminho)));
    for (const nome of revisao.comportamento) {
      if (semComportamento !== undefined) {
        dispensados.push({ nome, motivo: semComportamento });
        continue;
      }
      const por = tocado !== undefined ? `toca ${tocado.caminho}` : comportamento ? 'pedido com --comportamento' : 'o comportamento mudou (feature, bug ou fase)';
      const item = resumir(itemDe(nome, [{ gatilho: 'comportamento', arquivo: (tocado ?? codigo[0]).caminho, por }], cfg));
      (tocado !== undefined || comportamento ? obrigatorios : condicionais).push(item);
    }
  }
  if (esforco === 'rapido') {
    const bloqueados = [
      ...[...GATILHOS_BLOQUEADOS_NO_RAPIDO].filter((nome) => (dosGatilhos.get(nome)?.length ?? 0) > 0),
      ...(doConfereLgpd.length > 0 ? ['confere-lgpd'] : []),
    ];
    if (bloqueados.length > 0) {
      throw new Error(`esforço rapido não é permitido quando o diff aciona gatilho de risco (${[...new Set(bloqueados)].join(', ')}): use medio ou alto (D64)`);
    }
    for (const r of [...obrigatorios.splice(0), ...condicionais.splice(0)]) dispensados.push({ nome: r.nome, motivo: 'esforço rapido (D64)' });
  } else if (esforco === 'medio') {
    for (let i = 0; i < obrigatorios.length; i += 1) {
      if (FORA_DO_MEDIO.has(obrigatorios[i].nome)) {
        dispensados.push({ nome: obrigatorios.splice(i, 1)[0].nome, motivo: 'esforço medio (D64)' });
        i -= 1;
      }
    }
  }
  return { esforco, obrigatorios, condicionais, dispensados, semEfeito, codigo: codigo.length };
}

const onde = (m) => (m.linha === undefined ? m.arquivo : `${m.arquivo}:${m.linha}`);
const motivo = (m) => (['sempre', 'grande', 'comportamento'].includes(m.gatilho) ? `${m.gatilho}: ${m.por}` : m.gatilho === 'confere-lgpd' ? `confere-lgpd: ${m.por} (${onde(m)})` : `gatilho ${m.gatilho}: ${onde(m)} (${m.por})`);

/** O texto que o orquestrador lê. */
export function formatar(resultado, base, head) {
  const esforco = resultado.esforco ?? ESFORCO_PADRAO;
  const linhas = [`Revisores de ${base}..${head} (esforço ${esforco}): ${resultado.codigo} arquivo(s) de código.`];
  const bloco = (titulo, itens) => {
    linhas.push('', titulo);
    if (itens.length === 0) linhas.push('  (nenhum)');
    for (const r of itens) {
      linhas.push(`  - ${r.nome}  ${r.nivel}`);
      for (const m of r.motivos) linhas.push(`      ${motivo(m)}`);
      if (r.total > r.motivos.length) linhas.push(`      e mais ${r.total - r.motivos.length} motivo(s)`);
    }
  };
  bloco('Obrigatórios (lance todos; pode acrescentar, nunca tirar):', resultado.obrigatorios);
  if (resultado.condicionais.length > 0) bloco('Se o comportamento mudou (--comportamento os torna obrigatórios):', resultado.condicionais);
  if (resultado.dispensados.length > 0) {
    linhas.push('', 'Dispensado (--esforco, --sem-comportamento ou --sem-tela; o motivo vai para o relatório):');
    for (const d of resultado.dispensados) linhas.push(`  - ${d.nome}: ${d.motivo}`);
  }
  for (const s of resultado.semEfeito) linhas.push('', `${s.nome} não era obrigatório: ${s.opcao} sem efeito`);
  return linhas.join('\n');
}

// ---------- linha de comando ----------

/** O esforço em `env.PIPELINE_ESFORCO` ou gravado em `.claude/estado/esforco` na pasta `cwd`, ou o padrão (`medio`) se ausente/vazio. */
export function lerEsforcoDaPasta(cwd = process.cwd(), env = process.env) {
  const daEnv = typeof env?.PIPELINE_ESFORCO === 'string' ? env.PIPELINE_ESFORCO.trim().toLowerCase() : '';
  if (daEnv !== '') {
    if (!ESFORCOS_PIPELINE.has(daEnv)) throw new Error(`PIPELINE_ESFORCO inválido: "${daEnv}" (use rapido, medio ou alto)`);
    return daEnv;
  }
  const arquivo = join(cwd, ARQUIVO_ESFORCO);
  if (!existsSync(arquivo)) return ESFORCO_PADRAO;
  const texto = readFileSync(arquivo, 'utf8').trim().toLowerCase();
  if (texto === '') return ESFORCO_PADRAO;
  if (!ESFORCOS_PIPELINE.has(texto)) throw new Error(`${ARQUIVO_ESFORCO} inválido: "${texto}" (use rapido, medio ou alto)`);
  return texto;
}

function opcoes(argv) {
  const o = { posicionais: [], comportamento: false, json: false, trabalho: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--comportamento') o.comportamento = true;
    else if (a === '--json') o.json = true;
    else if (a === '--trabalho') o.trabalho = true;
    else if (a === '--esforco') {
      const valor = argv[i + 1]?.trim().toLowerCase();
      if (valor === undefined || valor.startsWith('--') || !ESFORCOS_PIPELINE.has(valor)) {
        throw new Error('--esforco pede rapido, medio ou alto');
      }
      o.esforco = valor;
      i += 1;
    } else if (a === '--sem-comportamento' || a === '--sem-tela') {
      const motivo = argv[i + 1];
      if (motivo === undefined || motivo.startsWith('--') || motivo.trim() === '') throw new Error(`${a} pede o motivo: ${a} "<motivo>"`);
      o[a === '--sem-tela' ? 'semTela' : 'semComportamento'] = motivo;
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`);
    else o.posicionais.push(a);
  }
  return o;
}

function principal(argv) {
  const o = opcoes(argv);
  const [base, head] = o.posicionais;
  if (!o.trabalho && (base === undefined || head === undefined || o.posicionais.length > 2)) {
    throw new Error('uso: node .claude/hooks/escolhe-revisores.mjs <base> <head> | --trabalho [--esforco rapido|medio|alto] [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]');
  }
  const esforco = o.esforco ?? lerEsforcoDaPasta();
  const lidos = { agentes: lerAgentes(), niveis: lerNiveis(), pastas: lerPastas() };
  for (const r of Object.values(lidos)) if (r.erro !== null) throw new Error(r.erro);
  conferirReferencias(o.trabalho ? ['HEAD'] : [base, head]);
  const revisao = carregarRevisao({ base, head, trabalho: o.trabalho });
  const cfg = { agentes: lidos.agentes.valor, niveis: lidos.niveis.valor, pastas: lidos.pastas.valor, revisao };
  const resultado = escolher(lerDiff({ base, head, trabalho: o.trabalho }), cfg, { comportamento: o.comportamento, semComportamento: o.semComportamento, semTela: o.semTela, esforco });
  console.log(o.json ? JSON.stringify(resultado, null, 2) : formatar(resultado, o.trabalho ? 'HEAD' : base, o.trabalho ? 'árvore' : head));
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

if (mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(`escolhe-revisores: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 2;
  }
}
