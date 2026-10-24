// Autoanálise do pipeline (D2): lê as sessões de docs/pipeline/sessoes/ e os ajustes de docs/pipeline/ajustes/, faz a
// conta por revisor e por nível e diz o que descer (aplica sozinho, dentro dos pisos do config.mjs), o que subir
// (propõe; só se aplica com o "sim" do usuário) e que gatilho falta. A skill `adjust-pipeline` diz quando rodar. Uso:
//   node .claude/hooks/ajusta-pipeline.mjs [--relatorio] [--json] [--raiz <pasta>]
//   node .claude/hooks/ajusta-pipeline.mjs --aplicar-menos [--data AAAA-MM-DD] [--raiz <pasta>]
//   node .claude/hooks/ajusta-pipeline.mjs --aplicar-mais <alvo> [--data AAAA-MM-DD] [--raiz <pasta>]
//   node .claude/hooks/ajusta-pipeline.mjs --sincronizar-tabela [--raiz <pasta>]
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESCADA, FIXOS, PISOS, SUPRESSAO, lerAgentes, lerAjuste, lerNiveis, localizar, par } from './config.mjs';
import { varrer } from './confere-lgpd.mjs';
import { TETO } from './guarda-agentes.mjs';

const RAIZ_PADRAO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GRAVES = new Set(['critico', 'alto', 'must']);
const MEDIO_MAIS = new Set([...GRAVES, 'medio', 'should', 'defeito']);
const SEVERIDADES = new Set([...MEDIO_MAIS, 'baixo', 'nice']);
// `consulta`: subagente que só busca ou lê; o `tipo` dele é um nível (como o `leve`), não o nome do agente (`Explore`,
// `claude-code-guide`). Não conta como código nem leva modelo e esforço obrigatórios.
const PAPEIS = new Set(['codigo', 'revisor', 'qa', 'bug', 'integracao', 'consulta']);
const COM_CODIGO = new Set(['codigo', 'bug', 'integracao']);
const ACIONADO = new Set(['sempre', 'gatilho', 'julgamento']);
const MAX_TEXTO = 600;
const INICIO = '<!-- tabela-agentes:inicio (gerada por ajusta-pipeline.mjs --sincronizar-tabela; não edite) -->';
const FIM = '<!-- tabela-agentes:fim -->';
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const caminhos = (raiz) => ({
  config: join(raiz, '.claude', 'pipeline.json'),
  agentes: join(raiz, '.claude', 'agents'),
  skill: join(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md'),
  sessoes: join(raiz, 'docs', 'pipeline', 'sessoes'),
  ajustes: join(raiz, 'docs', 'pipeline', 'ajustes'),
});

/** A configuração que a conta usa. */
export function lerConfig(arquivo) {
  const lidos = { agentes: lerAgentes(arquivo), niveis: lerNiveis(arquivo), ajuste: lerAjuste(arquivo) };
  for (const r of Object.values(lidos)) if (r.erro !== null) throw new Error(r.erro);
  return Object.fromEntries(Object.entries(lidos).map(([k, r]) => [k, r.valor]));
}

/** O `id` (`secao.chave`) de um nome usado numa sessão, ou undefined. `ponytail-review` é o `revisor` de um nível. */
const idDe = (cfg, nome) => {
  const onde = localizar(cfg.agentes, cfg.niveis, nome);
  return onde === undefined ? undefined : `${onde.secao}.${onde.chave}`;
};

// ---------- sessões e ajustes ----------

const blocoJson = (texto, nome) => {
  const m = /```json\r?\n([\s\S]*?)\r?\n```/.exec(texto);
  if (m === null) throw new Error(`${nome}: sem o bloco json`);
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`${nome}: o bloco json não é JSON válido (${e.message})`);
  }
};

const lista = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string');
const numeroOuNulo = (v) => v === null || v === undefined || (typeof v === 'number' && v >= 0);

/**
 * Valida o bloco de uma sessão e devolve o objeto, ou lança com o que falta. Com `cfg`, todo nome (tipo, revisor,
 * escapou_de, visto_por, gatilho_falso, adiar) tem de existir no pipeline.json (erro de digitação não passa), e o bloco
 * passa pelas regras do confere-lgpd (sem dado pessoal nem supressão) e pelo limite de tamanho do texto. `unico` não se grava: é o achado sem `visto_por`.
 */
