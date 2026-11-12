// Os pares modelo/esforço (D11): o ÚNICO módulo que lê do .claude/pipeline.json as chaves `familias`, `escada`, `comum`,
// `agentes` e `niveis`, e o único que ordena, compara, sobe ou desce um par. O resto dos hooks recebe o resultado daqui
// (`lerPapeis`) e pergunta (`papel`, `faixa`, `degrau`...). Um teste de fronteira nega outro leitor dessas chaves.
// A entrada sem `piso` e `teto` é fixa; com os dois, o par anda só entre eles, no mesmo modelo (D3: o modelo vem do papel).
// No código fica só a estrutura (família, esforço, `piso ≤ par ≤ teto`, o que não pode faltar); os valores são dado.
import { APOSENTADOS, ARQUIVO, falha, lerObjeto, ok } from './config.mjs';

/** As famílias de modelo que o pipeline conhece. A versão de cada uma mora em `familias`, no formato `claude-<família>-…`. */
export const FAMILIAS = ['opus', 'sonnet', 'haiku'];
/** Os esforços que existem, do mais barato ao mais forte. */
export const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** O agente de código: o único que roda com worktree (D8); tem de estar em `agentes`. */
export const DESENVOLVEDOR = 'desenvolvedor';
/** O nível do chat principal: tem de estar em `niveis`. */
export const ORQUESTRACAO = 'orquestracao';

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const listaDe = (v, valido) => Array.isArray(v) && v.every((t) => typeof t === 'string' && valido(t));
const separa = (texto) => texto.split(':');
const PAR = new RegExp(`^(${FAMILIAS.join('|')}):(${ESFORCOS.join('|')})$`);
const NOME = /^[\w-]+$/;
const ONDE = '.claude/pipeline.json';

/** O par "modelo:esforço" de uma entrada. */
export const par = (e) => `${e.model}:${e.effort}`;

/** O erro (texto) da escada, ou null: sem repetição, só pares válidos, cada família contígua e com o esforço subindo. */
function problemaDaEscada(escada) {
  if (!Array.isArray(escada) || escada.length === 0 || !escada.every((t) => typeof t === 'string' && PAR.test(t))) {
    return `escada em ${ONDE} tem de ser uma lista de pares "família:esforço" (família ${FAMILIAS.join(', ')}; esforço ${ESFORCOS.join(', ')}), com ao menos um`;
  }
  const fechadas = new Set();
  let atual = null;
  let ultimo = -1;
  for (const [i, texto] of escada.entries()) {
    if (escada.indexOf(texto) !== i) return `escada: o par ${texto} aparece mais de uma vez`;
    const [familia, esforco] = separa(texto);
    if (familia !== atual) {
      if (fechadas.has(familia)) return `escada: a família ${familia} tem de ser contígua (${texto} volta depois de outra família)`;
      if (atual !== null) fechadas.add(atual);
      atual = familia;
      ultimo = -1;
    }
    if (ESFORCOS.indexOf(esforco) <= ultimo) return `escada: dentro de ${familia} o esforço tem de subir (${texto} não sobe)`;
    ultimo = ESFORCOS.indexOf(esforco);
  }
  return null;
}

/** O erro (texto) de `familias`, ou null: as três famílias, cada versão no formato `claude-<família>-…`. */
function problemaDasFamilias(familias) {
  if (!ehObjeto(familias) || Object.keys(familias).sort().join() !== [...FAMILIAS].sort().join()) {
    return `familias em ${ONDE} tem de ter exatamente ${FAMILIAS.join(', ')}, cada uma com a versão do modelo`;
  }
  for (const f of FAMILIAS) {
    if (typeof familias[f] !== 'string' || !new RegExp(`^claude-${f}-[\\w.-]+$`).test(familias[f])) return `familias.${f} em ${ONDE} tem de ser "claude-${f}-<versão>"`;
  }
  return null;
}

/** O erro (texto) de `comum`, ou null: os três campos da chamada comum (general-purpose, Explore, Plan). */
function problemaDoComum(comum) {
  if (!ehObjeto(comum) || !listaDe(comum.esforcos, (t) => ESFORCOS.includes(t)) || comum.esforcos.length === 0
    || !listaDe(comum.passa, (t) => FAMILIAS.includes(t)) || comum.passa.length === 0 || !listaDe(comum.confirma, (t) => /^[a-z0-9][a-z0-9.-]*$/.test(t))) {
    return `comum em ${ONDE} tem de ter esforcos (lista não vazia de esforços), passa (lista não vazia de famílias) e confirma (lista de trechos de modelo)`;
  }
  return comum.confirma.some((m) => comum.passa.includes(m)) ? 'comum: o mesmo modelo em passa e em confirma' : null;
}

