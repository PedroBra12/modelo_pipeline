// Hook pre-commit do git (D11): o esforço `rapido` não muda o pipeline. Com o esforço do pipeline em `rapido` (`.claude/estado/esforco`
// ou `PIPELINE_ESFORCO`, como a guarda-agentes o lê) o commit cujo índice tem um arquivo que casa um caminho do gatilho `config_pipeline`
// (o piso do config.mjs mais os caminhos do gatilho no pipeline.json) é recusado: "grave medio ou alto". O `rapido` pula os revisores e o qa
// (D64), que são justamente quem revisa o `config_pipeline`. O esforço também se procura no checkout principal do repositório (o pai do
// `git rev-parse --git-common-dir`): o worktree de um agente não tem `.claude/estado/` (a pasta não é versionada), e é de lá que ele commita.
// Falha fechado: com o esforço `rapido`, o git que não lista o índice recusa. Sem esforço gravado, ou em `medio` ou `alto`, não faz nada.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PISO_GATILHOS, lerRevisao } from './config.mjs';
import { lerEsforcoDoEstado } from './guarda-agentes.mjs';

export const MENSAGEM = 'confere-esforco: o esforço rapido não muda o pipeline: grave medio ou alto em .claude/estado/esforco (D11)';

/** Os caminhos do gatilho `config_pipeline`: o piso do config.mjs e os do pipeline.json (o que não lê, o piso cobre sozinho). */
export function caminhosDoConfigPipeline(arquivo) {
  const doPiso = PISO_GATILHOS.config_pipeline.caminhos.map((t) => new RegExp(t, 'i'));
  const { valor, erro } = arquivo === undefined ? lerRevisao() : lerRevisao(arquivo);
  const doJson = erro === null ? (valor.gatilhos.find((g) => g.nome === 'config_pipeline')?.caminhos ?? []) : [];
  return [...doPiso, ...doJson];
}

/**
 * O motivo de recusar o commit (texto) ou null: o esforço `rapido` em alguma das raízes e um arquivo do índice que casa um caminho de
 * `caminhos` (RegExp). `esforcos` são os esforços lidos de cada raiz (`'rapido'`, `'medio'`, `'alto'`, `'<ausente>'`...).
 */
export function motivoDoRapido(esforcos, arquivos, caminhos) {
  if (!esforcos.includes('rapido')) return null;
  const tocados = arquivos.filter((a) => caminhos.some((re) => re.test(a)));
  return tocados.length === 0 ? null : `${MENSAGEM}; o commit toca o gatilho config_pipeline: ${tocados.slice(0, 5).join(', ')}${tocados.length > 5 ? ` e mais ${tocados.length - 5}` : ''}`;
}

/** O checkout principal do repositório (o pai do diretório comum do git), ou null se o git não diz. */
function raizPrincipal(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 5000, shell: false });
  if (r.error || r.status !== 0 || r.stdout.trim() === '') return null;
  const comum = resolve(cwd, r.stdout.trim());
  return basename(comum) === '.git' ? dirname(comum) : null;
}

/** O que o commit faz: `{ motivo }` (null se passa). `env` e `cwd` vêm do git que roda o hook. */
export function conferir(cwd = process.cwd(), env = process.env) {
  const raizes = [...new Set([env.CLAUDE_PROJECT_DIR, cwd, raizPrincipal(cwd)].filter((r) => typeof r === 'string' && r !== ''))];
  const esforcos = raizes.map((raiz) => lerEsforcoDoEstado(raiz, env));
  if (!esforcos.includes('rapido')) return { motivo: null };
  const r = spawnSync('git', ['diff', '--cached', '--no-renames', '--name-only', '-z'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, shell: false });
  if (r.error || r.status !== 0) return { motivo: `${MENSAGEM}; não deu para listar o índice do commit` };
  return { motivo: motivoDoRapido(esforcos, r.stdout.split('\0').filter((a) => a !== ''), caminhosDoConfigPipeline()) };
}

const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  const { motivo } = conferir();
  if (motivo !== null) {
    process.stderr.write(`${motivo}\n`);
    process.exit(1);
  }
}
