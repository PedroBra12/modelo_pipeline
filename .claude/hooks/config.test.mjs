// O config.mjs: lê e valida o .claude/pipeline.json, campo a campo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVO, CONFIGURE, MARCADOR, lerPastas, lerPortao, lerRepositorio, urlDoRepositorio } from './config.mjs';

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

test('o pipeline.json do projeto é JSON válido e tem os três campos; o repositorio é o marcador ou um dono/repo', () => {
  const dados = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
  assert.deepEqual(Object.keys(dados).sort(), ['pastasDeTrabalho', 'portaoRapido', 'repositorio']);
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
