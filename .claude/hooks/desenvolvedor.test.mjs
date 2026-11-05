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
// Itens com fonte: `item(texto)` registra o texto num ajuste inventado de 2026-01-01, que a `fontes.ajuste` devolve.
const ENTRAM = [];
const item = (texto) => {
  ENTRAM.push(texto);
  return `- ${texto} [ajuste 2026-01-01]`;
};
const ajuste = (data) => (data === '2026-01-01' ? `# Ajuste 2026-01-01: desenvolvedor\n\n${ENTRAM.map((t) => `- entra: ${t}`).join('\n')}\n` : null);
// o CLAUDE.md adotado, sem regra do domínio (o bloco `dominio` só é exigido com regra do domínio)
const FONTES = { 'CLAUDE.md': claude({ dominio: '' }), 'docs/arquitetura.md': ARQ, ajuste };

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
  assert.deepEqual(problemas(agente(`\n${item('a')}\n`), FONTES), []);
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
  const itens = (n) => `\n${Array.from({ length: n }, () => item('z'.repeat(178))).join('\n')}\n`;
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

// Uma regra fixa (a 5, `Local primeiro`) e a do domínio (a 8) com o mesmo molde, para provar os dois caminhos.
const comRegra = (corpo) => ({
  fixa: extrairRegras(claude().replace('5. **Local primeiro:** sem produção.\n', `5. **Local primeiro:** sem produção.\n${corpo}`)),
  dominio: extrairRegras(claude({ dominio: `8. **Isolamento** entre donos.\n${corpo}` })),
});
const fixaDe = (r) => r.fixas.find((t) => t.startsWith('5. '));
const dominioDe = (r) => r.dominio.find((t) => t.startsWith('8. '));

test('extrairRegras: o subitem aninhado (5 ou 6 espaços), de 4 espaços ou com tab continua a regra, na fixa e no domínio', () => {
  const casos = {
    aninhado: ['   - a\n     - aninhado de 5\n       - aninhado de 7\n', '   - a\n     - aninhado de 5\n       - aninhado de 7'],
    'seis espaços': ['   - a\n      - seis\n', '   - a\n      - seis'],
    'quatro espaços': ['    - quatro\n', '    - quatro'],
    tab: ['\t- com tab\n', '\t- com tab'],
    'tab depois do subitem': ['   - a\n\t- com tab\n', '   - a\n\t- com tab'],
  };
  for (const [rotulo, [corpo, esperado]] of Object.entries(casos)) {
    const r = comRegra(corpo);
    assert.equal(r.fixa.erro, undefined, rotulo);
    assert.equal(r.dominio.erro, undefined, rotulo);
    assert.equal(fixaDe(r.fixa), `5. **Local primeiro:** sem produção.\n${esperado}`, `${rotulo}: fixa`);
    assert.equal(dominioDe(r.dominio), `8. **Isolamento** entre donos.\n${esperado}`, `${rotulo}: domínio`);
  }
});

test('extrairRegras: a linha em branco entre subitens não fecha o item; a do fim sai; o item seguinte começa certo', () => {
  const r = comRegra('   - a\n\n   - b depois do branco\n\n\n     - c\n\n');
  assert.equal(fixaDe(r.fixa), '5. **Local primeiro:** sem produção.\n   - a\n\n   - b depois do branco\n\n\n     - c');
  assert.equal(dominioDe(r.dominio), '8. **Isolamento** entre donos.\n   - a\n\n   - b depois do branco\n\n\n     - c');
  // a linha só com espaço conta como em branco
  assert.equal(fixaDe(comRegra('   - a\n  \n   - b\n').fixa), '5. **Local primeiro:** sem produção.\n   - a\n\n   - b');
  // o branco do fim da regra não vai para o texto, e a regra seguinte continua a ser lida
  const duas = extrairRegras(claude().replace('6. **Segredos**', '\n6. **Segredos**'));
  assert.equal(duas.erro, undefined);
  assert.equal(fixaDe(duas), '5. **Local primeiro:** sem produção.');
  assert.ok(duas.fixas.some((t) => t.startsWith('6. **Segredos**')));
});

test('extrairRegras: linha solta na seção (sem recuo de 3 espaços, depois de um branco ou sem item) é erro com a linha no texto', () => {
  for (const [rotulo, corpo] of Object.entries({ colada: 'linha solta colada\n', 'depois de um branco': '\nlinha solta depois do branco\n', 'recuo de 2': '  - recuo de dois\n', subtítulo: '### Subtítulo solto\n' })) {
    const r = comRegra(corpo);
    for (const [onde, x] of [['fixa', r.fixa], ['domínio', r.dominio]]) {
      assert.match(x.erro ?? '', /linha|solta/, `${rotulo}: ${onde}`);
      assert.ok((x.erro ?? '').includes(corpo.trim()), `${rotulo}: ${onde}: a linha vai no texto (${x.erro})`);
    }
  }
  const antes = extrairRegras('# P\n\n## Regras que não se negociam\n\ntexto antes do item 1\n\n1. **Pipeline:** a.\n');
  assert.match(antes.erro, /texto antes do item 1/, 'linha solta antes do primeiro item');
  assert.match(extrairRegras('# P\n\n## Regras que não se negociam\n\n   - recuado sem item\n').erro, /recuado sem item/);
  // a linha solta fora da seção das regras não conta
  assert.equal(extrairRegras(`${claude()}\ntexto solto na outra seção\n`).erro, undefined);
});

