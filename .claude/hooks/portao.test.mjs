import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTAO = join(dirname(fileURLToPath(import.meta.url)), 'portao.mjs');

/**
 * Projeto falso: package.json com o script `nomeDoScript` (padrão `checar:rapido`) que sai com `codigoDoPortao`
 * (ou sem o script), e o .claude/pipeline.json com `portaoRapido` (`config` troca o arquivo inteiro: texto ou null = sem arquivo).
 */
function projeto({ alterados, codigoDoPortao, nomeDoScript = 'checar:rapido', portaoRapido = 'checar:rapido', config }) {
  const raiz = mkdtempSync(join(tmpdir(), 'portao-'));
  const scripts = codigoDoPortao === undefined ? {} : { [nomeDoScript]: `node -e "console.log('saida do portao'); process.exit(${codigoDoPortao})"` };
  writeFileSync(join(raiz, 'package.json'), JSON.stringify({ scripts }));
  mkdirSync(join(raiz, '.claude', 'estado'), { recursive: true });
  if (config !== null) writeFileSync(join(raiz, '.claude', 'pipeline.json'), config ?? JSON.stringify({ repositorio: 'acme/app', portaoRapido, pastasDeTrabalho: ['^src/[^/]+(?=/)'] }));
  if (alterados !== undefined) writeFileSync(join(raiz, '.claude', 'estado', 'alterados.txt'), alterados);
  return raiz;
}

