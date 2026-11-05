// O módulo do agente `desenvolvedor` (D8): o cabeçalho exato, os marcadores, os tetos, a extração das regras do
// CLAUDE.md, o `sincronizar` e o lint da parte do projeto; mais o arquivo de verdade em .claude/agents/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CABECALHO, CARACTERES_POR_TOKEN, TITULOS_DO_MODELO, TITULOS_FIXOS, adotado, extrairRegras, mesmaParteFixa, partes, problemas, sincronizar, vazia } from './desenvolvedor.mjs';
import { CARACTERES_POR_TOKEN as DA_GUARDA } from './guarda-agentes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const lerReal = (...rel) => readFileSync(join(RAIZ, ...rel), 'utf8');

// Um CLAUDE.md inventado, no molde do modelo, e a fonte de arquitetura.
const regra = (n, titulo, resto, sub = '') => `${n}. **${titulo}** ${resto}${sub}\n`;
const claude = ({ adotar = true, dominio = '8. **Isolamento** entre donos de dado: nunca cruzar.\n   - o porquê está na D9.\n' } = {}) => `${adotar ? '# Projeto Ficticio' : '# <Nome do projeto>'}

## Regras que não se negociam

${regra(1, 'Pipeline:', 'siga a skill.', '\n   - subitem do pipeline')}${regra(2, 'Um `AGENTS.md` por pasta de trabalho', '(as de x).', '\n   - Ler o AGENTS.md.\n   - Pasta nova nasce com o seu.')}${regra(3, 'Multiagentes:', 'orquestrador.')}${regra(4, 'Dado inventado', 'em todo teste.')}${regra(5, 'Local primeiro:', 'sem produção.')}${regra(6, 'Segredos', 'nunca em código.')}${regra(7, 'Recurso pago', '(nuvem): só com sim.')}${dominio}
## Como rodar

- \`npm run checar:rapido\`: tipos e testes.
`;
const ARQ = '# Arquitetura\n\n- Linguagem: TypeScript estrito.\n- Testes: `npm test` roda tudo.\n';
const FONTES = { 'CLAUDE.md': claude(), 'docs/arquitetura.md': ARQ };

const eolDe = (t, eol) => (eol === '\r\n' ? t.replace(/\r?\n/g, '\r\n') : t);
/** Um agente válido, com as regras de `claudeMd` e o projeto dado. */
const agente = (projeto = '', claudeMd = claude({ adotar: false })) => sincronizar(`${CABECALHO}Texto fixo.\n\n<!-- regras:inicio -->\n<!-- regras:fim -->\n\nOutro texto.\n<!-- projeto:inicio -->${projeto}<!-- projeto:fim -->\n`, claudeMd);

// ---------- partes ----------

test('partes: devolve o cabeçalho, a parte fixa e a do projeto; sem exatamente um par de cada marcador, ou fora de ordem, erro que diz qual', () => {
  const p = partes(agente('\n- a\n'));
  assert.equal(p.cabecalho, CABECALHO);
  assert.equal(p.projeto, '\n- a\n');
  assert.ok(p.fixa.includes('Texto fixo.') && !p.fixa.includes('- a'));
  assert.match(partes(`${CABECALHO}corpo\n`).erro, /regras:inicio.*0 vez/);
  const um = agente();
  assert.match(partes(`${um}<!-- projeto:inicio -->\n<!-- projeto:fim -->\n`).erro, /projeto:inicio.*2 vez/);
  assert.match(partes(um.replace('<!-- regras:fim -->', '<!-- regras:inicio -->')).erro, /regras:inicio.*2 vez|regras:fim.*0 vez/);
  const trocado = um.replace('<!-- projeto:inicio -->', '@@').replace('<!-- projeto:fim -->', '<!-- projeto:inicio -->').replace('@@', '<!-- projeto:fim -->');
  assert.match(partes(trocado).erro, /fora de ordem/);
  assert.match(partes('sem cabeçalho\n').erro, /cabeçalho/);
});

test('partes: o texto em CRLF é lido igual, mas o cabeçalho em CRLF não é o CABECALHO', () => {
  const crlf = eolDe(agente('\n- a\n'), '\r\n');
  const p = partes(crlf);
  assert.equal(p.erro, undefined);
  assert.ok(p.projeto.includes('- a'));
  assert.notEqual(p.cabecalho, CABECALHO);
  assert.ok(problemas(crlf, FONTES).some((x) => /cabeçalho/.test(x)));
});

// ---------- o cabeçalho ----------

