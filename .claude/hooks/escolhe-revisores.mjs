// Escolhe os revisores de uma mudança de forma mecânica (D2): lê o diff do git, aplica a seção `revisao` do
// .claude/pipeline.json e imprime os revisores obrigatórios, com modelo, esforço e o motivo (gatilho, arquivo, linha).
// O orquestrador lança exatamente esses; pode acrescentar um, com o motivo no relatório, nunca tirar.
// Uso: node .claude/hooks/escolhe-revisores.mjs <base> <head> | --trabalho
//        [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]
// `<base> <head>` compara do merge-base (base...head); `--trabalho` compara o HEAD com a árvore, inclusive o que ainda não foi commitado.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PISO_GATILHOS, lerAgentes, lerNiveis, lerPastas, localizar, par, revisaoDeObjeto } from './config.mjs';

const REFERENCIA = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}:-]*$/; // nunca começa com "-": não vira opção do git
const MAX_MOTIVOS = 3;
const ARQUIVO_NO_GIT = '.claude/pipeline.json';
const FLAGS_DIFF = ['-c', 'core.quotepath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/'];

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// ---------- o diff ----------

/**
 * O texto de `git diff -U0` vira `[{ caminho, binario, linhas, removidas }]` (linhas com o número da linha nova ou da velha).
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
      atual = { caminho: nomes[arquivos.length], binario: false, linhas: [], removidas: [] };
      arquivos.push(atual);
      noHunk = false;
    } else if (atual === undefined) {
      continue;
    } else if (linha.startsWith('@@')) {
      noHunk = true;
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(linha);
      velho = Number(m?.[1] ?? 0);
      novo = Number(m?.[2] ?? 0);
    } else if (!noHunk) {
      if (/^(Binary files |GIT binary patch)/.test(linha)) atual.binario = true;
    } else if (linha.startsWith('+')) {
      atual.linhas.push({ n: novo, texto: linha.slice(1) });
      novo += 1;
    } else if (linha.startsWith('-')) {
      atual.removidas.push({ n: velho, texto: linha.slice(1) });
      velho += 1;
    }
  }
  if (arquivos.length !== nomes.length) throw new Error(`o diff e a lista de nomes não batem (${arquivos.length} cabeçalhos, ${nomes.length} nomes)`);
  return arquivos;
}

/** Os arquivos novos ainda fora do git (ls-files --others) como se fossem inteiros adicionados. */
function naoRastreados(cwd) {
  return git(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean).map((caminho) => {
    const bruto = readFileSync(join(cwd, caminho));
    if (bruto.includes(0)) return { caminho, binario: true, linhas: [], removidas: [] };
    const linhas = bruto.toString('utf8').split('\n');
    if (linhas.at(-1) === '') linhas.pop();
    return { caminho, binario: false, linhas: linhas.map((texto, i) => ({ n: i + 1, texto })), removidas: [] };
  });
}