function rodar(raiz, entrada = '{}') {
  const r = spawnSync(process.execPath, [PORTAO], {
    input: entrada, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: raiz }, timeout: 120_000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? null : JSON.parse(r.stdout);
}
const ativo = JSON.stringify({ stop_hook_active: true });

const comProjeto = (nome, opcoes, fn) =>
  test(nome, () => {
    const raiz = projeto(opcoes);
    try {
      fn(raiz);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

const lista = (raiz) => existsSync(join(raiz, '.claude', 'estado', 'alterados.txt'));
const pedida = (raiz) => existsSync(join(raiz, '.claude', 'estado', 'revisao-pedida'));

comProjeto('sem código alterado, não faz nada', { codigoDoPortao: 1 }, (raiz) => {
  assert.equal(rodar(raiz), null);
});

comProjeto('lista vazia, não faz nada', { alterados: '', codigoDoPortao: 1 }, (raiz) => {
  assert.equal(rodar(raiz), null);
});

comProjeto('sem o script do portão no package.json, não faz nada', { alterados: 'src/x.ts\n' }, (raiz) => {
  assert.equal(rodar(raiz), null);
  assert.ok(lista(raiz));
});

comProjeto('vermelho: bloqueia com o erro e guarda a lista', { alterados: 'src/x.ts\n', codigoDoPortao: 1 }, (raiz) => {
  const r = rodar(raiz);
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /Portão rápido vermelho/);
  assert.match(r.reason, /npm run checar:rapido/);
  assert.match(r.reason, /saida do portao/);
  assert.ok(lista(raiz));
  assert.ok(!pedida(raiz));
});

comProjeto('verde: pede a revisão uma vez e depois libera', { alterados: 'src/x.ts\n', codigoDoPortao: 0 }, (raiz) => {
  const primeira = rodar(raiz);
  assert.equal(primeira.decision, 'block');
  assert.match(primeira.reason, /Portão rápido verde/);
  assert.match(primeira.reason, /src\/x\.ts/);
  assert.ok(pedida(raiz));
  assert.equal(rodar(raiz), null);
  assert.ok(!lista(raiz));
  assert.ok(!pedida(raiz));
  assert.equal(rodar(raiz), null);
});

comProjeto('esforço rapido (D64): vermelho ainda bloqueia; verde libera direto sem pedir revisão e limpa alterados.txt', { alterados: 'src/x.ts\n', codigoDoPortao: 1 }, (raiz) => {
  writeFileSync(join(raiz, '.claude', 'estado', 'esforco'), 'rapido\n');
  const vermelho = rodar(raiz);
  assert.equal(vermelho.decision, 'block', 'vermelho no rapido ainda bloqueia');
  assert.match(vermelho.reason, /Portão rápido vermelho/);
  assert.ok(lista(raiz));
  writeFileSync(join(raiz, 'package.json'), JSON.stringify({ scripts: { 'checar:rapido': 'node -e "process.exit(0)"' } }));
  assert.equal(rodar(raiz), null, 'verde no rapido libera de primeira, sem pedir revisão');
  assert.ok(!lista(raiz));
  assert.ok(!pedida(raiz));
});

comProjeto('stop_hook_active e vermelho: só avisa, não bloqueia', { alterados: 'src/x.ts\n', codigoDoPortao: 1 }, (raiz) => {
  const r = rodar(raiz, ativo);
  assert.equal(r.decision, undefined);
  assert.match(r.systemMessage, /ainda vermelho/);
  assert.ok(lista(raiz));
});

comProjeto('vermelho corrigido, verde na continuação: pede a revisão uma vez e libera', { alterados: 'src/x.ts\n', codigoDoPortao: 0 }, (raiz) => {
  assert.match(rodar(raiz, ativo).reason, /Portão rápido verde/);
  assert.ok(pedida(raiz));
  assert.equal(rodar(raiz, ativo), null);
  assert.ok(!lista(raiz));
  assert.ok(!pedida(raiz));
});

comProjeto('entrada que não é JSON conta como sem stop_hook_active', { alterados: 'src/x.ts\n', codigoDoPortao: 1 }, (raiz) => {
  assert.equal(rodar(raiz, 'lixo').decision, 'block');
});

// o nome do script vem do portaoRapido do pipeline.json
comProjeto('portaoRapido da configuração: roda o script com esse nome', { alterados: 'src/x.ts\n', codigoDoPortao: 1, nomeDoScript: 'verificar', portaoRapido: 'verificar' }, (raiz) => {
  const r = rodar(raiz);
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /npm run verificar/);
  assert.match(r.reason, /saida do portao/);
});

comProjeto('portaoRapido da configuração: o checar:rapido do package.json não roda se a configuração aponta para outro', { alterados: 'src/x.ts\n', codigoDoPortao: 1, nomeDoScript: 'checar:rapido', portaoRapido: 'verificar' }, (raiz) => {
  assert.equal(rodar(raiz), null);
  assert.ok(lista(raiz));
});

comProjeto('portaoRapido ausente na configuração vale checar:rapido', { alterados: 'src/x.ts\n', codigoDoPortao: 1, config: JSON.stringify({ repositorio: 'acme/app', pastasDeTrabalho: ['^src(?=/)'] }) }, (raiz) => {
  assert.equal(rodar(raiz).decision, 'block');
});

// config ilegível: o portão só avisa, nunca bloqueia
for (const [rotulo, config] of [['JSON quebrado', '{ lixo'], ['sem o arquivo', null], ['nome de script com shell', JSON.stringify({ portaoRapido: 'a; echo x' })]]) {
  comProjeto(`pipeline.json ilegível (${rotulo}): só avisa, não bloqueia nem roda o script`, { alterados: 'src/x.ts\n', codigoDoPortao: 1, config }, (raiz) => {
    const r = rodar(raiz);
    assert.equal(r.decision, undefined);
    assert.match(r.systemMessage, /Portão rápido não rodou/);
    assert.ok(lista(raiz));
  });
}

comProjeto('pipeline.json ilegível mas sem código alterado: não faz nada', { codigoDoPortao: 1, config: '{ lixo' }, (raiz) => {
  assert.equal(rodar(raiz), null);
});

test('marca-alterado: anota o código do produto (tela .jsx, .css e .py inclusive), não o .claude, o docs nem o que não é código', async () => {
  const { relevante } = await import('./marca-alterado.mjs');
  const raiz = join(tmpdir(), 'projeto');
  assert.equal(relevante(raiz, join(raiz, 'app', '(app)', 'hoje', 'Hoje.jsx')), 'app/(app)/hoje/Hoje.jsx');
  assert.equal(relevante(raiz, join(raiz, 'lib', 'whatsapp.js')), 'lib/whatsapp.js');
  assert.equal(relevante(raiz, join(raiz, 'supabase', 'migrations', '1_a.sql')), 'supabase/migrations/1_a.sql');
  assert.equal(relevante(raiz, join(raiz, 'app', 'casa.css')), 'app/casa.css');
  assert.equal(relevante(raiz, join(raiz, 'scripts', 'build.py')), 'scripts/build.py');
  assert.equal(relevante(raiz, join(raiz, 'package-lock.json')), null);
  assert.equal(relevante(raiz, join(raiz, 'README.md')), null);
  assert.equal(relevante(raiz, join(raiz, 'docs', 'ddl-v2.sql')), null);
  assert.equal(relevante(raiz, join(raiz, '.claude', 'hooks', 'portao.mjs')), null);
});