export function validarSessao(dados, nome, cfg) {
  const falta = (m) => { throw new Error(`${nome}: ${m}`); };
  const s = dados?.sessao;
  if (typeof s?.data !== 'string' || !DATA.test(s.data)) falta('sessao.data tem de ser AAAA-MM-DD');
  if (typeof s.assunto !== 'string' || s.assunto === '') falta('sessao.assunto falta');
  const o = s.orquestrador;
  if (typeof o?.model !== 'string' || o.model.trim() === '' || !(o.effort === null || (typeof o.effort === 'string' && o.effort.trim() !== ''))) {
    falta('sessao.orquestrador é obrigatório: { model, effort } em que o chat principal rodou (texto; o effort é texto ou null quando não deu para ler)');
  }
  if (!Array.isArray(dados.agentes)) falta('agentes tem de ser uma lista');
  for (const a of dados.agentes) {
    if (!PAPEIS.has(a?.papel)) falta(`agentes[].papel inválido (${a?.papel})`);
    if (typeof a.tipo !== 'string' || a.tipo === '') falta('agentes[].tipo falta');
    if (![a.tokens, a.minutos, a.rodadas].every(numeroOuNulo)) falta(`agentes[] ${a.tipo}: tokens, minutos e rodadas são números`);
    if (['revisor', 'qa'].includes(a.papel) && (typeof a.modelo !== 'string' || typeof a.esforco !== 'string')) falta(`agentes[] ${a.tipo}: o revisor e o qa levam modelo e esforco (o par em que rodaram)`);
  }
  if (!Array.isArray(dados.achados)) falta('achados tem de ser uma lista');
  for (const a of dados.achados) {
    if (typeof a?.revisor !== 'string' || !SEVERIDADES.has(a.severidade)) falta(`achados[] inválido (${a?.revisor}, ${a?.severidade}): revisor e severidade são obrigatórios`);
    for (const campo of ['escapou_de', 'nao_rodou', 'visto_por']) if (a[campo] !== undefined && !lista(a[campo])) falta(`achados[].${campo} tem de ser lista de nomes`);
    if (a.acionado_por !== undefined && !ACIONADO.has(a.acionado_por)) falta(`achados[].acionado_por inválido (${a.acionado_por})`);
    if (typeof a.resumo === 'string' && a.resumo.length > MAX_TEXTO) falta(`achados[].resumo passa de ${MAX_TEXTO} caracteres`);
  }
  for (const campo of ['erros_orquestrador', 'licoes', 'adiar']) if (!Array.isArray(dados[campo] ?? [])) falta(`${campo} tem de ser uma lista`);
  if (dados.gatilho_falso !== undefined && !lista(dados.gatilho_falso)) falta('gatilho_falso tem de ser lista de nomes');
  if (s.baseline !== undefined && typeof s.baseline !== 'boolean') falta('sessao.baseline tem de ser true ou false');
  for (const l of dados.licoes ?? []) if (typeof l !== 'string' || l.length > MAX_TEXTO) falta(`licoes[]: texto de até ${MAX_TEXTO} caracteres`);
  for (const e of dados.erros_orquestrador ?? []) if ([e?.resumo, e?.custo].some((t) => typeof t !== 'string' || t.length > MAX_TEXTO)) falta(`erros_orquestrador[]: resumo e custo são texto de até ${MAX_TEXTO} caracteres`);
  for (const d of dados.adiar ?? []) if (typeof d?.alvo !== 'string' || typeof d.motivo !== 'string' || d.motivo === '') falta('adiar[] precisa de alvo e motivo');
  if (SUPRESSAO.test(JSON.stringify(dados))) falta('o bloco tem uma supressão lgpd-ignora: a sessão não leva dado que precise de supressão');
  if (cfg !== undefined) {
    const nomes = [
      ...dados.agentes.map((a) => a.tipo), ...dados.achados.flatMap((a) => [a.revisor, ...(a.escapou_de ?? []), ...(a.nao_rodou ?? []), ...(a.visto_por ?? [])]),
      ...(dados.gatilho_falso ?? []), ...(dados.adiar ?? []).map((d) => d.alvo),
    ];
    const desconhecido = nomes.find((n) => idDe(cfg, n) === undefined);
    if (desconhecido !== undefined) falta(`o nome ${desconhecido} não existe em agentes nem em niveis do pipeline.json (erro de digitação?)`);
    const achado = varrer(JSON.stringify(dados), 'sessao.md').find((x) => !x.suprimido && ['critico', 'alto'].includes(x.regra.nivel));
    if (achado !== undefined) falta(`dado pessoal no bloco (regra ${achado.regra.id}): a sessão só leva módulo, pasta, arquivo e o achado técnico`);
  }
  return dados;
}