/** O diff de `base...head`, ou do HEAD para a árvore (`trabalho`). */
export function lerDiff({ base, head, trabalho = false, cwd = process.cwd() }) {
  let alvo = ['HEAD'];
  if (!trabalho) {
    for (const ref of [base, head]) if (!REFERENCIA.test(ref ?? '')) throw new Error(`referência do git inválida: ${ref}`);
    alvo = [`${base}...${head}`];
  }
  const nomes = git([...FLAGS_DIFF, '--name-only', '-z', ...alvo, '--'], cwd).split('\0').filter(Boolean);
  const arquivos = interpretarDiff(git([...FLAGS_DIFF, ...alvo, '--'], cwd), nomes);
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
    });
  }
  return {
    sempre: [...new Set([...a.sempre, ...b.sempre])],
    comportamento: [...new Set([...a.comportamento, ...b.comportamento])],
    comportamento_caminhos: uniao(a.comportamento_caminhos, b.comportamento_caminhos),
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

/** O `revisao` sem um gatilho do piso do código é de um branch que saiu antes da regra: a saída é trazer a main. */
const dicaDoBranchAntigo = (revisao) => (Array.isArray(revisao?.gatilhos) && Object.keys(PISO_GATILHOS).some((nome) => !revisao.gatilhos.some((g) => g?.nome === nome))
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

const ehCodigo = (caminho, pastas) => !/\.md$/i.test(caminho) && pastas.some((re) => re.test(caminho));

/** Os motivos pelos quais o gatilho dispara no diff (nunca repete o trecho achado: pode ser dado pessoal). */
function motivosDoGatilho(g, arquivos, ignorar, pastas) {
  const motivos = [];
  for (const a of arquivos) {
    if (g.caminhos.some((re) => re.test(a.caminho))) motivos.push({ gatilho: g.nome, arquivo: a.caminho, por: 'caminho' });
    if (g.conteudo.length === 0) continue;
    if (!g.todo_arquivo && [...ignorar, ...g.ignorar].some((re) => re.test(a.caminho))) continue;
    if (a.binario && !g.todo_arquivo && ehCodigo(a.caminho, pastas)) motivos.push({ gatilho: g.nome, arquivo: a.caminho, por: 'binário: não dá para ler o conteúdo' });
    const olhar = (linhas, sufixo) => {
      for (const { n, texto } of linhas) {
        const re = g.conteudo.find((r) => r.test(texto));
        if (re !== undefined) motivos.push({ gatilho: g.nome, arquivo: a.caminho, linha: n, por: `conteudo /${re.source}/${sufixo}` });
      }
    };
    olhar(a.linhas, '');
    if (g.remocoes) olhar(a.removidas, ', linha removida');
  }
  return motivos;
}

const itemDe = (nome, motivos, { agentes, niveis }) => {
  const onde = localizar(agentes, niveis, nome);
  if (onde === undefined) throw new Error(`revisor ${nome} não existe em agentes nem em niveis do pipeline.json`);
  return { nome, nivel: par((onde.secao === 'agentes' ? agentes : niveis)[onde.chave]), motivos };
};

/**
 * Aplica `revisao` ao diff. Devolve `{ obrigatorios, condicionais, dispensados, codigo }`; cada revisor tem `nome`,
 * `nivel` ("modelo:esforço"), `motivos` (no máximo 3) e `total`. O `qa` é obrigatório quando o diff toca
 * `comportamento_caminhos` (ou com `comportamento`), fica condicional no resto do código e sai com `semComportamento`
 * (o motivo vai para `dispensados`). `semTela` tira só o `revisor-tela`, do mesmo jeito (D3). Opção que não tirou nada
 * (sem tela no diff, ou sem código) vai para `semEfeito`.
 */
export function escolher(arquivos, cfg, { comportamento = false, semComportamento, semTela } = {}) {
  const { revisao, pastas } = cfg;
  const codigo = arquivos.filter((a) => ehCodigo(a.caminho, pastas));
  const porNome = new Map();
  const juntar = (nome, motivos) => {
    const item = porNome.get(nome) ?? itemDe(nome, [], cfg);
    item.motivos.push(...motivos);
    porNome.set(nome, item);
  };
  if (codigo.length > 0) {
    for (const nome of revisao.sempre) juntar(nome, [{ gatilho: 'sempre', arquivo: codigo[0].caminho, por: `código mudou (${codigo.length} arquivo${codigo.length === 1 ? '' : 's'})` }]);
  }
  for (const g of revisao.gatilhos) {
    const motivos = motivosDoGatilho(g, arquivos, revisao.ignorar, pastas);
    if (motivos.length > 0) for (const nome of g.revisores) juntar(nome, motivos);
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
    const tocado = codigo.find((a) => revisao.comportamento_caminhos.some((re) => re.test(a.caminho)));
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
  return { obrigatorios, condicionais, dispensados, semEfeito, codigo: codigo.length };
}

const onde = (m) => (m.linha === undefined ? m.arquivo : `${m.arquivo}:${m.linha}`);
const motivo = (m) => (m.gatilho === 'sempre' || m.gatilho === 'comportamento' ? `${m.gatilho}: ${m.por}` : `gatilho ${m.gatilho}: ${onde(m)} (${m.por})`);

/** O texto que o orquestrador lê. */
export function formatar(resultado, base, head) {
  const linhas = [`Revisores de ${base}..${head}: ${resultado.codigo} arquivo(s) de código.`];
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
    linhas.push('', 'Dispensado (--sem-comportamento ou --sem-tela; o motivo vai para o relatório):');
    for (const d of resultado.dispensados) linhas.push(`  - ${d.nome}: ${d.motivo}`);
  }
  for (const s of resultado.semEfeito) linhas.push('', `${s.nome} não era obrigatório: ${s.opcao} sem efeito`);
  return linhas.join('\n');
}

// ---------- linha de comando ----------

function opcoes(argv) {
  const o = { posicionais: [], comportamento: false, json: false, trabalho: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--comportamento') o.comportamento = true;
    else if (a === '--json') o.json = true;
    else if (a === '--trabalho') o.trabalho = true;
    else if (a === '--sem-comportamento' || a === '--sem-tela') {
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
    throw new Error('uso: node .claude/hooks/escolhe-revisores.mjs <base> <head> | --trabalho [--comportamento] [--sem-comportamento "<motivo>"] [--sem-tela "<motivo>"] [--json]');
  }
  const lidos = { agentes: lerAgentes(), niveis: lerNiveis(), pastas: lerPastas() };
  for (const r of Object.values(lidos)) if (r.erro !== null) throw new Error(r.erro);
  const revisao = carregarRevisao({ base, head, trabalho: o.trabalho });
  const cfg = { agentes: lidos.agentes.valor, niveis: lidos.niveis.valor, pastas: lidos.pastas.valor, revisao };
  const resultado = escolher(lerDiff({ base, head, trabalho: o.trabalho }), cfg, { comportamento: o.comportamento, semComportamento: o.semComportamento, semTela: o.semTela });
  console.log(o.json ? JSON.stringify(resultado, null, 2) : formatar(resultado, o.trabalho ? 'HEAD' : base, o.trabalho ? 'árvore' : head));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(`escolhe-revisores: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 2;
  }
}
