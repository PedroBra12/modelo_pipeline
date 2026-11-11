// O ajusta-pipeline.mjs: a conta (desce, sobe, piso, teto, janela, linha de base, histerese, gatilho falso, adiar), a
// aplicação num projeto temporário e a sincronia com os arquivos de verdade (tabela da skill, sessões, MODELO.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO, FIXOS, PISOS, lerAgentes, lerNiveis, par } from './config.mjs';
import { analisar, aplicar, comTabela, formatar, lerAjustes, lerConfig, lerSessao, lerSessoes, linhasNormalizadas, repetidas, tabela, validarSessao } from './ajusta-pipeline.mjs';
import { lerCabecalhoDoArquivo } from './guarda-agentes.mjs';
import { EXEMPLO, fixarExemplo } from './teste-apoio.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLAUDE = join(AQUI, '..');
const RAIZ = join(CLAUDE, '..');
const SCRIPT = join(AQUI, 'ajusta-pipeline.mjs');

/** O estado de exemplo (`EXEMPLO`), não os pares do pipeline.json de verdade: o ajuste automático muda esses, e um teste que os crava quebraria o pre-commit. */
const config = () => {
  const cfg = structuredClone(lerConfig(ARQUIVO));
  for (const secao of Object.keys(EXEMPLO)) for (const [chave, valor] of Object.entries(EXEMPLO[secao])) [cfg[secao][chave].model, cfg[secao][chave].effort] = valor.split(':');
  return cfg;
};
const arq = (sessoes) => sessoes.map((x) => x.arquivo);

// ---------- fixtures ----------

const parDe = (cfg, tipo) => par(cfg.agentes[tipo] ?? cfg.niveis[tipo === 'ponytail-review' ? 'revisao-ponytail' : tipo]);
/** O agente de uma sessão: `tipo` no par que o pipeline.json (ou o `cfg`) diz. */
const roda = (tipo, cfg = config(), extra = {}) => {
  const [modelo, esforco] = parDe(cfg, tipo).split(':');
  return { papel: tipo === 'qa' ? 'qa' : 'revisor', tipo, modelo, esforco, modulo: 'm', tokens: 100000, minutos: 5, rodadas: null, ...extra };
};
const codigo = (tipo, rodadas, esforco = 'high') => ({ papel: 'codigo', tipo, modelo: 'sonnet', esforco, modulo: 'm', tokens: 100000, minutos: 30, rodadas });
const achado = (revisor, extra = {}) => ({ revisor, modulo: 'm', severidade: 'medio', resumo: `achado de ${revisor}`, ...extra });
const REVISORES = ['revisor-arquitetura', 'revisor-seguranca', 'ponytail-review', 'qa'];
/** Uma sessão do dia `d` (mês 11), com o nome de arquivo `2026-11-DD-s<d>.md`. */
const sessao = (d, agentes = [], achados = [], extra = {}) => ({
  arquivo: `2026-11-${String(d).padStart(2, '0')}-s${d}.md`,
  sessao: { data: `2026-11-${String(d).padStart(2, '0')}`, assunto: `s${d}`, orquestrador: { model: 'opus', effort: 'xhigh' }, ...(extra.sessao ?? {}) },
  agentes, achados, erros_orquestrador: [], licoes: [], ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'sessao')),
});
/** `n` sessões com código em que todos os revisores rodam e só a segurança (fixa) acha algo de nível médio: o suficiente para a sessão contar como limpa para os outros. */
const quietas = (cfg = config(), n = 3, primeiro = 1) => Array.from({ length: n }, (_, i) => sessao(primeiro + i, [codigo('medio', 0), ...REVISORES.map((t) => roda(t, cfg))], [achado('revisor-seguranca')]));
const acha = (r, lote, id) => r[lote].find((i) => i.id === id);
const ajuste = (alvo, vistas, extra = {}) => ({ alvo, tipo: 'menos', de: 'x:y', para: 'x:z', data: '2026-11-01', vistas, ordem: 1, arquivo: `2026-11-01-${alvo}.md`, ...extra });

// ---------- descer ----------

test('para menos: um alvo por execução, o mais caro primeiro (opus antes de sonnet, xhigh antes de high); o resto fica na fila', () => {
  const r = analisar(quietas(), [], config());
  assert.equal(r.completa, true);
  assert.deepEqual(r.descer.map((d) => [d.id, d.de, d.para]), [['agentes.revisor-arquitetura', 'opus:high', 'opus:medium']]);
  assert.deepEqual(r.pendentes.map((p) => p.id).sort(), ['agentes.qa', 'niveis.revisao-ponytail']);
  assert.equal(r.bloqueios.find((b) => b.id === 'agentes.revisor-seguranca'), undefined, 'a segurança é fixa: não desce e nem aparece como travada');
  assert.ok(![...r.descer, ...r.pendentes].some((d) => d.id === 'agentes.revisor-seguranca'));
  assert.equal(acha(r, 'descer', 'niveis.medio'), undefined, 'o nível de código nunca desce sozinho');
  assert.ok(![...r.descer, ...r.pendentes, ...r.bloqueios].some((d) => d.id === 'niveis.autoanalise'), 'a autoanálise é fixa, como o leve: não desce');
  assert.match(formatar(r), /Na fila para menos/);
});

test('para menos, passo a passo: arquitetura (opus), depois qa e ponytail; a segurança fixa não desce; nunca abaixo do piso', () => {
  const cfg = config();
  const vistas = [];
  const sessoes = [];
  const ajustes = [];
  for (let rodada = 0; rodada < 6; rodada += 1) {
    const novas = quietas(cfg, 3, 1 + sessoes.length);
    sessoes.push(...novas);
    const [d] = analisar(sessoes, ajustes, cfg).descer;
    if (d === undefined) break;
    vistas.push(`${d.chave} ${d.de}->${d.para}`);
    [cfg[d.secao][d.chave].model, cfg[d.secao][d.chave].effort] = d.para.split(':');
    ajustes.push(ajuste(d.chave, arq(sessoes), { ordem: ajustes.length + 1 }));
  }
  assert.deepEqual(vistas, [
    'revisor-arquitetura opus:high->opus:medium',
    'qa sonnet:high->sonnet:medium',
    'revisao-ponytail sonnet:high->sonnet:medium',
  ]);
});