/** O 1º bloco ```json de um arquivo de sessão, já validado. */
export const lerSessao = (texto, nome, cfg) => ({ ...validarSessao(blocoJson(texto, nome), nome, cfg), arquivo: nome });

/** As sessões de uma pasta (arquivos `AAAA-MM-DD-assunto.md`; o modelo da pasta fica de fora), em ordem pelo nome do arquivo. */
export function lerSessoes(pasta, cfg) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)).sort().map((f) => lerSessao(readFileSync(join(pasta, f), 'utf8'), f, cfg));
}

/** Os ajustes gravados (`AAAA-MM-DD-alvo.md`), do mais antigo ao mais novo (data, depois `ordem`). */
export function lerAjustes(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)).map((f) => {
    const a = blocoJson(readFileSync(join(pasta, f), 'utf8'), f);
    if (![a.alvo, a.tipo, a.de, a.para].every((v) => typeof v === 'string') || !DATA.test(a.data ?? '') || !lista(a.vistas)) throw new Error(`${f}: ajuste sem alvo, tipo, de, para, data ou vistas`);
    return { ...a, arquivo: f };
  }).sort((x, y) => x.data.localeCompare(y.data) || (x.ordem ?? 0) - (y.ordem ?? 0) || x.arquivo.localeCompare(y.arquivo));
}

// ---------- a conta ----------

const qtd = (a) => (Number.isInteger(a.quantidade) && a.quantidade > 0 ? a.quantidade : 1);
const soma = (itens, f) => itens.reduce((t, i) => t + f(i), 0);
const ehUnico = (a) => (a.visto_por ?? []).length === 0;
const nomeDe = (s) => s.arquivo ?? `${s.sessao.data}-${s.sessao.assunto}.md`;

/** O par em que o chat principal rodou, para o relatório ("haiku:null"). */
const parDaSessao = (s) => (s.sessao.orquestrador ? `${s.sessao.orquestrador.model}:${s.sessao.orquestrador.effort}` : 'desconhecido:desconhecido');
/** O orquestrador da sessão está no par de `FIXOS.niveis.orquestracao` (D3; o do código, não o do pipeline.json): o modelo contém o esperado e o esforço é igual, sem caixa nem espaços nas pontas. */
const noParDoOrquestrador = (s) => {
  const [modelo, esforco] = FIXOS.niveis.orquestracao.split(':');
  const limpa = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : undefined);
  const o = s.sessao.orquestrador;
  return limpa(o?.model)?.includes(modelo) === true && limpa(o?.effort) === esforco;
};

/** Os alvos do ajuste: todo agente fixo e todo nível, com `id` (`secao.chave`) e se é revisor (agente ou nível com `revisor`). */
const alvosDe = (cfg) => ['agentes', 'niveis'].flatMap((secao) => Object.entries(cfg[secao]).map(([chave, entrada]) => ({
  secao, chave, entrada, id: `${secao}.${chave}`, revisor: secao === 'agentes' || entrada.revisor !== undefined, fixo: Object.hasOwn(FIXOS[secao], chave),
})));

/** Um degrau da escada: `{ de, para }` ou `{ erro }`. Para cima: agente fixo até o teto da guarda; código e ponytail só em sonnet. Para baixo: até o piso. */
function degrau(alvo, delta) {
  const atual = par(alvo.entrada);
  if (alvo.fixo) return { erro: `${alvo.chave} é fixo em ${atual}: o par dele não se ajusta` };
  const i = ESCADA.indexOf(atual);
  if (i === -1) return { erro: `${atual} está fora da escada: não se ajusta` };
  const proximo = ESCADA[i + delta];
  if (proximo === undefined) return { erro: `${atual} já é o ${delta > 0 ? 'topo' : 'começo'} da escada` };
  if (delta > 0) {
    if (alvo.secao === 'niveis' && !proximo.startsWith('sonnet:')) return { erro: `o nível ${alvo.chave} não passa de sonnet: o opus só entra no Plan de uma decisão` };
    if (alvo.secao === 'agentes' && ESCADA.indexOf(proximo) > ESCADA.indexOf(par(TETO[alvo.chave]))) return { erro: `${alvo.chave} já está no teto da guarda (${par(TETO[alvo.chave])})` };
  } else if (ESCADA.indexOf(proximo) < ESCADA.indexOf(PISOS[alvo.secao][alvo.chave])) {
    return { erro: `${atual} já está no piso (${PISOS[alvo.secao][alvo.chave]})` };
  }
  return { de: atual, para: proximo };
}

