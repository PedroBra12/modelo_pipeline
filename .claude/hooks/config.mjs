// Lê e valida .claude/pipeline.json, a configuração dos hooks (o contrato está em AGENTS.md desta pasta).
// Funções puras de leitura: cada campo devolve { valor, erro }, com um e só um dos dois preenchido (o outro é null).
// Quem bloqueia (guarda-git, confere-push, confere-docs) trata o erro como recusa; o portao só avisa.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** O pipeline.json ao lado da pasta dos hooks (.claude/pipeline.json). */
export const ARQUIVO = join(dirname(fileURLToPath(import.meta.url)), '..', 'pipeline.json');
/** O valor de `repositorio` no modelo, até alguém configurar. */
export const MARCADOR = '<dono>/<repo>';
/** O começo da mensagem de quem recusa por falta de repositório configurado. */
export const CONFIGURE = 'configure o repositorio em .claude/pipeline.json';
export const PORTAO_PADRAO = 'checar:rapido';

const REPOSITORIO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SCRIPT = /^[A-Za-z0-9_][A-Za-z0-9_:.-]*$/; // vai para `npm run`, num shell: só nome de script

const ok = (valor) => ({ valor, erro: null });
const falha = (erro) => ({ valor: null, erro });
const mensagem = (e) => (e instanceof Error ? e.message : String(e));

/** O objeto do arquivo, ou o motivo de não ter sido lido. */
function lerObjeto(arquivo) {
  let bruto;
  try {
    bruto = readFileSync(arquivo, 'utf8');
  } catch (e) {
    return falha(`não consegui ler ${arquivo}: ${mensagem(e)}`);
  }
  let dados;
  try {
    dados = JSON.parse(bruto.replace(/^\uFEFF/, ''));
  } catch (e) {
    return falha(`.claude/pipeline.json não é JSON válido: ${mensagem(e)}`);
  }
  return typeof dados === 'object' && dados !== null && !Array.isArray(dados) ? ok(dados) : falha('.claude/pipeline.json tem de ser um objeto JSON');
}

/** `dono/repo` do GitHub. Marcador, ausente ou inválido: erro que começa com CONFIGURE. */
export function lerRepositorio(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(`${CONFIGURE} (${erro})`);
  const repo = dados.repositorio;
  if (repo === undefined) return falha(`${CONFIGURE} (o campo repositorio falta)`);
  if (repo === MARCADOR) return falha(CONFIGURE);
  if (typeof repo !== 'string' || !REPOSITORIO.test(repo)) return falha(`${CONFIGURE} (repositorio tem de ser dono/repo, sem URL)`);
  return ok(repo);
}

/** O nome do script do package.json que é o portão rápido. Ausente = checar:rapido. */
export function lerPortao(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const nome = dados.portaoRapido ?? PORTAO_PADRAO;
  return typeof nome === 'string' && SCRIPT.test(nome) ? ok(nome) : falha('portaoRapido em .claude/pipeline.json tem de ser o nome de um script do package.json');
}