test('só achado grave trava a descida: médio e baixo deixam descer; alto, must e defeito travam', () => {
  const travou = (severidade, confirmado) => {
    const sessoes = quietas();
    sessoes[1].achados.push(achado('revisor-arquitetura', { severidade, ...(confirmado === undefined ? {} : { confirmado }) }));
    return [...analisar(sessoes, [], config()).descer, ...analisar(sessoes, [], config()).pendentes].some((d) => d.id === 'agentes.revisor-arquitetura') === false;
  };
  for (const grave of ['critico', 'alto', 'must', 'defeito']) assert.equal(travou(grave), true, `${grave} trava`);
  for (const leve of ['medio', 'should', 'baixo', 'nice']) assert.equal(travou(leve), false, `${leve} deixa descer`);
  assert.equal(travou('alto', false), false, 'grave não confirmado não trava');
  const visto = quietas();
  visto[1].achados.push(achado('revisor-seguranca', { severidade: 'must', visto_por: ['revisor-arquitetura'] }));
  assert.equal([...analisar(visto, [], config()).descer, ...analisar(visto, [], config()).pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'), false, 'o grave visto por ele também trava');
  const medioVisto = quietas();
  medioVisto[1].achados.push(achado('revisor-arquitetura'));
  const rm = analisar(medioVisto, [], config());
  assert.ok([...rm.descer, ...rm.pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'), 'o médio dele não trava');
  assert.equal(rm.alvos.find((x) => x.id === 'agentes.revisor-arquitetura').unicosMedioMais, 1, 'a coluna únicos segue médio ou mais');
  const semAchado = quietas().map((s) => ({ ...s, achados: [] }));
  assert.equal(analisar(semAchado, [], config()).descer.length, 0, 'a sessão em que ninguém achou médio ou mais não conta como limpa');
  const comEscape = quietas();
  comEscape[2].achados.push(achado('qa', { severidade: 'defeito', escapou_de: ['revisor-seguranca'] }));
  assert.equal(analisar(comEscape, [], config()).descer.some((d) => d.id === 'agentes.revisor-seguranca'), false, 'o escape trava a descida de quem deixou escapar');
  const baixo = quietas();
  baixo[0].achados.push(achado('qa', { severidade: 'baixo' }), achado('qa', { severidade: 'defeito', confirmado: false }));
  const rb = analisar(baixo, [], config());
  assert.ok([...rb.descer, ...rb.pendentes].some((d) => d.id === 'agentes.qa'), 'baixo e não confirmado não travam');
  const semCodigo = quietas().map((s) => ({ ...s, agentes: s.agentes.filter((a) => a.papel !== 'codigo') }));
  assert.equal(analisar(semCodigo, [], config()).descer.length, 0, 'sem código na sessão ela não conta');
  const outroPar = quietas();
  outroPar[0].agentes = outroPar[0].agentes.map((a) => (a.tipo === 'qa' ? { ...a, esforco: 'medium' } : a));
  const ro = analisar(outroPar, [], config());
  assert.ok(![...ro.descer, ...ro.pendentes].some((d) => d.id === 'agentes.qa'), 'o qa rodou no outro par numa das 3 sessões');
});

test('um achado visto por mais de um revisor conta para todos: os que se sobrepõem não descem juntos', () => {
  const sessoes = quietas();
  sessoes[1].achados.push(achado('revisor-arquitetura', { severidade: 'alto', visto_por: ['qa', 'revisor-seguranca'] }));
  const r = analisar(sessoes, [], config());
  const nomes = [...r.descer, ...r.pendentes].map((d) => d.id);
  for (const id of ['agentes.revisor-arquitetura', 'agentes.qa']) assert.ok(!nomes.includes(id), id);
  assert.ok(nomes.includes('niveis.revisao-ponytail'), 'quem não viu continua apto');
  assert.equal(r.alvos.find((x) => x.id === 'agentes.qa').unicosMedioMais, 0, 'não é achado único dele, só conta para não descer');
});

test('gatilho falso: a sessão não conta como limpa para o alvo, e o relatório propõe estreitar o gatilho', () => {
  const sessoes = quietas();
  sessoes[2] = { ...sessoes[2], gatilho_falso: ['revisor-arquitetura'] };
  const r = analisar(sessoes, [], config());
  assert.equal([...r.descer, ...r.pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'), false);
  assert.match(r.estreitar.find((e) => e.id === 'agentes.revisor-arquitetura').motivo, /estreite o gatilho/);
  assert.match(formatar(r), /Estreitar o gatilho \(nunca automático\)/);
});

test('adiar: o orquestrador adia uma descida com motivo, o script respeita e relata', () => {
  const sessoes = quietas();
  sessoes[2] = { ...sessoes[2], adiar: [{ alvo: 'revisor-arquitetura', motivo: 'mexemos em permissão na próxima semana' }] };
  const r = analisar(sessoes, [], config());
  assert.deepEqual(r.adiados, [{ id: 'agentes.revisor-arquitetura', motivo: 'descida adiada: mexemos em permissão na próxima semana' }]);
  assert.equal(r.descer[0].id, 'agentes.qa', 'sem o adiado, o próximo mais caro');
});

// ---------- janela, linha de base, ajustes anteriores ----------

test('a janela incompleta não deixa nada descer, mas escape e gatilho que falta viram proposta na hora; rodadas altas esperam a janela', () => {
  const cfg = config();
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], model: 'opus', effort: 'medium' };
  const sessoes = quietas(cfg, 2);
  sessoes[0].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura', 'revisor-seguranca'], nao_rodou: ['revisor-seguranca'] }));
  sessoes[0].agentes.push(codigo('medio', 3, 'medium'), codigo('medio', 3, 'medium'));
  const r = analisar(sessoes, [], cfg);
  assert.equal(r.completa, false);
  assert.deepEqual(r.descer, [], 'nada desce com a janela incompleta');
  assert.deepEqual([acha(r, 'subir', 'agentes.revisor-arquitetura').de, acha(r, 'subir', 'agentes.revisor-arquitetura').para], ['opus:medium', 'opus:high']);
  assert.match(acha(r, 'gatilhos', 'agentes.revisor-seguranca').motivo, /nem rodou/);
  assert.equal(acha(r, 'subir', 'niveis.medio'), undefined, 'a média de rodadas espera a janela');
  assert.match(r.relatos.find((i) => i.id === 'niveis.medio').relato, /janela incompleta \(2 de 3 sessões/);
  assert.match(formatar(r), /nenhum alvo desce ainda; escape e gatilho que falta já viram proposta/);
  assert.ok(analisar([], [], cfg).alvos.length > 0, 'sem nenhuma sessão também funciona');
});

test('três sessões sem achado nenhum não derrubam ninguém, nem a segurança lançada por gatilho', () => {
  const vazias = quietas().map((x) => ({ ...x, achados: [], agentes: x.agentes.map((ag) => (ag.tipo === 'revisor-seguranca' ? { ...ag, acionado_por: 'gatilho' } : ag)) }));
  const r = analisar(vazias, [], config());
  assert.deepEqual([r.descer, r.pendentes], [[], []], 'sem achado a sessão não prova nada, com o gatilho ativo ou não');
});

test('escape logo depois de uma descida vira proposta de subida na hora, com uma sessão só', () => {
  const cfg = config();
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], model: 'opus', effort: 'medium' };
  const antes = quietas(cfg, 3);
  const depois = quietas(cfg, 1, 4);
  depois[0].achados.push(achado('qa', { severidade: 'defeito', escapou_de: ['revisor-arquitetura'] }));
  const r = analisar([...antes, ...depois], [ajuste('revisor-arquitetura', arq(antes))], cfg);
  assert.equal(r.alvos.find((a) => a.id === 'agentes.revisor-arquitetura').sessoes, 1);
  assert.deepEqual([acha(r, 'subir', 'agentes.revisor-arquitetura').de, acha(r, 'subir', 'agentes.revisor-arquitetura').para], ['opus:medium', 'opus:high']);
});

test('a segurança é fixa: não desce nem sobe, e um escape dela vira travado; o gatilho que falta continua sendo proposto', () => {
  const sessoes = quietas();
  sessoes[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-seguranca'] }));
  sessoes[2].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-seguranca'], nao_rodou: ['revisor-seguranca'] }));
  const r = analisar(sessoes, [], config());
  assert.equal(acha(r, 'subir', 'agentes.revisor-seguranca'), undefined);
  assert.match(r.bloqueios.find((b) => b.id === 'agentes.revisor-seguranca').motivo, /é fixo em opus:xhigh/);
  assert.match(acha(r, 'gatilhos', 'agentes.revisor-seguranca').motivo, /nem rodou/);
});

test('a sessão de linha de base aparece no relatório e não conta na janela', () => {
  const base = sessao(1, [codigo('medio', 0), roda('revisor-arquitetura')], [achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'] })], { sessao: { baseline: true } });
  const r = analisar([base, ...quietas(config(), 2, 2)], [], config());
  assert.equal(r.completa, false, 'só 2 sessões contam');
  assert.deepEqual(r.baseline, ['2026-11-01-s1.md']);
  assert.equal(r.linhaDeBase.find((a) => a.id === 'agentes.revisor-arquitetura').escapesRodou, 1);
  assert.equal(r.alvos.find((a) => a.id === 'agentes.revisor-arquitetura').escapesRodou, 0);
  assert.equal(r.subir.length + r.relatos.length + r.gatilhos.length, 0, 'o escape da linha de base não gera proposta');
  assert.match(formatar(r), /Linha de base e fora da conta \(não contam na janela\):/);
  const com3 = analisar([base, ...quietas(config(), 3, 2)], [], config());
  assert.equal(com3.completa, true);
  assert.equal(com3.subir.length, 0);
});

test('uma sessão do mesmo dia gravada depois do ajuste, com o nome antes na ordem alfabética, entra na conta (o ajuste guarda as sessões já vistas)', () => {
  const c = quietas(config(), 3).map((x, i) => ({ ...x, arquivo: `2026-11-05-${['c', 'd', 'e'][i]}.md` }));
  const nova = { ...quietas(config(), 1, 9)[0], arquivo: '2026-11-05-aaa.md' };
  const ajustes = [ajuste('revisor-arquitetura', arq(c), { data: '2026-11-05' })];
  const r = analisar([...c, nova], ajustes, config());
  assert.equal(r.alvos.find((a) => a.id === 'agentes.revisor-arquitetura').sessoes, 1, 'a aaa não estava nas vistas');
  assert.equal(r.alvos.find((a) => a.id === 'agentes.qa').sessoes, 4, 'quem nunca foi ajustado conta todas');
});

test('depois de um ajuste só contam as sessões que ele ainda não tinha visto: as 3 do mesmo dia que vêm depois contam', () => {
  const mesmoDia = quietas(config(), 4).map((s, i) => ({ ...s, arquivo: `2026-11-04-s${i + 1}.md`, sessao: { ...s.sessao, data: '2026-11-04' } }));
  const ajustes = [ajuste('revisor-arquitetura', ['2026-11-04-s1.md'], { data: '2026-11-04' })];
  const r = analisar(mesmoDia, ajustes, config());
  assert.equal(r.alvos.find((a) => a.id === 'agentes.revisor-arquitetura').sessoes, 3, 'as 3 do mesmo dia que vêm depois do ajuste');
  assert.ok([...r.descer, ...r.pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'));
  assert.equal(analisar(mesmoDia.slice(0, 3), ajustes, config()).alvos.find((a) => a.id === 'agentes.revisor-arquitetura').sessoes, 2);
});

test('histerese: depois de uma subida o alvo não desce por 3 sessões; depois de uma descida só sobe com escape', () => {
  const cfg = config();
  const sessoes = quietas(cfg, 5);
  const subida = [ajuste('revisor-arquitetura', arq(sessoes.slice(0, 2)), { tipo: 'mais' })];
  const r = analisar(sessoes, subida, cfg);
  assert.equal(r.alvos.find((a) => a.id === 'agentes.revisor-arquitetura').sessoes, 3);
  assert.ok([...r.descer, ...r.pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'), 'com 3 sessões novas já pode');
  const poucas = analisar(sessoes.slice(0, 4), subida, cfg);
  assert.ok(![...poucas.descer, ...poucas.pendentes].some((d) => d.id === 'agentes.revisor-arquitetura'), 'com 2 sessões novas não desce');
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], model: 'opus', effort: 'medium' };
  const depois = quietas(cfg, 3, 6);
  const descida = [ajuste('revisor-arquitetura', arq(sessoes))];
  assert.equal(acha(analisar(depois, descida, cfg), 'subir', 'agentes.revisor-arquitetura'), undefined, 'sem escape não sobe');
  depois[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'] }));
  const sobe = acha(analisar(depois, descida, cfg), 'subir', 'agentes.revisor-arquitetura');
  assert.deepEqual([sobe.de, sobe.para], ['opus:medium', 'opus:high']);
});

// ---------- subir ----------

test('para mais: escape de nível médio ou mais no domínio do revisor propõe um degrau; baixo não conta; o teto da guarda trava', () => {
  const cfg = config();
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], model: 'opus', effort: 'medium' };
  const sessoes = quietas(cfg);
  sessoes[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'], resumo: 'a arquitetura deixou passar' }), achado('qa', { severidade: 'baixo', escapou_de: ['revisor-seguranca'] }));
  const r = analisar(sessoes, [], cfg);
  const sobe = acha(r, 'subir', 'agentes.revisor-arquitetura');
  assert.deepEqual([sobe.de, sobe.para], ['opus:medium', 'opus:high']);
  assert.match(sobe.provas[0], /a arquitetura deixou passar/);
  assert.equal(acha(r, 'subir', 'agentes.revisor-seguranca'), undefined, 'escape baixo não conta');
  const noTeto = config();
  const sessoesTeto = quietas(noTeto);
  sessoesTeto[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'] }));
  assert.match(analisar(sessoesTeto, [], noTeto).bloqueios.find((b) => b.id === 'agentes.revisor-arquitetura').motivo, /teto da guarda \(opus:high\)/);
});

test('para mais: escape de quem nem rodou, ou grave único de acionamento por julgamento, pede um gatilho, não um degrau', () => {
  const sessoes = quietas();
  sessoes[0].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-seguranca'], nao_rodou: ['revisor-seguranca'] }));
  sessoes[2].achados.push(achado('revisor-arquitetura', { severidade: 'alto', acionado_por: 'julgamento' }));
  const r = analisar(sessoes, [], config());
  assert.match(acha(r, 'gatilhos', 'agentes.revisor-seguranca').motivo, /1 escape\(s\) em que ele nem rodou/);
  assert.match(acha(r, 'gatilhos', 'agentes.revisor-arquitetura').motivo, /acionamento por julgamento/);
  assert.equal(acha(r, 'subir', 'agentes.revisor-seguranca'), undefined);
  assert.equal(r.descer.some((d) => d.id === 'agentes.revisor-seguranca'), false);
});

test('código nunca recebe opus: o nível de código sobe só dentro do sonnet, e no teto vira bloqueio', () => {
  const alto = (tipo, esforco) => [1, 2, 3].map((d) => sessao(d, [codigo(tipo, 3, esforco), codigo(tipo, 2, esforco)]));
  const r = analisar(alto('medio', 'medium'), [], config());
  const sobe = acha(r, 'subir', 'niveis.medio');
  assert.deepEqual([sobe.de, sobe.para], ['sonnet:medium', 'sonnet:high']);
  assert.match(sobe.motivo, /média de 2\.5 rodadas/);
  const teto = analisar(alto('codigo-seguranca', 'high'), [], config());
  assert.equal(acha(teto, 'subir', 'niveis.codigo-seguranca'), undefined);
  assert.match(teto.bloqueios.find((b) => b.id === 'niveis.codigo-seguranca').motivo, /não passa de sonnet/);
  const baixas = [1, 2, 3].map((d) => sessao(d, [codigo('medio', 0, 'medium'), codigo('medio', 1, 'medium')]));
  assert.equal(acha(analisar(baixas, [], config()), 'subir', 'niveis.medio'), undefined);
});

// ---------- sessões e ajustes ----------

test('validarSessao: o que falta, nome com erro de digitação, dado pessoal e texto longo demais', () => {
  const cfg = config();
  const ok = sessao(1, [roda('qa', cfg)], [achado('qa')]);
  assert.doesNotThrow(() => validarSessao(ok, 'x.md', cfg));
  const ruim = (muda) => { const c = structuredClone(ok); muda(c); return () => validarSessao(c, 'x.md', cfg); };
  assert.throws(ruim((c) => { c.sessao.data = '23/10/2026'; }), /x\.md: sessao\.data/);
  assert.throws(ruim((c) => { c.agentes[0].papel = 'estagiario'; }), /papel inválido/);
  assert.throws(ruim((c) => { c.agentes[0].tokens = 'muitos'; }), /são números/);
  assert.throws(ruim((c) => { c.achados[0].severidade = 'gravíssimo'; }), /achados\[\] inválido/);
  assert.doesNotThrow(ruim((c) => { c.agentes.push(roda('qa', cfg, { tipo: 'revisor-lgpd' })); c.achados.push(achado('revisor-lgpd', { visto_por: ['qa'], escapou_de: ['revisor-lgpd'] })); }), 'D34: o revisor-lgpd aposentado é histórico nas sessões antigas, não erro de nome');
  // D8: agente, contexto1 e pacote1 são opcionais; o tipo errado é recusado e a sessão antiga, sem eles, segue válida
  assert.doesNotThrow(ruim((c) => { Object.assign(c.agentes[0], { agente: 'desenvolvedor', contexto1: 12000, pacote1: 0 }); }));
  assert.doesNotThrow(ruim((c) => { Object.assign(c.agentes[0], { contexto1: null, pacote1: null }); }));
  assert.throws(ruim((c) => { c.agentes[0].agente = 3; }), /agente .* é texto/);
  assert.throws(ruim((c) => { c.agentes[0].contexto1 = '12000'; }), /contexto1 e pacote1 são números/);
  assert.throws(ruim((c) => { c.agentes[0].pacote1 = -1; }), /contexto1 e pacote1 são números/);
  assert.throws(ruim((c) => { c.agentes[0].contexto1 = true; }), /contexto1 e pacote1 são números/);
  assert.throws(ruim((c) => { delete c.agentes[0].modelo; }), /levam modelo e esforco/);
  assert.throws(ruim((c) => { delete c.agentes[0].esforco; }), /levam modelo e esforco/);
  assert.throws(ruim((c) => { c.achados[0].resumo = `${['//', 'lgpd-ignora:'].join(' ')} celular -- dado inventado para o teste`; }), /supressão lgpd-ignora/);
  assert.throws(ruim((c) => { c.achados[0].escapou_de = 'qa'; }), /escapou_de/);
  assert.throws(ruim((c) => { c.achados[0].visto_por = [1]; }), /visto_por/);
  assert.throws(ruim((c) => { c.achados[0].acionado_por = 'sorte'; }), /acionado_por/);
  assert.throws(ruim((c) => { c.gatilho_falso = 'qa'; }), /gatilho_falso/);
  assert.throws(ruim((c) => { c.adiar = [{ alvo: 'qa' }]; }), /adiar\[\]/);
  assert.throws(ruim((c) => { c.sessao.baseline = 'sim'; }), /baseline/);
  assert.throws(ruim((c) => { delete c.sessao.orquestrador; }), /sessao\.orquestrador/, 'o orquestrador é obrigatório');
  assert.throws(ruim((c) => { c.sessao.orquestrador = 'opus'; }), /sessao\.orquestrador/);
  assert.throws(ruim((c) => { c.sessao.orquestrador = null; }), /sessao\.orquestrador/);
  assert.throws(ruim((c) => { c.sessao.orquestrador = { model: '', effort: 'xhigh' }; }), /sessao\.orquestrador/);
  assert.throws(ruim((c) => { c.sessao.orquestrador = { model: 3, effort: 'xhigh' }; }), /sessao\.orquestrador/);
  assert.throws(ruim((c) => { c.sessao.orquestrador = { model: 'opus' }; }), /sessao\.orquestrador/, 'o esforço é texto ou null, nunca ausente');
  assert.throws(ruim((c) => { c.sessao.orquestrador = { model: 'opus', effort: '' }; }), /sessao\.orquestrador/);
  assert.doesNotThrow(ruim((c) => { c.sessao.orquestrador = { model: 'haiku', effort: null }; }), 'o esforço null vale (não deu para ler)');
  assert.doesNotThrow(ruim((c) => { c.agentes.push({ papel: 'consulta', tipo: 'leve', tokens: 1000, minutos: 1 }); }), 'consulta: subagente que só busca ou lê, sem modelo e esforço obrigatórios');
  assert.throws(ruim((c) => { c.agentes.push({ papel: 'consulta', tipo: 'leve', tokens: 'muitos' }); }), /são números/);
  assert.throws(ruim((c) => { c.achados[0].resumo = 'x'.repeat(601); }), /passa de 600/);
  assert.throws(ruim((c) => { c.licoes = ['x'.repeat(601)]; }), /licoes\[\]/);
  assert.throws(ruim((c) => { c.agentes[0].tipo = 'revisor-seguranc'; }), /não existe em agentes nem em niveis do pipeline\.json \(erro de digitação\?\)/);
  assert.throws(ruim((c) => { c.achados[0].revisor = 'qaa'; }), /qaa/);
  assert.throws(ruim((c) => { c.achados[0].visto_por = ['qa', 'revisor-lgdp']; }), /revisor-lgdp/);
  assert.throws(ruim((c) => { c.gatilho_falso = ['segurança']; }), /segurança/);
  assert.throws(ruim((c) => { c.adiar = [{ alvo: 'nada', motivo: 'x' }]; }), /nada/);
  const telefone = ['(62)', '99999-1234'].join(' ');
  assert.throws(ruim((c) => { c.achados[0].resumo = `o cliente de celular ${telefone}`; }), /dado pessoal no bloco/);
  assert.throws(() => lerSessao('sem bloco', 'y.md'), /y\.md: sem o bloco json/);
  assert.throws(() => lerSessao('```json\n{ quebrado\n```', 'y.md'), /não é JSON válido/);
});

test('o MODELO.md tem um bloco que passa na validação (com a data trocada) e a regra de não pôr dado pessoal', () => {
  const texto = readFileSync(join(RAIZ, 'docs', 'pipeline', 'sessoes', 'MODELO.md'), 'utf8');
  const s = lerSessao(texto.replace('"data": "AAAA-MM-DD"', '"data": "2026-01-01"'), 'MODELO.md', config());
  assert.equal(s.sessao.data, '2026-01-01');
  assert.match(texto, /sem nome de pessoa.*id de pessoa, celular, e-mail, CPF ou cidade/i);
  assert.match(texto, /\bconsulta\b/, 'o modelo cita o papel consulta');
});

test('as sessões de verdade do projeto (se houver) leem com a conferência de nomes e a de dado pessoal, e o MODELO.md não conta como sessão', () => {
  const sessoes = lerSessoes(join(RAIZ, 'docs', 'pipeline', 'sessoes'), config());
  assert.ok(Array.isArray(sessoes));
  assert.ok(!sessoes.some((s) => s.arquivo === 'MODELO.md'));
});

test('lerAjustes lê os arquivos de ajuste em ordem e recusa o que não tem os campos', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ajustes-'));
  try {
    assert.deepEqual(lerAjustes(join(pasta, 'nao-existe')), []);
    const grava = (nome, registro) => writeFileSync(join(pasta, nome), `# a\n\n\`\`\`json\n${JSON.stringify(registro)}\n\`\`\`\n`);
    grava('2026-11-02-qa.md', { alvo: 'qa', tipo: 'menos', de: 'a:b', para: 'a:c', data: '2026-11-02', vistas: ['s'], ordem: 2 });
    grava('2026-11-02-qa-2.md', { alvo: 'qa', tipo: 'mais', de: 'a:c', para: 'a:b', data: '2026-11-02', vistas: ['s', 't'], ordem: 3 });
    grava('2026-11-01-x.md', { alvo: 'x', tipo: 'menos', de: 'a:b', para: 'a:c', data: '2026-11-01', vistas: [], ordem: 1 });
    assert.deepEqual(lerAjustes(pasta).map((a) => a.arquivo), ['2026-11-01-x.md', '2026-11-02-qa.md', '2026-11-02-qa-2.md']);
    grava('2026-11-03-ruim.md', { alvo: 'qa' });
    assert.throws(() => lerAjustes(pasta), /2026-11-03-ruim\.md: ajuste sem/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ---------- a tabela da skill e os cabeçalhos ----------

test('a tabela da seção 7 da skill pipeline é a gerada do pipeline.json', () => {
  const skill = readFileSync(join(CLAUDE, 'skills', 'pipeline', 'SKILL.md'), 'utf8');
  const cfg = lerConfig(ARQUIVO);
  assert.equal(comTabela(skill, cfg), skill, 'rode: node .claude/hooks/ajusta-pipeline.mjs --sincronizar-tabela');
  for (const [nome, e] of Object.entries(cfg.agentes)) assert.ok(tabela(cfg).includes(`| agente \`${nome}\` (\`.claude/agents/\`) | ${e.tarefa} | \`${e.model}\` | \`${e.effort}\` |`));
  assert.throws(() => comTabela('sem marcas', cfg), /sem as marcas/);
});

test('os cabeçalhos de .claude/agents/ repetem o modelo e o esforço do pipeline.json', () => {
  for (const [nome, e] of Object.entries(lerAgentes().valor)) {
    const c = lerCabecalhoDoArquivo(nome);
    assert.deepEqual([c.model, c.effort, c.tools], [e.model, e.effort, e.tools], nome);
  }
  const { model, effort } = lerNiveis().valor.orquestracao;
  const o = lerCabecalhoDoArquivo('orquestrador');
  assert.deepEqual([o.model, o.effort], [model, effort]);
});

// ---------- aplicar num projeto temporário ----------

const DOCS = ['CLAUDE.md', 'AGENTS.md', '.claude/hooks/AGENTS.md', '.claude/skills/pipeline/SKILL.md', '.claude/skills/pipeline/fase.md', '.claude/skills/pipeline/feature.md', '.claude/skills/pipeline/bug.md', '.claude/skills/pipeline/refactor.md', '.claude/skills/pipeline/decisao.md', '.claude/skills/adjust-pipeline/SKILL.md'];
const grava = (raiz, s) => {
  const { arquivo, ...corpo } = s;
  writeFileSync(join(raiz, 'docs', 'pipeline', 'sessoes', arquivo), `# s\n\n\`\`\`json\n${JSON.stringify(corpo)}\n\`\`\`\n`);
};

/** Um projeto com os arquivos que o script edita e os documentos que citam modelo, copiados do de verdade, e as `sessoes` gravadas. */
function projeto(sessoes, mexer = () => {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'ajusta-'));
  mkdirSync(join(raiz, 'docs', 'pipeline', 'sessoes'), { recursive: true });
  cpSync(join(CLAUDE, 'agents'), join(raiz, '.claude', 'agents'), { recursive: true });
  cpSync(ARQUIVO, join(raiz, '.claude', 'pipeline.json'));
  for (const rel of DOCS) {
    if (!existsSync(join(RAIZ, rel))) continue;
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    cpSync(join(RAIZ, rel), join(raiz, rel));
  }
  fixarExemplo(raiz);
  mexer(raiz);
  sessoes.forEach((s) => grava(raiz, s));
  return raiz;
}
const cli = (raiz, ...args) => spawnSync(process.execPath, [SCRIPT, '--raiz', raiz, ...args], { encoding: 'utf8' });
const lerArquivo = (raiz, ...partes) => readFileSync(join(raiz, ...partes), 'utf8');
const comProjeto = (sessoes, fn, mexer) => {
  const raiz = projeto(sessoes, mexer);
  try {
    fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
};
/** As linhas dos documentos (fora das sessões e dos ajustes) que citam o alvo junto de uma palavra do par antigo. */
function paresAntigos(raiz, alvo, antigo) {
  const achadas = [];
  const olhar = (rel) => {
    if (!existsSync(join(raiz, rel))) return;
    lerArquivo(raiz, rel).split('\n').forEach((linha, i) => {
      if (linha.includes(alvo) && antigo.some((p) => new RegExp(`\\b${p}\\b`).test(linha))) achadas.push(`${rel}:${i + 1}`);
    });
  };
  [...DOCS, '.claude/pipeline.json', ...readdirSync(join(raiz, '.claude', 'agents')).map((f) => `.claude/agents/${f}`)].forEach(olhar);
  return achadas;
}

test('--aplicar-menos desce um alvo, edita só a linha dele, o cabeçalho e a tabela, grava o ajuste e não deixa o par antigo em lugar nenhum', () => {
  comProjeto(quietas(), (raiz) => {
    const antes = lerArquivo(raiz, '.claude', 'pipeline.json').split('\n');
    const r = cli(raiz, '--aplicar-menos', '--data', '2026-11-04');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Aplicado[\s\S]*revisor-arquitetura opus:high -> opus:medium \(docs\/pipeline\/ajustes\/2026-11-04-revisor-arquitetura\.md\)/);
    const depois = lerArquivo(raiz, '.claude', 'pipeline.json').split('\n');
    assert.equal(depois.filter((l, i) => l !== antes[i]).length, 1, 'uma linha só do pipeline.json');
    const cfg = lerConfig(join(raiz, '.claude', 'pipeline.json'));
    assert.equal(par(cfg.agentes['revisor-arquitetura']), 'opus:medium');
    assert.equal(par(cfg.agentes['revisor-seguranca']), 'opus:xhigh', 'a segurança é fixa');
    const cab = lerCabecalhoDoArquivo('revisor-arquitetura', join(raiz, '.claude', 'agents'));
    assert.deepEqual([cab.model, cab.effort], ['opus', 'medium']);
    const skill = lerArquivo(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md');
    assert.equal(comTabela(skill, cfg), skill, 'a tabela da skill ficou em sincronia');
    const registro = lerAjustes(join(raiz, 'docs', 'pipeline', 'ajustes'));
    assert.deepEqual(registro.map((a) => [a.alvo, a.tipo, a.de, a.para, a.data, a.vistas]), [['revisor-arquitetura', 'menos', 'opus:high', 'opus:medium', '2026-11-04', ['2026-11-01-s1.md', '2026-11-02-s2.md', '2026-11-03-s3.md']]]);
    assert.deepEqual(paresAntigos(raiz, 'revisor-arquitetura', ['high']), [], 'nenhuma cópia do par antigo sobra');
    assert.equal(existsSync(join(raiz, 'docs', 'decisoes.md')), false, 'nada de linha D<n> compartilhada');
  });
});

test('--aplicar-menos em sequência: cada execução tira um alvo (o mais caro), sem sobrar cópia do par antigo; o mesmo alvo só desce com sessões novas', () => {
  const real = readFileSync(ARQUIVO, 'utf8');
  comProjeto(quietas(), (raiz) => {
    const velho = { 'revisor-arquitetura': 'high', qa: 'high', 'revisao-ponytail': 'high' };
    const feitos = [];
    for (let i = 0; i < 5; i += 1) {
      const r = cli(raiz, '--aplicar-menos', '--data', '2026-11-04');
      assert.equal(r.status, 0, r.stderr);
      const m = /- (\S+) (\S+) -> (\S+) \(docs/.exec(r.stdout);
      if (m === null) break;
      feitos.push(`${m[1]} ${m[2]}->${m[3]}`);
      assert.deepEqual(paresAntigos(raiz, m[1], [velho[m[1]]]), [], `${m[1]}: sobrou o par antigo`);
    }
    assert.deepEqual(feitos, ['revisor-arquitetura opus:high->opus:medium', 'qa sonnet:high->sonnet:medium', 'revisao-ponytail sonnet:high->sonnet:medium']);
    assert.match(cli(raiz, '--aplicar-menos', '--data', '2026-11-04').stdout, /Nenhum ajuste para menos aplicado/, 'sem sessões novas depois dos ajustes ninguém desce de novo');
    assert.equal(lerAjustes(join(raiz, 'docs', 'pipeline', 'ajustes')).length, 3);
    const novas = quietas(lerConfig(join(raiz, '.claude', 'pipeline.json')), 3, 5);
    novas.forEach((s) => grava(raiz, s));
    const depois = cli(raiz, '--aplicar-menos', '--data', '2026-11-08');
    assert.equal(depois.status, 0, depois.stderr);
    assert.match(depois.stdout, /Nenhum ajuste|Aplicado/, 'a conta roda; os pisos seguram o resto');
    assert.equal(readFileSync(ARQUIVO, 'utf8'), real, 'o pipeline.json de verdade não mudou');
  });
});

test('--aplicar-mais só com proposta: grava o ajuste e sobe um degrau; sem proposta ou sem alvo é erro e não grava', () => {
  const descida = (raiz) => {
    const p = join(raiz, '.claude', 'pipeline.json');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/("revisor-arquitetura": \{ "model": "opus", "effort": ")high(")/, '$1medium$2'));
    const a = join(raiz, '.claude', 'agents', 'revisor-arquitetura.md');
    writeFileSync(a, readFileSync(a, 'utf8').replace(/^effort: high$/m, 'effort: medium'));
  };
  const cfg = config();
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], effort: 'medium' };
  const sessoes = quietas(cfg);
  sessoes[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'], resumo: 'passou pela arquitetura' }));
  comProjeto(sessoes, (raiz) => {
    assert.match(cli(raiz, '--relatorio').stdout, /Para MAIS[\s\S]*revisor-arquitetura: opus:medium -> opus:high/);
    const r = cli(raiz, '--aplicar-mais', 'revisor-arquitetura', '--data', '2026-11-04');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(par(lerConfig(join(raiz, '.claude', 'pipeline.json')).agentes['revisor-arquitetura']), 'opus:high');
    const [a] = lerAjustes(join(raiz, 'docs', 'pipeline', 'ajustes'));
    assert.deepEqual([a.tipo, a.de, a.para], ['mais', 'opus:medium', 'opus:high']);
    assert.equal(cli(raiz, '--aplicar-mais', 'revisor-arquitetura').status, 2, 'já subiu: não há mais proposta');
    assert.equal(cli(raiz, '--aplicar-mais', 'qa').status, 2);
    assert.equal(cli(raiz, '--aplicar-mais').status, 2, 'sem o alvo');
  }, descida);
});

test('nome com erro de digitação na sessão: sai com 2 e não grava nada; opção sem valor, valor ruim ou desconhecida também', () => {
  const ruim = quietas();
  ruim[1].achados.push(achado('revisor-seguranc'));
  comProjeto(ruim, (raiz) => {
    const antes = lerArquivo(raiz, '.claude', 'pipeline.json');
    const r = cli(raiz, '--aplicar-menos');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /revisor-seguranc.*erro de digitação/);
    assert.equal(lerArquivo(raiz, '.claude', 'pipeline.json'), antes);
    assert.equal(existsSync(join(raiz, 'docs', 'pipeline', 'ajustes')), false);
  });
  comProjeto(quietas(), (raiz) => {
    for (const args of [['--raiz', raiz, '--data'], ['--raiz', raiz, '--data', 'ontem'], ['--raiz', raiz, '--inventada'], ['--raiz'], ['--raiz', '--relatorio']]) {
      assert.equal(spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' }).status, 2, args.join(' '));
    }
  });
});

test('sem a janela completa o --aplicar-menos não mexe em nada, e o --relatorio nunca grava', () => {
  comProjeto(quietas(config(), 2), (raiz) => {
    const antes = lerArquivo(raiz, '.claude', 'pipeline.json');
    assert.match(cli(raiz, '--aplicar-menos').stdout, /Nenhum ajuste para menos aplicado/);
    assert.equal(JSON.parse(cli(raiz, '--relatorio', '--json').stdout).completa, false);
    assert.equal(lerArquivo(raiz, '.claude', 'pipeline.json'), antes);
    assert.equal(existsSync(join(raiz, 'docs', 'pipeline', 'ajustes')), false);
  });
});

test('aplicar recusa e não grava se o cabeçalho do agente não tem model: e effort:', () => {
  comProjeto(quietas(), (raiz) => {
    const a = join(raiz, '.claude', 'agents', 'revisor-arquitetura.md');
    writeFileSync(a, readFileSync(a, 'utf8').replace(/^effort:.*\n/m, ''));
    const antes = lerArquivo(raiz, '.claude', 'pipeline.json');
    const r = cli(raiz, '--aplicar-menos');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /não tem model: e effort:/);
    assert.equal(lerArquivo(raiz, '.claude', 'pipeline.json'), antes);
  });
});

test('aplicar valida o pipeline.json novo contra os pisos antes de gravar', () => {
  comProjeto(quietas(), (raiz) => {
    const item = { id: 'agentes.revisor-seguranca', secao: 'agentes', chave: 'revisor-seguranca', de: 'opus:xhigh', para: 'sonnet:high', tipo: 'menos', motivo: 'teste' };
    const antes = lerArquivo(raiz, '.claude', 'pipeline.json');
    assert.throws(() => aplicar(raiz, [item], '2026-11-04', []), /é fixo em opus:xhigh/);
    assert.equal(lerArquivo(raiz, '.claude', 'pipeline.json'), antes);
    assert.equal(existsSync(join(raiz, 'docs', 'pipeline', 'ajustes')), false);
  });
});

test('os documentos de verdade não citam modelo e esforço de um agente: só o pipeline.json, os cabeçalhos e a tabela gerada', () => {
  const cfg = lerConfig(ARQUIVO);
  const par_ = /\b(opus|sonnet|haiku)\b[`" ]*,?[`" ]*(e |em )?[`" ]*\b(xhigh|high|medium|low)\b/;
  const proibido = [];
  for (const rel of DOCS) {
    if (!existsSync(join(RAIZ, rel))) continue;
    readFileSync(join(RAIZ, rel), 'utf8').split('\n').forEach((linha, i) => {
      if (linha.startsWith('| agente `') || linha.startsWith('| nível `')) return;
      for (const nome of Object.keys(cfg.agentes)) if (linha.includes(nome) && par_.test(linha)) proibido.push(`${rel}:${i + 1} (${nome})`);
    });
  }
  assert.deepEqual(proibido, [], 'troque o par copiado por um ponteiro para .claude/pipeline.json ou para a tabela da seção 7');
  for (const f of readdirSync(join(CLAUDE, 'agents'))) {
    const texto = readFileSync(join(CLAUDE, 'agents', f), 'utf8');
    texto.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').split('\n').forEach((l) => assert.doesNotMatch(l, par_, `${f}: o corpo repete o par`));
    assert.doesNotMatch(/^description:(.*)$/m.exec(texto)?.[1] ?? '', /\b(opus|sonnet|haiku)\b[^.]{0,12}\b(xhigh|high|medium|low)\b/, `${f}: a descrição repete o par`);
  }
});

// ---------- a sessão com o orquestrador fora do par (D3) ----------

const comOrquestrador = (s, orquestrador) => ({ ...s, sessao: { ...s.sessao, orquestrador } });

test('a sessão cujo orquestrador não está em opus xhigh fica fora da janela e entra só na tabela de comparação; o relatório diz qual e por quê', () => {
  const cfg = config();
  const [a, b, c] = quietas(cfg, 3);
  const haiku = comOrquestrador(quietas(cfg, 1, 4)[0], { model: 'haiku', effort: null });
  const r = analisar([a, b, haiku], [], cfg);
  assert.equal(r.completa, false, 'só 2 sessões contam: a do haiku não entra');
  assert.deepEqual(r.datas, ['2026-11-01', '2026-11-02']);
  assert.deepEqual(r.descer, [], 'a janela incompleta não deixa nada descer');
  assert.deepEqual(r.foraDaConta, [{ arquivo: '2026-11-04-s4.md', orquestrador: 'haiku:null' }]);
  assert.equal(r.alvos.find((x) => x.id === 'agentes.revisor-arquitetura').sessoes, 2, 'a sessão do haiku não conta na conta');
  assert.equal(r.linhaDeBase.find((x) => x.id === 'agentes.revisor-arquitetura').sessoes, 1, 'mas entra na tabela de comparação');
  const texto = formatar(r);
  assert.match(texto, /Fora da conta \(orquestrador em haiku:null, D3\): 2026-11-04-s4\.md/);
  assert.match(texto, /Linha de base e fora da conta \(não contam na janela\):/);
  assert.deepEqual(r.baseline, [], 'não é linha de base');
  assert.equal(analisar([a, b, c, haiku], [], cfg).completa, true, 'com as 3 sessões do par certo a janela fecha, com a do haiku de fora');
});

test('o orquestrador conta pelo par: o modelo "contém" opus e o esforço é igual a xhigh; outro esforço, outro modelo ou esforço desconhecido ficam fora', () => {
  const cfg = config();
  const fora = (orq) => analisar([comOrquestrador(quietas(cfg, 1)[0], orq)], [], cfg).foraDaConta.map((x) => x.orquestrador);
  assert.deepEqual(fora({ model: 'claude-opus-5-5', effort: 'xhigh' }), [], 'o nome completo do modelo vale');
  assert.deepEqual(fora({ model: 'opus', effort: 'high' }), ['opus:high']);
  assert.deepEqual(fora({ model: 'sonnet', effort: 'xhigh' }), ['sonnet:xhigh']);
  assert.deepEqual(fora({ model: 'opus', effort: null }), ['opus:null']);
  assert.deepEqual(fora(undefined), ['desconhecido:desconhecido'], 'sem orquestrador (sessão não validada) fica fora');
  assert.deepEqual(fora({ model: 'OPUS', effort: 'XHIGH ' }), [], 'caixa e espaços não importam');
  assert.deepEqual(fora({ model: ' Claude-Opus-5-5 ', effort: ' xhigh' }), []);
  assert.deepEqual(fora({ model: 'opus', effort: 'HIGH ' }), ['opus:HIGH '], 'o esforço errado segue fora, escrito como veio');
  assert.deepEqual(fora({ model: 'opus', effort: 3 }), ['opus:3']);
  const outroPar = structuredClone(cfg);
  outroPar.niveis.orquestracao = { ...outroPar.niveis.orquestracao, model: 'haiku', effort: 'low' };
  const noOutro = analisar([comOrquestrador(quietas(cfg, 1)[0], { model: 'opus', effort: 'xhigh' })], [], outroPar);
  assert.deepEqual(noOutro.foraDaConta, [], 'o par esperado é o FIXOS do config.mjs, não o cfg.niveis do pipeline.json');
  assert.equal(FIXOS.niveis.orquestracao, 'opus:xhigh');
});

test('a sessão de linha de base com o orquestrador fora do par continua listada só como linha de base', () => {
  const cfg = config();
  const base = comOrquestrador(sessao(1, [codigo('medio', 0), roda('revisor-arquitetura')], [achado('qa', { severidade: 'alto', escapou_de: ['revisor-arquitetura'] })], { sessao: { baseline: true } }), { model: 'haiku', effort: null });
  const r = analisar([base, ...quietas(cfg, 3, 2)], [], cfg);
  assert.deepEqual(r.baseline, ['2026-11-01-s1.md']);
  assert.deepEqual(r.foraDaConta, []);
  assert.doesNotMatch(formatar(r), /Fora da conta/);
  assert.equal(r.linhaDeBase.find((a) => a.id === 'agentes.revisor-arquitetura').escapesRodou, 1);
});

test('as sessões de verdade do projeto (se houver): a conta roda sobre elas, e uma sessão de linha de base nunca aparece como fora da conta', () => {
  const sessoes = lerSessoes(join(RAIZ, 'docs', 'pipeline', 'sessoes'), config());
  const r = analisar(sessoes, [], config());
  const base = sessoes.filter((s) => s.sessao.baseline === true).map((s) => s.arquivo);
  assert.deepEqual(r.baseline, base);
  assert.deepEqual(r.foraDaConta.filter((f) => base.includes(f.arquivo)), []);
});

test('o --relatorio e o --json trazem a sessão fora da conta, e a conta segue sem ela', () => {
  const cfg = config();
  const sessoes = [...quietas(cfg, 3), comOrquestrador(quietas(cfg, 1, 4)[0], { model: 'sonnet', effort: 'low' })];
  comProjeto(sessoes, (raiz) => {
    assert.match(cli(raiz, '--relatorio').stdout, /Fora da conta \(orquestrador em sonnet:low, D3\): 2026-11-04-s4\.md/);
    const json = JSON.parse(cli(raiz, '--relatorio', '--json').stdout);
    assert.deepEqual(json.foraDaConta, [{ arquivo: '2026-11-04-s4.md', orquestrador: 'sonnet:low' }]);
    assert.equal(json.completa, true);
  });
});

// ---------- o ajuste só mexe no esforço, dentro do mesmo modelo (D3) ----------

const modeloDe = (p) => p.split(':')[0];

test('a descida do revisor-arquitetura vai de opus:high para opus:medium e para aí: o piso é opus:medium, não um sonnet', () => {
  const cfg = config();
  assert.equal(PISOS.agentes['revisor-arquitetura'], 'opus:medium');
  cfg.agentes['revisor-seguranca'] = { ...cfg.agentes['revisor-seguranca'], effort: 'high' }; // no piso dela: o arquitetura é o mais caro que ainda desce
  const sessoes = quietas(cfg, 3);
  const [d] = analisar(sessoes, [], cfg).descer;
  assert.deepEqual([d.id, d.de, d.para], ['agentes.revisor-arquitetura', 'opus:high', 'opus:medium']);
  cfg.agentes['revisor-arquitetura'] = { ...cfg.agentes['revisor-arquitetura'], effort: 'medium' };
  const r = analisar(quietas(cfg, 3), [], cfg);
  assert.equal(acha(r, 'descer', 'agentes.revisor-arquitetura'), undefined);
  assert.match(r.bloqueios.find((b) => b.id === 'agentes.revisor-arquitetura').motivo, /já está no piso \(opus:medium\)/);
});

test('nenhum ajuste troca o modelo de ninguém: toda descida e toda subida propostas ficam no modelo do alvo, em qualquer par de partida', () => {
  const esforcos = { opus: ['medium', 'high', 'xhigh'], sonnet: ['low', 'medium', 'high'] };
  for (const [secao, chave] of [['agentes', 'revisor-seguranca'], ['agentes', 'revisor-arquitetura'], ['agentes', 'qa'], ['agentes', 'revisor-tela'], ['niveis', 'medio'], ['niveis', 'codigo-seguranca'], ['niveis', 'revisao-ponytail']]) {
    const modelo = lerConfig(ARQUIVO)[secao][chave].model;
    for (const effort of esforcos[modelo]) {
      const cfg = config();
      cfg[secao][chave] = { ...cfg[secao][chave], model: modelo, effort };
      const sessoes = quietas(cfg, 3);
      const nome = secao === 'agentes' ? chave : 'ponytail-review';
      sessoes[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: [nome] }));
      const limpas = quietas(cfg, 3);
      for (const r of [analisar(sessoes, [], cfg), analisar(limpas, [], cfg)]) {
        for (const p of [...r.subir, ...r.descer, ...r.pendentes.map((x) => ({ id: x.id, de: x.motivo.split(' ')[0], para: x.motivo.split(' ')[2] }))]) {
          assert.equal(modeloDe(p.para), modeloDe(p.de), `${p.id}: ${p.de} -> ${p.para} trocou o modelo`);
        }
      }
    }
  }
  // o topo e o começo de cada modelo bloqueiam em vez de saltar para o outro
  const cfg = config();
  cfg.agentes.qa = { ...cfg.agentes.qa, model: 'sonnet', effort: 'high' };
  const s = quietas(cfg, 3);
  s[1].achados.push(achado('qa', { severidade: 'alto', escapou_de: ['qa'] }));
  assert.equal(acha(analisar(s, [], cfg), 'subir', 'agentes.qa'), undefined);
});

// ---------- o fim de linha do SKILL.md (CRLF ou LF) é mantido ----------

const emCRLF = (texto) => texto.replace(/\r?\n/g, '\r\n');
const temLFsolto = (texto) => /(^|[^\r])\n/.test(texto);

test('a tabela mantém o fim de linha que o SKILL.md já usa: comTabela, --sincronizar-tabela e --aplicar-menos, em CRLF e em LF', () => {
  const cfg = lerConfig(ARQUIVO);
  const skill = readFileSync(join(CLAUDE, 'skills', 'pipeline', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const lf = comTabela(skill, cfg);
  const crlf = comTabela(emCRLF(skill), cfg);
  assert.equal(temLFsolto(crlf), false, 'a tabela gerada em um SKILL.md CRLF não deixa LF solto');
  assert.equal(crlf, emCRLF(lf), 'o mesmo texto, só com outro fim de linha');
  assert.equal(/\r/.test(lf), false, 'em LF continua LF');
  assert.equal(comTabela(crlf, cfg), crlf, 'idempotente');
  for (const converter of [emCRLF, (t) => t.replace(/\r\n/g, '\n')]) {
    comProjeto(quietas(), (raiz) => {
      const arquivoSkill = join(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md');
      const eol = (t) => (/\r\n/.test(t) ? 'crlf' : 'lf');
      const esperado = eol(converter('a\nb'));
      assert.equal(eol(lerArquivo(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md')), esperado, 'prepara');
      assert.equal(cli(raiz, '--sincronizar-tabela').status, 0);
      const depoisSync = lerArquivo(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md');
      assert.equal(eol(depoisSync), esperado);
      assert.equal(esperado === 'crlf' ? temLFsolto(depoisSync) : /\r/.test(depoisSync), false, '--sincronizar-tabela: um fim de linha só');
      const r = cli(raiz, '--aplicar-menos', '--data', '2026-11-04');
      assert.equal(r.status, 0, r.stderr);
      const depoisAplicar = readFileSync(arquivoSkill, 'utf8');
      assert.equal(esperado === 'crlf' ? temLFsolto(depoisAplicar) : /\r/.test(depoisAplicar), false, '--aplicar-menos: um fim de linha só');
      assert.equal(comTabela(depoisAplicar, lerConfig(join(raiz, '.claude', 'pipeline.json'))), depoisAplicar, 'a tabela ficou em sincronia');
    }, (raiz) => {
      const arquivoSkill = join(raiz, '.claude', 'skills', 'pipeline', 'SKILL.md');
      writeFileSync(arquivoSkill, converter(readFileSync(arquivoSkill, 'utf8')));
    });
  }
});

// ---------- id de pessoa e nome do arquivo ----------

test('validarSessao recusa id de pessoa (cliente, lead, contato, titular + número de 3 dígitos ou mais) em qualquer texto do bloco', () => {
  const cfg = config();
  const ok = sessao(1, [roda('qa', cfg)], [achado('qa')]);
  const com = (muda) => { const c = structuredClone(ok); muda(c); return () => validarSessao(c, 'x.md', cfg); };
  for (const texto of ['o cliente 12345 reclamou', 'Cliente #9876', 'lead4567', 'LEAD  000', 'contato 123', 'titular#1234', 'do titular   9999']) {
    assert.throws(com((c) => { c.achados[0].resumo = texto; }), /id de pessoa/, texto);
    assert.throws(com((c) => { c.licoes = [texto]; }), /id de pessoa/, `licoes: ${texto}`);
    assert.throws(com((c) => { c.sessao.assunto = texto; }), /id de pessoa/, `assunto: ${texto}`);
    assert.throws(com((c) => { c.erros_orquestrador = [{ resumo: texto, custo: 'x' }]; }), /id de pessoa/, `erros: ${texto}`);
    assert.throws(com((c) => { c.adiar = [{ alvo: 'qa', motivo: texto }]; }), /id de pessoa/, `adiar: ${texto}`);
  }
  for (const texto of ['cliente 12', 'contatos 3000', 'o cliente chegou', 'cliente-novo', 'leads de 2026', 'client 1234', 'titulares 123']) {
    assert.doesNotThrow(com((c) => { c.achados[0].resumo = texto; }), texto);
  }
});

test('o arquivo de sessão: depois da data o nome é kebab de até 60 caracteres e sem id de pessoa; o MODELO.md e o que não começa com a data ficam de fora', () => {
  const cfg = config();
  const pasta = mkdtempSync(join(tmpdir(), 'sessoes-'));
  try {
    const bloco = (s) => `# s\n\n\`\`\`json\n${JSON.stringify({ sessao: s.sessao, agentes: s.agentes, achados: s.achados, erros_orquestrador: [], licoes: [] })}\n\`\`\`\n`;
    const grava = (nome) => writeFileSync(join(pasta, nome), bloco(sessao(1, [roda('qa', cfg)], [achado('qa')])));
    grava('2026-11-01-um-assunto-bom.md');
    grava('2026-11-02-a1-b2.md');
    grava(`2026-11-03-${'a'.repeat(60)}.md`);
    writeFileSync(join(pasta, 'MODELO.md'), 'sem bloco');
    writeFileSync(join(pasta, 'LEIAME.md'), 'sem bloco');
    assert.equal(lerSessoes(pasta, cfg).length, 3);
    for (const [nome, motivo] of [
      ['2026-11-04-Assunto-Maiúsculo.md', /kebab/], ['2026-11-04-com espaço.md', /kebab/], ['2026-11-04-com_underscore.md', /kebab/], ['2026-11-04-acentuação-é.md', /kebab/],
      ['2026-11-04--duplo.md', /kebab/], ['2026-11-04-termina-.md', /kebab/], [`2026-11-04-${'a'.repeat(61)}.md`, /60 caracteres/],
      ['2026-11-04-cliente-12345.md', /id de pessoa/], ['2026-11-04-lead-9876-reclamou.md', /id de pessoa/],
    ]) {
      grava(nome);
      assert.throws(() => lerSessoes(pasta, cfg), motivo, nome);
      rmSync(join(pasta, nome));
    }
    assert.equal(lerSessoes(pasta, cfg).length, 3, 'sem os ruins volta ao normal');
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ---------- --sincronizar-desenvolvedor (D8) ----------

test('--sincronizar-desenvolvedor: em dia não grava; CLAUDE.md mudado regrava o bloco de regras e diz o que mudou; adotado cria o bloco do domínio; erro de extração falha com o título', () => {
  comProjeto([], (raiz) => {
    const agente = join(raiz, '.claude', 'agents', 'desenvolvedor.md');
    const claude = join(raiz, 'CLAUDE.md');
    const inicial = readFileSync(agente, 'utf8');
    const emDia = cli(raiz, '--sincronizar-desenvolvedor');
    assert.equal(emDia.status, 0, emDia.stderr);
    assert.match(emDia.stdout, /já estava em dia/);
    assert.equal(readFileSync(agente, 'utf8'), inicial, 'não gravou');

    writeFileSync(claude, readFileSync(claude, 'utf8').replace('O `.env` local fica fora do git.', 'O `.env` local fica fora do git, sempre.'));
    const mudou = cli(raiz, '--sincronizar-desenvolvedor');
    assert.equal(mudou.status, 0, mudou.stderr);
    assert.match(mudou.stdout, /bloco regras/);
    assert.doesNotMatch(mudou.stdout, /bloco dominio/);
    const depois = readFileSync(agente, 'utf8');
    assert.match(depois, /fora do git, sempre\./);
    assert.equal(depois.replace('fora do git, sempre.', 'fora do git.'), inicial, 'só o bloco de regras mudou');
    assert.match(cli(raiz, '--sincronizar-desenvolvedor').stdout, /já estava em dia/, 'idempotente');

    writeFileSync(claude, readFileSync(claude, 'utf8').replace('# <Nome do projeto>', '# Projeto Ficticio').replace(/^8\. <.*>$/m, '8. **Isolamento** entre donos de dado: nunca cruzar.'));
    const adotou = cli(raiz, '--sincronizar-desenvolvedor');
    assert.equal(adotou.status, 0, adotou.stderr);
    assert.match(adotou.stdout, /bloco dominio/);
    assert.match(readFileSync(agente, 'utf8'), /<!-- dominio:inicio -->\n8\. \*\*Isolamento\*\* entre donos de dado: nunca cruzar\.\n<!-- dominio:fim -->/);

    writeFileSync(claude, readFileSync(claude, 'utf8').replace('6. **Segredos**', '6. Segredos'));
    const falhou = cli(raiz, '--sincronizar-desenvolvedor');
    assert.equal(falhou.status, 2);
    assert.match(falhou.stderr, /Segredos/);
  });
});

// ---------- D8.3: o --repetidas ----------

const AGENTE_DE_EXEMPLO = `---
name: desenvolvedor
description: Agente de código inventado para o teste, com uma linha de cabeçalho bem comprida.
---
Você escreve código numa pasta, com o pacote do orquestrador.

## Como trabalhar
- Escopo: só a pasta do pacote, e mais nada além dela.
- Só commita: sem push, PR, merge nem rebase.
<!-- projeto:inicio -->
<!-- projeto:fim -->
`;
const LINHA_A = 'Rode o portão rápido antes de pedir a revisão do código';
const LINHA_B = 'Confira o AGENTS.md da pasta antes de mexer em qualquer arquivo';
const pct = (arquivo, ...linhas) => ({ arquivo, texto: `# Pacote\n\n${linhas.join('\n')}\n` });

test('repetidas: 1 pacote não basta e 2 bastam; a mesma linha duas vezes no mesmo pacote conta 1', () => {
  const r1 = repetidas([pct('desenvolvedor-a.md', LINHA_A, LINHA_A, LINHA_A), pct('desenvolvedor-b.md', LINHA_B)], AGENTE_DE_EXEMPLO);
  assert.deepEqual(r1.candidatas, [], 'três ocorrências em 1 pacote não são repetição entre pacotes');
  const r2 = repetidas([pct('desenvolvedor-a.md', LINHA_A, LINHA_A), pct('desenvolvedor-b.md', LINHA_A, LINHA_B)], AGENTE_DE_EXEMPLO);
  assert.deepEqual(r2.candidatas, [{ linha: LINHA_A.toLowerCase(), pacotes: 2, arquivos: ['desenvolvedor-a.md', 'desenvolvedor-b.md'] }]);
  assert.deepEqual(r2.pacotes, ['desenvolvedor-a.md', 'desenvolvedor-b.md']);
});

test('repetidas: a linha com 39 caracteres normalizados fica de fora e a de 40 entra', () => {
  const l39 = 'a'.repeat(39);
  const l40 = 'b'.repeat(40);
  const r = repetidas([pct('desenvolvedor-a.md', `- ${l39}.`, `- **${l40}**;`), pct('desenvolvedor-b.md', l39, `> ${l40}`)], AGENTE_DE_EXEMPLO);
  assert.deepEqual(r.candidatas.map((c) => c.linha), [l40]);
});

test('linhasNormalizadas: cerca de código, #, | e <!-- ficam de fora; >, marcador de lista, ** e pontuação do fim saem; espaços se juntam e tudo vai a minúsculas', () => {
  const texto = ['# Título que tem mais de quarenta caracteres no total', '| tabela | com mais de quarenta caracteres no total aqui |', '<!-- comentário com mais de quarenta caracteres no total -->',
    '```json', 'linha dentro da cerca de código com mais de quarenta caracteres', '```', '~~~', 'outra linha dentro da cerca de til com mais de quarenta caracteres', '~~~',
    '- **Leia** o   AGENTS.md DA pasta antes de qualquer mudança, ', '> 1. Leia o AGENTS.md da pasta antes de qualquer mudança;', '* leia o agents.md da pasta antes de qualquer mudança:', '+ Leia o AGENTS.md da pasta antes de qualquer mudança.'];
  assert.deepEqual(linhasNormalizadas(texto.join('\n'), 40), Array(4).fill('leia o agents.md da pasta antes de qualquer mudança'));
  assert.deepEqual(linhasNormalizadas('```\nnão fecha\nainda dentro\n', 0), [], 'a cerca sem fim vai até o fim do texto');
  assert.deepEqual(linhasNormalizadas('````\n```\nainda dentro da cerca maior\n````\nfora', 0), ['fora']);
});

test('repetidas: a linha de pacote igual a uma do corpo do agente é economia perdida (tamanho ÷ 3 × pacotes) e não é candidata; o cabeçalho do agente não conta como corpo', () => {
  const escopo = 'Escopo: só a pasta do pacote, e mais nada além dela.';
  const r = repetidas([pct('desenvolvedor-a.md', `- ${escopo}`, LINHA_A), pct('desenvolvedor-b.md', `> ${escopo}`, LINHA_A, 'Agente de código inventado para o teste, com uma linha de cabeçalho bem comprida'), pct('desenvolvedor-c.md', escopo)], AGENTE_DE_EXEMPLO);
  const normal = escopo.slice(0, -1).toLowerCase();
  assert.deepEqual(r.economiaPerdida, [{ linha: normal, pacotes: 3, arquivos: ['desenvolvedor-a.md', 'desenvolvedor-b.md', 'desenvolvedor-c.md'], tokens: Math.round((normal.length / 3) * 3) }]);
  assert.deepEqual(r.candidatas.map((c) => c.linha), [LINHA_A.toLowerCase()]);
  const so1 = repetidas([pct('desenvolvedor-a.md', escopo)], AGENTE_DE_EXEMPLO);
  assert.equal(so1.economiaPerdida[0].pacotes, 1, 'a economia perdida vale já com 1 pacote');
  assert.equal(so1.economiaPerdida[0].tokens, Math.round(normal.length / 3));
  const cab = repetidas([pct('desenvolvedor-a.md', 'Agente de código inventado para o teste, com uma linha de cabeçalho bem comprida'), pct('desenvolvedor-b.md', 'Agente de código inventado para o teste, com uma linha de cabeçalho bem comprida.')], AGENTE_DE_EXEMPLO);
  assert.equal(cab.candidatas.length, 1, 'o description do cabeçalho não é corpo');
});

/** Uma pasta de pacotes e uma raiz só com o agente (sem `pipeline.json`), para o `--repetidas` na linha de comando. */
function comPacotes(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'repetidas-'));
  const pasta = join(raiz, 'pacotes');
  try {
    mkdirSync(join(raiz, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(raiz, '.claude', 'agents', 'desenvolvedor.md'), AGENTE_DE_EXEMPLO);
    mkdirSync(join(pasta, 'desenvolvedor-sub'), { recursive: true });
    const grava = (nome, ...linhas) => writeFileSync(join(pasta, nome), `${linhas.join('\n')}\n`);
    grava('desenvolvedor-a.md', LINHA_A, 'Escopo: só a pasta do pacote, e mais nada além dela.');
    grava('desenvolvedor-b.md', LINHA_A, 'Escopo: só a pasta do pacote, e mais nada além dela.');
    // fora da conta: planejamento, outro nome, outra extensão, subpasta e quem só contém o nome no meio
    grava('planejamento-c.md', LINHA_B);
    grava('planejamento-d.md', LINHA_B);
    grava('outro-desenvolvedor-e.md', LINHA_B);
    grava('desenvolvedor-f.txt', LINHA_B);
    grava('desenvolvedor.md', LINHA_B);
    writeFileSync(join(pasta, 'desenvolvedor-sub', 'desenvolvedor-g.md'), `${LINHA_B}\n`);
    fn(raiz, pasta);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
const instantaneo = (pasta) => readdirSync(pasta, { recursive: true }).sort().map((f) => `${f}:${statSync(join(pasta, f)).isFile() ? readFileSync(join(pasta, f)).length : 'dir'}`);

test('--repetidas na linha de comando: só os desenvolvedor-*.md do 1º nível, texto e --json, sem gravar e sem ler o pipeline.json', () => {
  comPacotes((raiz, pasta) => {
    const antes = instantaneo(raiz);
    const texto = spawnSync(process.execPath, [SCRIPT, '--raiz', raiz, '--repetidas', pasta], { encoding: 'utf8' });
    assert.equal(texto.status, 0, texto.stderr);
    assert.match(texto.stdout, /Pacotes contados \(2\): desenvolvedor-a\.md, desenvolvedor-b\.md/);
    assert.match(texto.stdout, new RegExp(`\\[2 pacotes\\] ${LINHA_A.toLowerCase()}`));
    assert.match(texto.stdout, /Economia perdida .*≈ 34 tokens\)/);
    assert.match(texto.stdout, /\[2 pacotes, ≈ 34 tokens\] escopo: só a pasta do pacote, e mais nada além dela/);
    assert.ok(!texto.stdout.includes(LINHA_B.toLowerCase()), 'planejamento e os outros nomes ficam fora');
    const json = JSON.parse(spawnSync(process.execPath, [SCRIPT, '--raiz', raiz, '--repetidas', pasta, '--json'], { encoding: 'utf8' }).stdout);
    assert.deepEqual(json.pacotes, ['desenvolvedor-a.md', 'desenvolvedor-b.md']);
    assert.deepEqual(json.candidatas.map((c) => [c.linha, c.pacotes]), [[LINHA_A.toLowerCase(), 2]]);
    assert.deepEqual(json.economiaPerdida.map((c) => [c.pacotes, c.tokens]), [[2, 34]]);
    assert.deepEqual(instantaneo(raiz), antes, 'nunca grava');
  });
});

test('--repetidas: pasta que não existe ou sem valor sai com 2, e a pasta sem pacotes imprime zero', () => {
  comPacotes((raiz, pasta) => {
    const roda = (...a) => spawnSync(process.execPath, [SCRIPT, '--raiz', raiz, ...a], { encoding: 'utf8' });
    assert.equal(roda('--repetidas', join(raiz, 'nao-existe')).status, 2);
    assert.equal(roda('--repetidas').status, 2);
    assert.equal(roda('--repetidas', '--json').status, 2);
    const vazia = join(raiz, 'vazia');
    mkdirSync(vazia);
    const r = roda('--repetidas', vazia);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Pacotes contados \(0\): nenhum/);
  });
});

// ---------- D8.(D): o registro do ajuste do agente ----------

test('um ajuste do desenvolvedor (parte do projeto) em docs/pipeline/ajustes/ não quebra o --relatorio nem entra na conta dos alvos', () => {
  comProjeto([], (raiz) => {
    const antes = JSON.parse(cli(raiz, '--relatorio', '--json').stdout);
    const bloco = { alvo: 'desenvolvedor', tipo: 'parte-do-projeto', de: '0 linhas', para: '3 linhas', data: '2026-11-05', vistas: [] };
    mkdirSync(join(raiz, 'docs', 'pipeline', 'ajustes'), { recursive: true });
    writeFileSync(join(raiz, 'docs', 'pipeline', 'ajustes', '2026-11-05-desenvolvedor.md'), `# Ajuste 2026-11-05: desenvolvedor\n\n\`\`\`json\n${JSON.stringify(bloco, null, 2)}\n\`\`\`\n`);
    const r = cli(raiz, '--relatorio', '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), antes);
    assert.equal(cli(raiz, '--relatorio').status, 0);
    assert.deepEqual(lerAjustes(join(raiz, 'docs', 'pipeline', 'ajustes')).map((a) => [a.alvo, a.tipo]), [['desenvolvedor', 'parte-do-projeto']]);
  });
});