test('problemas: o cabeçalho tem de ser o CABECALHO byte a byte (campo a mais, repetido, tools errado, chave entre aspas)', () => {
  assert.deepEqual(problemas(agente('\n- a\n'), FONTES), []);
  const sem = agente();
  const variantes = {
    'campo a mais': sem.replace('omitClaudeMd: true\n', 'omitClaudeMd: true\npermissionMode: bypassPermissions\n'),
    'campo repetido': sem.replace('model: sonnet\n', 'model: sonnet\nmodel: opus\n'),
    'tools errado': sem.replace('tools: Read, Edit, Write, Bash, Grep, Glob', 'tools: Read, Edit, Write, Bash, Grep, Glob, Agent'),
    'chave entre aspas': sem.replace('name: desenvolvedor', '"name": desenvolvedor'),
    'sem omitClaudeMd': sem.replace('omitClaudeMd: true\n', ''),
  };
  for (const [rotulo, texto] of Object.entries(variantes)) {
    assert.ok(problemas(texto, FONTES).some((x) => /cabeçalho/.test(x)), rotulo);
  }
});

// ---------- os tetos ----------

test('problemas: os tetos da parte fixa (900) e do projeto (600), em tamanho ÷ 3 (o do corpo, 1500, é a soma deles), e a constante é a da guarda', () => {
  assert.equal(CARACTERES_POR_TOKEN, 3);
  assert.equal(CARACTERES_POR_TOKEN, DA_GUARDA);
  const itens = (n) => `\n${Array.from({ length: n }, () => `- ${'z'.repeat(198)}`).join('\n')}\n`;
  // 600 tokens = 1800 bytes: 8 itens de 200 cabem, 10 não
  assert.deepEqual(problemas(agente(itens(8)), FONTES), []);
  assert.ok(problemas(agente(itens(10)), FONTES).some((x) => /parte do projeto.*600/.test(x)));
  const grande = (extra) => sincronizar(`${CABECALHO}${extra}\n<!-- regras:inicio -->\n<!-- regras:fim -->\n<!-- projeto:inicio -->\n<!-- projeto:fim -->\n`, claude({ adotar: false }));
  assert.ok(problemas(grande('x'.repeat(3000)), FONTES).some((x) => /parte fixa.*900/.test(x)));
  const dominio = `8. **Domínio** ${'y'.repeat(100)}\n`;
  const cheio = claude({ dominio }); // o bloco do domínio entra na parte do projeto
  const doProjeto = sincronizar(agente(itens(8), cheio), cheio.replace(dominio, `8. **Domínio** ${'y'.repeat(900)}\n`));
  assert.ok(problemas(doProjeto, FONTES).some((x) => /parte do projeto.*600/.test(x)), 'o bloco do domínio conta no teto do projeto');
});

// ---------- a extração das regras ----------

test('extrairRegras: os itens de título fixo vão para a fixa, na ordem, com os subitens; o resto é o domínio', () => {
  const r = extrairRegras(claude());
  assert.equal(r.erro, undefined);
  assert.equal(r.fixas.length, TITULOS_FIXOS.length);
  assert.ok(r.fixas[0].startsWith('2. **Um `AGENTS.md`') && r.fixas[0].includes('\n   - Pasta nova nasce com o seu.'));
  assert.ok(r.fixas.at(-1).startsWith('7. **Recurso pago**'));
  assert.ok(!r.fixas.join('\n').includes('Pipeline') && !r.fixas.join('\n').includes('Multiagentes'));
  assert.deepEqual(r.dominio, ['8. **Isolamento** entre donos de dado: nunca cruzar.\n   - o porquê está na D9.']);
  assert.deepEqual(TITULOS_DO_MODELO.filter((t) => !TITULOS_FIXOS.includes(t)).sort(), ['Multiagentes', 'Pipeline']);
});

test('extrairRegras: no modelo o item 8 é o placeholder e vira regra do domínio; título ausente ou repetido é erro com o nome', () => {
  assert.deepEqual(extrairRegras(claude({ adotar: false, dominio: '8. <Regras do domínio.>\n' })).dominio, ['8. <Regras do domínio.>']);
  assert.match(extrairRegras(claude().replace('6. **Segredos**', '6. Segredos')).erro, /Segredos/);
  assert.match(extrairRegras(claude().replace('4. **Dado inventado** em todo teste.', '4. **Dado inventado** a.\n9. **Dado inventado** b.')).erro, /Dado inventado.*mais de uma vez|repetid/);
  assert.match(extrairRegras('# x\n\nsem seção\n').erro, /Regras que não se negociam/);
  // só a seção das regras vale: um item numerado em outra seção não conta
  const fora = `${claude()}\n7. **Recurso pago** fora da seção\n`;
  assert.equal(extrairRegras(fora).erro, undefined);
});

test('adotado: a 1ª linha do CLAUDE.md sem o <...> do modelo', () => {
  assert.equal(adotado(claude()), true);
  assert.equal(adotado(claude({ adotar: false })), false);
  assert.equal(adotado('#  <Nome>  \n'), false);
  assert.equal(adotado('# Meu <app>\n'), true);
});