/** As pastas de trabalho como RegExp[] (cada uma casa com o começo do caminho relativo, com "/"). */
export function lerPastas(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const lista = dados.pastasDeTrabalho;
  if (!Array.isArray(lista) || lista.length === 0 || lista.some((t) => typeof t !== 'string' || t === '')) {
    return falha('pastasDeTrabalho em .claude/pipeline.json tem de ser uma lista de regex (texto), com ao menos uma');
  }
  try {
    return ok(lista.map((t) => new RegExp(t)));
  } catch (e) {
    return falha(`pastasDeTrabalho em .claude/pipeline.json tem uma regex inválida: ${mensagem(e)}`);
  }
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A URL de push que vale: https ou ssh do GitHub para o `dono/repo`, com ou sem .git, sem caixa. */
export const urlDoRepositorio = (repo) => new RegExp(`^(https://github\\.com/|git@github\\.com:)${escapar(repo)}(\\.git)?$`, 'i');

// --- Agentes, níveis, revisão e ajuste: a fonte de modelo, esforço e revisores (D2). Os pisos moram aqui, no código:
// o JSON não os afrouxa, e o teto dos agentes fixos mora na guarda-agentes.mjs. ---

/** Do mais barato ao mais forte. O ajuste anda um degrau por vez nesta ordem. */
export const ESCADA = ['sonnet:low', 'sonnet:medium', 'sonnet:high', 'opus:high', 'opus:xhigh'];
/** O par mínimo que o ajuste automático respeita, por seção e nome. */
export const PISOS = {
  agentes: { 'revisor-seguranca': 'opus:high', 'revisor-arquitetura': 'sonnet:high', qa: 'sonnet:medium', 'revisor-tela': 'sonnet:medium' },
  niveis: { medio: 'sonnet:medium', 'codigo-seguranca': 'sonnet:high', 'revisao-ponytail': 'sonnet:medium' },
};
/** Os níveis de código: o `opus` só entra no `Plan` de uma decisão, então o JSON não os põe nele. */
export const NIVEIS_DE_CODIGO = ['medio', 'codigo-seguranca'];
/** O que não se ajusta: o par é exatamente este. */
export const FIXOS = {
  agentes: { 'leitor-docs': 'haiku:low', 'revisor-lgpd': 'opus:high' },
  niveis: { leve: 'sonnet:low', orquestracao: 'opus:xhigh', forte: 'opus:high' },
};
/** A supressão de um achado do `confere-lgpd` (`lgpd-ignora: <regra> -- <motivo>`): o `confere-lgpd` e o gatilho `lgpd_ignora` usam esta mesma regex. */
export const SUPRESSAO = /lgpd-ignora:\s*([\w ,]+?)\s*--\s*\S.{9,}/;
/**
 * O mínimo de cada gatilho: o JSON pode somar, nunca tirar. `remocoes` e `todo_arquivo` são obrigatórios onde estão; um
 * `ignorar` (do gatilho ou o global) que case com um dos `exemplos` de um gatilho de conteúdo cala o gatilho e é recusado.
 * O projeto que adotar o modelo soma aqui, e no pipeline.json, os caminhos e os conteúdos dele (pastas de rotas, de permissão, de dados).
 */
export const PISO_GATILHOS = {
  permissao: { revisores: ['revisor-seguranca'], caminhos: [], conteudo: ['security\\s+definer', '\\bgrant\\b'], remocoes: true, exemplos: ['src/x/servidor.ts', 'src/api/x/route.ts'] },
  dado_pessoal: { revisores: ['revisor-lgpd', 'revisor-seguranca'], caminhos: [], conteudo: ['\\bcpf\\b'], exemplos: ['src/x/servidor.ts', 'src/api/x/route.ts'] },
  banco: { revisores: ['revisor-seguranca'], caminhos: ['\\.sql$'], conteudo: [], remocoes: true, exemplos: ['db/migrations/20260101000000_x.sql'] },
  config_pipeline: { revisores: ['revisor-seguranca', 'revisor-arquitetura'], caminhos: ['^\\.claude/(pipeline\\.json|agents/|hooks/|settings(\\.local)?\\.json|skills/pipeline/|skills/adjust-pipeline/)'], conteudo: [], exemplos: ['.claude/pipeline.json'] },
  rede_rota: { revisores: ['revisor-seguranca'], caminhos: [], conteudo: ['fetch\\('], remocoes: true, exemplos: ['src/x/servidor.ts', 'src/api/x/route.ts'] },
  lgpd_ignora: { revisores: ['revisor-lgpd'], caminhos: [], conteudo: [SUPRESSAO.source], todo_arquivo: true, exemplos: [] },
  lgpd_regras: { revisores: ['revisor-lgpd'], caminhos: ['^\\.claude/hooks/(lgpd-regras|confere-lgpd)', '^\\.claude/hooks/config\\.mjs$', '^\\.claude/agents/revisor-lgpd\\.md$'], conteudo: [], exemplos: ['.claude/hooks/lgpd-regras.mjs'] },
  tela: { revisores: ['revisor-tela'], caminhos: ['^(apps|packages|src)/.+\\.(jsx|tsx|vue|svelte|css|scss|html)$'], conteudo: [], exemplos: ['src/x/Tela.jsx'] },
};
/** O mínimo de `sempre`, `comportamento` e dos caminhos que tornam o `qa` obrigatório. */
export const PISO_REVISAO = { sempre: ['revisor-arquitetura', 'ponytail-review'], comportamento: ['qa'], comportamento_caminhos: ['^(apps|packages|src)/'] };

const MODELOS = new Set(['opus', 'sonnet', 'haiku']);
const ESFORCOS = new Set(['low', 'medium', 'high', 'xhigh']);
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const listaDeTextos = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string' && t !== '');
const regexOk = (lista) => lista.every((t) => { try { return new RegExp(t, 'i') instanceof RegExp; } catch { return false; } });

/** O par "modelo:esforço" de uma entrada. */
export const par = (e) => `${e.model}:${e.effort}`;

/** Um piso fora da escada é erro de configuração do código (null quando está tudo na escada). */
export function conferirPisos(pisos = PISOS, escada = ESCADA) {
  for (const [secao, nomes] of Object.entries(pisos)) {
    for (const [nome, p] of Object.entries(nomes)) if (!escada.includes(p)) return `piso ${p} de ${secao}.${nome} está fora da escada`;
  }
  return null;
}

/** Lê a seção `nome` e confere os pisos e os fixos dela. */
function lerEntradas(nome, arquivo, comTools) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const secao = dados[nome];
  if (!ehObjeto(secao) || Object.keys(secao).length === 0) return falha(`${nome} em .claude/pipeline.json tem de ser um objeto com ao menos uma entrada`);
  for (const [chave, e] of Object.entries(secao)) {
    if (!/^[\w-]+$/.test(chave)) return falha(`${nome}.${chave}: nome inválido`);
    if (!ehObjeto(e) || !MODELOS.has(e.model) || !ESFORCOS.has(e.effort)) return falha(`${nome}.${chave}: model (opus, sonnet ou haiku) e effort (low a xhigh) são obrigatórios`);
    if (comTools && (typeof e.tools !== 'string' || e.tools.trim() === '')) return falha(`${nome}.${chave}: tools é obrigatório`);
    if (e.tarefa !== undefined && typeof e.tarefa !== 'string') return falha(`${nome}.${chave}: tarefa tem de ser texto`);
    if (nome === 'niveis' && NIVEIS_DE_CODIGO.includes(chave) && e.model !== 'sonnet') return falha(`niveis.${chave}: nível de código não usa ${e.model} (o opus só entra no Plan de uma decisão)`);
    if (!Object.hasOwn(PISOS[nome], chave) && !Object.hasOwn(FIXOS[nome], chave)) return falha(`${nome}.${chave}: nome desconhecido (os de ${nome} são ${[...Object.keys(PISOS[nome]), ...Object.keys(FIXOS[nome])].join(', ')})`);
  }
  for (const [chave, fixo] of Object.entries(FIXOS[nome])) {
    if (secao[chave] === undefined) return falha(`${nome}.${chave} falta no pipeline.json`);
    if (par(secao[chave]) !== fixo) return falha(`${nome}.${chave} é fixo em ${fixo}, e o pipeline.json diz ${par(secao[chave])}`);
  }
  for (const [chave, piso] of Object.entries(PISOS[nome])) {
    if (secao[chave] === undefined) return falha(`${nome}.${chave} falta no pipeline.json`);
    if (ESCADA.indexOf(par(secao[chave])) < ESCADA.indexOf(piso)) return falha(`${nome}.${chave} está em ${par(secao[chave])}, abaixo do piso ${piso}`);
  }
  return ok(secao);
}

