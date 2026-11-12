// O agente de código `desenvolvedor` (D8), em três zonas com um dono cada: o cabeçalho e o texto fixo (do modelo), o bloco
// `regras` (gerado do CLAUDE.md pelo título em negrito de cada regra) e a parte do projeto, entre os marcadores
// `projeto:inicio` e `projeto:fim` (do orquestrador, só itens `- `, com um bloco `dominio` gerado da regra 8). Puro: só
// `node:*`, sem ler arquivo. A guarda dos subagentes chama `problemas` em toda chamada; `sincronizar` é o que o
// `ajusta-pipeline.mjs --sincronizar-desenvolvedor` grava; `mesmaParteFixa` é a conta da exceção do `escolhe-revisores`.

const DESCRICAO = 'Agente de código deste projeto. Escreve código, teste ou migração numa pasta, num worktree, com o pacote de contexto do orquestrador; roda os portões e só commita no branch dele.';

/**
 * O cabeçalho exato, com o fim de linha LF, gerado da entrada `agentes.desenvolvedor` do pipeline.json (`model`, `effort`,
 * `tools`, D11); qualquer outro (campo a mais, CRLF, aspas, valor diferente) é problema. Puro: quem chama passa a entrada.
 */
export const cabecalho = (entrada) => `---
name: desenvolvedor
description: ${DESCRICAO}
model: ${entrada.model}
effort: ${entrada.effort}
tools: ${entrada.tools}
omitClaudeMd: true
---
`;

/** Quantos bytes valem um token na estimativa (o mesmo da guarda dos subagentes). */
export const CARACTERES_POR_TOKEN = 3;
export const TETO_CORPO = 1500;
export const TETO_FIXA = 900;
export const TETO_PROJETO = 600;

export const MARCADORES = {
  regrasIni: '<!-- regras:inicio -->',
  regrasFim: '<!-- regras:fim -->',
  projetoIni: '<!-- projeto:inicio -->',
  projetoFim: '<!-- projeto:fim -->',
};
const DOMINIO_INI = '<!-- dominio:inicio -->';
const DOMINIO_FIM = '<!-- dominio:fim -->';

/** Os títulos em negrito do CLAUDE.md (sem o `:` do fim) cujas regras vão, em cópia literal, para a parte fixa. */
export const TITULOS_FIXOS = ['Um `AGENTS.md` por pasta de trabalho', 'Dado inventado', 'Local primeiro', 'Segredos', 'Recurso pago'];
/** Todos os títulos do modelo: o item de outro título é regra do domínio. */
export const TITULOS_DO_MODELO = [...TITULOS_FIXOS, 'Pipeline', 'Multiagentes'];
export const FONTES = ['CLAUDE.md', 'docs/arquitetura.md'];
const MAX_ITEM = 240;

const tokens = (texto) => Math.ceil(Buffer.byteLength(texto) / CARACTERES_POR_TOKEN);
const vezes = (texto, trecho) => texto.split(trecho).length - 1;
const linhasDe = (texto) => texto.split(/\r?\n/);

/**
 * Divide o agente: `{ cabecalho, corpo, regras, projeto, fixa, fora }` (`fixa` = o corpo sem o conteúdo do projeto;
 * `fora` = o texto inteiro sem ele, cabeçalho incluído), ou `{ erro }` dizendo o que falta. Vale com exatamente um par de
 * cada marcador, na ordem `regras`, `projeto`, depois do cabeçalho.
 */