/** O erro (texto) de uma entrada de `agentes` ou `niveis`, ou null. `escada` já foi validada. */
function problemaDaEntrada(secao, nome, e, escada) {
  const id = `${secao}.${nome}`;
  if (!NOME.test(nome)) return `${id}: nome inválido`;
  if (secao === 'agentes' && APOSENTADOS.has(nome)) return `${id}: nome aposentado (D34), não volta ao pipeline.json`;
  if (!ehObjeto(e) || !FAMILIAS.includes(e.model) || !ESFORCOS.includes(e.effort)) return `${id}: model (${FAMILIAS.join(', ')}) e effort (${ESFORCOS.join(', ')}) são obrigatórios`;
  if (secao === 'agentes' && (typeof e.tools !== 'string' || e.tools.trim() === '' || /[\r\n]/.test(e.tools))) return `${id}: tools é obrigatório, texto de uma linha só`;
  if (e.tarefa !== undefined && typeof e.tarefa !== 'string') return `${id}: tarefa tem de ser texto`;
  const atual = par(e);
  if (!escada.includes(atual)) return `${id}: o par ${atual} está fora da escada`;
  if (e.piso === undefined && e.teto === undefined) return null;
  if (e.piso === undefined || e.teto === undefined) return `${id}: piso e teto vêm juntos, ou nenhum dos dois (sem os dois a entrada é fixa)`;
  for (const campo of ['piso', 'teto']) {
    if (typeof e[campo] !== 'string' || !escada.includes(e[campo])) return `${id}: ${campo} ${String(e[campo])} está fora da escada`;
    if (separa(e[campo])[0] !== e.model) return `${id}: ${campo} ${e[campo]} é de outro modelo que o ${e.model} da entrada (o modelo vem do papel, D3)`;
  }
  if (escada.indexOf(atual) < escada.indexOf(e.piso)) return `${id} está em ${atual}, abaixo do piso ${e.piso}`;
  if (escada.indexOf(atual) > escada.indexOf(e.teto)) return `${id} está em ${atual}, acima do teto ${e.teto}`;
  return null;
}

/**
 * Valida o objeto do pipeline.json e devolve `{ valor, erro }`. O valor é `{ familias, escada, comum, agentes, niveis }`,
 * cada entrada de `agentes` e `niveis` como está no arquivo (`model`, `effort`, `tools`?, `piso`?, `teto`?, `tarefa`?).
 * Pura. Falha fechado: qualquer regra de estrutura quebrada é erro, e quem chama nega.
 */
export function papeisDeObjeto(dados) {
  if (!ehObjeto(dados)) return falha(`${ONDE} tem de ser um objeto JSON`);
  const { familias, escada, comum, agentes, niveis } = dados;
  const erroDe = problemaDaEscada(escada) ?? problemaDasFamilias(familias) ?? problemaDoComum(comum);
  if (erroDe !== null) return falha(erroDe);
  for (const [secao, entradas] of [['agentes', agentes], ['niveis', niveis]]) {
    if (!ehObjeto(entradas) || Object.keys(entradas).length === 0) return falha(`${secao} em ${ONDE} tem de ser um objeto com ao menos uma entrada`);
    for (const [nome, e] of Object.entries(entradas)) {
      const erro = problemaDaEntrada(secao, nome, e, escada);
      if (erro !== null) return falha(erro);
    }
  }
  if (!Object.hasOwn(agentes, DESENVOLVEDOR)) return falha(`agentes.${DESENVOLVEDOR} falta no pipeline.json`);
  if (!Object.hasOwn(niveis, ORQUESTRACAO)) return falha(`niveis.${ORQUESTRACAO} falta no pipeline.json`);
  return ok({ familias, escada, comum, agentes, niveis });
}

/** Lê o pipeline.json (ver `papeisDeObjeto`). Arquivo ausente, ilegível ou inválido: erro. */
export function lerPapeis(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  return erro !== null ? falha(erro) : papeisDeObjeto(dados);
}

// ---------- consultas puras ----------

/** A entrada `nome` da seção (`agentes` ou `niveis`), ou undefined. */
export const papel = (p, secao, nome) => (Object.hasOwn(p[secao] ?? {}, nome) ? p[secao][nome] : undefined);
/** Sem `piso` e `teto` a entrada é fixa: o par dela não se ajusta. */
export const ehFixo = (e) => e.piso === undefined && e.teto === undefined;
/** Os agentes fixos de `.claude/agents/`: todos de `agentes` menos o `desenvolvedor`, que tem as regras dele (D8) e não é alvo do ajuste. */
export const agentesFixos = (p) => Object.fromEntries(Object.entries(p.agentes).filter(([nome]) => nome !== DESENVOLVEDOR));
/** Os nomes de todo agente de `.claude/agents/` que o pipeline.json conhece, o `desenvolvedor` incluso. */
export const nomesDeAgentes = (p) => Object.keys(p.agentes);
/** O par do chat principal (`niveis.orquestracao`): `{ model, effort }`. */
export const orquestrador = (p) => ({ model: p.niveis[ORQUESTRACAO].model, effort: p.niveis[ORQUESTRACAO].effort });
/** A versão de cada família: `{ opus: 'claude-opus-…', sonnet, haiku }`. */
export const versoes = (p) => ({ ...p.familias });
/** O que a chamada comum (general-purpose, Explore, Plan) aceita: `{ esforcos, passa, confirma }`. */
export const comum = (p) => ({ esforcos: [...p.comum.esforcos], passa: [...p.comum.passa], confirma: [...p.comum.confirma] });

