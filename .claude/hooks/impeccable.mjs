// O lançador preso da `impeccable` (D35 (6)). Não é hook: é a única porta por onde o agente `designer-ui` e o `revisor-tela`
// rodam o motor da skill, um binário fechado de terceiro (telemetria, checagem de atualização, chamadas a `impeccable.style`
// e à OpenAI em alguns comandos).
//   node .claude/hooks/impeccable.mjs <context|detect> [args]
// Só os verbos `context` e `detect`, e nenhum argumento com `://` (o `detect` aceitaria URL). O motor é só o da tabela
// `MOTORES` daqui, por plataforma, com a versão e o SHA-256 (hoje só `darwin-arm64`), em `~/.impeccable/bin/<versão>/impeccable`:
// plataforma fora da tabela, arquivo ausente ou hash que não bate saem com erro (3) e NUNCA baixam. O motor roda dentro de uma
// caixa do macOS (`sandbox-exec`) que nega a rede e a pasta dos segredos locais; sem o `sandbox-exec`, sai 3. O filho recebe
// um ambiente mínimo (sem os segredos do processo), as quatro chaves que pedem ao motor que não tente a rede (quem nega a
// rede é a caixa) e o `IMPECCABLE_SELF`, com o próprio lançador, para os comandos que o motor imprime.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
/** A pasta da skill copiada da Agenda (SKILL.md, reference/, scripts/). */
export const PASTA_DA_SKILL = join(AQUI, '..', 'skills', 'impeccable');
/** Os únicos verbos que o lançador aceita (D35 (6)). */
export const VERBOS = ['context', 'detect'];
/**
 * A tabela fechada dos motores aceitos, por `<plataforma>-<arquitetura>` do Node: a versão e o SHA-256 do binário. O
 * `scripts/VERSION` da skill só é conferido contra ela (um teste), não decide qual binário roda. Plataforma nova entra aqui,
 * com o hash colhido à mão, e só se a caixa dela existir.
 */
export const MOTORES = Object.freeze({
  'darwin-arm64': Object.freeze({ versao: '0.1.11', sha256: '7427918d6e75507401a1b7b691eefe58a7c01a2fc63b712016ffc5a0ac1c05e6' }),
});
/** A caixa do macOS que roda o motor. */
export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
/** O comando do próprio lançador, que o motor escreve nos comandos que imprime (a pasta de trabalho é a raiz do repositório). */
export const SELF = 'node .claude/hooks/impeccable.mjs';
/** As chaves que o motor lê para não tentar a rede por conta própria (quem nega a rede é a caixa, não elas). */
export const CHAVES_DESLIGADAS = {
  IMPECCABLE_NO_UPDATE_CHECK: '1',
  IMPECCABLE_NO_TELEMETRY: '1',
  IMPECCABLE_NO_STALENESS_CHECK: '1',
  DO_NOT_TRACK: '1',
};
/** O que do ambiente do processo passa ao motor: o mínimo para ele achar o `HOME`, o `PATH` e o terminal. Nenhum segredo. */
const AMBIENTE_QUE_PASSA = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'NO_COLOR'];

/** O caminho único do motor: `<casa>/.impeccable/bin/<versão>/impeccable`. */
export const caminhoDoMotor = (versao, casa = homedir()) => join(casa, '.impeccable', 'bin', versao, 'impeccable');

/**
 * O perfil do `sandbox-exec`: tudo liberado menos a rede inteira e a pasta dos segredos locais da pilha principal (leitura e
 * escrita; `CLAUDE.md`, regra 6). O `deny` vem depois do `allow`, que senão o vence. A casa entra escapada na string do perfil.
 */
export function perfilDaCaixa(casa = homedir()) {
  const pasta = join(casa, '.disparador-local').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `(version 1)\n(allow default)\n(deny network*)\n(deny file* (subpath "${pasta}"))\n`;
}

/** O ambiente do filho: o mínimo do processo, mais o motor, a pasta da skill, o lançador e as quatro chaves desligadas. */
export function ambienteDoFilho(motor, ambiente = process.env, pastaDaSkill = PASTA_DA_SKILL) {
  const filho = {};
  for (const nome of AMBIENTE_QUE_PASSA) if (ambiente[nome] !== undefined) filho[nome] = ambiente[nome];
  return { ...filho, ...CHAVES_DESLIGADAS, IMPECCABLE_BIN: motor, IMPECCABLE_SKILL_DIR: pastaDaSkill, IMPECCABLE_SELF: SELF };
}

const AUSENTE = 'motor ausente: leia o PRODUCT.md e o DESIGN.md direto';

/**
 * Roda o motor com o verbo e os argumentos. Devolve `{ codigo, erro }`: `erro` é a mensagem para o stderr (ou null) e
 * `codigo` o que sai do processo (2: verbo ou URL recusados; 3: motor ausente, de fora da tabela ou com hash que não bate, ou
 * sem a caixa; o resto vem do motor). O processo filho, o disco e o ambiente entram por injeção, para o teste não rodar o
 * binário de verdade.
 */
export function lancar(
  args,
  { executar = spawnSync, existe = existsSync, ler = readFileSync, casa = homedir(), plataforma = process.platform, arquitetura = process.arch, ambiente = process.env, motores = MOTORES } = {},
) {
  const [verbo, ...resto] = args;
  if (!VERBOS.includes(verbo)) {
    return { codigo: 2, erro: `verbo recusado: só ${VERBOS.join(' e ')} rodam por aqui (D35 (6)); recebi ${verbo === undefined ? 'nenhum' : `"${verbo}"`}` };
  }
  if (resto.some((a) => a.includes('://'))) return { codigo: 2, erro: 'URL recusada: o lançador só recebe arquivos e pastas do repositório, nunca endereço (D35 (6))' };
  const chave = `${plataforma}-${arquitetura}`;
  const entrada = Object.hasOwn(motores, chave) ? motores[chave] : undefined;
  if (entrada === undefined) return { codigo: 3, erro: `${AUSENTE} (a plataforma ${chave} não está na tabela de motores do lançador)` };
  if (!existe(SANDBOX_EXEC)) return { codigo: 3, erro: `${AUSENTE} (sem o ${SANDBOX_EXEC}, o motor não roda: a caixa que nega a rede não existe)` };
  const motor = caminhoDoMotor(entrada.versao, casa);
  if (!existe(motor)) return { codigo: 3, erro: `${AUSENTE} (${motor} não existe; o lançador nunca baixa)` };
  let sha;
  try {
    sha = createHash('sha256').update(ler(motor)).digest('hex');
  } catch (e) {
    return { codigo: 3, erro: `${AUSENTE} (${motor} não se lê: ${e.message}; o lançador nunca baixa)` };
  }
  if (sha !== entrada.sha256) return { codigo: 3, erro: `${AUSENTE} (o SHA-256 de ${motor} não é o da tabela; o lançador nunca baixa nem roda outro arquivo)` };
  const r = executar(SANDBOX_EXEC, ['-p', perfilDaCaixa(casa), motor, verbo, ...resto], { stdio: 'inherit', env: ambienteDoFilho(motor, ambiente) });
  if (r.error) return { codigo: 3, erro: `${AUSENTE} (${r.error.message})` };
  return { codigo: r.status ?? 1, erro: null };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { codigo, erro } = lancar(process.argv.slice(2));
  if (erro !== null) process.stderr.write(`impeccable: ${erro}\n`);
  process.exit(codigo);
}