const evidencia = (a) => `${a.sessao} ${a.modulo ?? ''} (${a.revisor}, ${a.severidade}): ${a.resumo ?? 'sem resumo'}`.replace(/\s+/g, ' ');

/** Os números de um alvo nas sessões `posteriores` (a janela são as `tamanho` mais novas). */
function medir(alvo, posteriores, tamanho, cfg) {
  const janela = posteriores.slice(-tamanho);
  const meus = (a) => idDe(cfg, a.tipo) === alvo.id && `${a.modelo}:${a.esforco}` === par(alvo.entrada);
  const achados = posteriores.flatMap((s) => s.achados.map((a) => ({ ...a, sessao: nomeDe(s) })));
  const contribui = (a) => a.confirmado !== false && MEDIO_MAIS.has(a.severidade) && (idDe(cfg, a.revisor) === alvo.id || (a.visto_por ?? []).some((n) => idDe(cfg, n) === alvo.id));
  const escapes = achados.filter((a) => a.confirmado !== false && MEDIO_MAIS.has(a.severidade) && (a.escapou_de ?? []).some((n) => idDe(cfg, n) === alvo.id));
  const semRodar = escapes.filter((a) => (a.nao_rodou ?? []).some((n) => idDe(cfg, n) === alvo.id));
  const comRodar = escapes.filter((a) => !semRodar.includes(a));
  const unicos = achados.filter((a) => contribui(a) && ehUnico(a) && idDe(cfg, a.revisor) === alvo.id);
  const tokens = soma(janela.flatMap((s) => s.agentes.filter(meus)), (e) => e.tokens ?? 0);
  const rodadas = posteriores.flatMap((s) => s.agentes.filter(meus)).map((e) => e.rodadas).filter((x) => typeof x === 'number');
  const nUnicos = soma(unicos, qtd);
  return {
    janela, meus, achados, contribui, escapes, semRodar, comRodar, rodadas,
    linha: {
      id: alvo.id, nivel: par(alvo.entrada), fixo: alvo.fixo, sessoes: posteriores.length, sessoesQueRodou: posteriores.filter((s) => s.agentes.some(meus)).length,
      tokens, unicosMedioMais: nUnicos, graves: soma(unicos.filter((a) => GRAVES.has(a.severidade)), qtd), tokensPorUnico: nUnicos === 0 ? null : Math.round(tokens / nUnicos),
      escapesRodou: soma(comRodar, qtd), escapesSemRodar: soma(semRodar, qtd),
      mediaRodadas: rodadas.length === 0 ? null : Number((rodadas.reduce((t, x) => t + x, 0) / rodadas.length).toFixed(2)),
    },
  };
}

/**
 * A análise. Conta as sessões gravadas depois do último ajuste do alvo (em ordem pelo nome do arquivo); a de linha de
 * base e a cujo orquestrador não rodou em `orquestracao` (D3, `foraDaConta`) entram no relatório (`linhaDeBase`) e não
 * na conta. Devolve `{ janela, datas, completa, baseline, foraDaConta, alvos, linhaDeBase, subir,
 * gatilhos, descer, pendentes, adiados, estreitar, bloqueios, relatos }`; `descer` leva no máximo um alvo (o mais caro),
 * os outros ficam em `pendentes`.
 */