// ---------- sincronizar ----------

test('sincronizar: grava as regras fixas, é idempotente, mantém o resto e só cria o bloco do domínio se o projeto adotou', () => {
  const modelo = agente('\n- a mão [CLAUDE.md]\n');
  const p = partes(modelo);
  assert.ok(p.regras.includes('4. **Dado inventado** em todo teste.'));
  assert.ok(p.projeto.includes('- a mão') && !p.projeto.includes('dominio'), 'não adotou: sem o bloco');
  assert.equal(sincronizar(modelo, claude({ adotar: false })), modelo, 'idempotente');
  const novo = claude({ dominio: '8. **Isolamento** entre donos de dado: nunca cruzar.\n' }).replace('só com sim', 'só com sim do usuário');
  const depois = sincronizar(modelo, novo);
  assert.ok(partes(depois).regras.includes('só com sim do usuário'));
  assert.equal(partes(depois).fixa.replace(partes(depois).regras, ''), partes(modelo).fixa.replace(partes(modelo).regras, ''), 'o resto da fixa não mudou');
  assert.ok(partes(depois).projeto.includes('<!-- dominio:inicio -->') && partes(depois).projeto.includes('Isolamento'), 'adotou: bloco criado no topo');
  assert.ok(partes(depois).projeto.indexOf('dominio:inicio') < partes(depois).projeto.indexOf('- a mão'));
  assert.equal(sincronizar(depois, novo), depois, 'idempotente com o domínio');
  const outro = sincronizar(depois, claude({ dominio: '8. **Outra** regra.\n9. **Mais** uma.\n' }));
  assert.ok(partes(outro).projeto.includes('Outra') && partes(outro).projeto.includes('Mais') && !partes(outro).projeto.includes('Isolamento'), 'o bloco é regravado');
  assert.ok(partes(outro).projeto.includes('- a mão'), 'o item do projeto fica');
  assert.throws(() => sincronizar(modelo, claude().replace('6. **Segredos**', '6. x')), /Segredos/);
  assert.throws(() => sincronizar('sem marcadores', claude()), /cabeçalho|marcador/);
});

test('sincronizar: mantém o fim de linha do arquivo', () => {
  const crlf = eolDe(agente(), '\r\n');
  const depois = sincronizar(crlf, claude({ adotar: false }));
  assert.equal(depois, crlf);
  assert.equal(/[^\r]\n/.test(depois), false, 'nenhum LF solto');
});

// ---------- vazia e mesmaParteFixa ----------

test('vazia: a parte do projeto sem comentário e sem espaço não tem nada', () => {
  assert.equal(vazia(agente()), true);
  assert.equal(vazia(agente('\n<!-- só um comentário -->\n\n')), true);
  assert.equal(vazia(agente('\n- a\n')), false);
  assert.equal(vazia(sincronizar(agente(), claude())), false, 'o bloco do domínio é conteúdo');
  assert.equal(vazia('sem marcadores'), false);
});

test('mesmaParteFixa: tudo fora do projeto igual byte a byte; o projeto pode mudar; cabeçalho, regras, marcador e CRLF mudados não', () => {
  const a = agente('\n- a\n');
  assert.equal(mesmaParteFixa(a, agente('\n- b\n- c\n')), true);
  assert.equal(mesmaParteFixa(a, a), true);
  assert.equal(mesmaParteFixa(a, a.replace('Texto fixo.', 'Texto fixo!')), false);
  assert.equal(mesmaParteFixa(a, a.replace('model: sonnet', 'model: opus')), false, 'cabeçalho');
  assert.equal(mesmaParteFixa(a, a.replace('em todo teste', 'em todo teste e mais')), false, 'bloco de regras');
  assert.equal(mesmaParteFixa(a, a.replace('<!-- projeto:inicio -->', '<!-- projeto:inicio -->\n')), true, 'dentro do projeto');
  assert.equal(mesmaParteFixa(a, eolDe(a, '\r\n')), false, 'CRLF');
  assert.equal(mesmaParteFixa(a, 'sem marcadores'), false);
  assert.equal(mesmaParteFixa('sem marcadores', 'sem marcadores'), false);
});

// ---------- o lint da parte do projeto ----------

