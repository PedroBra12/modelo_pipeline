// A guarda dos subagentes: decidirAgente como função pura, o hook de ponta a ponta e os cabeçalhos de verdade.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO, FIXOS, lerAgentes, lerNiveis } from './config.mjs';
import { TETO, SO_NO_CHAT, decidirAgente, decidirChamador, decidirOrquestrador, juntarDecisoes, lerCabecalhoDoArquivo, lerParDoRegistro, lerRegistroDoArquivo, parDoChat } from './guarda-agentes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AGENTES = join(AQUI, '..', 'agents');

// O chat principal dos testes de ponta a ponta: um registro (JSONL) numa pasta temporária e o esforço na entrada do hook.
const PASTA_REGISTROS = mkdtempSync(join(tmpdir(), 'registros-'));
after(() => rmSync(PASTA_REGISTROS, { recursive: true, force: true }));
let contador = 0;
const linhaDoAssistente = (model, effort, extra = {}) => JSON.stringify({ type: 'assistant', ...(effort === undefined ? {} : { effort }), message: { model, role: 'assistant', content: [] }, ...extra });
/** Grava um registro com as linhas dadas e devolve o caminho. */
const registro = (...linhas) => {
  contador += 1;
  const arquivo = join(PASTA_REGISTROS, `r${contador}.jsonl`);
  writeFileSync(arquivo, `${linhas.join('\n')}\n`);
  return arquivo;
};
/** A entrada completa do hook para uma chamada de Agent, com o chat principal no par dado (opus xhigh por padrão). */
const entradaDoHook = (tool_input, { model = 'claude-opus-5-5', effort = 'xhigh', nivelNaEntrada = true } = {}) => JSON.stringify({
  tool_name: 'Agent', tool_input, transcript_path: model === null ? undefined : registro(linhaDoAssistente(model)), ...(nivelNaEntrada && effort !== null ? { effort: { level: effort } } : {}),
});