export function analisar(sessoes, ajustes, cfg) {
  const { janela: tamanho, rodadas_altas: altas } = cfg.ajuste;
  const todas = [...sessoes].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)));
  const baseline = todas.filter((s) => s.sessao.baseline === true);
  const fora = todas.filter((s) => s.sessao.baseline !== true && !noParDoOrquestrador(s));
  const validas = todas.filter((s) => !baseline.includes(s) && !fora.includes(s));
  const base = todas.filter((s) => baseline.includes(s) || fora.includes(s));
  const r = { janela: tamanho, datas: validas.slice(-tamanho).map((s) => s.sessao.data), baseline: baseline.map(nomeDe), foraDaConta: fora.map((s) => ({ arquivo: nomeDe(s), orquestrador: parDaSessao(s) })), completa: validas.length >= tamanho, alvos: [], linhaDeBase: [], subir: [], gatilhos: [], descer: [], pendentes: [], adiados: [], estreitar: [], bloqueios: [], relatos: [] };
  const candidatos = [];
  for (const alvo of alvosDe(cfg)) {
    if (base.length > 0) r.linhaDeBase.push(medir(alvo, base, tamanho, cfg).linha);
    const ultimo = ajustes.filter((a) => a.alvo === alvo.chave).at(-1);
    const posteriores = validas.filter((s) => ultimo === undefined || !ultimo.vistas.includes(nomeDe(s)));
    const completa = posteriores.length >= tamanho;
    const { janela, meus, achados, contribui, escapes, semRodar, comRodar, rodadas, linha } = medir(alvo, posteriores, tamanho, cfg);
    r.alvos.push(linha);
    if (alvo.fixo && !alvo.revisor) continue;
    const subir = (motivo, provas, soComJanela = false) => {
      const d = degrau(alvo, +1);
      if (d.erro) r.bloqueios.push({ id: alvo.id, motivo: d.erro });
      else if (soComJanela && !completa) r.relatos.push({ id: alvo.id, secao: alvo.secao, chave: alvo.chave, ...d, tipo: 'mais', motivo, relato: `janela incompleta (${posteriores.length} de ${tamanho} sessões desde o último ajuste): só relato`, provas: [] });
      else r.subir.push({ id: alvo.id, secao: alvo.secao, chave: alvo.chave, ...d, tipo: 'mais', motivo, provas: provas.map(evidencia) });
    };
    if (alvo.revisor) {
      if (comRodar.length > 0) subir(`${soma(comRodar, qtd)} defeito(s) de nível médio ou mais passaram por ele e foram pegos depois`, comRodar);
      const julgamento = achados.filter((a) => contribui(a) && GRAVES.has(a.severidade) && ehUnico(a) && a.acionado_por === 'julgamento' && idDe(cfg, a.revisor) === alvo.id);
      const gatilho = [...semRodar, ...julgamento];
      if (gatilho.length > 0) {
        const partes = [];
        if (semRodar.length > 0) partes.push(`${semRodar.length} escape(s) em que ele nem rodou`);
        if (julgamento.length > 0) partes.push(`${julgamento.length} achado(s) grave(s) único(s) de um acionamento por julgamento`);
        r.gatilhos.push({ id: alvo.id, motivo: `${partes.join(' e ')}: falta um gatilho em revisao.gatilhos`, provas: gatilho.map(evidencia) });
      }
      const falsos = janela.filter((s) => (s.gatilho_falso ?? []).some((n) => idDe(cfg, n) === alvo.id));
      if (falsos.length > 0) r.estreitar.push({ id: alvo.id, motivo: `${falsos.length} sessão(ões) marcaram o gatilho dele como falso: estreite o gatilho em revisao.gatilhos (não é automático)`, provas: falsos.map(nomeDe) });
      // uma sessão só conta como limpa se o alvo rodou com código no diff e a sessão tinha o que achar: algum revisor achou nível
      // médio ou mais. Sem isso, sessão vazia (ou só com o gatilho ativo) derrubaria todos.
      const achouAlgo = (s) => s.achados.some((a) => a.confirmado !== false && MEDIO_MAIS.has(a.severidade));
      const limpas = posteriores.filter((s) => s.agentes.some(meus) && s.agentes.some((a) => COM_CODIGO.has(a.papel)) && !(s.gatilho_falso ?? []).some((n) => idDe(cfg, n) === alvo.id)
        && achouAlgo(s)).slice(-tamanho);
      const apto = !alvo.fixo && limpas.length >= tamanho && limpas.every((s) => !s.achados.some((a) => contribui(a))) && escapes.length === 0;
      if (apto) {
        const adiar = janela.flatMap((s) => (s.adiar ?? []).filter((d) => idDe(cfg, d.alvo) === alvo.id));
        const d = degrau(alvo, -1);
        if (adiar.length > 0) r.adiados.push({ id: alvo.id, motivo: `descida adiada: ${adiar.at(-1).motivo}` });
        else if (d.erro) r.bloqueios.push({ id: alvo.id, motivo: d.erro });
        else candidatos.push({ id: alvo.id, secao: alvo.secao, chave: alvo.chave, ...d, tipo: 'menos', motivo: `${tamanho} sessões com código em que ele rodou, sem achado de nível médio ou mais seu e sem escape`, provas: [] });
      }
    } else if (linha.mediaRodadas !== null && rodadas.length >= 2 && linha.mediaRodadas >= altas) {
      subir(`média de ${linha.mediaRodadas} rodadas de correção em ${rodadas.length} agentes (limite ${altas})`, [], true);
    }
  }
  candidatos.sort((a, b) => ESCADA.indexOf(b.de) - ESCADA.indexOf(a.de) || a.id.localeCompare(b.id));
  r.descer = candidatos.slice(0, 1);
  r.pendentes = candidatos.slice(1).map((c) => ({ id: c.id, motivo: `${c.de} -> ${c.para}: fica para a próxima execução (um alvo por vez, o mais caro primeiro)` }));
  return r;
}

