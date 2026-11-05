// O agente de código `desenvolvedor` (D8), em três zonas com um dono cada: o cabeçalho e o texto fixo (do modelo), o bloco
// `regras` (gerado do CLAUDE.md pelo título em negrito de cada regra) e a parte do projeto, entre os marcadores
// `projeto:inicio` e `projeto:fim` (do orquestrador, só itens `- `, com um bloco `dominio` gerado da regra 8). Puro: só
// `node:*`, sem ler arquivo. A guarda dos subagentes chama `problemas` em toda chamada; `sincronizar` é o que o
// `ajusta-pipeline.mjs --sincronizar-desenvolvedor` grava; `mesmaParteFixa` é a conta da exceção do `escolhe-revisores`.

/** O cabeçalho exato, com o fim de linha LF; qualquer outro (campo a mais, CRLF, aspas) é problema. */
export const CABECALHO = `---
name: desenvolvedor
description: Agente de código deste projeto. Escreve código, teste ou migração numa pasta, num worktree, com o pacote de contexto do orquestrador; roda os portões e só commita no branch dele.
model: sonnet
effort: medium
tools: Read, Edit, Write, Bash, Grep, Glob
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

/** Verdadeiro se o CLAUDE.md já foi preenchido: a 1ª linha deixou de ser o `# <Nome do projeto>` do modelo. */
export const adotado = (claudeMd) => !/^#\s*<[^>]*>\s*$/.test(linhasDe(claudeMd)[0] ?? '');

/**
 * As regras da seção `## Regras que não se negociam` do CLAUDE.md: `{ fixas, dominio }` (cada item, com os subitens de 3
 * espaços, como texto literal), ou `{ erro }` se um título fixo falta ou se repete. O item sem título conhecido é do domínio.
 */
export function extrairRegras(claudeMd) {
  const linhas = linhasDe(claudeMd);
  const ini = linhas.findIndex((l) => /^##\s+Regras que não se negociam\s*$/.test(l));
  if (ini === -1) return { erro: 'o CLAUDE.md não tem a seção "## Regras que não se negociam"' };
  const fim = linhas.findIndex((l, i) => i > ini && /^##\s/.test(l));
  const itens = [];
  let aberto = false;
  for (const linha of linhas.slice(ini + 1, fim === -1 ? undefined : fim)) {
    if (/^\d+\. /.test(linha)) {
      itens.push({ titulo: /^\d+\. \*\*(.+?)\*\*/.exec(linha)?.[1].replace(/:$/, '').trim(), linhas: [linha.trimEnd()] });
      aberto = true;
    } else if (aberto && /^ {3}\S/.test(linha)) itens.at(-1).linhas.push(linha.trimEnd());
    else aberto = false;
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

/**
 * Os problemas do agente, em frases (lista vazia = nada a dizer): o cabeçalho, os marcadores, os tetos, o formato da parte
 * do projeto fora do bloco `dominio` e a fonte de cada item marcado. `fontes` é `{ 'CLAUDE.md': texto, 'docs/arquitetura.md': texto }`.
 * Não compara os blocos gerados com o CLAUDE.md: isso é do teste (D8: não barrar o agente no meio da sessão).
 */
export function problemas(texto, fontes) {
  const p = partes(texto);
  if (p.erro !== undefined) return [p.erro];
  const achados = [];
  if (p.cabecalho !== CABECALHO) achados.push('o cabeçalho não é o do modelo, byte a byte (campo a mais, repetido, fim de linha ou valor diferente)');
  for (const [rotulo, parte, teto] of [['o corpo', p.corpo, TETO_CORPO], ['a parte fixa', p.fixa, TETO_FIXA], ['a parte do projeto', p.projeto, TETO_PROJETO]]) {
    if (tokens(parte) > teto) achados.push(`${rotulo} estima ${tokens(parte)} tokens (tamanho ÷ ${CARACTERES_POR_TOKEN}), acima do teto de ${teto}`);
  }
  const d = dominioDe(p.projeto);
  if (d.erro !== undefined) return [...achados, d.erro];
  const livre = d.sem ? p.projeto : d.antes + d.depois;
  for (const linha of linhasDe(livre)) {
    const l = linha.trimEnd();
    if (l.trim() === '') continue;
    if (!/^- \S/.test(l)) achados.push(`a parte do projeto só aceita itens "- ...": "${corta(l.trim())}" não é (sem título, cerca de código, comentário nem marcador)`);
    else if (l.length > MAX_ITEM) achados.push(`um item da parte do projeto passa de ${MAX_ITEM} caracteres: "${corta(l)}"`);
    else if (/<!--|-->|```/.test(l)) achados.push(`um item da parte do projeto tem comentário ou cerca de código: "${corta(l)}"`);
    const marca = /^- (.*\S)\s*\[(CLAUDE\.md|docs\/arquitetura\.md)\]$/.exec(l);
    if (marca !== null) {
      const fonte = fontes?.[marca[2]];
      if (typeof fonte !== 'string') achados.push(`a fonte ${marca[2]} do item "${corta(marca[1])}" não foi lida`);
      else if (!linhasDe(fonte).some((f) => semLista(f) === marca[1].trim())) achados.push(`o item "${corta(marca[1])}" diz vir de ${marca[2]}, mas nenhuma linha de lá é igual`);
    }
  }
  return achados;
}
