// Confere a documentação a cada commit. Roda como hook commit-msg do git (.claude/hooks/git/commit-msg),
// então vale para todo commit, do agente ou da pessoa, em qualquer worktree. Recusa quando:
// - a pasta de trabalho de um arquivo (as regex de pastasDeTrabalho, em .claude/pipeline.json) não tem AGENTS.md,
//   ou ele não tem as partes do modelo (Faz:, Não faz:, Como testar:);
// - o AGENTS.md cita um arquivo que não existe na pasta nem na raiz do repositório;
// - um link relativo de um .md do commit não leva a nada;
// - o código de uma pasta mudou e o AGENTS.md dela não, sem a linha "Docs-conferidos: <pasta>/AGENTS.md"
//   (arquivo de uma pasta `gerado/` que o AGENTS.md cita não conta como código);
// - o pipeline.json está ilegível ou sem pastasDeTrabalho válidas (falha fechado).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerPastas } from './config.mjs';

const CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql|json)$/i;
const GERADO = /(^|\/)gerado\//; // arquivo gerado e citado no AGENTS.md não conta como código que mudou (as demais regras valem)
const ARQUIVO_CITAVEL = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql|json|md|sh)$/i;
const PARTES = ['Faz:', 'Não faz:', 'Como testar:'];
const CITADOS_DE_FORA = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.base.json', 'README.md', 'CLAUDE.md', 'AGENTS.md', 'PRODUCT.md', 'SKILL.md', 'pipeline.json']);
const SEM_CONFERIR_LINKS = /^\.claude\/skills\//; // skills de terceiros: os links de exemplo são deles

/**
 * A pasta de trabalho de um arquivo: o trecho que a 1ª regex de `pastas` (RegExp[], de lerPastas) acha no caminho
 * relativo, ou null. O "(?=/)" no fim da regex faz o AGENTS.md de uma pasta que só agrupa (apps/) não virar pasta de trabalho.
 */