// ---------- texto do relatório ----------

const alinha = (v, n) => String(v ?? '-').padEnd(n);

/** O relatório que o orquestrador lê (e cola no relatório da sessão). */
export function formatar(r) {
  const o = [`Autoanálise do pipeline: janela de ${r.janela} sessões (${r.datas.join(', ') || 'nenhuma sessão'}).`];
  if (r.baseline.length > 0) o.push(`Linha de base (entra aqui, não na conta): ${r.baseline.join(', ')}.`);
  for (const orquestrador of [...new Set(r.foraDaConta.map((x) => x.orquestrador))]) o.push(`Fora da conta (orquestrador em ${orquestrador}, D3): ${r.foraDaConta.filter((x) => x.orquestrador === orquestrador).map((x) => x.arquivo).join(', ')}.`);
  if (!r.completa) o.push(`Há menos sessões (${r.datas.length}) que a janela (${r.janela}): nenhum alvo desce ainda; escape e gatilho que falta já viram proposta.`);
  const tabela = (titulo, alvos) => {
    o.push('', titulo, `${alinha('quem', 32)}${alinha('nível', 14)}${alinha('sessões', 9)}${alinha('rodou', 6)}${alinha('únicos', 8)}${alinha('graves', 8)}${alinha('tok/único', 11)}${alinha('escapes', 9)}${alinha('sem rodar', 10)}rodadas`);
    for (const a of alvos) o.push(`${alinha(a.id + (a.fixo ? ' (fixo)' : ''), 32)}${alinha(a.nivel, 14)}${alinha(a.sessoes, 9)}${alinha(a.sessoesQueRodou, 6)}${alinha(a.unicosMedioMais, 8)}${alinha(a.graves, 8)}${alinha(a.tokensPorUnico, 11)}${alinha(a.escapesRodou, 9)}${alinha(a.escapesSemRodar, 10)}${a.mediaRodadas ?? '-'}`);
  };
  tabela('Desde o último ajuste (a conta):', r.alvos);
  if (r.linhaDeBase.length > 0) tabela('Linha de base e fora da conta (não contam na janela):', r.linhaDeBase.filter((a) => a.sessoesQueRodou > 0 || a.mediaRodadas !== null));
  const bloco = (titulo, itens, linha) => {
    if (itens.length === 0) return;
    o.push('', titulo);
    for (const i of itens) {
      o.push(`  - ${linha(i)}`);
      for (const p of i.provas ?? []) o.push(`      * ${p}`);
    }
  };
  bloco('Para MAIS (propõe; só com o "sim" do usuário: --aplicar-mais <alvo>):', r.subir, (i) => `${i.id}: ${i.de} -> ${i.para}. ${i.motivo}`);
  bloco('Falta um GATILHO (propõe; o usuário diz "sim" e se edita o pipeline.json):', r.gatilhos, (i) => `${i.id}: ${i.motivo}`);
  bloco('Estreitar o gatilho (nunca automático):', r.estreitar, (i) => `${i.id}: ${i.motivo}`);
  bloco('Para MENOS (aplica sozinho com --aplicar-menos; um alvo por execução):', r.descer, (i) => `${i.id}: ${i.de} -> ${i.para}. ${i.motivo}`);
  bloco('Na fila para menos:', r.pendentes, (i) => `${i.id}: ${i.motivo}`);
  bloco('Adiado pelo orquestrador:', r.adiados, (i) => `${i.id}: ${i.motivo}`);
  bloco('Só relato:', r.relatos, (i) => `${i.id}: ${i.relato}. ${i.motivo}${i.de ? ` (${i.de} -> ${i.para})` : ''}`);
  bloco('Travado (piso, teto ou fora da escada):', r.bloqueios, (i) => `${i.id}: ${i.motivo}`);
  if (![r.subir, r.gatilhos, r.estreitar, r.descer, r.pendentes, r.adiados, r.relatos, r.bloqueios].some((l) => l.length > 0)) o.push('', 'Nada a ajustar.');
  return o.join('\n');
}

