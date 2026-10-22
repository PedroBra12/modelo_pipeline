// A guarda dos subagentes: decidirAgente como função pura, o hook de ponta a ponta e os cabeçalhos de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTES_FIXOS, SO_NO_CHAT, decidirAgente, lerCabecalhoDoArquivo } from './guarda-agentes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AGENTES = join(AQUI, '..', 'agents');

const tools = 'Read, Grep, Glob';
const cabecalhos = {
  orquestrador: { name: 'orquestrador', model: 'opus', effort: 'xhigh' },
  'revisor-arquitetura': { name: 'revisor-arquitetura', model: 'opus', effort: 'high', tools },
  'revisor-seguranca': { name: 'revisor-seguranca', model: 'opus', effort: 'xhigh', tools },
  'revisor-lgpd': { name: 'revisor-lgpd', model: 'opus', effort: 'high', tools },
  'leitor-docs': { name: 'leitor-docs', model: 'haiku', effort: 'low', tools },
  qa: { name: 'qa', model: 'sonnet', effort: 'high', tools: 'Read, Grep, Glob, Bash' },
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
  assert.equal(AGENTES_FIXOS.qa.tools, 'Read, Grep, Glob, Bash');
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
  const chamada = (tool_input) => JSON.stringify({ tool_name: 'Agent', tool_input });
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
  assert.equal(hook(chamada({ subagent_type: 'qa', model: 'opus', effort: 'high', description: 'x' }))?.permissionDecision, 'deny', 'qa não roda em opus');
  assert.equal(hook(chamada({ subagent_type: 'orquestrador', description: 'x' }))?.permissionDecision, 'deny', 'o orquestrador não roda como subagente');
  assert.equal(hook(chamada({ subagent_type: 'orquestrador', model: 'opus', effort: 'xhigh', description: 'x' }))?.permissionDecision, 'deny');
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
      assert.equal(model, 'opus', `${arquivo}: model ${model}`);
      assert.equal(effort, 'xhigh', `${arquivo}: effort ${effort}`);
    } else if (Object.hasOwn(AGENTES_FIXOS, tipo)) {
      assert.equal(model, AGENTES_FIXOS[tipo].model, `${arquivo}: model ${model}`);
      assert.equal(effort, AGENTES_FIXOS[tipo].effort, `${arquivo}: effort ${effort}`);
      assert.equal(ferramentas, AGENTES_FIXOS[tipo].tools, `${arquivo}: tools ${ferramentas}`);
    } else {
      assert.fail(`${arquivo}: agente fora das listas da guarda (ou em subpasta)`);
    }
  }
  for (const tipo of Object.keys(AGENTES_FIXOS)) assert.ok(arquivos.includes(`${tipo}.md`), `${tipo} da tabela sem arquivo`);
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
    fn(pasta, (subagent_type) => decidirAgente({ subagent_type, description: 'x' }, (t) => lerCabecalhoDoArquivo(t, pasta)));
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
      for (const tipo of Object.keys(AGENTES_FIXOS)) {
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
    const hook = (tipo) => {
      const entrada = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: tipo, description: 'x' } });
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
  for (const subagent_type of Object.keys(AGENTES_FIXOS)) {
    assert.deepEqual(decidirAgente({ subagent_type, description: 'x' }, lerCabecalhoDoArquivo), passa, subagent_type);
  }
});