/** Os agentes fixos de `.claude/agents/`: `{ nome: { model, effort, tools, tarefa } }`. */
export const lerAgentes = (arquivo = ARQUIVO) => lerEntradas('agentes', arquivo, true);
/** Os níveis dos subagentes comuns: `{ nome: { model, effort, tarefa, revisor? } }`. */
export const lerNiveis = (arquivo = ARQUIVO) => lerEntradas('niveis', arquivo, false);

/** Um `ignorar` de gatilho é um prefixo de caminho literal (`^pasta/`): letras, dígitos, `_`, `/`, `-` e `\.`. */
const PREFIXO_LITERAL = /^\^(?:[\w/-]|\\\.)+$/;
const compila = (lista) => lista.map((t) => new RegExp(t, 'i'));
const faltam = (tem, minimo) => minimo.filter((m) => !tem.includes(m));

/**
 * O objeto `revisao` já com os regex compilados (flag i). Com `pisos` (padrão), confere o que o código exige: `sempre`
 * e `comportamento` não vazios, cada gatilho mínimo presente e sem tirar revisor, caminho ou conteúdo mínimo.
 */
export function revisaoDeObjeto(r, { pisos = true } = {}) {
  if (!ehObjeto(r) || !listaDeTextos(r.sempre) || !listaDeTextos(r.comportamento) || !Array.isArray(r.gatilhos)) {
    return falha('revisao em .claude/pipeline.json tem de ter sempre e comportamento (listas de nomes) e gatilhos (lista)');
  }
  const ignorar = r.ignorar_conteudo ?? [];
  const porCaminho = r.comportamento_caminhos ?? [];
  if (!listaDeTextos(ignorar) || !regexOk(ignorar)) return falha('revisao.ignorar_conteudo tem de ser uma lista de regex válidas');
  if (!listaDeTextos(porCaminho) || !regexOk(porCaminho)) return falha('revisao.comportamento_caminhos tem de ser uma lista de regex válidas');
  const nomes = new Set();
  for (const g of r.gatilhos) {
    const ruim = !ehObjeto(g) || typeof g.nome !== 'string' || g.nome === '' || nomes.has(g.nome) || !listaDeTextos(g.revisores) || g.revisores.length === 0
      || !listaDeTextos(g.caminhos) || !listaDeTextos(g.conteudo) || !regexOk(g.caminhos) || !regexOk(g.conteudo)
      || !listaDeTextos(g.ignorar ?? []) || !regexOk(g.ignorar ?? []);
    if (ruim) return falha(`revisao.gatilhos: gatilho inválido (${ehObjeto(g) ? g.nome : typeof g}): nome único, revisores (lista não vazia), caminhos, conteudo e ignorar (listas de regex válidas)`);
    nomes.add(g.nome);
  }
  if (pisos) {
    if (r.sempre.length === 0 || r.comportamento.length === 0) return falha('revisao.sempre e revisao.comportamento não podem ficar vazios');
    const sem = (lista, minimo, o) => { const f = faltam(lista, minimo); return f.length > 0 ? `${o} perdeu ${f.join(', ')}` : null; };
    const lookahead = [...ignorar, ...r.gatilhos.flatMap((g) => g.ignorar ?? [])].find((t) => t.includes('(?'));
    const problemas = [
      lookahead === undefined ? null : `ignorar e ignorar_conteudo não aceitam (? (um lookahead cala quase tudo e escapa da conferência): ${lookahead}`,
      ...r.gatilhos.flatMap((g) => (g.ignorar ?? []).filter((t) => !PREFIXO_LITERAL.test(t)).map((t) => `o gatilho ${g.nome}: ignorar tem de ser um prefixo de caminho literal (^pasta/), não ${t}`)),
      sem(r.sempre, PISO_REVISAO.sempre, 'revisao.sempre'),
      sem(r.comportamento, PISO_REVISAO.comportamento, 'revisao.comportamento'),
      sem(porCaminho, PISO_REVISAO.comportamento_caminhos, 'revisao.comportamento_caminhos'),
      ...Object.entries(PISO_GATILHOS).flatMap(([nome, min]) => {
        const g = r.gatilhos.find((x) => x.nome === nome);
        if (g === undefined) return [`o gatilho ${nome} falta`];
        const ignoram = min.conteudo.length > 0 && min.todo_arquivo !== true ? [...compila(g.ignorar ?? []), ...compila(ignorar)] : [];
        const calado = min.exemplos.find((e) => ignoram.some((re) => re.test(e)));
        return [
          sem(g.revisores, min.revisores, `o gatilho ${nome}: revisores`), sem(g.caminhos, min.caminhos, `o gatilho ${nome}: caminhos`), sem(g.conteudo, min.conteudo, `o gatilho ${nome}: conteudo`),
          min.remocoes === true && g.remocoes !== true ? `o gatilho ${nome}: remocoes tem de ser true` : null,
          min.todo_arquivo === true && g.todo_arquivo !== true ? `o gatilho ${nome}: todo_arquivo tem de ser true` : null,
          calado === undefined ? null : `o gatilho ${nome}: um ignorar casa com ${calado}, e o gatilho ficaria calado`,
        ];
      }),
    ].filter(Boolean);
    if (problemas.length > 0) return falha(`revisao abaixo do piso do código: ${problemas.join('; ')}`);
  }
  return ok({
    sempre: r.sempre,
    comportamento: r.comportamento,
    comportamento_caminhos: compila(porCaminho),
    ignorar: compila(ignorar),
    gatilhos: r.gatilhos.map((g) => ({
      nome: g.nome, revisores: g.revisores, caminhos: compila(g.caminhos), conteudo: compila(g.conteudo), ignorar: compila(g.ignorar ?? []),
      remocoes: g.remocoes === true, todo_arquivo: g.todo_arquivo === true,
    })),
  });
}