// ---------- tabela da seção 7 ----------

/** A tabela de modelo e esforço da seção 7 da skill `pipeline`, gerada do pipeline.json. */
export function tabela(cfg) {
  const linhas = ['| Quem | Tarefa | `model` | `effort` |', '|---|---|---|---|'];
  for (const [chave, e] of Object.entries(cfg.niveis)) linhas.push(`| nível \`${chave}\` | ${e.tarefa ?? ''} | \`${e.model}\` | \`${e.effort}\` |`);
  for (const [chave, e] of Object.entries(cfg.agentes)) linhas.push(`| agente \`${chave}\` (\`.claude/agents/\`) | ${e.tarefa ?? ''} | \`${e.model}\` | \`${e.effort}\` |`);
  return `${INICIO}\n${linhas.join('\n')}\n${FIM}`;
}

/** O texto da skill com a tabela entre as marcas trocada pela gerada. Lança se as marcas faltam. */
export function comTabela(skill, cfg) {
  const a = skill.indexOf(INICIO);
  const b = skill.indexOf(FIM);
  if (a === -1 || b === -1 || b < a) throw new Error('SKILL.md sem as marcas da tabela (tabela-agentes:inicio e tabela-agentes:fim)');
  return skill.slice(0, a) + tabela(cfg) + skill.slice(b + FIM.length);
}

// ---------- aplicar um ajuste ----------

const trocarPar = (texto, secao, chave, [model, effort]) => {
  const ini = texto.indexOf(`"${secao}": {`);
  const re = new RegExp(`("${chave}": \\{ "model": ")[a-z]+(", "effort": ")[a-z]+(")`);
  const resto = texto.slice(ini);
  if (ini === -1 || !re.test(resto)) throw new Error(`não achei ${secao}.${chave} no pipeline.json no formato de uma linha`);
  return texto.slice(0, ini) + resto.replace(re, `$1${model}$2${effort}$3`);
};

const trocarCabecalho = (texto, chave, [model, effort]) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (m === null || !/^model:.*$/m.test(m[1]) || !/^effort:.*$/m.test(m[1])) throw new Error(`o cabeçalho de .claude/agents/${chave}.md não tem model: e effort:`);
  return texto.replace(m[1], m[1].replace(/^model:.*$/m, `model: ${model}`).replace(/^effort:.*$/m, `effort: ${effort}`));
};

/**
 * Aplica os ajustes de `itens` (`analisar`: `descer` ou um de `subir`): edita o pipeline.json (só a linha do par do alvo),
 * o cabeçalho do agente e a tabela da skill, e grava um arquivo por ajuste em docs/pipeline/ajustes/. Só grava se tudo
 * deu certo. Devolve as linhas para o relatório.
 */