test('sincronizar: a regra com sublista aninhada, 4 espaços, tab e branco chega inteira ao bloco, e a linha solta vira erro', () => {
  const corpo = '   - a\n     - aninhado\n\n    - quatro\n\t- tab\n';
  const adot = claude({ dominio: `8. **Isolamento** entre donos.\n${corpo}` }).replace('5. **Local primeiro:** sem produção.\n', `5. **Local primeiro:** sem produção.\n${corpo}`);
  const texto = sincronizar(agente(), adot);
  const p = partes(texto);
  assert.ok(p.regras.includes('     - aninhado\n\n    - quatro\n\t- tab'), 'regra fixa inteira');
  assert.ok(p.projeto.includes('     - aninhado\n\n    - quatro\n\t- tab'), 'regra do domínio inteira');
  assert.equal(sincronizar(texto, adot), texto, 'idempotente');
  assert.throws(() => sincronizar(agente(), adot.replace('   - a\n', 'solta\n   - a\n')), /solta/);
});

test('adotado: a 1ª linha do CLAUDE.md sem o <...> do modelo', () => {
  assert.equal(adotado(claude()), true);
  assert.equal(adotado(claude({ adotar: false })), false);
  assert.equal(adotado('#  <Nome>  \n'), false);
  assert.equal(adotado('# Meu <app>\n'), true);
});

test('adotado: o BOM no começo do CLAUDE.md não faz o modelo contar como adotado, e o adotado com BOM conta', () => {
  assert.equal(adotado('﻿# <Nome do projeto>\n'), false);
  assert.equal(adotado('﻿# Projeto Ficticio\n'), true);
  assert.equal(adotado(`﻿${claude({ adotar: false })}`), false);
  assert.equal(adotado(`﻿${claude()}`), true);
  const modelo = agente();
  assert.equal(sincronizar(modelo, `﻿${claude({ adotar: false })}`), modelo, 'o BOM não cria o bloco do domínio');
  assert.deepEqual(problemas(modelo, { ...FONTES, 'CLAUDE.md': `﻿${claude({ adotar: false })}` }), []);
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
  assert.deepEqual(problemas(agente(`\n${item('um item livre')}\n\n${item('outro')}\n`), FONTES), [], 'item com fonte passa');
  const ruins = {
    'linha que não é item': '\numa frase solta\n',
    título: '\n## Título\n',
    'cerca de código': '\n```js\nx\n```\n',
    comentário: `\n${item('item <!-- solto -->')}\n`,
    'outro marcador': '\n<!-- regras:fim -->\n',
    'item comprido': `\n${item('a'.repeat(220))}\n`,
    'item indentado': '\n  - item\n',
  };
  for (const [rotulo, projeto] of Object.entries(ruins)) {
    const texto = rotulo === 'outro marcador' ? agente().replace('<!-- projeto:inicio -->', `<!-- projeto:inicio -->\n${item('a')}\n<!-- projeto:inicio -->`) : agente(projeto);
    assert.ok(problemas(texto, FONTES).length > 0, rotulo);
  }
  assert.deepEqual(problemas(agente(`\n${item('a'.repeat(218))}\n`), FONTES), [], '240 passa');
  assert.ok(problemas(agente(`\n${item('a'.repeat(219))}\n`), FONTES).some((x) => /240/.test(x)), '241 não');
});

test('lint do projeto: o bloco do domínio fica fora do lint de formato', () => {
  const adotado_ = claude({ dominio: '8. **Isolamento** entre donos de dado.\n   - com subitem, que não é "- " na coluna 0.\n' });
  const texto = sincronizar(agente(`\n${item('a')}\n`), adotado_);
  assert.ok(partes(texto).projeto.includes('com subitem'));
  assert.deepEqual(problemas(texto, { ...FONTES, 'CLAUDE.md': adotado_ }), []);
  assert.ok(problemas(texto.replace('<!-- dominio:fim -->', ''), FONTES).some((x) => /dominio/.test(x)), 'marcador do domínio sem par');
});