export function partes(texto) {
  const cab = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(texto);
  if (cab === null) return { erro: 'o agente não começa com um cabeçalho --- ... ---' };
  const pos = {};
  for (const [nome, marcador] of Object.entries(MARCADORES)) {
    const n = vezes(texto, marcador);
    if (n !== 1) return { erro: `o marcador ${marcador} aparece ${n} vez(es), e tem de aparecer exatamente 1` };
    pos[nome] = texto.indexOf(marcador);
  }
  const ordem = [cab[0].length, pos.regrasIni, pos.regrasFim, pos.projetoIni, pos.projetoFim];
  if (ordem.some((p, i) => i > 0 && p <= ordem[i - 1])) return { erro: 'marcadores fora de ordem: regras:inicio, regras:fim, projeto:inicio e projeto:fim, nessa ordem e depois do cabeçalho' };
  const regrasDe = pos.regrasIni + MARCADORES.regrasIni.length;
  const projetoDe = pos.projetoIni + MARCADORES.projetoIni.length;
  return {
    cabecalho: cab[0],
    corpo: texto.slice(cab[0].length),
    regras: texto.slice(regrasDe, pos.regrasFim),
    projeto: texto.slice(projetoDe, pos.projetoFim),
    fixa: texto.slice(cab[0].length, projetoDe) + texto.slice(pos.projetoFim),
    fora: texto.slice(0, projetoDe) + texto.slice(pos.projetoFim),
    _regras: [regrasDe, pos.regrasFim],
    _projeto: [projetoDe, pos.projetoFim],
  };
}

/** O bloco `dominio` dentro da parte do projeto: `{ antes, conteudo, depois }`, `{ sem: true }` ou `{ erro }`. */
function dominioDe(projeto) {
  const ini = vezes(projeto, DOMINIO_INI);
  const fim = vezes(projeto, DOMINIO_FIM);
  if (ini === 0 && fim === 0) return { sem: true };
  if (ini !== 1 || fim !== 1 || projeto.indexOf(DOMINIO_INI) > projeto.indexOf(DOMINIO_FIM)) {
    return { erro: `os marcadores ${DOMINIO_INI} e ${DOMINIO_FIM} têm de aparecer uma vez cada, nessa ordem` };
  }
  const de = projeto.indexOf(DOMINIO_INI) + DOMINIO_INI.length;
  const ate = projeto.indexOf(DOMINIO_FIM);
  return { antes: projeto.slice(0, de - DOMINIO_INI.length), conteudo: projeto.slice(de, ate), depois: projeto.slice(ate + DOMINIO_FIM.length), de, ate };
}

/** Verdadeiro se o CLAUDE.md já foi preenchido: a 1ª linha (sem o BOM) deixou de ser o `# <Nome do projeto>` do modelo. */
export const adotado = (claudeMd) => !/^#\s*<[^>]*>\s*$/.test(linhasDe(claudeMd.replace(/^\uFEFF/, ''))[0] ?? '');

/**
 * As regras da seção `## Regras que não se negociam` do CLAUDE.md: `{ fixas, dominio }` (cada item, com tudo o que o continua,
 * como texto literal), ou `{ erro }` se um título fixo falta ou se repete, ou se a seção tem linha solta. O item sem título
 * conhecido é do domínio. O item continua na linha de 3 espaços ou mais ou com tab (sublista aninhada inclusive) e na linha em
 * branco seguida de linha assim; o branco do fim sai. Linha não vazia que não é item nem continuação é erro, com a linha no texto.
 */
