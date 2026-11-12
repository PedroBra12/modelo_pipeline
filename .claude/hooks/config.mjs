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

/**
 * O que é código: as extensões, numa lista só. O marca-alterado (portão), o confere-docs (AGENTS.md) e o escolhe-revisores
 * (revisão) usam esta. Vale em qualquer lugar do repositório; as pastasDeTrabalho só decidem onde se exige o AGENTS.md.
 */
export const EXTENSOES_DE_CODIGO = [
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'sql', 'json',
  'py', 'go', 'rs', 'rb', 'java', 'kt', 'cs', 'php', 'vue', 'svelte', 'css', 'scss', 'html', 'sh', 'yml', 'yaml', 'toml', 'prisma',
];
const CODIGO = new RegExp(`\\.(${EXTENSOES_DE_CODIGO.join('|')})$`, 'i');
// o lockfile é gerado pelo gerenciador de pacotes e não tem o que revisar: não é código (o package.json é)
const LOCKFILE = /(^|[\\/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i;
/** O caminho (ou nome) é de um arquivo de código? */
export const ehArquivoDeCodigo = (caminho) => CODIGO.test(caminho) && !LOCKFILE.test(caminho);

const REPOSITORIO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SCRIPT = /^[A-Za-z0-9_][A-Za-z0-9_:.-]*$/; // vai para `npm run`, num shell: só nome de script

/** O resultado de uma leitura: `{ valor, erro }`, com um e só um dos dois preenchido. O papeis.mjs usa o mesmo. */
export const ok = (valor) => ({ valor, erro: null });
export const falha = (erro) => ({ valor: null, erro });
const mensagem = (e) => (e instanceof Error ? e.message : String(e));

/** O objeto do arquivo, ou o motivo de não ter sido lido. */
export function lerObjeto(arquivo) {
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

// --- Revisão e ajuste (D2). O par modelo/esforço de agentes e níveis, a escada, os pisos e os tetos moram no pipeline.json e só o
// papeis.mjs os lê (D11); aqui ficam os gatilhos, a revisão, o ajuste e o que só se cobre no código. ---

/**
 * Os agentes que saíram do pipeline (D34: `revisor-lgpd`). As sessões antigas em `docs/pipeline/sessoes/` os citam, e o
 * `ajusta-pipeline` segue lendo todas: o nome aposentado é histórico, não erro de digitação, e não entra na conta.
 */
export const APOSENTADOS = new Set(['revisor-lgpd']);
/** A supressão de um achado do `confere-lgpd` (`lgpd-ignora: <regra> -- <motivo>`): o `confere-lgpd` e o gatilho `lgpd_ignora` usam esta mesma regex. */
export const SUPRESSAO = /lgpd-ignora:\s*([\w ,]+?)\s*--\s*\S.{9,}/;
/**
 * O mínimo de cada gatilho: o JSON pode somar, nunca tirar. `remocoes` e `todo_arquivo` são obrigatórios onde estão; um
 * `ignorar` (do gatilho ou o global) que case com um dos `exemplos` de um gatilho de conteúdo cala o gatilho e é recusado.
 * O projeto que adotar o modelo soma aqui, e no pipeline.json, os caminhos e os conteúdos dele (pastas de rotas, de permissão, de dados).
 */
export const PISO_GATILHOS = {
  permissao: { revisores: ['revisor-seguranca'], caminhos: ['(^|/)(auth[\\w-]*|middleware|proxy)(/|\\.)'], conteudo: ['security\\s+definer', '\\bgrant\\b'], remocoes: true, exemplos: ['src/x/servidor.ts', 'src/api/x/route.ts', 'src/x/dados.ts'] },
  dado_pessoal: { revisores: ['revisor-seguranca'], caminhos: [], conteudo: ['cpf', 'e_?mail', 'celular', 'nascimento', 'telefone'], remocoes: true, exemplos: ['db/migrations/x.sql', 'src/x/dados.ts'] },
  banco: { revisores: ['revisor-seguranca'], caminhos: ['\\.sql$'], conteudo: ['\\bwhere\\s*:\\s*(\\{|\\(|(eq|and|or|not|inArray|sql)\\b)', '(^\\s*|\\)\\s*|\\b(db|knex|trx|tx|qb|q|query|builder|sb|supabase|client)\\s*)\\.where\\(\\s*[\'"`{(\\w]'], remocoes: true, exemplos: ['db/migrations/20260101000000_x.sql', 'src/x/dados.ts'] },
  config_pipeline: { revisores: ['revisor-seguranca', 'revisor-arquitetura'], caminhos: ['^\\.claude/(pipeline\\.json|agents/|hooks/|settings(\\.local)?\\.json|skills/pipeline/|skills/adjust-pipeline/)', '^CLAUDE\\.md$', '^\\.claude/commands/', '^\\.claude/skills/impeccable/', '^\\.claude/skills/(pick-ui-library|break-ui|mobile-native|emil-design-eng)/'], conteudo: [], exemplos: ['.claude/pipeline.json'] },
  rede_rota: { revisores: ['revisor-seguranca'], caminhos: ['(^|/)api/', '(^|/)route\\.[cm]?[jt]sx?$'], conteudo: ['[\'"]use server[\'"]', 'fetch\\('], remocoes: true, exemplos: ['src/x/servidor.ts', 'src/api/x/route.ts', 'src/app/x/route.ts'] },
  lgpd_ignora: { revisores: ['revisor-seguranca'], caminhos: [], conteudo: [SUPRESSAO.source], todo_arquivo: true, exemplos: [] },
  lgpd_regras: { revisores: ['revisor-seguranca'], caminhos: ['^\\.claude/hooks/(lgpd-regras|confere-lgpd)', '^\\.claude/hooks/config\\.mjs$', '^docs/(decisoes|arquitetura)\\.md$', '^CLAUDE\\.md$'], conteudo: ['legadoAte'], remocoes: true, exemplos: ['.claude/hooks/lgpd-regras.mjs'] },
  tela: { revisores: ['revisor-tela'], caminhos: ['^(apps|packages|src)/(?!.*\\.(test|spec|stories)\\.).+\\.(jsx|tsx|vue|svelte|css|scss|html)$'], conteudo: [], exemplos: ['src/x/Tela.jsx'] },
};
/** O mínimo de `sempre` (vazio desde a D60), `comportamento` e dos caminhos que tornam o `qa` obrigatório. */
export const PISO_REVISAO = { sempre: [], comportamento: ['qa'], comportamento_caminhos: ['^(apps|packages|src)/'] };
/**
 * A regra da mudança grande (D60): os revisores e os gatilhos (por nome) que a disparam. O JSON pode somar a estes,
 * nunca tirar. As outras duas causas (2 rotas de `app/` ou mais, um `AGENTS.md` criado) moram no escolhe-revisores.mjs.
 */
export const PISO_GRANDE = { revisores: ['revisor-arquitetura', 'ponytail-review'], gatilhos: ['banco'] };

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const listaDeTextos = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string' && t !== '');
const regexOk = (lista) => lista.every((t) => { try { return new RegExp(t, 'i') instanceof RegExp; } catch { return false; } });

/** Exemplos de caminho de código (D63): nenhum `comportamento_ignorar` pode casar com um deles, senão o `qa` deixa de ser obrigatório em código. */
const EXEMPLOS_CODIGO = ['src/x/servidor.ts', 'src/api/x/route.ts', 'apps/web/src/x.tsx', 'packages/core/src/x.ts', 'db/migrations/20260101000000_x.sql'];

/** Um `ignorar` de gatilho é um prefixo de caminho literal (`^pasta/`): letras, dígitos, `_`, `/`, `-` e `\.`. */
const PREFIXO_LITERAL = /^\^(?:[\w/-]|\\\.)+$/;
const compila = (lista) => lista.map((t) => new RegExp(t, 'i'));
const faltam = (tem, minimo) => minimo.filter((m) => !tem.includes(m));

/**
 * O objeto `revisao` já com os regex compilados (flag i). Com `pisos` (padrão), confere o que o código exige: `sempre`
 * vazio ou não, `comportamento` e `grande` com o mínimo, cada gatilho mínimo presente e sem tirar revisor, caminho ou conteúdo mínimo.
 */
export function revisaoDeObjeto(r, { pisos = true } = {}) {
  if (!ehObjeto(r) || !listaDeTextos(r.sempre) || !listaDeTextos(r.comportamento) || !Array.isArray(r.gatilhos)) {
    return falha('revisao em .claude/pipeline.json tem de ter sempre e comportamento (listas de nomes) e gatilhos (lista)');
  }
  if (r.grande !== undefined && (!ehObjeto(r.grande) || !listaDeTextos(r.grande.revisores) || !listaDeTextos(r.grande.gatilhos))) {
    return falha('revisao.grande em .claude/pipeline.json tem de ter revisores e gatilhos (listas de nomes)');
  }
  const ignorar = r.ignorar_conteudo ?? [];
  const porCaminho = r.comportamento_caminhos ?? [];
  const semQa = r.comportamento_ignorar ?? [];
  if (!listaDeTextos(ignorar) || !regexOk(ignorar)) return falha('revisao.ignorar_conteudo tem de ser uma lista de regex válidas');
  if (!listaDeTextos(porCaminho) || !regexOk(porCaminho)) return falha('revisao.comportamento_caminhos tem de ser uma lista de regex válidas');
  if (!listaDeTextos(semQa) || !regexOk(semQa)) return falha('revisao.comportamento_ignorar tem de ser uma lista de regex válidas');
  const nomes = new Set();
  for (const g of r.gatilhos) {
    const ruim = !ehObjeto(g) || typeof g.nome !== 'string' || g.nome === '' || nomes.has(g.nome) || !listaDeTextos(g.revisores) || g.revisores.length === 0
      || !listaDeTextos(g.caminhos) || !listaDeTextos(g.conteudo) || !regexOk(g.caminhos) || !regexOk(g.conteudo)
      || !listaDeTextos(g.ignorar ?? []) || !regexOk(g.ignorar ?? []) || (g.layout !== undefined && typeof g.layout !== 'boolean') || (g.layout === true && g.nome !== 'tela');
    if (ruim) return falha(`revisao.gatilhos: gatilho inválido (${ehObjeto(g) ? g.nome : typeof g}): nome único, revisores (lista não vazia), caminhos, conteudo e ignorar (listas de regex válidas) e layout (verdadeiro ou falso; verdadeiro só no tela)`);
    nomes.add(g.nome);
  }
  if (pisos) {
    if (r.comportamento.length === 0) return falha('revisao.comportamento não pode ficar vazio');
    const sem = (lista, minimo, o) => { const f = faltam(lista, minimo); return f.length > 0 ? `${o} perdeu ${f.join(', ')}` : null; };
    const lookahead = [...ignorar, ...r.gatilhos.flatMap((g) => g.ignorar ?? [])].find((t) => t.includes('(?'));
    const semQaCala = EXEMPLOS_CODIGO.find((e) => compila(semQa).some((re) => re.test(e)));
    const problemas = [
      semQa.some((t) => t.includes('(?')) ? 'revisao.comportamento_ignorar não aceita (? (um lookahead cala quase tudo)' : null,
      semQaCala === undefined ? null : `revisao.comportamento_ignorar casa com ${semQaCala}, e o qa deixaria de ser obrigatório em código`,
      lookahead === undefined ? null : `ignorar e ignorar_conteudo não aceitam (? (um lookahead cala quase tudo e escapa da conferência): ${lookahead}`,
      ...r.gatilhos.flatMap((g) => (g.ignorar ?? []).filter((t) => !PREFIXO_LITERAL.test(t)).map((t) => `o gatilho ${g.nome}: ignorar tem de ser um prefixo de caminho literal (^pasta/), não ${t}`)),
      sem(r.sempre, PISO_REVISAO.sempre, 'revisao.sempre'),
      ...(r.grande === undefined ? ['revisao.grande falta'] : [
        sem(r.grande.revisores, PISO_GRANDE.revisores, 'revisao.grande: revisores'), sem(r.grande.gatilhos, PISO_GRANDE.gatilhos, 'revisao.grande: gatilhos'),
        ...r.grande.gatilhos.filter((n) => !r.gatilhos.some((g) => g.nome === n)).map((n) => `revisao.grande: o gatilho ${n} não existe em revisao.gatilhos`),
      ]),
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
    grande: r.grande === undefined ? null : { revisores: r.grande.revisores, gatilhos: r.grande.gatilhos },
    comportamento_caminhos: compila(porCaminho),
    comportamento_ignorar: compila(semQa),
    ignorar: compila(ignorar),
    gatilhos: r.gatilhos.map((g) => ({
      nome: g.nome, revisores: g.revisores, caminhos: compila(g.caminhos), conteudo: compila(g.conteudo), ignorar: compila(g.ignorar ?? []),
      remocoes: g.remocoes === true, todo_arquivo: g.todo_arquivo === true, layout: g.layout === true,
    })),
  });
}

/** Quem revisa o quê (ver `revisaoDeObjeto`), do arquivo. */
export function lerRevisao(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  return erro !== null ? falha(erro) : revisaoDeObjeto(dados.revisao);
}

/** A regra do ajuste: `janela` e `rodadas_altas`. A escada é do pipeline.json e só o papeis.mjs a lê (D11). */
export function lerAjuste(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const a = dados.ajuste;
  const inteiro = (v) => Number.isInteger(v) && v >= 1;
  if (!ehObjeto(a) || !inteiro(a.janela) || !inteiro(a.rodadas_altas)) {
    return falha('ajuste em .claude/pipeline.json tem de ter janela e rodadas_altas (inteiros)');
  }
  return ok({ janela: a.janela, rodadas_altas: a.rodadas_altas });
}

/** Acha o nome `nome` na configuração: `{ secao: 'agentes'|'niveis', chave }` ou undefined. `ponytail-review` é o `revisor` de um nível. */
export function localizar(agentes, niveis, nome) {
  if (Object.hasOwn(agentes, nome)) return { secao: 'agentes', chave: nome };
  const chave = Object.keys(niveis).find((k) => k === nome || niveis[k].revisor === nome);
  return chave === undefined ? undefined : { secao: 'niveis', chave };
}

/**
 * O legado do `confere-lgpd` é opcional: só existe com `"lgpd": { "legadoAte": "<sha>" }` no pipeline.json. O sha é o commit
 * a partir do qual o achado antigo não bloqueia (o texto de cada arquivo naquele commit). Sem a chave não há legado nenhum.
 */
export function legadoAteDoTexto(texto) {
  let dados;
  try {
    dados = JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch (e) {
    return falha(`lgpd.legadoAte: o pipeline.json não é JSON válido (${mensagem(e)})`);
  }
  const l = dados?.lgpd;
  if (l === undefined) return ok(null);
  if (!ehObjeto(l)) return falha('lgpd em .claude/pipeline.json tem de ser um objeto');
  if (l.legadoAte === undefined) return ok(null);
  if (typeof l.legadoAte !== 'string' || !/^[0-9a-f]{7,40}$/i.test(l.legadoAte)) return falha('lgpd.legadoAte em .claude/pipeline.json tem de ser o sha de um commit (7 a 40 caracteres hexadecimais)');
  return ok(l.legadoAte);
}

/** O `lgpd.legadoAte` do arquivo (ver `legadoAteDoTexto`). */
export function lerLegadoAte(arquivo = ARQUIVO) {
  try {
    return legadoAteDoTexto(readFileSync(arquivo, 'utf8'));
  } catch (e) {
    return falha(`não consegui ler ${arquivo}: ${mensagem(e)}`);
  }
}
