// Hook pre-push do git: o push vai só para o repositório do projeto no GitHub (o `repositorio` de
// .claude/pipeline.json), sem forçar, sem apagar e sem tocar a main (ela anda pelo merge do PR).
// O git passa o remoto e a URL nos argumentos e, na entrada, uma linha por ref: <ref local> <sha local> <ref remota> <sha remoto>.
// Vale para todo push daqui, como quer que o comando seja escrito; só o usuário passa por cima, com --no-verify.
// Falha fechado: sem repositório configurado (marcador, ausente, inválido) ou com o arquivo ilegível, nega todo push.
// O confere-lgpd roda também sobre os arquivos de cada ref que sobe (o diff <remoto>...<local>, ou origin/main...<local> quando a ref é
// nova): é a trava de quem commitou sem o hook (clone à parte, pull --ff-only, PATH com outro node). Achado que bloqueia nega o push.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerRepositorio, urlDoRepositorio } from './config.mjs';
import { bloqueia, conferirRef, regrasCarregaram, relatorio } from './confere-lgpd.mjs';

const ZERO = /^0+$/;

/**
 * O motivo de negar o push (ou null). `ehAncestral(a, b)` diz se o commit a está na história de b;
 * `repositorio` é o resultado de lerRepositorio() ({ valor, erro }).
 */
export function avaliarPush(url, linhas, ehAncestral, repositorio = lerRepositorio()) {
  if (repositorio.erro !== null) return repositorio.erro;
  if (!urlDoRepositorio(repositorio.valor).test(url)) return `o destino "${url}" não é o repositório do projeto (${repositorio.valor})`;
  for (const linha of linhas) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length !== 4) return 'linha do git ilegível';
    const [, local, ref, remoto] = campos;
    if (ZERO.test(local)) return `apagaria ${ref} no remoto`;
    if (ref === 'refs/heads/main') return 'a main só anda pelo merge do PR no GitHub';
    if (!ZERO.test(remoto) && !ehAncestral(remoto, local)) {
      return `${ref} no remoto tem commit que o push descartaria (traga antes com git pull; forçar é do usuário)`;
    }
  }
  return null;
}

/**
 * O motivo de negar o push por dado pessoal nos arquivos das refs que sobem (ou null). `existe(ref)` diz se a ref existe aqui;
 * `conferir(base, local)` devolve os achados do confere-lgpd (ver conferirRef). Falha fechado: regra que não carrega, ou erro ao conferir, nega.
 */
export function avaliarLgpdDoPush(linhas, existe, conferir, regrasOk = regrasCarregaram()) {
  const refs = linhas.map((l) => l.trim().split(/\s+/)).filter((c) => c.length === 4 && !ZERO.test(c[1]));
  if (refs.length === 0) return null;
  if (!regrasOk) return 'as regras do confere-lgpd não carregaram (lgpd-regras.mjs ou config.mjs quebrado), e sem elas o que sobe não se confere';
  for (const [, local, ref, remoto] of refs) {
    const base = !ZERO.test(remoto) ? remoto : existe('refs/remotes/origin/main') ? 'refs/remotes/origin/main' : null;
    let achados;
    try {
      achados = conferir(base, local);
    } catch (erro) {
      return `não consegui conferir o dado pessoal de ${ref} (${erro instanceof Error ? erro.message : String(erro)})`;
    }
    const bloqueiam = achados.filter(bloqueia);
    if (bloqueiam.length > 0) return `dado pessoal nos arquivos de ${ref} (confere-lgpd; o commit foi feito sem o hook?):\n${relatorio(bloqueiam)}`;
  }
  return null;
}

async function principal() {
  const [, , remoto = '', url = ''] = process.argv;
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  const linhas = entrada.split(/\r?\n/).filter((l) => l.trim() !== '');
  const ehAncestral = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b]).status === 0;
  let motivo = avaliarPush(url, linhas, ehAncestral);
  if (motivo === null) {
    const raiz = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
    const existe = (ref) => spawnSync('git', ['-C', raiz, 'rev-parse', '-q', '--verify', `${ref}^{commit}`]).status === 0;
    motivo = avaliarLgpdDoPush(linhas, existe, (base, local) => conferirRef(raiz, base, local));
  }
  if (motivo !== null) {
    process.stderr.write(`confere-push: push para ${remoto} negado: ${motivo}.\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
