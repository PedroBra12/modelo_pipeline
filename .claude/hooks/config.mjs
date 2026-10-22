// Lê e valida .claude/pipeline.json, a configuração dos hooks (o contrato está em AGENTS.md desta pasta).
// Funções puras de leitura: cada campo devolve { valor, erro }, com um e só um dos dois preenchido (o outro é null).
// Quem bloqueia (guarda-git, confere-push, confere-docs) trata o erro como recusa; o portao só avisa.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** O pipeline.json ao lado da pasta dos hooks (.claude/pipeline.json). */
export const ARQUIVO = join(dirname(fileURLToPath(import.meta.url)), '..', 'pipeline.json');
/** O valor de `repositorio` no modelo, até alguém configurar. */
export const MARCADOR = '<dono>/<repo>';
/** O começo da mensagem de quem recusa por falta de repositório configurado. */
export const CONFIGURE = 'configure o repositorio em .claude/pipeline.json';
export const PORTAO_PADRAO = 'checar:rapido';

const REPOSITORIO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SCRIPT = /^[A-Za-z0-9_][A-Za-z0-9_:.-]*$/; // vai para `npm run`, num shell: só nome de script

const ok = (valor) => ({ valor, erro: null });
const falha = (erro) => ({ valor: null, erro });
const mensagem = (e) => (e instanceof Error ? e.message : String(e));

/** O objeto do arquivo, ou o motivo de não ter sido lido. */
function lerObjeto(arquivo) {
  let bruto;
  try {
    bruto = readFileSync(arquivo, 'utf8');
  } catch (e) {
    return falha(`não consegui ler ${arquivo}: ${mensagem(e)}`);
  }
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch (e) {
    return falha(`.claude/pipeline.json não é JSON válido: ${mensagem(e)}`);
  }
  return typeof dados === 'object' && dados !== null && !Array.isArray(dados) ? ok(dados) : falha('.claude/pipeline.json tem de ser um objeto JSON');
}

/** `dono/repo` do GitHub. Marcador, ausente ou inválido: erro que começa com CONFIGURE. */
export function lerRepositorio(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(`${CONFIGURE} (${erro})`);
  const repo = dados.repositorio;
  if (repo === undefined) return falha(`${CONFIGURE} (o campo repositorio falta)`);
  if (repo === MARCADOR) return falha(CONFIGURE);
  if (typeof repo !== 'string' || !REPOSITORIO.test(repo)) return falha(`${CONFIGURE} (repositorio tem de ser dono/repo, sem URL)`);
  return ok(repo);
}

/** O nome do script do package.json que é o portão rápido. Ausente = checar:rapido. */
export function lerPortao(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const nome = dados.portaoRapido ?? PORTAO_PADRAO;
  return typeof nome === 'string' && SCRIPT.test(nome) ? ok(nome) : falha('portaoRapido em .claude/pipeline.json tem de ser o nome de um script do package.json');
}

/** As pastas de trabalho como RegExp[] (cada uma casa com o começo do caminho relativo, com "/"). */
export function lerPastas(arquivo = ARQUIVO) {
  const { valor: dados, erro } = lerObjeto(arquivo);
  if (erro !== null) return falha(erro);
  const lista = dados.pastasDeTrabalho;
  if (!Array.isArray(lista) || lista.length === 0 || lista.some((t) => typeof t !== 'string' || t === '')) {
    return falha('pastasDeTrabalho em .claude/pipeline.json tem de ser uma lista de regex (texto), com ao menos uma');
  }
  try {
    return ok(lista.map((t) => new RegExp(t)));
  } catch (e) {
    return falha(`pastasDeTrabalho em .claude/pipeline.json tem uma regex inválida: ${mensagem(e)}`);
  }
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A URL de push que vale: https ou ssh do GitHub para o `dono/repo`, com ou sem .git, sem caixa. */
export const urlDoRepositorio = (repo) => new RegExp(`^(https://github\\.com/|git@github\\.com:)${escapar(repo)}(\\.git)?$`, 'i');