/** Quem revisa o quê (ver `revisaoDeObjeto`), do arquivo. */
export function lerRevisao(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  return erro !== null ? falha(erro) : revisaoDeObjeto(dados.revisao);
}

/** A regra do ajuste: `janela`, `rodadas_altas` e a `escada` (do código). */
export function lerAjuste(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const a = dados.ajuste;
  const inteiro = (v) => Number.isInteger(v) && v >= 1;
  if (!ehObjeto(a) || !inteiro(a.janela) || !inteiro(a.rodadas_altas)) {
    return falha('ajuste em .claude/pipeline.json tem de ter janela e rodadas_altas (inteiros)');
  }
  const fora = conferirPisos();
  return fora === null ? ok({ janela: a.janela, rodadas_altas: a.rodadas_altas, escada: ESCADA }) : falha(fora);
}

/** Acha o nome `nome` na configuração: `{ secao: 'agentes'|'niveis', chave }` ou undefined. `ponytail-review` é o `revisor` de um nível. */
export function localizar(agentes, niveis, nome) {
  if (Object.hasOwn(agentes, nome)) return { secao: 'agentes', chave: nome };
  const chave = Object.keys(niveis).find((k) => k === nome || niveis[k].revisor === nome);
  return chave === undefined ? undefined : { secao: 'niveis', chave };
}