/**
 * Onde o par `parTexto` ("modelo:esforço", mesmo fora da escada: `sonnet:xhigh`) está em relação à faixa da entrada `e`
 * (`piso` a `teto`; a fixa tem só o par dela): `abaixo`, `dentro`, `acima`, ou `fora` se for de outro modelo que o da entrada.
 */
export function faixa(parTexto, e) {
  const [modelo, esforco] = separa(String(parTexto));
  const [modeloDoPiso, esforcoDoPiso] = separa(e.piso ?? par(e));
  const [modeloDoTeto, esforcoDoTeto] = separa(e.teto ?? par(e));
  if (modelo !== e.model || modelo !== modeloDoPiso || modelo !== modeloDoTeto || !ESFORCOS.includes(esforco)) return 'fora';
  const posto = ESFORCOS.indexOf(esforco);
  if (posto < ESFORCOS.indexOf(esforcoDoPiso)) return 'abaixo';
  return posto > ESFORCOS.indexOf(esforcoDoTeto) ? 'acima' : 'dentro';
}

/** Os esforços que a entrada aceita numa chamada (do `piso` ao `teto`, no modelo dela), do mais barato ao mais forte. */
export const esforcosDe = (e) => ESFORCOS.filter((f) => faixa(`${e.model}:${f}`, e) === 'dentro');
/** Os esforços que ficam fora de `permitidos`, em texto ("medium, high, xhigh e max"), para a mensagem de quem nega. */
export function esforcosNegados(permitidos) {
  const fora = ESFORCOS.filter((f) => !permitidos.includes(f));
  return fora.length < 2 ? fora.join('') : `${fora.slice(0, -1).join(', ')} e ${fora.at(-1)}`;
}

/**
 * Um degrau da escada para o alvo `{ secao, chave, entrada }`: `{ de, para }` ou `{ erro }`. Só mexe no esforço, dentro do
 * piso e do teto da entrada e do mesmo modelo (D3: o modelo vem do papel). Entrada fixa não anda. `delta` é +1 ou -1.
 */
export function degrau(p, { secao, chave, entrada }, delta) {
  const atual = par(entrada);
  if (ehFixo(entrada)) return { erro: `${chave} é fixo em ${atual}: o par dele não se ajusta` };
  const i = p.escada.indexOf(atual);
  if (i === -1) return { erro: `${atual} está fora da escada: não se ajusta` };
  const proximo = p.escada[i + delta];
  if (proximo === undefined) return { erro: `${atual} já é o ${delta > 0 ? 'topo' : 'começo'} da escada` };
  if (delta > 0 && p.escada.indexOf(proximo) > p.escada.indexOf(entrada.teto)) {
    return { erro: secao === 'niveis' ? `o nível ${chave} não passa de ${entrada.teto}: é o teto dele no pipeline.json` : `${chave} já está no teto da guarda (${entrada.teto})` };
  }
  if (delta < 0 && p.escada.indexOf(proximo) < p.escada.indexOf(entrada.piso)) return { erro: `${atual} já está no piso (${entrada.piso})` };
  const modelo = separa(atual)[0];
  if (separa(proximo)[0] !== modelo) return { erro: `${atual} já é o ${delta > 0 ? 'topo' : 'começo'} do ${modelo}: o ajuste só mexe no esforço, o modelo vem do papel` };
  return { de: atual, para: proximo };
}

// ---------- as seções, para quem só precisa de uma ----------

/** Os agentes fixos (ver `agentesFixos`), do arquivo: `{ nome: { model, effort, tools, tarefa, piso?, teto? } }`. */
export function lerAgentes(arquivo = ARQUIVO) {
  const { valor: p, erro } = lerPapeis(arquivo);
  return erro !== null ? falha(erro) : ok(agentesFixos(p));
}

/** Os níveis dos subagentes comuns, do arquivo: `{ nome: { model, effort, tarefa, revisor?, piso?, teto? } }`. */
export function lerNiveis(arquivo = ARQUIVO) {
  const { valor: p, erro } = lerPapeis(arquivo);
  return erro !== null ? falha(erro) : ok(p.niveis);
}