test('lint da fonte: o item termina numa marca, e a marca tem de conferir com a fonte', () => {
  assert.deepEqual(problemas(agente('\n- Linguagem: TypeScript estrito. [docs/arquitetura.md]\n- `npm run checar:rapido`: tipos e testes. [CLAUDE.md]\n'), FONTES), []);
  assert.deepEqual(problemas(agente('\n- Testes: `npm test` roda tudo.   [docs/arquitetura.md]\n'), FONTES), [], 'com trim');
  const falha = problemas(agente('\n- Linguagem: Java. [docs/arquitetura.md]\n'), FONTES);
  assert.ok(falha.some((x) => /fonte não confere/.test(x) && /arquitetura\.md/.test(x)));
  assert.ok(problemas(agente('\n- Linguagem: TypeScript estrito. [CLAUDE.md]\n'), FONTES).some((x) => /fonte não confere/.test(x)), 'a linha existe, mas em outra fonte');
  assert.ok(problemas(agente('\n- x [CLAUDE.md]\n'), { 'docs/arquitetura.md': ARQ }).length > 0, 'fonte que não foi lida');
});

test('lint da fonte: o item sem marca, ou com marca que não é de fonte, é "item sem fonte"', () => {
  for (const linha of ['- texto qualquer sem fonte', '- a [outra coisa]', '- a [ajuste 2026-1-1]', '- a [ajuste ../x]', '- [CLAUDE.md]', '- a [CLAUDE.md] depois']) {
    assert.ok(problemas(agente(`\n${linha}\n`), FONTES).some((x) => /item sem fonte/.test(x)), linha);
  }
});

test('lint da fonte: [ajuste AAAA-MM-DD] pede o registro da data com uma linha "- entra: <texto>" igual (com trim)', () => {
  assert.deepEqual(problemas(agente(`\n${item('o texto que entra')}\n`), FONTES), []);
  const lido = [];
  const com = (registro) => ({ ...FONTES, ajuste: (data) => { lido.push(data); return registro; } });
  const texto = agente('\n- o texto que entra [ajuste 2026-02-03]\n');
  assert.deepEqual(problemas(texto, com('# Ajuste\n\n- entra:   o texto que entra  \n- sai: outro\n')), [], 'com trim');
  assert.deepEqual(lido, ['2026-02-03'], 'só lê a data citada');
  for (const [rotulo, registro] of Object.entries({ 'registro que não existe': null, 'texto diferente': '- entra: outro texto\n', 'linha "sai"': '- sai: o texto que entra\n', 'sem o "- entra:"': 'o texto que entra\n' })) {
    assert.ok(problemas(texto, com(registro)).some((x) => /fonte não confere/.test(x) && /2026-02-03/.test(x)), rotulo);
  }
  const semLeitor = { 'CLAUDE.md': FONTES['CLAUDE.md'], 'docs/arquitetura.md': ARQ };
  assert.ok(problemas(texto, semLeitor).some((x) => /fonte não confere/.test(x)), 'sem a função ajuste');
  assert.ok(problemas(texto, { ...FONTES, ajuste: () => { throw new Error('EACCES'); } }).some((x) => /fonte não confere/.test(x)), 'leitura que falha');
});

test('lint da fonte: o bloco do domínio fica fora da exigência de fonte', () => {
  const adot = claude({ dominio: '8. **Isolamento** entre donos de dado.\n   - sem marca nenhuma.\n' });
  const texto = sincronizar(agente(), adot);
  assert.deepEqual(problemas(texto, { ...FONTES, 'CLAUDE.md': adot }), []);
});

test('problemas: projeto adotado, com regra do domínio e sem os marcadores dominio na parte do projeto, é problema (só presença)', () => {
  const adot = claude();
  const fontes = { ...FONTES, 'CLAUDE.md': adot };
  const semBloco = agente(`\n${item('a')}\n`);
  assert.ok(problemas(semBloco, fontes).some((x) => /falta o bloco das regras do domínio: rode `node \.claude\/hooks\/ajusta-pipeline\.mjs --sincronizar-desenvolvedor`/.test(x)));
  const comBloco = sincronizar(semBloco, adot);
  assert.deepEqual(problemas(comBloco, fontes), []);
  // o texto do bloco não é comparado: só a presença
  assert.deepEqual(problemas(comBloco, { ...fontes, 'CLAUDE.md': adot.replace('nunca cruzar', 'nunca misturar') }), []);
  // sem regra do domínio, não adotado ou com a extração em erro: sem exigência
  assert.deepEqual(problemas(semBloco, { ...fontes, 'CLAUDE.md': claude({ dominio: '' }) }), [], 'adotado sem regra do domínio');
  assert.deepEqual(problemas(semBloco, { ...fontes, 'CLAUDE.md': claude({ adotar: false }) }), [], 'não adotado');
  assert.ok(!problemas(semBloco, { ...fontes, 'CLAUDE.md': '# Projeto Ficticio\n' }).some((x) => /bloco das regras/.test(x)), 'extração em erro');
  assert.ok(problemas(semBloco, { ...fontes, 'CLAUDE.md': `﻿${adot}` }).some((x) => /bloco das regras/.test(x)), 'com BOM');
});

test('problemas: a comparação do bloco de regras com o CLAUDE.md não é da guarda (D8.2)', () => {
  const velho = agente();
  const mudou = { ...FONTES, 'CLAUDE.md': claude({ dominio: '' }).replace('só com sim', 'só com o sim') };
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