const tools = 'Read, Grep, Glob';
const cabecalhos = {
  orquestrador: { name: 'orquestrador', model: 'opus', effort: 'xhigh' },
  'revisor-arquitetura': { name: 'revisor-arquitetura', model: 'opus', effort: 'high', tools },
  'revisor-seguranca': { name: 'revisor-seguranca', model: 'opus', effort: 'xhigh', tools },
  'revisor-lgpd': { name: 'revisor-lgpd', model: 'opus', effort: 'high', tools },
  'leitor-docs': { name: 'leitor-docs', model: 'haiku', effort: 'low', tools },
  qa: { name: 'qa', model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
  'revisor-tela': { name: 'revisor-tela', model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
};
const ler = (tipo) => cabecalhos[tipo];
const decide = (entrada) => decidirAgente({ description: 'revisar', prompt: 'x', ...entrada }, ler);
const passa = { decisao: null, motivo: null };

test('fork é negado, mesmo com model e effort', () => {
  assert.equal(decide({ subagent_type: 'fork' }).decisao, 'deny');
  assert.match(decide({ subagent_type: 'fork', model: 'sonnet', effort: 'high' }).motivo, /fork herda o modelo do chat principal; use um subagente com model/);
});

test('xhigh e max são negados fora dos agentes fixos', () => {
  for (const effort of ['xhigh', 'max', 'XHIGH']) {
    assert.equal(decide({ subagent_type: 'general-purpose', model: 'sonnet', effort }).decisao, 'deny', effort);
  }
  assert.equal(decide({ subagent_type: 'general-purpose', model: 'opus', effort: 'xhigh' }).decisao, 'deny', 'o negado vence o ask');
});

test('o effort fora dos agentes fixos só aceita low, medium e high: qualquer outro valor nega', () => {
  for (const effort of ['low', 'medium', 'high']) {
    assert.deepEqual(decide({ subagent_type: 'general-purpose', model: 'sonnet', effort }), passa, effort);
  }
  for (const effort of ['normal', 'ultra', 'inherit', 'Highest', '0']) {
    const r = decide({ subagent_type: 'general-purpose', model: 'sonnet', effort });
    assert.equal(r.decisao, 'deny', effort);
    assert.match(r.motivo, /low, medium ou high/);
  }
  const cabecalhoSonnet = () => ({ name: 'estranho', model: 'sonnet', effort: 'low', tools });
  assert.equal(decidirAgente({ subagent_type: 'estranho' }, cabecalhoSonnet).decisao, 'deny', 'fora dos fixos o cabeçalho não preenche model nem effort');
  assert.equal(decidirAgente({ subagent_type: 'estranho', model: 'sonnet' }, cabecalhoSonnet).decisao, 'deny', 'nem só o effort');
  assert.equal(decidirAgente({ subagent_type: 'estranho', effort: 'low' }, cabecalhoSonnet).decisao, 'deny', 'nem só o model');
});

test('o revisor-seguranca passa direto em opus xhigh e o revisor-arquitetura e o revisor-lgpd em opus high, negando outro modelo ou esforço', () => {
  const subagent_type = 'revisor-seguranca';
  assert.deepEqual(decide({ subagent_type }), passa, `${subagent_type} pelo cabeçalho`);
  assert.deepEqual(decide({ subagent_type, model: 'opus', effort: 'xhigh' }), passa, `${subagent_type} explícito`);
  assert.equal(decide({ subagent_type, model: 'sonnet', effort: 'high' }).decisao, 'deny', `${subagent_type} não aceita sonnet`);
  assert.equal(decide({ subagent_type, model: 'opus', effort: 'high' }).decisao, 'deny', `${subagent_type} não aceita high`);
  for (const tipo of ['revisor-arquitetura', 'revisor-lgpd']) {
    assert.deepEqual(decide({ subagent_type: tipo }), passa, `${tipo} pelo cabeçalho`);
    assert.deepEqual(decide({ subagent_type: tipo, model: 'opus', effort: 'high' }), passa, `${tipo} explícito`);
    assert.equal(decide({ subagent_type: tipo, model: 'sonnet', effort: 'high' }).decisao, 'deny', `${tipo} não aceita sonnet`);
    assert.equal(decide({ subagent_type: tipo, model: 'opus', effort: 'xhigh' }).decisao, 'deny', `${tipo} não aceita xhigh`);
  }
});

test('o leitor-docs passa direto em haiku low (cabeçalho ou chamada) e nega outro modelo ou esforço', () => {
  assert.deepEqual(decide({ subagent_type: 'leitor-docs' }), passa, 'leitor-docs pelo cabeçalho');
  assert.deepEqual(decide({ subagent_type: 'leitor-docs', model: 'haiku', effort: 'low' }), passa, 'leitor-docs explícito');
  assert.deepEqual(decide({ subagent_type: 'leitor-docs', effort: 'low' }), passa, 'só o effort: o modelo vem do cabeçalho');
  assert.equal(decide({ subagent_type: 'leitor-docs', model: 'sonnet', effort: 'low' }).decisao, 'deny', 'leitor-docs não aceita sonnet');
  assert.equal(decide({ subagent_type: 'leitor-docs', model: 'haiku', effort: 'medium' }).decisao, 'deny', 'leitor-docs não aceita medium');
  assert.equal(decide({ subagent_type: 'leitor-docs', model: 'opus', effort: 'xhigh' }).decisao, 'deny', 'leitor-docs não aceita opus xhigh');
});

test('o qa passa direto em sonnet high (cabeçalho ou chamada) e nega outro modelo, outro esforço e outras ferramentas', () => {
  assert.deepEqual(decide({ subagent_type: 'qa' }), passa, 'qa pelo cabeçalho, sem model nem effort');
  assert.deepEqual(decide({ subagent_type: 'qa', model: 'sonnet', effort: 'high' }), passa, 'qa explícito');
  assert.deepEqual(decide({ subagent_type: 'qa', effort: 'high' }), passa, 'só o effort: o modelo vem do cabeçalho');
  for (const [model, effort] of [['opus', 'high'], ['opus', 'xhigh'], ['haiku', 'high'], ['sonnet', 'medium'], ['sonnet', 'xhigh'], ['fable', 'high']]) {
    assert.equal(decide({ subagent_type: 'qa', model, effort }).decisao, 'deny', `qa ${model} ${effort}`);
  }
  assert.equal(TETO.qa.tools, 'Read, Grep, Glob, Bash');
  const com = (cabecalho) => (tipo) => (tipo === 'qa' ? { name: 'qa', ...cabecalho } : undefined);
  const certo = { model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' };
  const chamada = { subagent_type: 'qa', description: 'x', prompt: 'x' };
  assert.deepEqual(decidirAgente(chamada, com({ ...certo, tools: 'Bash, Read, Glob, Grep' })), passa, 'a ordem das ferramentas não importa');
  for (const tools of ['Read, Grep, Glob', 'Read, Grep, Glob, Bash, Write', 'Read, Grep, Glob, Edit', '*', undefined]) {
    assert.equal(decidirAgente(chamada, com({ ...certo, tools })).decisao, 'deny', `tools ${tools}`);
  }
  assert.equal(decidirAgente(chamada, com({ ...certo, model: 'opus' })).decisao, 'deny', 'cabeçalho do qa em opus');
  assert.equal(decide({ subagent_type: 'QA' }).decisao, 'deny', 'o subagent_type tem de ser igual ao name');
});

test('o agente fixo com o cabeçalho diferente da tabela (model, effort ou tools) é negado, mesmo com a chamada certa', () => {
  const com = (cabecalho) => (tipo) => (tipo === 'leitor-docs' ? { name: 'leitor-docs', ...cabecalho } : undefined);
  const certo = { model: 'haiku', effort: 'low', tools };
  const chamada = { subagent_type: 'leitor-docs', description: 'x', prompt: 'x' };
  assert.deepEqual(decidirAgente(chamada, com(certo)), passa);
  assert.deepEqual(decidirAgente(chamada, com({ ...certo, tools: 'Grep,Glob, Read' })), passa, 'a ordem das ferramentas não importa');
  assert.equal(decidirAgente(chamada, com({ effort: 'low', tools })).decisao, 'deny', 'sem model');
  assert.equal(decidirAgente(chamada, com({ model: 'haiku', tools })).decisao, 'deny', 'sem effort');
  assert.equal(decidirAgente(chamada, com({})).decisao, 'deny', 'sem nada');
  assert.equal(decidirAgente(chamada, () => undefined).decisao, 'deny', 'sem arquivo');
  for (const outro of [undefined, 'Read', 'Read, Grep', 'Read, Grep, Glob, Bash', 'Read, Grep, Glob, Write', '*']) {
    const r = decidirAgente({ ...chamada, model: 'haiku', effort: 'low' }, com({ ...certo, tools: outro }));
    assert.equal(r.decisao, 'deny', `tools ${outro}`);
    assert.match(r.motivo, /Read, Grep, Glob/);
  }
  assert.equal(decidirAgente({ ...chamada, model: 'haiku', effort: 'low' }, com({ ...certo, model: 'opus' })).decisao, 'deny', 'model do cabeçalho errado');
  assert.equal(decidirAgente({ ...chamada, model: 'haiku', effort: 'low' }, com({ ...certo, effort: 'xhigh' })).decisao, 'deny', 'effort do cabeçalho errado');
  assert.equal(decidirAgente(chamada, com({ ...certo, problema: 'x' })).decisao, 'deny', 'cabeçalho com problema');
});

test('o agente fixo exige o subagent_type igual ao name do cabeçalho, sem mudar a caixa nem aparar', () => {
  for (const subagent_type of ['Leitor-Docs', 'LEITOR-DOCS', ' leitor-docs', 'leitor-docs ']) {
    const r = decide({ subagent_type, model: 'haiku', effort: 'low' });
    assert.equal(r.decisao, 'deny', JSON.stringify(subagent_type));
    assert.match(r.motivo, /igual ao name do cabeçalho/);
  }
  const outroNome = (tipo) => (tipo === 'leitor-docs' ? { name: 'Leitor-Docs', model: 'haiku', effort: 'low', tools } : undefined);
  assert.equal(decidirAgente({ subagent_type: 'leitor-docs' }, outroNome).decisao, 'deny', 'arquivo com name: Leitor-Docs');
  const semName = (tipo) => (tipo === 'leitor-docs' ? { model: 'haiku', effort: 'low', tools } : undefined);
  assert.equal(decidirAgente({ subagent_type: 'leitor-docs' }, semName).decisao, 'deny', 'cabeçalho sem name');
});

test('o orquestrador é negado como subagente em toda combinação de modelo e esforço: roda só como agente do chat principal', () => {
  const modelos = [undefined, 'opus', 'sonnet', 'haiku', 'fable'];
  const esforcos = [undefined, 'low', 'medium', 'high', 'xhigh', 'max'];
  for (const subagent_type of ['orquestrador', 'Orquestrador', ' ORQUESTRADOR ']) {
    for (const model of modelos) {
      for (const effort of esforcos) {
        const r = decide({ subagent_type, model, effort });
        assert.equal(r.decisao, 'deny', `${subagent_type} ${model} ${effort}`);
        assert.match(r.motivo, /só como agente do chat principal/);
      }
    }
  }
});

test('sem model ou sem effort na chamada, só passa o agente fixo, que os traz no cabeçalho', () => {
  assert.match(decide({ subagent_type: 'general-purpose' }).motivo, /passe model e effort; o padrão é sonnet/);
  assert.equal(decide({}).decisao, 'deny', 'sem tipo, é o general-purpose');
  assert.equal(decide({ subagent_type: 'Explore', effort: 'low' }).decisao, 'deny');
  assert.deepEqual(decide({ subagent_type: 'revisor-seguranca' }), passa);
  assert.equal(decide({ subagent_type: 'sem-model' }).decisao, 'deny', 'tipo desconhecido, mesmo com cabeçalho');
  assert.equal(decide({ subagent_type: 'general-purpose', model: 'sonnet' }).decisao, 'deny', 'sonnet sem effort');
  assert.equal(decide({ subagent_type: 'general-purpose', effort: 'medium' }).decisao, 'deny', 'effort sem model');
  assert.equal(decide({ subagent_type: 'general-purpose', model: ' ', effort: 'medium' }).decisao, 'deny');
});

test('sonnet passa; opus e fable fora dos agentes fixos pedem a confirmação com o motivo; haiku é negado', () => {
  assert.deepEqual(decide({ subagent_type: 'general-purpose', model: 'sonnet', effort: 'medium' }), passa);
  const opus = decide({ subagent_type: 'Plan', model: 'opus', effort: 'high', description: 'proposta de arquitetura' });
  assert.deepEqual(opus, { decisao: 'ask', motivo: 'subagente em opus: um sonnet não resolveria? Motivo dado: proposta de arquitetura' });
  assert.equal(decide({ subagent_type: 'general-purpose', model: 'fable', effort: 'high' }).decisao, 'ask');
  assert.equal(decide({ subagent_type: 'general-purpose', model: 'haiku', effort: 'low' }).decisao, 'deny');
  assert.equal(decide({ subagent_type: 'general-purpose', model: 'inherit', effort: 'low' }).decisao, 'deny');
});

test('o hook de ponta a ponta: nega a entrada ilegível, o fork e o orquestrador, pede o opus fora dos agentes fixos, deixa o sonnet e os agentes fixos', () => {
  const hook = (entrada) => {
    const r = spawnSync(process.execPath, [join(AQUI, 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8' });
    return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput;
  };
  const chamada = (tool_input) => entradaDoHook(tool_input);
  assert.equal(hook('não é json')?.permissionDecision, 'deny');
  assert.equal(hook(JSON.stringify({ tool_name: 'Agent' }))?.permissionDecision, 'deny');
  assert.equal(hook(chamada({ subagent_type: 'fork', prompt: 'x' }))?.permissionDecision, 'deny');
  assert.equal(hook(chamada({ subagent_type: 'general-purpose', model: 'opus', effort: 'high', description: 'x' }))?.permissionDecision, 'ask');
  assert.equal(hook(chamada({ subagent_type: 'general-purpose', model: 'sonnet', effort: 'medium', description: 'x' })), null);
  assert.equal(hook(chamada({ subagent_type: 'revisor-seguranca', description: 'x' })), null, 'o cabeçalho de verdade do revisor-seguranca (opus xhigh)');
  assert.equal(hook(chamada({ subagent_type: 'revisor-arquitetura', description: 'x' })), null, 'o cabeçalho de verdade do revisor-arquitetura (opus high)');
  assert.equal(hook(chamada({ subagent_type: 'revisor-lgpd', description: 'x' })), null, 'o cabeçalho de verdade do revisor-lgpd (opus high)');
  assert.equal(hook(chamada({ subagent_type: 'leitor-docs', description: 'x' })), null, 'o cabeçalho de verdade do leitor-docs (haiku low)');
  assert.equal(hook(chamada({ subagent_type: 'qa', description: 'x' })), null, 'o cabeçalho de verdade do qa (sonnet high)');
  assert.equal(hook(chamada({ subagent_type: 'revisor-tela', description: 'x' })), null, 'o cabeçalho de verdade do revisor-tela (sonnet high)');
  assert.equal(hook(chamada({ subagent_type: 'qa', model: 'opus', effort: 'high', description: 'x' }))?.permissionDecision, 'deny', 'qa não roda em opus');
  assert.equal(hook(chamada({ subagent_type: 'orquestrador', description: 'x' }))?.permissionDecision, 'deny', 'o orquestrador não roda como subagente');
  assert.equal(hook(chamada({ subagent_type: 'orquestrador', model: 'opus', effort: 'xhigh', description: 'x' }))?.permissionDecision, 'deny');
});

/** Roda o hook de verdade numa pasta temporária com a cópia dele, o config.mjs e o `pipeline.json` que o teste escolhe (texto, ou null = sem arquivo). */
function hookCom(pipeline, tipo = 'qa') {
  const raiz = mkdtempSync(join(tmpdir(), 'guarda-agentes-json-'));
  try {
    mkdirSync(join(raiz, 'hooks'));
    cpSync(join(AQUI, 'guarda-agentes.mjs'), join(raiz, 'hooks', 'guarda-agentes.mjs'));
    cpSync(join(AQUI, 'config.mjs'), join(raiz, 'hooks', 'config.mjs'));
    cpSync(AGENTES, join(raiz, 'agents'), { recursive: true });
    if (pipeline !== null) writeFileSync(join(raiz, 'pipeline.json'), pipeline);
    const entrada = entradaDoHook({ subagent_type: tipo, description: 'x' });
    const r = spawnSync(process.execPath, [join(raiz, 'hooks', 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8' });
    return { status: r.status, saida: r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
const real = () => readFileSync(ARQUIVO, 'utf8');
const comAgente = (nome, campos) => { const j = JSON.parse(real()); Object.assign(j.agentes[nome], campos); return JSON.stringify(j); };

test('o pipeline.json ausente, ilegível, com marcas de conflito, sem agentes ou fora do formato dá deny em JSON, nunca saída 1 sem decisão', () => {
  const quebrado = [
    ['ausente', null],
    ['ilegível', '{ quebrado'],
    ['marcas de conflito', `<<<<<<< HEAD
${real()}
=======
${real()}
>>>>>>> outro`],
    ['sem agentes', JSON.stringify({ ...JSON.parse(real()), agentes: undefined })],
    ['agente sem tools', comAgente('qa', { tools: undefined })],
    ['abaixo do piso', comAgente('revisor-seguranca', { model: 'sonnet', effort: 'medium' })],
    ['nome desconhecido', JSON.stringify({ ...JSON.parse(real()), agentes: { ...JSON.parse(real()).agentes, intruso: { model: 'opus', effort: 'high', tools: 'Read' } } })],
  ];
  for (const [rotulo, texto] of quebrado) {
    const r = hookCom(texto);
    assert.equal(r.status, 0, `${rotulo}: o hook não sai com erro`);
    assert.equal(r.saida?.permissionDecision, 'deny', rotulo);
    assert.match(r.saida.permissionDecisionReason, /pipeline\.json ilegível/, rotulo);
  }
});

test('o config.mjs quebrado (conflito de merge) dá deny em JSON na guarda, e o hook não sai sem decisão', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'guarda-agentes-cfg-'));
  try {
    mkdirSync(join(raiz, 'hooks'));
    cpSync(join(AQUI, 'guarda-agentes.mjs'), join(raiz, 'hooks', 'guarda-agentes.mjs'));
    writeFileSync(join(raiz, 'hooks', 'config.mjs'), '<<<<<<< HEAD\nexport const ESCADA = [];\n=======\n>>>>>>> outro\n');
    cpSync(ARQUIVO, join(raiz, 'pipeline.json'));
    cpSync(AGENTES, join(raiz, 'agents'), { recursive: true });
    for (const tipo of ['qa', 'general-purpose']) {
      const entrada = entradaDoHook({ subagent_type: tipo, model: 'sonnet', effort: 'low', description: 'x' });
      const r = spawnSync(process.execPath, [join(raiz, 'hooks', 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8' });
      assert.equal(r.status, 0, `${tipo}: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', tipo);
      assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /config\.mjs ilegível/);
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o pipeline.json com BOM carrega e a guarda decide normalmente', () => {
  const r = hookCom(`﻿${real()}`);
  assert.deepEqual(r, { status: 0, saida: null });
});

test('o pipeline.json acima do teto dá ask, abaixo do teto passa e o cabeçalho tem de acompanhar o JSON', () => {
  const acima = hookCom(comAgente('revisor-arquitetura', { effort: 'xhigh' }), 'revisor-arquitetura');
  assert.equal(acima.saida?.permissionDecision, 'deny', 'o cabeçalho ainda diz high: não bate com o JSON');
  const entradaDe = (vigente) => decidirAgente({ subagent_type: 'revisor-arquitetura', description: 'x' }, () => ({ name: 'revisor-arquitetura', model: vigente.model, effort: vigente.effort, tools: vigente.tools }), { 'revisor-arquitetura': vigente });
  const ferr = TETO['revisor-arquitetura'].tools;
  assert.equal(entradaDe({ model: 'opus', effort: 'xhigh', tools: ferr }).decisao, 'ask', 'acima do teto (opus xhigh): confirmação');
  assert.match(entradaDe({ model: 'opus', effort: 'xhigh', tools: ferr }).motivo, /acima do teto/);
  assert.deepEqual(entradaDe({ model: 'sonnet', effort: 'high', tools: ferr }), passa, 'descer abaixo do teto passa');
  assert.deepEqual(entradaDe({ model: 'opus', effort: 'high', tools: ferr }), passa, 'no teto passa');
  assert.equal(entradaDe({ model: 'opus', effort: 'high', tools: 'Read, Grep, Glob, Bash' }).decisao, 'deny', 'ferramentas diferentes do teto negam');
  assert.equal(decidirAgente({ subagent_type: 'qa', description: 'x' }, () => cabecalhos.qa, {}).decisao, 'deny', 'o agente falta no pipeline.json');
});

test('os cabeçalhos de verdade de .claude/agents/ batem com a tabela da guarda e o name com o nome do arquivo', () => {
  const arquivos = readdirSync(AGENTES, { recursive: true }).map(String).filter((a) => a.toLowerCase().endsWith('.md'));
  assert.ok(arquivos.length >= 5);
  for (const arquivo of arquivos) {
    const tipo = arquivo.replace(/\.md$/, '');
    const { name, model, effort, tools: ferramentas, problema } = lerCabecalhoDoArquivo(tipo) ?? {};
    assert.equal(name, tipo, `${arquivo}: name ${name}`);
    assert.equal(problema, undefined, `${arquivo}: ${problema}`);
    if (tipo === SO_NO_CHAT) {
      const { model: modeloDoJson, effort: esforcoDoJson } = lerNiveis().valor.orquestracao;
      assert.equal(model, modeloDoJson, `${arquivo}: model ${model}`);
      assert.equal(effort, esforcoDoJson, `${arquivo}: effort ${effort}`);
    } else if (Object.hasOwn(TETO, tipo)) {
      const vigente = lerAgentes().valor[tipo];
      assert.equal(model, vigente.model, `${arquivo}: model ${model}`);
      assert.equal(effort, vigente.effort, `${arquivo}: effort ${effort}`);
      assert.equal(ferramentas, vigente.tools, `${arquivo}: tools ${ferramentas}`);
    } else {
      assert.fail(`${arquivo}: agente fora das listas da guarda (ou em subpasta)`);
    }
  }
  for (const tipo of Object.keys(TETO)) assert.ok(arquivos.includes(`${tipo}.md`), `${tipo} da tabela sem arquivo`);
  assert.equal(lerCabecalhoDoArquivo('nao-existe'), undefined);
  assert.equal(lerCabecalhoDoArquivo('../agents/revisor-lgpd'), undefined, 'o tipo não sai da pasta');
});

/** Uma cópia dos agentes de verdade numa pasta temporária, com `mexer(pasta)` aplicado; `fn` recebe a pasta e um decide(tipo) contra ela. */
function comPasta(mexer, fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'guarda-agentes-'));
  try {
    const pasta = join(raiz, 'agents');
    cpSync(AGENTES, pasta, { recursive: true });
    mexer(pasta);
    fn(pasta, (subagent_type) => decidirAgente({ subagent_type, description: 'x' }, (t) => lerCabecalhoDoArquivo(t, pasta), lerAgentes().valor));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
const cabecalhoFalso = (name, extra = 'model: opus\neffort: max\n') => `---\nname: ${name}\ndescription: x\n${extra}---\ncorpo\n`;

test('outro arquivo em .claude/agents nega o agente fixo: com o mesmo name, fora da lista ou em subpasta', () => {
  comPasta(() => {}, (_, decide) => assert.deepEqual(decide('revisor-seguranca'), passa, 'a cópia intacta passa'));
  for (const [rotulo, rel] of [['na raiz', 'zz.md'], ['em subpasta', join('sub', 'zz.md')], ['com .MD', 'zz.MD']]) {
    comPasta((pasta) => {
      if (rel.includes('sub')) mkdirSync(join(pasta, 'sub'));
      writeFileSync(join(pasta, rel), cabecalhoFalso('revisor-seguranca'));
    }, (_, decide) => {
      for (const tipo of Object.keys(TETO)) {
        const r = decide(tipo);
        assert.equal(r.decisao, 'deny', `${rotulo}: ${tipo}`);
        assert.match(r.motivo, /não é um agente conhecido da guarda/);
      }
    });
  }
  comPasta((pasta) => writeFileSync(join(pasta, 'sub.md'), cabecalhoFalso('outro-nome')), (_, decide) => {
    assert.equal(decide('leitor-docs').decisao, 'deny', 'mesmo com name diferente: o arquivo fora da lista nega');
  });
});

test('um arquivo da lista com o name de outro agente fixo nega esse agente, com aspas ou sem', () => {
  for (const name of ['revisor-seguranca', '"revisor-seguranca"', "'revisor-seguranca'"]) {
    comPasta((pasta) => writeFileSync(join(pasta, 'orquestrador.md'), cabecalhoFalso(name, 'model: opus\neffort: xhigh\n')), (_, decide) => {
      const r = decide('revisor-seguranca');
      assert.equal(r.decisao, 'deny', name);
      assert.match(r.motivo, /orquestrador\.md também tem name: revisor-seguranca/);
    });
  }
});

test('campo repetido no cabeçalho (name, model, effort ou tools) nega o agente fixo', () => {
  for (const [campo, linha] of [['name', 'name: leitor-docs'], ['model', 'model: opus'], ['effort', 'effort: max'], ['tools', 'tools: Bash']]) {
    comPasta((pasta) => {
      const arquivo = join(pasta, 'leitor-docs.md');
      writeFileSync(arquivo, readFileSync(arquivo, 'utf8').replace(/\r?\n---/, `\n${linha}\n---`));
    }, (_, decide) => {
      const r = decide('leitor-docs');
      assert.equal(r.decisao, 'deny', campo);
      assert.match(r.motivo, new RegExp(`o campo ${campo}: aparece mais de uma vez`));
    });
  }
});

test('o tools do cabeçalho do agente fixo precisa ser o da tabela, de verdade em disco', () => {
  for (const tools of ['Read, Grep, Glob, Bash', 'Read', '*']) {
    comPasta((pasta) => {
      const arquivo = join(pasta, 'revisor-lgpd.md');
      writeFileSync(arquivo, readFileSync(arquivo, 'utf8').replace(/^tools:.*$/m, `tools: ${tools}`));
    }, (_, decide) => assert.equal(decide('revisor-lgpd').decisao, 'deny', tools));
  }
  comPasta((pasta) => {
    const arquivo = join(pasta, 'revisor-lgpd.md');
    writeFileSync(arquivo, readFileSync(arquivo, 'utf8').replace(/^tools:.*\r?\n/m, ''));
  }, (_, decide) => assert.equal(decide('revisor-lgpd').decisao, 'deny', 'sem tools = todas as ferramentas'));
});

test('o cabeçalho com fim de linha CRLF é lido igual', () => {
  comPasta((pasta) => {
    const arquivo = join(pasta, 'leitor-docs.md');
    writeFileSync(arquivo, readFileSync(arquivo, 'utf8').replace(/\r?\n/g, '\r\n'));
  }, (pasta, decide) => {
    assert.deepEqual(decide('leitor-docs'), passa);
    assert.deepEqual(lerCabecalhoDoArquivo('leitor-docs', pasta)?.tools, 'Read, Grep, Glob');
  });
});

test('o hook copiado para uma pasta temporária falha fechado: arquivo ilegível, arquivo estranho e a cópia intacta', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'guarda-agentes-hook-'));
  try {
    mkdirSync(join(raiz, 'hooks'));
    cpSync(join(AQUI, 'guarda-agentes.mjs'), join(raiz, 'hooks', 'guarda-agentes.mjs'));
    cpSync(join(AQUI, 'config.mjs'), join(raiz, 'hooks', 'config.mjs'));
    cpSync(ARQUIVO, join(raiz, 'pipeline.json'));
    cpSync(join(AQUI, 'config.mjs'), join(raiz, 'hooks', 'config.mjs'));
    cpSync(ARQUIVO, join(raiz, 'pipeline.json'));
    const hook = (tipo) => {
      const entrada = entradaDoHook({ subagent_type: tipo, description: 'x' });
      const r = spawnSync(process.execPath, [join(raiz, 'hooks', 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8' });
      return { status: r.status, saida: r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput };
    };
    cpSync(AGENTES, join(raiz, 'agents'), { recursive: true });
    assert.deepEqual(hook('leitor-docs'), { status: 0, saida: null }, 'cópia intacta');
    mkdirSync(join(raiz, 'agents', 'general-purpose.md'));
    const geral = hook('general-purpose');
    assert.equal(geral.status, 0, 'a pasta general-purpose.md não derruba o hook');
    assert.equal(geral.saida?.permissionDecision, 'deny');
    rmSync(join(raiz, 'agents', 'general-purpose.md'), { recursive: true });
    rmSync(join(raiz, 'agents', 'leitor-docs.md'));
    mkdirSync(join(raiz, 'agents', 'leitor-docs.md'));
    const ilegivel = hook('leitor-docs');
    assert.equal(ilegivel.status, 0, 'o hook não cai com saída 1');
    assert.equal(ilegivel.saida?.permissionDecision, 'deny');
    assert.match(ilegivel.saida?.permissionDecisionReason, /cabeçalho ilegível/);
    rmSync(join(raiz, 'agents', 'leitor-docs.md'), { recursive: true });
    cpSync(join(AGENTES, 'leitor-docs.md'), join(raiz, 'agents', 'leitor-docs.md'));
    writeFileSync(join(raiz, 'agents', 'zz.md'), cabecalhoFalso('revisor-seguranca'));
    assert.equal(hook('revisor-seguranca').saida?.permissionDecision, 'deny', 'arquivo estranho');
    assert.match(hook('revisor-seguranca').saida?.permissionDecisionReason, /zz\.md/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('com o cabeçalho lido do arquivo de verdade, o agente fixo em minúsculas, sem model nem effort, passa', () => {
  for (const subagent_type of Object.keys(TETO)) {
    assert.deepEqual(decidirAgente({ subagent_type, description: 'x' }, lerCabecalhoDoArquivo, lerAgentes().valor), passa, subagent_type);
  }
});

test('o revisor-tela passa direto em sonnet high, com as ferramentas do qa, e nega outro modelo, esforço ou ferramentas (D3)', () => {
  assert.deepEqual(TETO['revisor-tela'], { model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' });
  assert.deepEqual(decide({ subagent_type: 'revisor-tela' }), passa, 'pelo cabeçalho');
  assert.deepEqual(decide({ subagent_type: 'revisor-tela', model: 'sonnet', effort: 'high' }), passa, 'explícito');
  for (const [model, effort] of [['opus', 'high'], ['haiku', 'high'], ['sonnet', 'xhigh'], ['sonnet', 'medium']]) {
    assert.equal(decide({ subagent_type: 'revisor-tela', model, effort }).decisao, 'deny', `${model} ${effort}`);
  }
  const cabecalho = (tools) => (tipo) => (tipo === 'revisor-tela' ? { ...cabecalhos['revisor-tela'], tools } : undefined);
  assert.equal(decidirAgente({ subagent_type: 'revisor-tela', description: 'x' }, cabecalho('Read, Grep, Glob')).decisao, 'deny', 'sem o Bash');
  assert.equal(decidirAgente({ subagent_type: 'revisor-tela', description: 'x' }, cabecalho('Read, Grep, Glob, Bash, Edit')).decisao, 'deny', 'com o Edit');
});

// ---------- o chat principal em opus xhigh (D3) ----------

const ESPERADO = FIXOS.niveis.orquestracao;
const SEM_PAR = { model: undefined, effort: undefined };

test('decidirOrquestrador: o par esperado vem do config.mjs (opus xhigh); esforço ou modelo errado nega com a correção; o que não deu para ler pede confirmação', () => {
  assert.equal(ESPERADO, 'opus:xhigh');
  const d = ({ model, effort, efforts } = {}) => decidirOrquestrador({ model, efforts: efforts ?? (effort === undefined ? [] : [effort]) });
  assert.deepEqual(d({ model: 'claude-opus-5-5', effort: 'xhigh' }), passa);
  assert.deepEqual(d({ model: 'claude-opus-5-5[1m]', effort: 'XHIGH' }), passa, 'caixa e sufixo do modelo não importam');
  for (const effort of ['low', 'medium', 'high', 'max']) {
    const r = d({ model: 'claude-opus-5-5', effort });
    assert.equal(r.decisao, 'deny', effort);
    assert.match(r.motivo, /\/effort xhigh/);
    assert.match(r.motivo, new RegExp(effort));
  }
  for (const model of ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-fable-1']) {
    const r = d({ model, effort: 'xhigh' });
    assert.equal(r.decisao, 'deny', model);
    assert.match(r.motivo, /\/model opus/);
  }
  const dois = d({ model: 'claude-haiku-4-5', effort: 'low' });
  assert.equal(dois.decisao, 'deny');
  assert.match(dois.motivo, /\/model opus/);
  assert.match(dois.motivo, /\/effort xhigh/, 'os dois erros na mesma mensagem');
  for (const par of [{}, { effort: 'xhigh' }, { model: 'claude-opus-5-5' }, { model: '', effort: '  ' }, { model: null, effort: null }, undefined]) {
    const r = d(par);
    assert.equal(r.decisao, 'ask', JSON.stringify(par));
    assert.match(r.motivo, /confirme que o chat está em opus xhigh, D3/);
  }
  assert.equal(d({ model: 'claude-haiku-4-5' }).decisao, 'deny', 'modelo errado e esforço desconhecido: o deny vence o ask');
  assert.equal(d({ effort: 'high' }).decisao, 'deny', 'esforço errado e modelo desconhecido: o deny vence o ask');
  assert.equal(d({ model: 'claude-opus-5-5', efforts: ['xhigh', 'low'] }).decisao, 'deny', 'qualquer esforço conhecido que não seja xhigh nega');
  assert.equal(d({ model: 'claude-opus-5-5', efforts: ['low', 'xhigh'] }).decisao, 'deny', 'em qualquer ordem');
  assert.deepEqual(d({ model: 'claude-opus-5-5', efforts: ['xhigh', 'XHIGH '] }), passa, 'todos xhigh');
  assert.equal(decidirOrquestrador({ model: 'claude-opus-5-5' }).decisao, 'ask', 'sem a lista de esforços: desconhecido');
});

test('juntarDecisoes: deny vence ask, que vence passar', () => {
  const nega = { decisao: 'deny', motivo: 'a' };
  const pede = { decisao: 'ask', motivo: 'b' };
  assert.deepEqual(juntarDecisoes(passa, passa), passa);
  assert.deepEqual(juntarDecisoes(passa, pede), pede);
  assert.deepEqual(juntarDecisoes(pede, nega), nega);
  assert.deepEqual(juntarDecisoes(nega, pede), nega);
  assert.deepEqual(juntarDecisoes(nega, { decisao: 'deny', motivo: 'c' }), { decisao: 'deny', motivo: 'a; c' });
  assert.deepEqual(juntarDecisoes(pede, { decisao: 'ask', motivo: 'd' }), { decisao: 'ask', motivo: 'b; d' });
});

const L = linhaDoAssistente;

test('lerParDoRegistro: a última linha do assistente fora de subagente dá o modelo e o esforço; linha quebrada se pula; CRLF vale', () => {
  const texto = (...linhas) => linhas.join('\n');
  const opus = { model: 'claude-opus-5-5', effort: 'xhigh' };
  assert.deepEqual(lerParDoRegistro(texto(L('claude-haiku-4-5', 'low'), L('claude-opus-5-5', 'xhigh'))), opus, 'a última');
  assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', 'xhigh'), L('claude-haiku-4-5', 'low', { isSidechain: true }))), opus, 'subagente não conta');
  assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', 'xhigh', { isSidechain: false }))), opus, 'isSidechain false conta');
  assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', 'xhigh'), JSON.stringify({ type: 'user', message: { role: 'user', content: 'oi' } }), JSON.stringify({ type: 'system', effort: 'low' }))), opus, 'só type assistant');
  assert.deepEqual(lerParDoRegistro(texto('ssistant","message":{"model":"x"}}', L('claude-opus-5-5', 'xhigh'), '{ "type": "assistant", "message": { "model": "claude-haiku')), opus, 'o começo cortado e a última linha pela metade se pulam');
  assert.deepEqual(lerParDoRegistro(`${L('claude-opus-5-5', 'xhigh')}\r\n${L('claude-opus-5-5', 'high')}\r\n`), { model: 'claude-opus-5-5', effort: 'high' }, 'CRLF');
  const dePapelErrado = (type) => JSON.stringify({ type, effort: 'low', message: { model: 'claude-haiku-x', role: 'user', content: 'x' } });
  for (const type of ['user', 'system', 'summary', 'attachment']) {
    assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', 'xhigh'), dePapelErrado(type))), opus, `uma linha type ${type} com message.model depois da linha opus não vale`);
  }
  assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', 'xhigh'), L('<synthetic>', undefined))), opus, 'a mensagem sintética (erro de API) não é o modelo do chat');
  assert.deepEqual(lerParDoRegistro(texto(L('claude-opus-5-5', undefined))), { model: 'claude-opus-5-5', effort: undefined }, 'sem o campo effort, o esforço fica desconhecido');
  for (const vazio of ['', '\n\n', 'não é json', L('claude-opus-5-5', 'xhigh', { isSidechain: true }), JSON.stringify({ type: 'assistant' })]) {
    assert.deepEqual(lerParDoRegistro(vazio), SEM_PAR, JSON.stringify(vazio));
  }
  assert.deepEqual(lerParDoRegistro(undefined), SEM_PAR);
});

test('lerRegistroDoArquivo lê só o fim de um arquivo grande, e o arquivo que falta ou é pasta dá par desconhecido, sem exceção', () => {
  const enchimento = `${JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } })}\n`;
  const arquivo = registro(L('claude-haiku-4-5', 'low'));
  writeFileSync(arquivo, `${L('claude-haiku-4-5', 'low')}\n${enchimento.repeat(3000)}${L('claude-opus-5-5', 'xhigh')}\n`); // ~6 MB: o 1º assistente fica fora da janela
  assert.deepEqual(lerRegistroDoArquivo(arquivo), { model: 'claude-opus-5-5', effort: 'xhigh' });
  assert.deepEqual(lerRegistroDoArquivo(arquivo, 1024), { model: 'claude-opus-5-5', effort: 'xhigh' }, 'janela pequena: pega o fim e pula a linha cortada');
  assert.deepEqual(lerRegistroDoArquivo(join(PASTA_REGISTROS, 'nao-existe.jsonl')), SEM_PAR);
  assert.deepEqual(lerRegistroDoArquivo(PASTA_REGISTROS), SEM_PAR, 'uma pasta');
  for (const ruim of [undefined, null, '', 42]) assert.deepEqual(lerRegistroDoArquivo(ruim), SEM_PAR, String(ruim));
});

test('a janela do registro: a única linha do chat no começo de um arquivo de mais de 4 MB, coberta por linhas que não contam, dá par desconhecido', () => {
  const user = `${JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } })}\n`;
  const subagente = `${L('claude-haiku-4-5', 'low', { isSidechain: true })}\n`;
  const arquivo = registro(L('claude-opus-5-5', 'xhigh'));
  writeFileSync(arquivo, `${L('claude-opus-5-5', 'xhigh')}\n${user.repeat(1500)}${subagente.repeat(1300)}${user.repeat(1500)}`); // ~6,5 MB
  assert.ok(readFileSync(arquivo).length > 4 * 1024 * 1024 + 1024, 'o arquivo passa da janela');
  assert.deepEqual(lerRegistroDoArquivo(arquivo), SEM_PAR, 'a linha do chat ficou fora da janela de 4 MB: o par é desconhecido');
  assert.deepEqual(lerRegistroDoArquivo(arquivo, Number.POSITIVE_INFINITY), { model: 'claude-opus-5-5', effort: 'xhigh' }, 'sem janela o mesmo arquivo dá o par: é a janela que corta');
});

test('o hook de ponta a ponta nega a chamada de Agent feita por um subagente, sem rodar a checagem do par; o chat principal aberto como orquestrador segue (D3)', () => {
  const hook = (entrada) => {
    const r = spawnSync(process.execPath, [join(AQUI, 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8' });
    return { status: r.status, saida: r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput };
  };
  const chamada = { subagent_type: 'leitor-docs', description: 'x' };
  const com = (extra, par) => JSON.stringify({ ...JSON.parse(entradaDoHook(chamada, par)), ...extra });
  const dentro = hook(com({ agent_id: 'abc', agent_type: 'general-purpose' }));
  assert.equal(dentro.status, 0);
  assert.equal(dentro.saida?.permissionDecision, 'deny');
  assert.match(dentro.saida.permissionDecisionReason, /subagente não abre subagente: só o chat principal, o orquestrador, delega \(D3\)/);
  assert.equal(hook(com({ agent_id: 'abc', agent_type: 'orquestrador' })).saida?.permissionDecision, 'deny', 'agent_id vale mesmo com agent_type orquestrador');
  assert.equal(hook(com({ agent_id: 'abc' })).saida?.permissionDecision, 'deny', 'só o agent_id');
  const foraDoPar = hook(com({ agent_id: 'abc', agent_type: 'qa' }, { effort: 'low' }));
  assert.match(foraDoPar.saida.permissionDecisionReason, /subagente não abre subagente/);
  assert.doesNotMatch(foraDoPar.saida.permissionDecisionReason, /effort/, 'a checagem do par não roda');
  assert.deepEqual(hook(com({ agent_type: 'orquestrador' })), { status: 0, saida: null }, 'orquestrador no par certo passa');
  assert.equal(hook(com({ agent_type: 'orquestrador' }, { effort: 'low' })).saida?.permissionDecision, 'deny', 'e no par errado nega pelo par');
  assert.deepEqual(hook(com({})), { status: 0, saida: null }, 'sem agent_type (o chat principal sem --agent) segue');
  assert.deepEqual(hook(com({ agent_type: 'outro' })), { status: 0, saida: null }, 'o chat principal aberto com --agent outro: sem agent_id não nega aqui');
  assert.equal(hook(com({ agent_type: 'outro' }, { effort: 'low' })).saida?.permissionDecision, 'deny', 'e segue para a checagem do par');
  for (const agent_id of ['', null, 7]) assert.deepEqual(hook(com({ agent_id })), { status: 0, saida: null }, `agent_id ${JSON.stringify(agent_id)} não é subagente`);
});

test('parDoChat: com effort.level na entrada só ele vale; sem ele valem CLAUDE_EFFORT e o registro, todos os que existem; o modelo vem do registro', () => {
  const doRegistro = () => ({ model: 'claude-opus-5-5', effort: 'high' });
  const opus = (efforts) => ({ model: 'claude-opus-5-5', efforts });
  assert.deepEqual(parDoChat({ effort: { level: 'xhigh' } }, { CLAUDE_EFFORT: 'low' }, doRegistro), opus(['xhigh']), 'a entrada vence e é a única');
  assert.deepEqual(parDoChat({}, { CLAUDE_EFFORT: 'xhigh' }, doRegistro), opus(['xhigh', 'high']), 'sem a entrada, a variável e o registro');
  assert.deepEqual(parDoChat({}, {}, doRegistro), opus(['high']), 'só o registro');
  assert.deepEqual(parDoChat({}, { CLAUDE_EFFORT: 'high' }, doRegistro), opus(['high']), 'iguais: uma vez só');
  assert.deepEqual(parDoChat({ effort: { level: '  ' } }, { CLAUDE_EFFORT: '' }, doRegistro), opus(['high']), 'vazio não conta');
  assert.deepEqual(parDoChat({}, { CLAUDE_EFFORT: ' XHIGH ' }, () => SEM_PAR), { model: undefined, efforts: ['xhigh'] }, 'normaliza');
  assert.deepEqual(parDoChat({ effort: 'xhigh' }, {}, () => SEM_PAR), { model: undefined, efforts: [] }, 'effort que não é objeto com level não vale');
  assert.deepEqual(parDoChat({ transcript_path: 'x' }, {}, (caminho) => ({ model: caminho, effort: undefined })), { model: 'x', efforts: [] }, 'o registro recebe o transcript_path');
  assert.deepEqual(parDoChat(undefined, undefined, () => SEM_PAR), { model: undefined, efforts: [] });
  assert.deepEqual(parDoChat({}, {}, () => { throw new Error('quebrou'); }), { model: undefined, efforts: [] }, 'erro ao ler o registro: desconhecido, nunca exceção');
  // a regra que importa (segurança): sem effort.level, CLAUDE_EFFORT xhigh não cobre um registro em low
  assert.equal(decidirOrquestrador(parDoChat({}, { CLAUDE_EFFORT: 'xhigh' }, () => ({ model: 'claude-opus-5-5', effort: 'low' }))).decisao, 'deny');
  assert.deepEqual(decidirOrquestrador(parDoChat({ effort: { level: 'xhigh' } }, { CLAUDE_EFFORT: 'low' }, () => ({ model: 'claude-opus-5-5', effort: 'low' }))), passa, 'com effort.level só ele vale');
});

test('decidirChamador: quem separa o subagente do chat principal é o agent_id; sem ele, qualquer agent_type segue para a checagem do par (D3)', () => {
  const motivo = 'subagente não abre subagente: só o chat principal, o orquestrador, delega (D3)';
  for (const entrada of [{ agent_id: 'a1' }, { agent_id: 'a1', agent_type: 'orquestrador' }, { agent_id: 'a1', agent_type: 'general-purpose' }, { agent_id: ' a1 ', agent_type: 'Explore' }]) {
    assert.deepEqual(decidirChamador(entrada), { decisao: 'deny', motivo }, JSON.stringify(entrada));
  }
  for (const entrada of [{}, undefined, null, { agent_type: 'orquestrador' }, { agent_type: 'outro' }, { agent_type: 'general-purpose' }, { agent_id: '' }, { agent_id: '  ' }, { agent_id: null }, { agent_id: 7 }, { agent_id: {}, agent_type: 'outro' }]) {
    assert.equal(decidirChamador(entrada), null, JSON.stringify(entrada));
  }
});

test('o hook de ponta a ponta confere o chat principal: opus xhigh passa; outro esforço ou modelo nega; o que não deu para ler pede confirmação; vale para toda chamada de Agent', () => {
  const hook = (entrada, env = {}) => {
    const { CLAUDE_EFFORT, ...resto } = process.env;
    const r = spawnSync(process.execPath, [join(AQUI, 'guarda-agentes.mjs')], { input: entrada, encoding: 'utf8', env: { ...resto, ...env } });
    return { status: r.status, saida: r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput };
  };
  const leitor = { subagent_type: 'leitor-docs', description: 'x' };
  const sonnet = { subagent_type: 'general-purpose', model: 'sonnet', effort: 'low', description: 'x' };
  assert.deepEqual(hook(entradaDoHook(leitor)), { status: 0, saida: null }, 'opus xhigh');
  for (const chamada of [leitor, sonnet]) {
    const alto = hook(entradaDoHook(chamada, { effort: 'high' }));
    assert.equal(alto.saida?.permissionDecision, 'deny', 'effort high');
    assert.match(alto.saida.permissionDecisionReason, /\/effort xhigh/);
    const haiku = hook(entradaDoHook(chamada, { model: 'claude-haiku-4-5' }));
    assert.equal(haiku.saida?.permissionDecision, 'deny', 'modelo haiku');
    assert.match(haiku.saida.permissionDecisionReason, /\/model opus/);
    assert.equal(hook(entradaDoHook(chamada, { model: null })).saida?.permissionDecision, 'ask', 'sem registro');
    assert.equal(hook(entradaDoHook(chamada, { nivelNaEntrada: false })).saida?.permissionDecision, 'ask', 'esforço só no registro, sem o campo effort na linha: desconhecido');
  }
  const semNivel = entradaDoHook(leitor, { nivelNaEntrada: false });
  assert.deepEqual(hook(semNivel, { CLAUDE_EFFORT: 'xhigh' }), { status: 0, saida: null }, 'o esforço pela variável de ambiente');
  assert.equal(hook(semNivel, { CLAUDE_EFFORT: 'high' }).saida?.permissionDecision, 'deny');
  const registroLow = JSON.parse(semNivel);
  registroLow.transcript_path = registro(L('claude-opus-5-5', 'low'));
  const baixo = hook(JSON.stringify(registroLow), { CLAUDE_EFFORT: 'xhigh' });
  assert.equal(baixo.saida?.permissionDecision, 'deny', 'sem effort.level, CLAUDE_EFFORT xhigh não cobre o registro em low');
  assert.match(baixo.saida.permissionDecisionReason, /\/effort xhigh/);
  registroLow.effort = { level: 'xhigh' };
  assert.deepEqual(hook(JSON.stringify(registroLow), { CLAUDE_EFFORT: 'low' }), { status: 0, saida: null }, 'com effort.level só ele vale');
  const noRegistro = JSON.parse(semNivel);
  noRegistro.transcript_path = registro(L('claude-opus-5-5', 'xhigh'), L('claude-haiku-4-5', 'low', { isSidechain: true }));
  assert.deepEqual(hook(JSON.stringify(noRegistro)), { status: 0, saida: null }, 'o par todo pelo registro, ignorando a linha de subagente');
  noRegistro.transcript_path = join(PASTA_REGISTROS, 'nao-existe.jsonl');
  const faltando = hook(JSON.stringify(noRegistro));
  assert.equal(faltando.status, 0, 'registro ilegível: o hook decide, não cai');
  assert.equal(faltando.saida?.permissionDecision, 'ask');
  assert.match(faltando.saida.permissionDecisionReason, /confirme que o chat está em opus xhigh, D3/);
  const negado = hook(entradaDoHook({ subagent_type: 'fork', prompt: 'x' }, { effort: 'high' }));
  assert.equal(negado.saida?.permissionDecision, 'deny', 'deny com deny');
  assert.match(negado.saida.permissionDecisionReason, /fork herda/);
  assert.match(negado.saida.permissionDecisionReason, /\/effort xhigh/, 'os dois motivos');
  const opus = hook(entradaDoHook({ subagent_type: 'general-purpose', model: 'opus', effort: 'high', description: 'x' }, { model: null }));
  assert.equal(opus.saida?.permissionDecision, 'ask', 'ask com ask');
});

test('opus:medium num agente fixo (o piso do revisor-arquitetura): passa quando o cabeçalho diz o mesmo, nega quando não, e a chamada não sobe o esforço sozinha', () => {
  const ferr = TETO['revisor-arquitetura'].tools;
  const vigente = { model: 'opus', effort: 'medium', tools: ferr };
  const com = (cab, entrada = {}) => decidirAgente({ subagent_type: 'revisor-arquitetura', description: 'x', ...entrada }, () => ({ name: 'revisor-arquitetura', ...cab }), { 'revisor-arquitetura': vigente });
  assert.deepEqual(com({ model: 'opus', effort: 'medium', tools: ferr }), passa, 'abaixo do teto (opus high) e igual ao cabeçalho');
  assert.deepEqual(com({ model: 'opus', effort: 'medium', tools: ferr }, { model: 'opus', effort: 'medium' }), passa);
  assert.equal(com({ model: 'opus', effort: 'high', tools: ferr }).decisao, 'deny', 'o cabeçalho ainda diz high: não bate com o JSON');
  assert.equal(com({ model: 'opus', effort: 'medium', tools: ferr }, { effort: 'high' }).decisao, 'deny', 'a chamada pede mais esforço que o pipeline.json');
});
