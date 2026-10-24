// O config.mjs: lê e valida o .claude/pipeline.json, campo a campo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVO, CONFIGURE, MARCADOR, ESCADA, PISOS, PISO_GATILHOS, conferirPisos, lerAgentes, lerAjuste, lerNiveis, lerPastas, lerPortao, lerRepositorio, lerRevisao, localizar, revisaoDeObjeto, urlDoRepositorio } from './config.mjs';

/** Roda `fn(caminho)` com um pipeline.json temporário (objeto vira JSON; texto vai como está; undefined = sem arquivo). */
function comArquivo(conteudo, fn) {
  const pasta = mkdtempSync(join(tmpdir(), 'config-'));
  const caminho = join(pasta, 'pipeline.json');
  try {
    if (conteudo !== undefined) writeFileSync(caminho, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
    fn(caminho);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

test('o pipeline.json do projeto é JSON válido e tem os sete campos; o repositorio é o marcador ou um dono/repo', () => {
  const dados = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
  assert.deepEqual(Object.keys(dados).sort(), ['agentes', 'ajuste', 'niveis', 'pastasDeTrabalho', 'portaoRapido', 'repositorio', 'revisao']);
  const repo = lerRepositorio();
  if (dados.repositorio === MARCADOR) assert.ok(repo.erro?.startsWith(CONFIGURE), 'o marcador falha fechado');
  else assert.deepEqual(repo, { valor: dados.repositorio, erro: null });
  assert.equal(lerPortao().erro, null);
  assert.equal(lerPastas().erro, null);
});

test('repositorio: dono/repo vale; marcador, ausente, inválido e arquivo ilegível falham com a mensagem de configurar', () => {
  comArquivo({ repositorio: 'acme/app' }, (c) => assert.deepEqual(lerRepositorio(c), { valor: 'acme/app', erro: null }));
  comArquivo({ repositorio: 'Acme/app.v2_x-1' }, (c) => assert.equal(lerRepositorio(c).erro, null));
  for (const repositorio of [MARCADOR, undefined, '', 'acme', 'https://github.com/acme/app', 'acme/app/extra', 'a b/c', 42, null, ['acme/app']]) {
    comArquivo({ repositorio }, (c) => {
      const r = lerRepositorio(c);
      assert.equal(r.valor, null, String(repositorio));
      assert.ok(r.erro.startsWith(CONFIGURE), `${String(repositorio)}: ${r.erro}`);
    });
  }
  comArquivo('{ não é json', (c) => assert.ok(lerRepositorio(c).erro.startsWith(CONFIGURE)));
  comArquivo('[1]', (c) => assert.match(lerRepositorio(c).erro, /objeto JSON/));
  comArquivo(undefined, (c) => assert.match(lerRepositorio(c).erro, /não consegui ler/));
});

test('portaoRapido: nome de script; ausente vale checar:rapido; nome com shell é recusado', () => {
  comArquivo({ portaoRapido: 'verificar' }, (c) => assert.deepEqual(lerPortao(c), { valor: 'verificar', erro: null }));
  comArquivo({ portaoRapido: 'test:unit' }, (c) => assert.equal(lerPortao(c).valor, 'test:unit'));
  comArquivo({}, (c) => assert.equal(lerPortao(c).valor, 'checar:rapido'));
  for (const portaoRapido of ['a; rm -rf x', 'a b', '$(x)', '', 7, '-x']) {
    comArquivo({ portaoRapido }, (c) => assert.notEqual(lerPortao(c).erro, null, String(portaoRapido)));
  }
  comArquivo('lixo', (c) => assert.match(lerPortao(c).erro, /não é JSON válido/));
});

test('pastasDeTrabalho: lista de regex; vazia, ausente, não texto e regex inválida falham', () => {
  comArquivo({ pastasDeTrabalho: ['^lib/[^/]+(?=/)', '^db(?=/)'] }, (c) => {
    const r = lerPastas(c);
    assert.equal(r.erro, null);
    assert.ok(r.valor.every((re) => re instanceof RegExp));
    assert.equal('lib/x/a.ts'.match(r.valor[0])?.[0], 'lib/x');
  });
  for (const pastasDeTrabalho of [undefined, [], 'src', [1], [''], ['(']]) {
    comArquivo({ pastasDeTrabalho }, (c) => {
      const r = lerPastas(c);
      assert.equal(r.valor, null, JSON.stringify(pastasDeTrabalho));
      assert.match(r.erro, /pastasDeTrabalho/);
    });
  }
});

test('urlDoRepositorio: https e ssh do GitHub, com ou sem .git, sem caixa, e escapa o ponto do nome', () => {
  const re = urlDoRepositorio('acme/app.v2');
  for (const url of ['https://github.com/acme/app.v2', 'https://github.com/acme/app.v2.git', 'git@github.com:acme/app.v2.git', 'HTTPS://GITHUB.COM/Acme/App.V2']) {
    assert.ok(re.test(url), url);
  }
  for (const url of ['https://github.com/acme/appXv2', 'https://github.com/acme/app.v2/outro', 'https://example.com/acme/app.v2', 'https://github.com/acme/app.v2.git.evil', 'ssh://github.com/acme/app.v2']) {
    assert.ok(!re.test(url), url);
  }
});

const dadosReais = () => JSON.parse(readFileSync(ARQUIVO, 'utf8'));

test('agentes e niveis: o do projeto carrega; nome, model, effort e tools inválidos, abaixo do piso ou fixo mudado falham', () => {
  const agentes = lerAgentes();
  assert.equal(agentes.erro, null);
  assert.deepEqual(Object.keys(agentes.valor).sort(), ['leitor-docs', 'qa', 'revisor-arquitetura', 'revisor-lgpd', 'revisor-seguranca', 'revisor-tela']);
  assert.equal(lerNiveis().erro, null);
  const com = (secao, nome, valor) => { const d = dadosReais(); d[secao][nome] = valor; return d; };
  const q = dadosReais().agentes.qa;
  for (const [rotulo, d, esperado] of [
    ['model inválido', com('agentes', 'qa', { ...q, model: 'gpt' }), /agentes\.qa/],
    ['effort inválido', com('agentes', 'qa', { ...q, effort: 'max' }), /agentes\.qa/],
    ['sem tools', com('agentes', 'qa', { model: 'sonnet', effort: 'high' }), /agentes\.qa/],
    ['tarefa não texto', com('agentes', 'qa', { ...q, tarefa: 3 }), /agentes\.qa/],
    ['abaixo do piso', com('agentes', 'revisor-seguranca', { ...dadosReais().agentes['revisor-seguranca'], model: 'sonnet', effort: 'medium' }), /abaixo do piso opus:high/],
    ['lgpd é fixo', com('agentes', 'revisor-lgpd', { ...dadosReais().agentes['revisor-lgpd'], model: 'sonnet' }), /revisor-lgpd é fixo em opus:high/],
    ['fixo mudado', com('agentes', 'leitor-docs', { ...dadosReais().agentes['leitor-docs'], model: 'sonnet' }), /fixo em haiku:low/],
    ['revisor-tela abaixo do piso', com('agentes', 'revisor-tela', { ...dadosReais().agentes['revisor-tela'], model: 'sonnet', effort: 'low' }), /agentes\.revisor-tela está em sonnet:low, abaixo do piso sonnet:medium/],
    ['arquitetura em sonnet (o modelo vem do papel)', com('agentes', 'revisor-arquitetura', { ...dadosReais().agentes['revisor-arquitetura'], model: 'sonnet', effort: 'high' }), /sonnet:high, abaixo do piso opus:medium/],
    ['nome desconhecido', com('agentes', 'intruso', q), /nome desconhecido/],
    ['nível de código em opus', com('niveis', 'medio', { model: 'opus', effort: 'high' }), /niveis\.medio: nível de código não usa opus/],
    ['nível codigo-seguranca em opus', com('niveis', 'codigo-seguranca', { model: 'opus', effort: 'high' }), /niveis\.codigo-seguranca: nível de código não usa opus/],
    ['nível abaixo do piso', com('niveis', 'medio', { model: 'sonnet', effort: 'low' }), /abaixo do piso sonnet:medium/],
  ]) comArquivo(d, (c) => assert.match((rotulo.startsWith('nível') ? lerNiveis(c) : lerAgentes(c)).erro, esperado, rotulo));
  const sem = dadosReais();
  delete sem.agentes.qa;
  comArquivo(sem, (c) => assert.match(lerAgentes(c).erro, /agentes\.qa falta/));
  for (const agentes of [undefined, {}, [], 'x']) comArquivo({ agentes }, (c) => assert.match(lerAgentes(c).erro, /agentes em/));
  comArquivo({ niveis: { 'nome ruim': { model: 'sonnet', effort: 'low' } } }, (c) => assert.match(lerNiveis(c).erro, /nome inválido/));
});

test('o BOM no começo do pipeline.json é aceito', () => {
  comArquivo(`﻿${JSON.stringify(dadosReais())}`, (c) => assert.equal(lerAgentes(c).erro, null));
});

test('revisao: a do projeto compila e cumpre os pisos; gatilho repetido, regex inválida, sem revisor ou abaixo do piso falha', () => {
  const r = lerRevisao();
  assert.equal(r.erro, null);
  assert.ok(r.valor.gatilhos.every((g) => g.caminhos.every((re) => re instanceof RegExp)));
  assert.deepEqual(r.valor.gatilhos.map((g) => g.nome).sort(), Object.keys(PISO_GATILHOS).sort());
  const com = (muda) => { const d = dadosReais(); muda(d.revisao); return d; };
  const g = (d, nome) => d.gatilhos.find((x) => x.nome === nome);
  const casos = [
    ['gatilho repetido', (d) => d.gatilhos.push(d.gatilhos[0]), /gatilho inválido/],
    ['regex inválida', (d) => { g(d, 'banco').caminhos.push('('); }, /gatilho inválido/],
    ['sem revisor', (d) => { g(d, 'banco').revisores = []; }, /gatilho inválido/],
    ['ignorar_conteudo inválido', (d) => { d.ignorar_conteudo = ['(']; }, /ignorar_conteudo/],
    ['sempre vazio', (d) => { d.sempre = []; }, /não podem ficar vazios/],
    ['comportamento vazio', (d) => { d.comportamento = []; }, /não podem ficar vazios/],
    ['gatilho de piso removido', (d) => { d.gatilhos = d.gatilhos.filter((x) => x.nome !== 'permissao'); }, /gatilho permissao falta/],
    ['gatilho tela removido', (d) => { d.gatilhos = d.gatilhos.filter((x) => x.nome !== 'tela'); }, /gatilho tela falta/],
    ['revisor-tela tirado do gatilho tela', (d) => { g(d, 'tela').revisores = ['qa']; }, /tela: revisores perdeu revisor-tela/],
    ['caminho do gatilho tela encolhido', (d) => { g(d, 'tela').caminhos = ['^src/.+\\.jsx$']; }, /tela: caminhos perdeu/],
    ['revisor mínimo tirado', (d) => { g(d, 'dado_pessoal').revisores = ['revisor-lgpd']; }, /dado_pessoal: revisores perdeu revisor-seguranca/],
    ['caminho mínimo tirado', (d) => { g(d, 'banco').caminhos = ['^x/']; }, /banco: caminhos perdeu/],
    ['conteúdo mínimo tirado', (d) => { g(d, 'lgpd_ignora').conteudo = ['outra coisa']; }, /lgpd_ignora: conteudo perdeu/],
    ['remocoes tirado do permissao', (d) => { g(d, 'permissao').remocoes = false; }, /permissao: remocoes tem de ser true/],
    ['remocoes tirado do banco', (d) => { delete g(d, 'banco').remocoes; }, /banco: remocoes tem de ser true/],
    ['remocoes tirado do rede_rota', (d) => { delete g(d, 'rede_rota').remocoes; }, /rede_rota: remocoes tem de ser true/],
    ['todo_arquivo tirado do lgpd_ignora', (d) => { delete g(d, 'lgpd_ignora').todo_arquivo; }, /lgpd_ignora: todo_arquivo tem de ser true/],
    ['lookahead no ignorar do gatilho', (d) => { g(d, 'dado_pessoal').ignorar = ['^(?!.*/x\\.js$|.*/y\\.js$)']; }, /não aceitam \(\?/],
    ['lookahead no ignorar_conteudo', (d) => { d.ignorar_conteudo.push('^docs/(?!.*\\.sql$)'); }, /não aceitam \(\?/],
    ['ignorar do gatilho que não é prefixo', (d) => { g(d, 'dado_pessoal').ignorar = ['\\.mjs$']; }, /dado_pessoal: ignorar tem de ser um prefixo de caminho literal/],
    ['ignorar que cala o permissao', (d) => { g(d, 'permissao').ignorar = ['.']; }, /permissao: um ignorar casa com src\/x\/servidor\.ts/],
    ['ignorar que cala o dado_pessoal', (d) => { g(d, 'dado_pessoal').ignorar = ['^src/']; }, /dado_pessoal: um ignorar casa com src\/x\/dados\.ts/],
    ['ignorar_conteudo global que cala o dado_pessoal', (d) => { d.ignorar_conteudo.push('dados'); }, /dado_pessoal: um ignorar casa com src\/x\/dados\.ts/],
    ['caminhos do qa tirados', (d) => { d.comportamento_caminhos = []; }, /comportamento_caminhos perdeu/],
  ];
  for (const [rotulo, muda, esperado] of casos) comArquivo(com(muda), (c) => assert.match(lerRevisao(c).erro, esperado, rotulo));
  comArquivo(com((d) => { g(d, 'banco').revisores.push('revisor-lgpd'); g(d, 'banco').caminhos.push('^extra/'); }), (c) => assert.equal(lerRevisao(c).erro, null), 'somar pode');
  assert.equal(revisaoDeObjeto(com((d) => { d.sempre = []; }).revisao, { pisos: false }).erro, null, 'sem os pisos (a base de um diff) aceita');
});

test('ajuste: janela e rodadas_altas do projeto; a escada vem do código e o piso fora dela é erro', () => {
  const a = lerAjuste();
  assert.equal(a.erro, null);
  assert.deepEqual(a.valor.escada, ESCADA);
  assert.equal(a.valor.janela, 3);
  assert.equal(conferirPisos(), null);
  assert.match(conferirPisos({ agentes: { qa: 'haiku:low' } }), /haiku:low de agentes\.qa está fora da escada/);
  assert.match(conferirPisos(PISOS, ['sonnet:low']), /fora da escada/);
  for (const [niveis, pisos] of Object.entries(PISOS)) for (const p of Object.values(pisos)) assert.ok(ESCADA.includes(p), `${niveis}: ${p}`);
  const certo = dadosReais().ajuste;
  for (const ruim of [{ ...certo, janela: 0 }, { ...certo, rodadas_altas: 1.5 }, undefined]) {
    comArquivo({ ajuste: ruim }, (c) => assert.match(lerAjuste(c).erro, /ajuste/, JSON.stringify(ruim)));
  }
});

test('localizar acha o agente fixo, o nível pelo nome e o nível pelo revisor', () => {
  const { valor: agentes } = lerAgentes();
  const { valor: niveis } = lerNiveis();
  assert.deepEqual(localizar(agentes, niveis, 'qa'), { secao: 'agentes', chave: 'qa' });
  assert.deepEqual(localizar(agentes, niveis, 'medio'), { secao: 'niveis', chave: 'medio' });
  assert.deepEqual(localizar(agentes, niveis, 'ponytail-review'), { secao: 'niveis', chave: 'revisao-ponytail' });
  assert.equal(localizar(agentes, niveis, 'nada'), undefined);
});

test('o nível codigo-seguranca descreve o código que toca um gatilho de risco, pelos nomes dos gatilhos do pipeline.json, e a integração de fase (D3)', () => {
  const { tarefa } = lerNiveis().valor['codigo-seguranca'];
  const gatilhos = lerRevisao().valor.gatilhos.map((g) => g.nome);
  for (const nome of ['permissao', 'dado_pessoal', 'banco', 'config_pipeline', 'rede_rota']) {
    assert.ok(gatilhos.includes(nome), `o gatilho ${nome} existe`);
    assert.ok(tarefa.includes(`\`${nome}\``), `a tarefa cita o gatilho ${nome}`);
  }
  assert.match(tarefa, /integração de fase/);
  assert.doesNotMatch(tarefa, /isolamento entre donos de dado ou dado pessoal/, 'o texto antigo (só permissão, isolamento e dado pessoal) saiu');
});

test('a lista única de extensões de código: as pedidas estão nela e o resto (md, imagem, texto) não é código', async () => {
  const { EXTENSOES_DE_CODIGO, ehArquivoDeCodigo } = await import('./config.mjs');
  const pedidas = 'ts tsx mts cts js jsx mjs cjs sql json py go rs rb java kt cs php vue svelte css scss html sh yml yaml toml prisma'.split(' ');
  assert.deepEqual([...EXTENSOES_DE_CODIGO].sort(), [...pedidas].sort());
  for (const e of pedidas) assert.ok(ehArquivoDeCodigo(`a/b/x.${e}`) && ehArquivoDeCodigo(`X.${e.toUpperCase()}`), e);
  for (const n of ['README.md', 'a.png', 'LICENSE', 'x.txt', 'ts', 'a.tsx.bak']) assert.equal(ehArquivoDeCodigo(n), false, n);
});