export function unidadeDe(rel, pastas) {
  for (const re of pastas) {
    const m = rel.match(re);
    if (m) return m[0];
  }
  return null;
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// aceita "Faz:", "**Faz:**" e "**Faz**:" no começo da linha
const temParte = (texto, parte) => new RegExp(`^\\s*(\\*\\*)?${escapar(parte.slice(0, -1))}(:\\*\\*|\\*\\*:|:)`, 'mi').test(texto);
const semCodigo = (texto) => texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

/**
 * Lista os problemas de documentação de um commit. Vazio = pode commitar.
 * `arquivos`: o que entra ou muda; `apagados`: o que sai (conta para achar o dono, nunca para "sem AGENTS.md");
 * `pastas`: as regex das pastas de trabalho (lerPastas().valor).
 */
export function conferir({ raiz, arquivos, apagados = [], mensagem, pastas }) {
  const problemas = [];
  const donos = new Map();
  const semAgents = new Set();
  const existe = (rel) => existsSync(join(raiz, rel));

  const donoDe = (f) => {
    const unidade = unidadeDe(f, pastas);
    if (unidade === null) return { unidade: null, dono: null };
    for (let dir = posix.dirname(f); dir.length >= unidade.length; dir = posix.dirname(dir)) {
      if (existe(`${dir}/AGENTS.md`)) return { unidade, dono: dir };
      if (dir === unidade) break;
    }
    return { unidade, dono: null };
  };

  for (const [f, apagado] of [...arquivos.map((a) => [a, false]), ...apagados.map((a) => [a, true])]) {
    const { unidade, dono } = donoDe(f);
    if (unidade !== null && dono === null && !apagado) semAgents.add(unidade);
    if (dono !== null) {
      const d = donos.get(dono) ?? { codigo: false, agents: false, gerados: [] };
      if (f === `${dono}/AGENTS.md`) d.agents = true;
      else if (GERADO.test(f)) { if (!apagado) d.gerados.push(basename(f)); } // apagado: o teste do gerador pega o que sobrou
      else if (CODIGO.test(f) || apagado) d.codigo = true;
      donos.set(dono, d);
    }
    if (!apagado && f.endsWith('.md') && !SEM_CONFERIR_LINKS.test(f) && existe(f)) {
      for (const [, alvo] of semCodigo(readFileSync(join(raiz, f), 'utf8')).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(alvo)) continue;
        let caminho;
        try {
          caminho = posix.normalize(posix.join(posix.dirname(f), decodeURI(alvo.split('#')[0])));
        } catch {
          caminho = null;
        }
        if (caminho === null || !existe(caminho)) problemas.push(`${f}: o link "${alvo}" não leva a nada`);
      }
    }
  }

  for (const unidade of semAgents) problemas.push(`${unidade} não tem AGENTS.md (toda pasta de trabalho tem um)`);

  for (const [dono, d] of donos) {
    if (!existe(`${dono}/AGENTS.md`)) continue;
    const texto = readFileSync(join(raiz, dono, 'AGENTS.md'), 'utf8');
    const faltam = PARTES.filter((p) => !temParte(texto, p));
    if (faltam.length > 0) problemas.push(`${dono}/AGENTS.md não tem: ${faltam.join(', ')} (o modelo tem as partes ${PARTES.join(', ')})`);
    const naPasta = new Set(readdirSync(join(raiz, dono), { recursive: true }).map((n) => basename(String(n))));
    for (const [, nome] of texto.matchAll(/`([\w-][\w.-]*)`/g)) {
      if (!ARQUIVO_CITAVEL.test(nome) || CITADOS_DE_FORA.has(nome) || naPasta.has(nome) || existe(nome)) continue; // o da raiz vale sem caminho
      problemas.push(`${dono}/AGENTS.md cita \`${nome}\`, que não existe na pasta`);
    }
    // o gerador tem teste que falha quando o arquivo dele fica velho, então só o gerado que o AGENTS.md cita não conta;
    // gerado novo ou escrito à mão na pasta conta como código
    const codigo = d.codigo || d.gerados.some((nome) => !texto.includes(nome));
    if (codigo && !d.agents && !new RegExp(`Docs-conferidos:[^\\n]*${escapar(`${dono}/AGENTS.md`)}`).test(mensagem)) {
      problemas.push(`o código de ${dono} mudou e o AGENTS.md dela não: releia-o e, se ainda diz o que a pasta é, ponha na mensagem "Docs-conferidos: ${dono}/AGENTS.md"`);
    }
  }

  if (!existe('README.md')) problemas.push('o repositório não tem README.md');
  return problemas;
}

/** O que o commit em preparo leva (o git já montou o índice, inclusive com -a). */
function doIndice(raiz) {
  const saida = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-status', '-M'], { cwd: raiz, encoding: 'utf8' });
  const arquivos = [];
  const apagados = [];
  for (const linha of saida.split('\n').filter(Boolean)) {
    const [estado, ...caminhos] = linha.split('\t');
    if (estado?.startsWith('D')) apagados.push(caminhos[0]);
    else if (estado?.startsWith('R')) { apagados.push(caminhos[0]); arquivos.push(caminhos[1]); }
    else arquivos.push(caminhos[0]);
  }
  return { arquivos: arquivos.filter(Boolean), apagados: apagados.filter(Boolean) };
}

function principal(arquivoDaMensagem) {
  const { valor: pastas, erro } = lerPastas();
  if (erro !== null) {
    process.stderr.write(`Commit recusado pelo confere-docs: ${erro}.\n`);
    return 1;
  }
  const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const mensagem = readFileSync(arquivoDaMensagem, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n');
  const problemas = conferir({ raiz, ...doIndice(raiz), mensagem, pastas });
  if (problemas.length === 0) return 0;
  process.stderr.write(
    `Commit recusado pelo confere-docs: a documentação não bate com a realidade.\n- ${problemas.slice(0, 15).join('\n- ')}\n` +
    (problemas.length > 15 ? `- e mais ${problemas.length - 15}\n` : ''),
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = principal(process.argv[2] ?? '');
  } catch (erro) {
    process.stderr.write(`confere-docs: não consegui conferir a documentação: ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  }
}