export function aplicar(raiz, itens, data, vistas) {
  if (itens.length === 0) return [];
  const c = caminhos(raiz);
  let json = readFileSync(c.config, 'utf8');
  const escritas = [];
  const arquivos = [];
  const existentes = lerAjustes(c.ajustes);
  itens.forEach((d, k) => {
    const para = d.para.split(':');
    json = trocarPar(json, d.secao, d.chave, para);
    if (d.secao === 'agentes') {
      const arquivo = join(c.agentes, `${d.chave}.md`);
      arquivos.push([arquivo, trocarCabecalho(readFileSync(arquivo, 'utf8'), d.chave, para)]);
    }
    let nome = `${data}-${d.chave}.md`;
    for (let n = 2; existsSync(join(c.ajustes, nome)) || arquivos.some(([f]) => f === join(c.ajustes, nome)); n += 1) nome = `${data}-${d.chave}-${n}.md`;
    const registro = { alvo: d.chave, tipo: d.tipo, data, de: d.de, para: d.para, vistas, ordem: existentes.length + k + 1, motivo: d.motivo };
    arquivos.push([join(c.ajustes, nome), `# Ajuste ${data}: ${d.chave} de ${d.de} para ${d.para}\n\nAjuste ${d.tipo === 'menos' ? 'automático para menos' : 'para mais, confirmado pelo usuário'} (D2). ${d.motivo}.\n\n\`\`\`json\n${JSON.stringify(registro, null, 2)}\n\`\`\`\n`]);
    escritas.push(`${d.chave} ${d.de} -> ${d.para} (docs/pipeline/ajustes/${nome})`);
  });
  JSON.parse(json);
  const pasta = mkdtempSync(join(tmpdir(), 'ajusta-'));
  let cfg;
  try {
    writeFileSync(join(pasta, 'pipeline.json'), json);
    cfg = lerConfig(join(pasta, 'pipeline.json'));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
  for (const d of itens) if (par(cfg[d.secao][d.chave]) !== d.para) throw new Error(`${d.id}: o pipeline.json novo não ficou em ${d.para}`);
  const skill = comTabela(readFileSync(c.skill, 'utf8'), cfg);
  mkdirSync(c.ajustes, { recursive: true });
  writeFileSync(c.config, json);
  writeFileSync(c.skill, skill);
  for (const [arquivo, texto] of arquivos) writeFileSync(arquivo, texto);
  return escritas;
}

/** Regrava a tabela da skill a partir do pipeline.json. */
export function sincronizarTabela(raiz) {
  const c = caminhos(raiz);
  writeFileSync(c.skill, comTabela(readFileSync(c.skill, 'utf8'), lerConfig(c.config)));
}

// ---------- linha de comando ----------

const COM_VALOR = new Set(['--raiz', '--data', '--aplicar-mais']);
const SEM_VALOR = new Set(['--relatorio', '--json', '--aplicar-menos', '--sincronizar-tabela']);

function opcoes(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (SEM_VALOR.has(a)) o[a] = true;
    else if (COM_VALOR.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} pede um valor`);
      o[a] = v;
      i += 1;
    } else throw new Error(`opção desconhecida: ${a}`);
  }
  return o;
}

function principal(argv) {
  const o = opcoes(argv);
  const raiz = resolve(o['--raiz'] ?? RAIZ_PADRAO);
  const c = caminhos(raiz);
  if (o['--sincronizar-tabela']) {
    sincronizarTabela(raiz);
    console.log('tabela da seção 7 da skill pipeline sincronizada com o pipeline.json');
    return;
  }
  const data = o['--data'] ?? new Date().toLocaleDateString('sv-SE');
  if (!DATA.test(data)) throw new Error('--data tem de ser AAAA-MM-DD');
  const cfg = lerConfig(c.config);
  const sessoes = lerSessoes(c.sessoes, cfg);
  const r = analisar(sessoes, lerAjustes(c.ajustes), cfg);
  console.log(o['--json'] ? JSON.stringify(r, null, 2) : formatar(r));
  const vistas = sessoes.map(nomeDe);
  if (o['--aplicar-menos']) {
    const feitas = aplicar(raiz, r.descer, data, vistas);
    console.log(feitas.length === 0 ? '\nNenhum ajuste para menos aplicado.' : `\nAplicado (avise no relatório):\n${feitas.map((l) => `  - ${l}`).join('\n')}`);
  }
  if (o['--aplicar-mais'] !== undefined) {
    const alvo = o['--aplicar-mais'];
    const item = r.subir.find((i) => i.id === alvo || i.chave === alvo);
    if (item === undefined) throw new Error(`não há proposta para subir ${alvo} (não houve escape nem rodadas altas desde o último ajuste dele): rode --relatorio`);
    console.log(`\nAplicado (o "sim" do usuário):\n${aplicar(raiz, [item], data, vistas).map((l) => `  - ${l}`).join('\n')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(`ajusta-pipeline: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 2;
  }
}