export function extrairRegras(claudeMd) {
  const linhas = linhasDe(claudeMd);
  const ini = linhas.findIndex((l) => /^##\s+Regras que não se negociam\s*$/.test(l));
  if (ini === -1) return { erro: 'o CLAUDE.md não tem a seção "## Regras que não se negociam"' };
  const fim = linhas.findIndex((l, i) => i > ini && /^##\s/.test(l));
  const itens = [];
  let brancos = 0;
  for (const linha of linhas.slice(ini + 1, fim === -1 ? undefined : fim)) {
    if (linha.trim() === '') {
      if (itens.length > 0) brancos += 1;
    } else if (/^\d+\. /.test(linha)) {
      itens.push({ titulo: /^\d+\. \*\*(.+?)\*\*/.exec(linha)?.[1].replace(/:$/, '').trim(), linhas: [linha.trimEnd()] });
      brancos = 0;
    } else if (itens.length > 0 && /^(?: {3}|\t)/.test(linha)) {
      for (; brancos > 0; brancos -= 1) itens.at(-1).linhas.push('');
      itens.at(-1).linhas.push(linha.trimEnd());
    } else return { erro: `linha solta na seção "## Regras que não se negociam" do CLAUDE.md, que não é item nem continua um (3 espaços ou mais, ou tab): "${linha.trim()}"` };
  }
  for (const titulo of TITULOS_FIXOS) {
    const n = itens.filter((i) => i.titulo === titulo).length;
    if (n === 0) return { erro: `falta no CLAUDE.md a regra de título "${titulo}"` };
    if (n > 1) return { erro: `a regra de título "${titulo}" aparece mais de uma vez no CLAUDE.md` };
  }
  const texto = (i) => i.linhas.join('\n');
  return {
    fixas: itens.filter((i) => TITULOS_FIXOS.includes(i.titulo)).map(texto),
    dominio: itens.filter((i) => !TITULOS_DO_MODELO.includes(i.titulo)).map(texto),
  };
}

/**
 * Regrava o bloco `regras` (as regras fixas) e, se o CLAUDE.md já foi adotado, o bloco `dominio` (as regras do domínio,
 * criado no topo da parte do projeto se faltar); o resto fica como está. Idempotente. Erro de extração ou de marcador sobe.
 */
export function sincronizar(texto, claudeMd) {
  const p = partes(texto);
  if (p.erro !== undefined) throw new Error(p.erro);
  const r = extrairRegras(claudeMd);
  if (r.erro !== undefined) throw new Error(r.erro);
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const bloco = (itens) => (itens.length === 0 ? eol : `${eol}${itens.map((i) => i.split('\n').join(eol)).join(eol)}${eol}`);
  let novo = texto.slice(0, p._regras[0]) + bloco(r.fixas) + texto.slice(p._regras[1]);
  if (!adotado(claudeMd)) return novo;
  const q = partes(novo);
  const d = dominioDe(q.projeto);
  if (d.erro !== undefined) throw new Error(d.erro);
  let projeto;
  if (d.sem) {
    if (r.dominio.length === 0) return novo;
    projeto = `${eol}${DOMINIO_INI}${bloco(r.dominio)}${DOMINIO_FIM}${q.projeto}`;
  } else projeto = q.projeto.slice(0, d.de) + bloco(r.dominio) + q.projeto.slice(d.ate);
  novo = novo.slice(0, q._projeto[0]) + projeto + novo.slice(q._projeto[1]);
  return novo;
}

/** Verdadeiro se a parte do projeto, sem os comentários `<!-- -->` e sem espaço, não tem nada. Texto sem os marcadores não é vazio. */
export function vazia(texto) {
  const p = partes(texto);
  return p.erro === undefined && p.projeto.replace(/<!--[\s\S]*?-->/g, '').trim() === '';
}

/** Tudo fora do conteúdo do projeto igual byte a byte (cabeçalho, bloco de regras, marcadores e CRLF inclusive); falso se um dos dois não divide. */
export function mesmaParteFixa(antes, depois) {
  const a = partes(antes);
  const b = partes(depois);
  return a.erro === undefined && b.erro === undefined && a.fora === b.fora;
}

const corta = (t) => (t.length > 40 ? `${t.slice(0, 40)}...` : t);
const semLista = (l) => l.trim().replace(/^(?:[-*+]|\d+\.)\s+/, '');

const MARCA_DE_FONTE = /^- (.*\S)\s*\[(CLAUDE\.md|docs\/arquitetura\.md)\]$/;
const MARCA_DE_AJUSTE = /^- (.*\S)\s*\[ajuste (\d{4}-\d{2}-\d{2})\]$/;

/** O texto do registro do ajuste de `data`, ou `null` se não há leitor, o registro não existe ou a leitura falha. */
function registroDoAjuste(fontes, data) {
  try {
    const texto = typeof fontes?.ajuste === 'function' ? fontes.ajuste(data) : null;
    return typeof texto === 'string' ? texto : null;
  } catch {
    return null;
  }
}

/** Os problemas de fonte de um item "- ..." da parte do projeto fora do bloco `dominio`: sem marca, ou com marca que não confere. */
function problemaDeFonte(linha, fontes) {
  const doc = MARCA_DE_FONTE.exec(linha);
  if (doc !== null) {
    const fonte = fontes?.[doc[2]];
    if (typeof fonte !== 'string') return [`a fonte ${doc[2]} do item "${corta(doc[1])}" não foi lida`];
    if (!linhasDe(fonte).some((f) => semLista(f) === doc[1].trim())) return [`a fonte não confere: o item "${corta(doc[1])}" diz vir de ${doc[2]}, mas nenhuma linha de lá é igual`];
    return [];
  }
  const ajuste = MARCA_DE_AJUSTE.exec(linha);
  if (ajuste !== null) {
    const registro = registroDoAjuste(fontes, ajuste[2]);
    const entra = (l) => /^- entra:/.test(l.trim()) && l.trim().slice('- entra:'.length).trim() === ajuste[1].trim();
    if (registro === null || !linhasDe(registro).some(entra)) {
      return [`a fonte não confere: o item "${corta(ajuste[1])}" diz vir do ajuste ${ajuste[2]}, mas docs/pipeline/ajustes/${ajuste[2]}-desenvolvedor.md não existe ou não tem a linha "- entra: " com o mesmo texto`];
    }
    return [];
  }
  return [`item sem fonte: "${corta(linha.slice(2).trim())}" não termina em [CLAUDE.md], [docs/arquitetura.md] nem [ajuste AAAA-MM-DD]`];
}

/**
 * Os problemas do agente, em frases (lista vazia = nada a dizer): o cabeçalho, os marcadores, os tetos, o formato da parte
 * do projeto fora do bloco `dominio`, a presença do bloco `dominio` e a fonte de cada item (toda linha `- ` fora do bloco tem marca).
 * `entrada` é `agentes.desenvolvedor` do pipeline.json (o cabeçalho sai dela). `fontes` é
 * `{ 'CLAUDE.md': texto, 'docs/arquitetura.md': texto, ajuste(data) }`, com `ajuste` devolvendo o texto de
 * `docs/pipeline/ajustes/<data>-desenvolvedor.md` ou `null`.
 * Não compara os blocos gerados com o CLAUDE.md: isso é do teste (D8: não barrar o agente no meio da sessão).
 */
export function problemas(texto, fontes, entrada) {
  if (entrada === undefined) return ['falta agentes.desenvolvedor no pipeline.json: sem ele não há cabeçalho para comparar'];
  const p = partes(texto);
  if (p.erro !== undefined) return [p.erro];
  const achados = [];
  if (p.cabecalho !== cabecalho(entrada)) achados.push('o cabeçalho não é o do modelo, byte a byte (campo a mais, repetido, fim de linha ou valor diferente)');
  for (const [rotulo, parte, teto] of [['o corpo', p.corpo, TETO_CORPO], ['a parte fixa', p.fixa, TETO_FIXA], ['a parte do projeto', p.projeto, TETO_PROJETO]]) {
    if (tokens(parte) > teto) achados.push(`${rotulo} estima ${tokens(parte)} tokens (tamanho ÷ ${CARACTERES_POR_TOKEN}), acima do teto de ${teto}`);
  }
  const d = dominioDe(p.projeto);
  if (d.erro !== undefined) return [...achados, d.erro];
  const claudeMd = fontes?.['CLAUDE.md'];
  if (d.sem && typeof claudeMd === 'string' && adotado(claudeMd)) {
    // a extração em erro não pode calar a falta do bloco: o erro dela vira o problema, com a frase dele
    const r = extrairRegras(claudeMd);
    if (r.erro !== undefined) achados.push(r.erro);
    else if (r.dominio.length > 0) achados.push('falta o bloco das regras do domínio: rode `node .claude/hooks/ajusta-pipeline.mjs --sincronizar-desenvolvedor`');
  }
  const livre = d.sem ? p.projeto : d.antes + d.depois;
  for (const linha of linhasDe(livre)) {
    const l = linha.trimEnd();
    if (l.trim() === '') continue;
    if (!/^- \S/.test(l)) achados.push(`a parte do projeto só aceita itens "- ...": "${corta(l.trim())}" não é (sem título, cerca de código, comentário nem marcador)`);
    else if (l.length > MAX_ITEM) achados.push(`um item da parte do projeto passa de ${MAX_ITEM} caracteres: "${corta(l)}"`);
    else if (/<!--|-->|```/.test(l)) achados.push(`um item da parte do projeto tem comentário ou cerca de código: "${corta(l)}"`);
    if (/^- \S/.test(l)) achados.push(...problemaDeFonte(l, fontes));
  }
  return achados;
}
