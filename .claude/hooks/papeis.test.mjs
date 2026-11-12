// O papeis.mjs (D11): lê as chaves de par do pipeline.json, recusa o que quebra a estrutura e responde às consultas (faixa, degrau...).
// E a fronteira: nenhum outro .mjs de .claude/hooks lê essas chaves nem define as constantes de par que saíram do código.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO } from './config.mjs';
import { agentesFixos, comum, degrau, ehFixo, esforcosDe, esforcosNegados, faixa, lerAgentes, lerNiveis, lerPapeis, nomesDeAgentes, orquestrador, papel, papeisDeObjeto, par, versoes } from './papeis.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const dados = () => JSON.parse(readFileSync(ARQUIVO, 'utf8'));
/** O pipeline.json de verdade com `muda(dados)` aplicado (a cópia é nossa). */
const com = (muda) => { const d = dados(); muda(d); return d; };
const erro = (d) => papeisDeObjeto(d).erro;
const P = papeisDeObjeto(dados()).valor;

/** Roda `fn(caminho)` com um pipeline.json temporário (objeto vira JSON; texto vai como está; undefined = sem arquivo). */
function comArquivo(conteudo, fn) {
  const pasta = mkdtempSync(join(tmpdir(), 'papeis-'));
  const caminho = join(pasta, 'pipeline.json');
  try {
    if (conteudo !== undefined) writeFileSync(caminho, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
    fn(caminho);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

// ---------- o arquivo do projeto ----------

test('o pipeline.json do projeto carrega: famílias com versão, escada, comum, o desenvolvedor e a orquestração', () => {
  const r = lerPapeis();
  assert.equal(r.erro, null);
  assert.deepEqual(Object.keys(r.valor).sort(), ['agentes', 'comum', 'escada', 'familias', 'niveis']);
  assert.deepEqual(Object.keys(versoes(r.valor)).sort(), ['haiku', 'opus', 'sonnet']);
  assert.ok(r.valor.escada.length >= 3);
  assert.ok(papel(r.valor, 'agentes', 'desenvolvedor'));
  assert.ok(papel(r.valor, 'niveis', 'orquestracao'));
});

test('as entradas de verdade: o que é fixo, o que anda entre piso e teto, e o desenvolvedor fora dos agentes fixos', () => {
  const fixos = { agentes: ['revisor-seguranca', 'leitor-docs', 'designer-ui'], niveis: ['leve', 'autoanalise', 'orquestracao', 'forte'] };
  for (const [secao, nomes] of Object.entries(fixos)) for (const n of nomes) assert.equal(ehFixo(papel(P, secao, n)), true, `${secao}.${n} é fixo`);
  const faixas = {
    'agentes.revisor-arquitetura': ['opus:medium', 'opus:high'], 'agentes.qa': ['sonnet:medium', 'sonnet:high'], 'agentes.revisor-tela': ['sonnet:medium', 'sonnet:high'],
    'agentes.desenvolvedor': ['sonnet:low', 'sonnet:high'], 'niveis.medio': ['sonnet:medium', 'sonnet:high'], 'niveis.codigo-seguranca': ['sonnet:high', 'sonnet:high'],
    'niveis.revisao-ponytail': ['sonnet:medium', 'sonnet:high'],
  };
  for (const [id, [piso, teto]] of Object.entries(faixas)) {
    const [secao, nome] = id.split('.');
    assert.deepEqual([papel(P, secao, nome).piso, papel(P, secao, nome).teto], [piso, teto], id);
  }
  assert.deepEqual(par(papel(P, 'agentes', 'revisor-seguranca')), 'opus:xhigh');
  assert.deepEqual(par(papel(P, 'agentes', 'leitor-docs')), 'haiku:low');
  assert.deepEqual(par(papel(P, 'agentes', 'designer-ui')), 'sonnet:high');
  assert.deepEqual(orquestrador(P), { model: 'opus', effort: 'xhigh' });
  assert.equal(Object.hasOwn(agentesFixos(P), 'desenvolvedor'), false, 'o desenvolvedor não é agente fixo (tem as regras da D8)');
  assert.equal(nomesDeAgentes(P).includes('desenvolvedor'), true);
  assert.deepEqual(Object.keys(lerAgentes().valor), Object.keys(agentesFixos(P)));
  assert.deepEqual(Object.keys(lerNiveis().valor), Object.keys(P.niveis));
});

test('lerPapeis: arquivo ausente, ilegível e objeto que não é objeto falham com erro; o BOM é aceito', () => {
  comArquivo(undefined, (c) => assert.match(lerPapeis(c).erro, /não consegui ler/));
  comArquivo('{ quebrado', (c) => assert.match(lerPapeis(c).erro, /não é JSON válido/));
  comArquivo('[]', (c) => assert.match(lerPapeis(c).erro, /tem de ser um objeto JSON/));
  comArquivo(`﻿${JSON.stringify(dados())}`, (c) => assert.equal(lerPapeis(c).erro, null));
  comArquivo(dados(), (c) => assert.deepEqual(lerPapeis(c).valor, P));
  for (const ler of [lerAgentes, lerNiveis]) comArquivo('{ quebrado', (c) => assert.notEqual(ler(c).erro, null));
});

// ---------- a estrutura que fica no código: cada regra recusada ----------

test('familias: só opus, sonnet e haiku, cada uma com a versão claude-<família>-…', () => {
  const casos = [
    ['sem a chave', com((d) => { delete d.familias; }), /familias/],
    ['família a menos', com((d) => { delete d.familias.haiku; }), /familias/],
    ['família que não existe', com((d) => { d.familias.fable = 'claude-fable-1'; }), /familias/],
    ['a versão da família opus aponta para haiku', com((d) => { d.familias.opus = 'claude-haiku-5-5'; }), /familias\.opus/],
    ['versão sem o formato', com((d) => { d.familias.sonnet = 'sonnet-5'; }), /familias\.sonnet/],
    ['versão com espaço', com((d) => { d.familias.sonnet = 'claude-sonnet-5 5'; }), /familias\.sonnet/],
    ['versão que não é texto', com((d) => { d.familias.haiku = 5; }), /familias\.haiku/],
  ];
  for (const [rotulo, d, esperado] of casos) assert.match(erro(d), esperado, rotulo);
});

test('escada: sem repetição, só pares válidos e cada família contígua, com o esforço subindo', () => {
  const casos = [
    ['sem a chave', com((d) => { delete d.escada; }), /escada em/],
    ['vazia', com((d) => { d.escada = []; }), /escada em/],
    ['par sem família conhecida', com((d) => { d.escada.push('fable:high'); }), /escada em/],
    ['esforço que não existe', com((d) => { d.escada.push('opus:altissimo'); }), /escada em/],
    ['par repetido', com((d) => { d.escada.push('sonnet:low'); }), /sonnet:low aparece mais de uma vez/],
    ['família que volta depois de outra', com((d) => { d.escada = ['sonnet:low', 'opus:medium', 'opus:high', 'sonnet:medium']; }), /sonnet tem de ser contígua/],
    ['esforço que não sobe dentro da família', com((d) => { d.escada = ['haiku:low', 'sonnet:high', 'sonnet:medium', 'opus:medium']; }), /esforço tem de subir/],
    ['não é lista', com((d) => { d.escada = 'sonnet:low'; }), /escada em/],
  ];
  for (const [rotulo, d, esperado] of casos) assert.match(erro(d), esperado, rotulo);
});

test('comum: esforcos, passa e confirma, cada um válido', () => {
  const casos = [
    ['sem a chave', com((d) => { delete d.comum; }), /comum em/],
    ['esforco que não existe', com((d) => { d.comum.esforcos = ['low', 'enorme']; }), /comum em/],
    ['esforcos vazio', com((d) => { d.comum.esforcos = []; }), /comum em/],
    ['passa com família que não existe', com((d) => { d.comum.passa = ['fable']; }), /comum em/],
    ['passa vazio', com((d) => { d.comum.passa = []; }), /comum em/],
    ['confirma que não é lista de texto', com((d) => { d.comum.confirma = [1]; }), /comum em/],
    ['o mesmo modelo em passa e em confirma', com((d) => { d.comum.confirma = ['sonnet']; }), /passa e em confirma/],
  ];
  for (const [rotulo, d, esperado] of casos) assert.match(erro(d), esperado, rotulo);
});

test('entradas: nome, model, effort, tools e tarefa inválidos; o nome aposentado não volta', () => {
  const q = () => dados().agentes.qa;
  const casos = [
    ['model que não é família', com((d) => { d.agentes.qa = { ...q(), model: 'gpt' }; }), /agentes\.qa/],
    ['effort que não existe', com((d) => { d.agentes.qa = { ...q(), effort: 'enorme' }; }), /agentes\.qa/],
    ['sem tools', com((d) => { delete d.agentes.qa.tools; }), /agentes\.qa: tools é obrigatório/],
    ['tools com quebra de linha', com((d) => { d.agentes.qa.tools = 'Read\nBash'; }), /agentes\.qa: tools é obrigatório/],
    ['tarefa que não é texto', com((d) => { d.agentes.qa.tarefa = 3; }), /agentes\.qa: tarefa/],
    ['nome inválido', com((d) => { d.agentes['nome ruim'] = q(); }), /nome inválido/],
    ['o revisor aposentado (D34) volta', com((d) => { d.agentes['revisor-lgpd'] = dados().agentes['revisor-seguranca']; }), /aposentado/],
    ['nível sem effort', com((d) => { d.niveis.leve = { model: 'sonnet' }; }), /niveis\.leve/],
    ['seção que não é objeto', com((d) => { d.niveis = []; }), /niveis em/],
    ['seção vazia', com((d) => { d.agentes = {}; }), /agentes em/],
    ['par fora da escada', com((d) => { d.agentes['revisor-seguranca'].effort = 'max'; }), /opus:max está fora da escada/],
    ['faltam o desenvolvedor', com((d) => { delete d.agentes.desenvolvedor; }), /agentes\.desenvolvedor falta/],
    ['falta a orquestracao', com((d) => { delete d.niveis.orquestracao; }), /niveis\.orquestracao falta/],
  ];
  for (const [rotulo, d, esperado] of casos) assert.match(erro(d), esperado, rotulo);
});

test('piso e teto: vêm juntos, na escada, no mesmo modelo da entrada, com piso ≤ par ≤ teto', () => {
  const arq = () => dados().agentes['revisor-arquitetura'];
  const casos = [
    ['só o piso', com((d) => { delete d.agentes['revisor-arquitetura'].teto; }), /piso e teto vêm juntos/],
    ['só o teto', com((d) => { delete d.agentes['revisor-arquitetura'].piso; }), /piso e teto vêm juntos/],
    ['piso fora da escada', com((d) => { d.agentes['revisor-arquitetura'].piso = 'opus:low'; }), /piso opus:low está fora da escada/],
    ['teto que não é texto', com((d) => { d.agentes['revisor-arquitetura'].teto = 3; }), /teto 3 está fora da escada/],
    ['o par abaixo do piso', com((d) => { d.agentes['revisor-arquitetura'] = { ...arq(), effort: 'medium', piso: 'opus:high', teto: 'opus:xhigh' }; }), /opus:medium, abaixo do piso opus:high/],
    ['o par acima do teto', com((d) => { d.agentes['revisor-arquitetura'] = { ...arq(), effort: 'xhigh' }; }), /opus:xhigh, acima do teto opus:high/],
    ['piso acima do teto', com((d) => { d.agentes['revisor-arquitetura'] = { ...arq(), effort: 'high', piso: 'opus:xhigh', teto: 'opus:medium' }; }), /abaixo do piso|acima do teto/],
    ['o piso de outro modelo (o modelo vem do papel, D3)', com((d) => { d.agentes['revisor-arquitetura'].piso = 'sonnet:high'; }), /piso sonnet:high é de outro modelo/],
    ['o teto de outro modelo', com((d) => { d.agentes.qa.teto = 'opus:high'; }), /teto opus:high é de outro modelo/],
    ['o par em outro modelo que piso e teto', com((d) => { d.agentes.qa = { ...dados().agentes.qa, model: 'opus', effort: 'high' }; }), /de outro modelo/],
  ];
  for (const [rotulo, d, esperado] of casos) assert.match(erro(d), esperado, rotulo);
  // sem piso e teto o par é fixo: qualquer par da escada vale, e o modelo vem do que está escrito
  assert.equal(erro(com((d) => { d.agentes['revisor-seguranca'] = { ...dados().agentes['revisor-seguranca'], effort: 'high' }; })), null);
  assert.equal(erro(com((d) => { d.agentes.qa.effort = 'medium'; })), null, 'dentro da faixa');
});

// ---------- as consultas ----------

test('faixa: abaixo, dentro e acima do piso e do teto; outro modelo é fora; a entrada fixa só tem o par dela', () => {
  const arq = papel(P, 'agentes', 'revisor-arquitetura');
  assert.equal(faixa('opus:low', arq), 'abaixo');
  assert.equal(faixa('opus:medium', arq), 'dentro');
  assert.equal(faixa('opus:high', arq), 'dentro');
  assert.equal(faixa('opus:xhigh', arq), 'acima');
  assert.equal(faixa('opus:max', arq), 'acima');
  assert.equal(faixa('sonnet:high', arq), 'fora');
  assert.equal(faixa('fable:high', arq), 'fora');
  assert.equal(faixa('opus', arq), 'fora', 'sem esforço');
  assert.equal(faixa('opus:enorme', arq), 'fora', 'esforço que não existe');
  const dev = papel(P, 'agentes', 'desenvolvedor');
  assert.deepEqual(['low', 'medium', 'high', 'xhigh', 'max'].map((e) => faixa(`sonnet:${e}`, dev)), ['dentro', 'dentro', 'dentro', 'acima', 'acima']);
  const seg = papel(P, 'agentes', 'revisor-seguranca');
  assert.deepEqual(['medium', 'high', 'xhigh', 'max'].map((e) => faixa(`opus:${e}`, seg)), ['abaixo', 'abaixo', 'dentro', 'acima']);
  assert.equal(faixa('opus:xhigh', { model: 'opus', effort: 'high', piso: 'opus:high', teto: 'sonnet:high' }), 'fora', 'o teto de outro modelo');
});

test('esforcosDe e esforcosNegados: do piso ao teto, no modelo da entrada, e o resto para a mensagem', () => {
  assert.deepEqual(esforcosDe(papel(P, 'agentes', 'desenvolvedor')), ['low', 'medium', 'high']);
  assert.deepEqual(esforcosDe(papel(P, 'agentes', 'revisor-arquitetura')), ['medium', 'high']);
  assert.deepEqual(esforcosDe(papel(P, 'agentes', 'revisor-seguranca')), ['xhigh']);
  assert.equal(esforcosNegados(['low', 'medium', 'high']), 'xhigh e max');
});

test('degrau: anda um degrau, preso ao piso e ao teto; entrada fixa não anda; o modelo nunca muda', () => {
  const alvo = (secao, chave, entrada = papel(P, secao, chave)) => ({ secao, chave, entrada });
  const arq = (effort) => alvo('agentes', 'revisor-arquitetura', { ...papel(P, 'agentes', 'revisor-arquitetura'), effort });
  assert.deepEqual(degrau(P, arq('high'), -1), { de: 'opus:high', para: 'opus:medium' });
  assert.deepEqual(degrau(P, arq('medium'), +1), { de: 'opus:medium', para: 'opus:high' });
  assert.match(degrau(P, arq('medium'), -1).erro, /já está no piso \(opus:medium\)/, 'preso no piso');
  assert.match(degrau(P, arq('high'), +1).erro, /teto da guarda \(opus:high\)/, 'preso no teto');
  const medio = (effort) => alvo('niveis', 'medio', { ...papel(P, 'niveis', 'medio'), effort });
  assert.deepEqual(degrau(P, medio('medium'), +1), { de: 'sonnet:medium', para: 'sonnet:high' });
  assert.match(degrau(P, medio('high'), +1).erro, /o nível medio não passa de sonnet:high/, 'o nível preso no teto não vai ao opus');
  assert.match(degrau(P, medio('medium'), -1).erro, /já está no piso \(sonnet:medium\)/);
  for (const [secao, nome] of [['agentes', 'revisor-seguranca'], ['agentes', 'leitor-docs'], ['niveis', 'orquestracao'], ['niveis', 'leve']]) {
    for (const delta of [-1, +1]) assert.match(degrau(P, alvo(secao, nome), delta).erro, /é fixo em/, `${nome} ${delta}`);
  }
  const cs = alvo('niveis', 'codigo-seguranca');
  for (const delta of [-1, +1]) assert.ok(degrau(P, cs, delta).erro, 'piso igual ao teto: não anda para nenhum lado');
  assert.match(degrau(P, alvo('agentes', 'x', { model: 'sonnet', effort: 'xhigh', piso: 'sonnet:low', teto: 'sonnet:high' }), -1).erro, /fora da escada/);
  // só dentro do mesmo modelo: com piso e teto de outro modelo (montado na mão) o degrau não troca de modelo
  const cruzado = { model: 'sonnet', effort: 'high', piso: 'sonnet:medium', teto: 'opus:high' };
  assert.match(degrau(P, alvo('agentes', 'x', cruzado), +1).erro, /o ajuste só mexe no esforço/);
  // qualquer par de partida de qualquer entrada que anda: o degrau fica no modelo dela
  for (const secao of ['agentes', 'niveis']) {
    for (const [nome, e] of Object.entries(P[secao])) {
      if (ehFixo(e)) continue;
      for (const efforts of [esforcosDe(e)]) {
        for (const effort of efforts) for (const delta of [-1, +1]) {
          const r = degrau(P, alvo(secao, nome, { ...e, effort }), delta);
          if (r.para !== undefined) assert.equal(r.para.split(':')[0], e.model, `${secao}.${nome} ${effort} ${delta}`);
        }
      }
    }
  }
});

test('versoes, comum e orquestrador: cópias do que está no arquivo', () => {
  assert.deepEqual(versoes(P), { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' });
  const c = comum(P);
  assert.deepEqual(c, { esforcos: ['low', 'medium', 'high'], passa: ['sonnet'], confirma: ['opus', 'fable'] });
  c.passa.push('haiku');
  versoes(P).opus = 'x';
  assert.deepEqual(comum(P).passa, ['sonnet'], 'mexer na cópia não mexe nos papéis');
  assert.equal(versoes(P).opus, 'claude-opus-5-5');
  assert.equal(papel(P, 'agentes', 'nao-existe'), undefined);
  assert.equal(papel(P, 'agentes', '__proto__'), undefined);
  assert.equal(papel(P, 'secao-que-nao-existe', 'qa'), undefined);
});

// ---------- a fronteira: só o papeis.mjs lê as chaves de par ----------

const CONSTANTES = ['FIXOS', 'PISOS', 'TETO', 'ESCADA', 'MODELOS', 'NIVEIS_DE_CODIGO'];
const CHAVES = ['agentes', 'niveis', 'escada', 'familias', 'comum'];
const SEM_COMENTARIO = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * As violações da fronteira num texto de .mjs: define uma das constantes que saíram do código, ou lê uma chave de par de um
 * objeto que veio do JSON (`JSON.parse(...)` direto, uma variável atribuída a ele, ou uma chamada `pipeline` ou `configuracao`), ou
 * importa o `lerObjeto`. É uma heurística por regex, sem análise do código: não vê o apelido (`const x = dados; x.agentes`),
 * a chave calculada (`dados[chave]`), o `Object.entries(dados)` nem o objeto passado de uma função para outra; e lê texto de dentro
 * de uma string como código (uma frase com `TETO = ` numa mensagem dá falso positivo).
 */
function violacoes(texto) {
  const limpo = SEM_COMENTARIO(texto);
  const achados = [];
  const nomes = CONSTANTES.join('|');
  const chaves = CHAVES.join('|');
  if (new RegExp(`\\b(?:const|let|var|function|class)\\s+(?:${nomes})\\b`).test(limpo) || new RegExp(`\\b(?:${nomes})\\s*=(?![=>])`).test(limpo) || new RegExp(`^\\s*(?:${nomes})\\s*:`, 'm').test(limpo)) {
    achados.push('define uma constante de par que saiu do código');
  }
  const doJson = [...limpo.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?JSON\.parse\(/g)].map((m) => m[1]);
  const objetos = [...new Set([...doJson, 'pipeline', 'configuracao'])].join('|');
  if (new RegExp(`\\b(?:${objetos})\\s*\\??\\.\\s*(?:${chaves})\\b|\\b(?:${objetos})\\s*\\[\\s*['"\`](?:${chaves})['"\`]\\s*\\]|JSON\\.parse\\([^)]*\\)\\s*\\??\\.\\s*(?:${chaves})\\b`).test(limpo)) {
    achados.push('lê uma chave de par do objeto do pipeline.json');
  }
  if (new RegExp(`\\{[^}]*\\b(?:${chaves})\\b[^}]*\\}\\s*=\\s*(?:${objetos})\\b`).test(limpo)) achados.push('lê uma chave de par por desestruturação do objeto do pipeline.json');
  if (/\blerObjeto\b/.test(limpo)) achados.push('usa o lerObjeto (a leitura crua do pipeline.json é do config.mjs e do papeis.mjs)');
  return achados;
}

test('a fronteira: nenhum .mjs de .claude/hooks fora do papeis.mjs define as constantes de par ou lê as chaves de par do pipeline.json', () => {
  const donos = new Set(['papeis.mjs']);
  const arquivos = readdirSync(AQUI).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !donos.has(f));
  assert.ok(arquivos.length > 10, 'achou os hooks');
  for (const f of arquivos) {
    // o config.mjs é o dono da leitura crua (`lerObjeto`) e das outras chaves; as de par ele não toca
    const achados = violacoes(readFileSync(join(AQUI, f), 'utf8')).filter((a) => !(f === 'config.mjs' && /lerObjeto/.test(a)));
    assert.deepEqual(achados, [], `${f}: ${achados.join('; ')}`);
  }
});

test('a heurística da fronteira pega o que é para pegar e deixa passar o que não é', () => {
  const ruim = [
    'export const TETO = { qa: {} };',
    'const ESCADA = ["sonnet:low"];',
    'let FIXOS;',
    'function PISOS() {}',
    'ESCADA = [];',
    'const x = { TETO: 1 };\nexport const y = {\n  PISOS: {},\n};',
    'const MODELOS = new Set([]);',
    'const NIVEIS_DE_CODIGO = [];',
    'const a = pipeline.agentes;',
    'const a = pipeline?.niveis;',
    'const a = configuracao["escada"];',
    'const dados = JSON.parse(texto);\nconst a = dados.agentes;',
    'const a = JSON.parse(texto).familias;',
    'const cru = JSON.parse(texto);\nconst a = cru.comum;',
    'const { agentes } = pipeline;',
    'import { lerObjeto } from "./config.mjs";',
  ];
  for (const t of ruim) assert.notDeepEqual(violacoes(t), [], t);
  const boa = [
    'const TETO_TOKENS = 50000;',
    'export const TETO_CORPO = 1500;',
    '// export const TETO = 1;',
    '/* const ESCADA = [] */',
    'const a = cfg.agentes;',
    'const a = p.niveis;',
    'const a = dados.revisao;',
    'const a = dados.ajuste;',
    'const sessao = lerSessao(x);\nconst a = sessao.agentes;',
    'const x = papeis.papel(p, "agentes", nome);',
    'if (TETO_TOKENS == 3) {}',
  ];
  for (const t of boa) assert.deepEqual(violacoes(t), [], t);
});