test('lint do projeto: só linhas vazias ou itens "- " de até 240 caracteres, sem título, cerca, comentário nem marcador', () => {
  assert.deepEqual(problemas(agente('\n- um item livre\n\n- outro\n'), FONTES), [], 'item livre passa');
  const ruins = {
    'linha que não é item': '\numa frase solta\n',
    título: '\n## Título\n',
    'cerca de código': '\n```js\nx\n```\n',
    comentário: '\n- item <!-- solto -->\n',
    'outro marcador': '\n<!-- regras:fim -->\n',
    'item comprido': `\n- ${'a'.repeat(240)}\n`,
    'item indentado': '\n  - item\n',
  };
  for (const [rotulo, projeto] of Object.entries(ruins)) {
    const texto = rotulo === 'outro marcador' ? agente().replace('<!-- projeto:inicio -->', '<!-- projeto:inicio -->\n- a\n<!-- projeto:inicio -->') : agente(projeto);
    assert.ok(problemas(texto, FONTES).length > 0, rotulo);
  }
  assert.deepEqual(problemas(agente(`\n- ${'a'.repeat(238)}\n`), FONTES), [], '240 passa');
});

test('lint do projeto: o bloco do domínio fica fora do lint de formato', () => {
  const adotado_ = claude({ dominio: '8. **Isolamento** entre donos de dado.\n   - com subitem, que não é "- " na coluna 0.\n' });
  const texto = sincronizar(agente('\n- a\n'), adotado_);
  assert.ok(partes(texto).projeto.includes('com subitem'));
  assert.deepEqual(problemas(texto, { ...FONTES, 'CLAUDE.md': adotado_ }), []);
  assert.ok(problemas(texto.replace('<!-- dominio:fim -->', ''), FONTES).some((x) => /dominio/.test(x)), 'marcador do domínio sem par');
});

test('lint da fonte: o item com a marca tem de ser igual a uma linha da fonte; o sem marca só passa pelo formato', () => {
  assert.deepEqual(problemas(agente('\n- Linguagem: TypeScript estrito. [docs/arquitetura.md]\n- `npm run checar:rapido`: tipos e testes. [CLAUDE.md]\n'), FONTES), []);
  assert.deepEqual(problemas(agente('\n- Testes: `npm test` roda tudo.   [docs/arquitetura.md]\n'), FONTES), [], 'com trim');
  const falha = problemas(agente('\n- Linguagem: Java. [docs/arquitetura.md]\n'), FONTES);
  assert.ok(falha.some((x) => /arquitetura\.md/.test(x)));
  assert.ok(problemas(agente('\n- Linguagem: TypeScript estrito. [CLAUDE.md]\n'), FONTES).length > 0, 'a linha existe, mas em outra fonte');
  assert.ok(problemas(agente('\n- x [CLAUDE.md]\n'), { 'docs/arquitetura.md': ARQ }).length > 0, 'fonte que não foi lida');
  assert.deepEqual(problemas(agente('\n- texto qualquer sem fonte\n'), FONTES), []);
});

test('problemas: a comparação do bloco de regras com o CLAUDE.md não é da guarda (D8.2)', () => {
  const velho = agente();
  const mudou = { ...FONTES, 'CLAUDE.md': claude().replace('só com sim', 'só com o sim') };
  assert.deepEqual(problemas(velho, mudou), []);
});

// ---------- os arquivos de verdade ----------

test('o .claude/agents/desenvolvedor.md de verdade: sem problema, com os blocos iguais ao que o CLAUDE.md dá e a parte do projeto vazia no modelo', () => {
  const texto = lerReal('.claude', 'agents', 'desenvolvedor.md');
  const fontes = { 'CLAUDE.md': lerReal('CLAUDE.md'), 'docs/arquitetura.md': lerReal('docs', 'arquitetura.md') };
  assert.deepEqual(problemas(texto, fontes), []);
  assert.equal(sincronizar(texto, fontes['CLAUDE.md']), texto, 'rode: node .claude/hooks/ajusta-pipeline.mjs --sincronizar-desenvolvedor');
  assert.equal(texto.startsWith(CABECALHO), true);
  const p = partes(texto);
  assert.ok(Buffer.byteLength(p.fixa) <= 2450, `o corpo fixo tem ${Buffer.byteLength(p.fixa)} bytes`);
  if (!adotado(fontes['CLAUDE.md'])) {
    assert.equal(vazia(texto), true, 'o modelo traz a parte do projeto vazia');
    assert.ok(!texto.includes('dominio:inicio'));
  }
});

test('um projeto que já adotou o CLAUDE.md tem o bloco do domínio igual à extração (fontes falsas)', () => {
  const adot = claude();
  const texto = sincronizar(agente('\n- a\n'), adot);
  const { dominio } = extrairRegras(adot);
  assert.ok(dominio.length > 0);
  const p = partes(texto);
  const bloco = /<!-- dominio:inicio -->\r?\n([\s\S]*?)\r?\n<!-- dominio:fim -->/.exec(p.projeto)?.[1];
  assert.equal(bloco, dominio.join('\n'));
  assert.equal(p.regras.trim(), extrairRegras(adot).fixas.join('\n'));
});
