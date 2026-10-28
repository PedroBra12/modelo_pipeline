// Guarda de git (hook PreToolUse em Bash e PowerShell).
// O commit passa pelo confere-lgpd.mjs (pre-commit) e pelo confere-docs.mjs (commit-msg), e o push pelo
// confere-push.mjs (pre-push), hooks do git; por isso a guarda nega o --no-verify e mexer no core.hooksPath.
// O push e o PR saem só da pasta do projeto, fora dos worktrees de agente, para o origin; o pre-push confere a URL,
// o push forçado, o que apaga e a main. O PR nasce rascunho (gh pr create só com --draft), o merge é do usuário (o
// gh pr merge é negado) e todo push e toda escrita em PR pedem a confirmação dele. Outro remoto, o token e
// publicar ficam com o usuário. O repositório é o `repositorio` de .claude/pipeline.json: enquanto for o marcador,
// faltar ou for inválido, push, remote add/set-url e escrita em PR são negados (falha fechado).
// Modo em PIPELINE_GUARDA_GIT: "negar" (padrão), "perguntar" ou "desligado".
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIGURE, lerRepositorio, urlDoRepositorio } from './config.mjs';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROGRAMAS = new Set(['git', 'gh', 'glab', 'npm']);
const GIT_OPCOES_COM_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const GIT_LUGAR = /^(-C|--git-dir|--work-tree)(=|$)/; // trocam o repositório do comando
const GIT_PROIBIDOS = new Set(['send-pack', 'send-email', 'subtree', 'credential', 'credential-manager', 'credential-manager-core']); // saem sem o pre-push, ou mostram o token
const GIT_REMOTE_PROIBIDOS = new Set(['add', 'set-url', 'rename']);
const REMOTO = 'origin';
// o que o push pode levar; o resto (--force, --delete, --mirror, --no-verify e os prefixos deles, que o git aceita) é negado
const PUSH_OPCOES = /^(-[uvnq]+|--(set-upstream|dry-run|verbose|quiet|tags|follow-tags|atomic|porcelain|progress|no-progress)|--push-option=.+)$/;
const PUSH_OPCOES_COM_VALOR = new Set(['-o', '--push-option']);
const CONFIG_LEITURA = /^(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)$/;
const CONFIG_ESCRITA = /^(--unset|--unset-all|--add|--replace-all|--remove-section|--rename-section|--edit|-e)$/;
const PR_ESCRITA = new Set(['create', 'edit', 'comment', 'ready', 'review']); // o merge fica de fora: cai na regra geral do gh que escreve
// as opções do gh pr create que levam valor (o valor pode ser "--draft") e as letras curtas que não levam, para ler o -df
const CREATE_COM_VALOR = new Set(['-a', '--assignee', '-B', '--base', '-b', '--body', '-F', '--body-file', '-H', '--head', '-l', '--label', '-m', '--milestone', '-p', '--project', '-r', '--reviewer', '-T', '--template', '-t', '--title']);
const CREATE_CURTAS_SEM_VALOR = 'dfwe';
const FORJA_RECURSOS = new Set(['pr', 'mr', 'issue', 'repo', 'release', 'gist', 'secret', 'variable', 'label', 'workflow', 'run', 'auth', 'alias', 'extension', 'cache', 'project', 'ssh-key', 'gpg-key', 'codespace']);
const FORJA_LEITURA = new Set(['list', 'ls', 'view', 'show', 'status', 'diff', 'checks', 'watch', 'download', 'checkout']);
const NPM_PROIBIDOS = new Set(['publish', 'unpublish', 'deprecate', 'dist-tag']);
const PULA_CONFERENCIA = /^core\.hookspath/i; // o confere-docs, o confere-lgpd e o confere-push rodam como hooks do git: ninguém os desliga por aqui
const DESVIA_REMOTO = /^(remote\.|url\.|alias\.|include(if)?\.|branch\..+\.(push)?remote(=|$))/i; // trocaria o destino do push, o esconderia num apelido, ou traria por um include uma configuração que desvia os hooks
const MUDA_PASTA = /(^|[\s;&|(){}])(cd|chdir|pushd|popd|set-location|sl|push-location|pop-location)(?=[\s;&|)}]|$)/im;
const AMBIENTE = /(^|\W)(GIT|GH)_\w*\s*\+?=/i; // GIT_DIR, GIT_CONFIG_*, GH_REPO, GH_HOST… (no Windows, sem caixa)
// Regra invertida, em qualquer comando (não só no que sobe): a configuração por ambiente (GIT_CONFIG*) desliga os hooks do git, o NODE_OPTIONS
// muda o que o node carrega dentro deles, e a configuração do próprio git (core.hooksPath, .git/config, config.worktree, .git/hooks) os desliga sem
// variável nenhuma. TODA menção de um desses nomes nega, menos no segmento cujo 1º programa só lê (ou só tira a variável) e que não executa nem grava
// nada. Lista de formas de escrever uma variável ou um arquivo nunca fecha (Set-Item Env:\NOME, $env:NOME+=, Set-Content, Rename-Item, read NOME,
// declare -x, printf >> .git/config...), então a lista que fica é a das exceções, que é curta e fechada. Os segmentos se separam por ;, &, &&, ||, | e
// quebra de linha (não pelo & de >&2, 2>&1 e &>), e o que está entre aspas não separa. Perde a exceção o segmento com parêntese ($(, <(, >(, @(, o
// parêntese do PowerShell: executam) e a unidade (o mesmo, sem separar no |) que grava em arquivo: >, >>, tee, Out-File, Set-Content, Add-Content.
const NOME_DE_AMBIENTE = /\b(?:GIT_CONFIG\w*|NODE_OPTIONS)\b/i;
const NOME_DE_ARQUIVO = /\.git[\\/](?:config|hooks)\b|config\.worktree/i;
const NOME_DO_HOOKSPATH = /hookspath/i;
const menciona = (texto) => NOME_DE_AMBIENTE.test(texto) || NOME_DE_ARQUIVO.test(texto) || NOME_DO_HOOKSPATH.test(texto);
const SO_LE = new Set(['grep', 'rg', 'cat', 'echo', 'printenv', 'select-string', 'get-item', 'get-childitem', 'get-content', 'write-output', 'write-host', 'head', 'tail', 'wc', 'cut', 'tr', 'measure-object']);
// awk e sed ficam fora de SO_LE: o sed grava (w) e executa (e), o awk executa pelo pipe e pelo getline. O rg executa o que o --pre e o --hostname-bin apontam.
const RG_EXECUTA = /(^|\s)--(pre|hostname-bin)/i;
const SO_TIRA = new Set(['unset', 'remove-item']);
const GIT_QUE_LE = new Set(['grep', 'log', 'show', 'diff']);
const SEGMENTO_DO_AMBIENTE = /\r?\n|&&|\|\||[;|]|(?<![>&<])&(?![>&])/;
const UNIDADE_DO_AMBIENTE = /\r?\n|&&|\|\||;|(?<![>&<])&(?![>&])/;
// xargs grep/rg só lê; qualquer outro xargs executa o que recebe e fica na lista dos shells
const XARGS_LE = String.raw`xargs(?:\s+-[-\w={}]+(?:\s+(?:\d+|\{\}|'[^']*'|"[^"]*"))?)*\s+(?:grep|rg)(?:\s|$)`;
const SHELL_NA_PONTA = new RegExp(String.raw`(^|[\s;&|(])(sh|bash|zsh|dash|ksh|pwsh|powershell|cmd|iex|invoke-expression|eval|source|xargs(?!${XARGS_LE.slice(5)}))(\.exe)?(\s|$)`, 'i');
const SO_XARGS_LE = new RegExp(String.raw`^\s*${XARGS_LE}`, 'i');
const GRAVA_COM_COMANDO = /(?:^|[\s|])(?:tee|out-file|set-content|add-content)(?=\s|$)/i;
// a mensagem de git commit (-m "texto", --message=texto) é texto, não ordem; entre aspas duplas só vale sem $( nem crase, que executam.
// A forma $(cat <<'EOF' ... EOF) com o delimitador entre aspas simples também é só texto.
// Nenhuma das três formas aceita `\` (no PowerShell ele não escapa a aspa) e o heredoc só aceita espaço entre o delimitador e a quebra de linha.
const ASPAS_DUPLAS = String.raw`"(?:[^"\\$\x60]|\$(?![({]))*"`;
const ASPAS_SIMPLES = String.raw`'[^'\\]*'`;
const HEREDOC_DA_MENSAGEM = String.raw`"\$\(cat\s+<<-?[ \t]*'(?<h>\w+)'[ \t]*\n(?:(?!\n[ \t]*\k<h>[ \t]*\n)[^\\])*\n[ \t]*\k<h>[ \t]*\n\s*\)"`;
const TEXTO_DA_MENSAGEM = `${HEREDOC_DA_MENSAGEM}|${ASPAS_DUPLAS}|${ASPAS_SIMPLES}`;
const COMMIT_COM_MENSAGEM = new RegExp(String.raw`((?<=^|[;&|\n({]\s*)git\b[^;&|\n"']*\bcommit\b)((?:[^;&|\n"']|${TEXTO_DA_MENSAGEM})*)`, 'g');
const OPCAO_DA_MENSAGEM = new RegExp(String.raw`(?<=\s)(-[a-zA-Z]*m|--message)(=|\s*)(?:${TEXTO_DA_MENSAGEM})`, 'g');
const tirarMensagensDeCommit = (t) => t.replace(COMMIT_COM_MENSAGEM, (_, cabeca, resto) => cabeca + resto.replace(OPCAO_DA_MENSAGEM, '$1$2""'));
// o corpo de heredoc que menciona um nome vira o marcador no lugar do <<EOF: o comando que o recebe (cat > .git/config <<EOF) é julgado como quem menciona
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g;
const marcarHeredocs = (t) => t.replace(HEREDOC, (_, _aspa, _delimitador, resto, corpo) => ` ${menciona(corpo) ? 'GIT_CONFIG_HEREDOC' : ''} ${resto}`);
// o que está entre aspas não separa segmentos (grep -E 'A|B'); a aspa que não fecha não protege nada
const protegerAspas = (t) => t.replace(/\\.|"(?:\\.|[^"\\])*"|'[^']*'/g, (m) => (m[0] === '\\' ? m : m.replace(/[;|&\r\n]/g, '\u0000')));
/** O 1º programa do segmento (sem caminho, sem .exe, em minúsculas), ou '' se começa por atribuição, substituição ou outra coisa que não é programa. */
function primeiroPrograma(segmento) {
  const token = segmento.trim().replace(/^[&!({\s]+/, '').split(/\s+/)[0] ?? '';
  return /^[\w.\\/-]+(\.exe)?$/i.test(token) && !token.includes('=') ? nomeDoPrograma(token) : '';
}
/** As opções globais do git, o subcomando e o que vem depois dele. */
function partesDoGit(segmento) {
  const tokens = segmento.trim().replace(/^[&!({\s]+/, '').split(/\s+/).slice(1);
  for (let k = 0; k < tokens.length; k++) {
    if (!tokens[k].startsWith('-')) return { globais: tokens.slice(0, k), sub: tokens[k], depois: tokens.slice(k + 1) };
    if (GIT_OPCOES_COM_VALOR.has(tokens[k])) k++;
  }
  return { globais: tokens, sub: '', depois: [] };
}
// o git aceita o prefixo de uma opção longa (--ext-d é --ext-diff)
const prefixoDe = (token, opcao) => token.startsWith('--') && token.length > 2 && opcao.startsWith(token.slice(2).split('=')[0]);
/** git grep|log|show|diff que só lê: sem configuração por -c nem --config-env, sem programa (--ext-diff, -O) e sem gravar (--output). */
function gitSoLe(segmento) {
  const { globais, sub, depois } = partesDoGit(segmento);
  if (!GIT_QUE_LE.has(sub) || globais.some((t) => t === '-c' || t.startsWith('--config-env'))) return false;
  return !depois.some((t) => /^-O/.test(t) || prefixoDe(t, 'ext-diff') || prefixoDe(t, 'open-files-in-pager') || prefixoDe(t, 'output') || /^--output/.test(t));
}
const gravaEmArquivo = (unidade) => {
  const sem = unidade.replace(/\d*>&(?:\d+|-)/g, ' ').replace(/(?:\d*|&)>>?\s*(?:\/dev\/null|\$null|nul)(?![\w./-])/gi, ' ');
  return sem.includes('>') || GRAVA_COM_COMANDO.test(sem);
};
/** O segmento só lê ou só tira (e não traz atribuição, substituição de comando nem parêntese que façam outra coisa)? */
function soLeOuTira(segmento) {
  if (/[(\x60]|\$\{/.test(segmento)) return false; // $(, <(, >(, @(, o parêntese do PowerShell e a crase executam o que está dentro, e a ${X:=y} atribui
  const programa = primeiroPrograma(segmento);
  if ((programa === 'rg' || programa === 'xargs') && RG_EXECUTA.test(segmento)) return false;
  if (programa === 'xargs') return SO_XARGS_LE.test(segmento);
  if (programa === 'git') {
    // git config com o core.hooksPath só: quem o escreve é negado pelo analisarGit; com o nome do arquivo ou da variável, não
    const soHooksPath = !NOME_DE_AMBIENTE.test(segmento) && !NOME_DE_ARQUIVO.test(segmento);
    return gitSoLe(segmento) || (partesDoGit(segmento).sub === 'config' && soHooksPath);
  }
  if (SO_LE.has(programa) || SO_TIRA.has(programa)) return true;
  // env -u NOME ... sem nenhuma atribuição (env -u NODE_OPTIONS git status): só tira
  return programa === 'env' && /\s(-u|--unset)\b/i.test(segmento) && !/(^|\s)[A-Za-z_]\w*\+?=/.test(segmento);
}
function mudaAmbienteDosHooks(comando) {
  const texto = marcarHeredocs(tirarMensagensDeCommit(comando));
  if (!menciona(texto)) return false;
  // o que a leitura imprime não pode virar ordem: nada de ... | sh / bash / pwsh / iex / eval / xargs, nem de heredoc para um shell, num comando que menciona o nome
  // (o shell se procura no comando sem a máscara da mensagem: o que a máscara esconde não é, por isso, inofensivo)
  if (SHELL_NA_PONTA.test(marcarHeredocs(comando))) return true;
  const protegido = protegerAspas(texto);
  // a unidade (o pipe inteiro) que cita um nome não grava em arquivo, e todo segmento depois do 1º também só lê
  const alemDoPrimeiro = (unidade) => unidade.split('|').slice(1).some((s) => s.trim() !== '' && !soLeOuTira(s));
  if (protegido.split(UNIDADE_DO_AMBIENTE).some((unidade) => menciona(unidade) && (gravaEmArquivo(unidade) || alemDoPrimeiro(unidade)))) return true;
  return protegido.split(SEGMENTO_DO_AMBIENTE).some((segmento) => menciona(segmento) && !soLeOuTira(segmento));
}
// o comando entre aspas que vai para outro shell é lido também; o codificado não se lê, e se nega
const SHELL_ANINHADO = /\b(?:bash|sh|zsh|cmd|pwsh|powershell)(?:\.exe)?\s+(?:-c|-command|\/c|\/k)\s+(["'])((?:(?!\1)[\s\S])*)\1/gi;
const CODIFICADO = /\b(pwsh|powershell)(\.exe)?\s+(-\w+\s+)*-(e|ec|enc|encodedcommand)\b/i;

const tirarHeredocs = (t) => t.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, ' ');
// "C:/Program Files/Git/bin/git.exe" e C:/Program\ Files/... viram só "git" antes de tirar as aspas
const tirarCaminhoDoPrograma = (t) =>
  t.replace(/(["'])(?:[^"']*[\\/])?(git|gh|glab|npm)(?:\.exe|\.cmd)?\1/gi, '$2').replace(/\\ /g, '_');
// "+main" e '--force' são argumentos, não texto: perdem as aspas; o texto com espaço ou separador é apagado,
// e a aspa vazia fica (o "" de core.hooksPath "" é um valor)
const tirarAspas = (t) =>
  t.replace(/(['"])([^'"\s;|&(){}<>]+)\1/g, '$2').replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
const nomeDoPrograma = (t) => t.replace(/^[$({`]+/, '').split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat)$/, '');

const nada = { proibido: null, sobe: false };
const nega = (proibido) => ({ proibido, sobe: false });
const sobe = { proibido: null, sobe: true };

/** Os valores de -X GET, -XGET, -X=GET, --method GET e --method=GET, todas as vezes (o gh usa a última). */
function valoresDaOpcao(tokens, curta, longa) {
  const valores = [];
  for (const [k, t] of tokens.entries()) {
    if (t === curta || t === longa) valores.push(tokens[k + 1] ?? '');
    else if (t.startsWith(`${longa}=`)) valores.push(t.slice(longa.length + 1));
    else if (t.startsWith(curta) && !t.startsWith('--')) valores.push(t.slice(curta.length).replace(/^=/, ''));
  }
  return valores;
}

function motivoDoPush(args) {
  const fora = args.find((t) => t.startsWith('-') && !PUSH_OPCOES.test(t) && !PUSH_OPCOES_COM_VALOR.has(t));
  if (fora !== undefined) return `git push ${fora}`;
  const posicionais = args.filter((t, k) => !t.startsWith('-') && !PUSH_OPCOES_COM_VALOR.has(args[k - 1] ?? ''));
  const [remoto, ...refs] = posicionais;
  if (remoto !== undefined && remoto !== REMOTO) return 'git push para outro remoto';
  if (refs.some((r) => r.startsWith('+') || r.startsWith(':'))) return 'git push forçado ou que apaga';
  return null;
}

function analisarGit(resto, repo) {
  let j = 0;
  let trocaLugar = false;
  while (j < resto.length && resto[j].startsWith('-')) {
    const t = resto[j];
    const valor = /^(-c|--config-env)$/.test(t) ? (resto[j + 1] ?? '') : t.startsWith('--config-env=') ? t.slice(13) : null;
    if (valor !== null && PULA_CONFERENCIA.test(valor)) return nega('git -c core.hooksPath');
    if (valor !== null && DESVIA_REMOTO.test(valor)) return nega('git -c do remoto, de apelido ou de include');
    trocaLugar ||= GIT_LUGAR.test(t);
    j += GIT_OPCOES_COM_VALOR.has(t) ? 2 : 1;
  }
  const sub = resto[j];
  const args = resto.slice(j + 1);
  if (sub !== undefined && GIT_PROIBIDOS.has(sub)) return nega(`git ${sub}`);
  if (sub === 'push') {
    const motivo = motivoDoPush(args) ?? (trocaLugar ? 'git push em outra pasta (-C, --git-dir, --work-tree)' : null);
    if (motivo !== null) return nega(motivo);
    return repo.erro === null ? sobe : nega(repo.erro);
  }
  if (sub === 'config') {
    const posicionais = args.filter((t) => !t.startsWith('-'));
    const leitura =
      args.some((t) => CONFIG_LEITURA.test(t)) ||
      ['get', 'list'].includes(posicionais[0] ?? '') ||
      (posicionais.length === 1 && !args.some((t) => CONFIG_ESCRITA.test(t)));
    const oDoProjeto = args.at(-1) === '.claude/hooks/git' && !args.some((t) => CONFIG_ESCRITA.test(t));
    if (args.some((t) => PULA_CONFERENCIA.test(t)) && !leitura && !oDoProjeto) return nega('git config core.hooksPath');
    const secao = args.findIndex((t) => /^--(remove|rename)-section$/.test(t));
    if (secao !== -1 && /^core(\.|$)/i.test(args[secao + 1] ?? '')) return nega('git config: apagar ou renomear a seção core (leva o core.hooksPath)');
    if (args.some((t) => DESVIA_REMOTO.test(t)) && !leitura) return nega('git config do remoto, de apelido ou de include');
    return nada;
  }
  if (sub === 'commit' && args.some((t) => /^--no-veri/.test(t) || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(t))) {
    return nega('git commit --no-verify');
  }
  if (sub === 'remote') {
    const acao = args.find((t) => !t.startsWith('-'));
    if (acao === undefined || !GIT_REMOTE_PROIBIDOS.has(acao)) return nada;
    const [, nome, url] = args;
    if (acao !== 'rename' && repo.erro !== null) return nega(repo.erro);
    const oDoProjeto = acao !== 'rename' && args.length === 3 && nome === REMOTO && urlDoRepositorio(repo.valor).test(url ?? '') && !trocaLugar;
    return oDoProjeto ? sobe : nega(`git remote ${acao}`);
  }
  return nada;
}

/** O motivo de negar o gh pr create (ou null): precisa de --draft ou -d (sozinho ou colado a outras letras sem valor, como -df). */
function motivoDoDraft(args) {
  let draft = false;
  let invalido = false;
  // o valor do booleano como o gh o lê: 1, t, true (sem caixa) é verdadeiro; 0, f, false, falso; o resto não vale. Vale o último.
  const valor = (v) => {
    if (/^(1|t|true)$/i.test(v)) draft = true;
    else if (/^(0|f|false)$/i.test(v)) draft = false;
    else invalido = true;
  };
  for (const [k, t] of args.entries()) {
    if (CREATE_COM_VALOR.has(args[k - 1] ?? '')) continue; // é o valor da opção anterior
    if (t === '--draft') draft = true;
    else if (t.startsWith('--draft=')) valor(t.slice(8));
    else if (/^-[a-zA-Z]/.test(t) && !t.startsWith('--')) {
      for (const [n, c] of [...t.slice(1)].entries()) {
        if (c === 'd' && t[n + 2] === '=') {
          valor(t.slice(n + 3)); // -d=false
          break;
        }
        if (c === 'd') draft = true;
        if (!CREATE_CURTAS_SEM_VALOR.includes(c)) break; // o resto da palavra é o valor da opção (-Bmain)
      }
    }
  }
  if (invalido) return 'gh pr create com valor de --draft que o gh não lê como booleano';
  return draft ? null : 'gh pr create sem --draft (o PR nasce rascunho)';
}

function analisarForja(programa, resto, repo) {
  const [recurso, verbo] = resto;
  if (recurso?.startsWith('-') && !/^--(help|version)$/.test(recurso)) return nega(`${programa} com opção antes do comando`);
  if (recurso === 'api') {
    const escreve = valoresDaOpcao(resto, '-X', '--method').some((m) => m.toUpperCase() !== 'GET');
    const temCampo = resto.some((t) => /^(-[fF]|--field|--raw-field|--input)/.test(t));
    return escreve || temCampo ? nega(`${programa} api (escrita)`) : nada;
  }
  if (recurso === 'auth' && resto.some((t) => /^(-[a-zA-Z]*t[a-zA-Z]*|--show-token)$/.test(t))) return nega(`${programa} auth com o token`);
  if (programa === 'gh' && recurso === 'pr' && verbo !== undefined && PR_ESCRITA.has(verbo)) {
    if (repo.erro !== null) return nega(repo.erro);
    const doProjeto = repo.valor.toLowerCase();
    const outroRepo = valoresDaOpcao(resto, '-R', '--repo').some((r) => r.toLowerCase() !== doProjeto) || resto.some((t) => /^-[a-zA-Z]+R/.test(t));
    const linkDeFora = resto.some((t) => /github\.com[/:]/i.test(t) && !t.toLowerCase().startsWith(`https://github.com/${doProjeto}/`));
    if (outroRepo || linkDeFora) return nega('gh pr em outro repositório');
    const semDraft = verbo === 'create' ? motivoDoDraft(resto.slice(2)) : null;
    return semDraft === null ? sobe : nega(semDraft);
  }
  if (recurso !== undefined && FORJA_RECURSOS.has(recurso) && verbo !== undefined && !FORJA_LEITURA.has(verbo)) {
    return nega(`${programa} ${recurso} ${verbo}`);
  }
  return nada;
}

// O programa é a 1ª palavra que é git, gh, glab ou npm: xargs, timeout, cmd /c e afins antes dele não o escondem
function analisarSegmento(segmento, repo) {
  const tokens = segmento.trim().split(/\s+/).filter(Boolean);
  const i = tokens.findIndex((t) => PROGRAMAS.has(nomeDoPrograma(t)));
  if (i === -1) return nada;
  const programa = nomeDoPrograma(tokens[i]);
  const resto = tokens.slice(i + 1);
  if (programa === 'git') return analisarGit(resto, repo);
  if (programa === 'npm') return resto[0] !== undefined && NPM_PROIBIDOS.has(resto[0]) ? nega(`npm ${resto[0]}`) : nada;
  return analisarForja(programa, resto, repo);
}

/**
 * O que o comando faz de proibido (ou null) e se ele sobe algo para o GitHub (push, remoto ou PR).
 * `repo` é o resultado de lerRepositorio() ({ valor, erro }); com erro, o que sobe é negado com ele.
 */
export function analisar(comando, repo = lerRepositorio()) {
  const semHeredoc = tirarCaminhoDoPrograma(tirarHeredocs(comando));
  const total = { proibido: CODIFICADO.test(semHeredoc) ? 'comando codificado (-EncodedCommand)' : null, sobe: false };
  for (const [, , dentro] of semHeredoc.matchAll(SHELL_ANINHADO)) {
    const r = analisar(dentro, repo);
    total.proibido ??= r.proibido;
    total.sobe ||= r.sobe;
  }
  const limpo = tirarAspas(semHeredoc);
  for (const segmento of limpo.split(/\r?\n|&&|\|\||[;|&(){}]/)) {
    const r = analisarSegmento(segmento, repo);
    total.proibido ??= r.proibido;
    total.sobe ||= r.sobe;
  }
  if (mudaAmbienteDosHooks(comando)) total.proibido ??= 'menção a GIT_CONFIG_*, NODE_OPTIONS, core.hooksPath, .git/config, config.worktree ou .git/hooks fora de um segmento que só lê (grep, rg, cat, echo, printenv, Select-String, Get-Item, git grep/log/show/diff, head, tail, wc) ou só tira (unset, env -u, Remove-Item), sem parêntese nem gravação em arquivo: desvia os hooks do git';
  if (total.sobe && MUDA_PASTA.test(limpo)) total.proibido ??= 'push ou PR com troca de pasta no comando';
  if (total.sobe && AMBIENTE.test(limpo)) total.proibido ??= 'push ou PR com variável GIT_ ou GH_ no comando';
  return total;
}

// O 1º .git acima do cwd tem de ser o do projeto: um clone ou um worktree dentro dele não serve. O projeto pode ser
// ele mesmo um worktree (com o .git em arquivo): vale, porque os hooks que rodam são os dele.
function foraDoProjeto(cwd) {
  if (typeof cwd !== 'string') return 'push ou PR sem a pasta do comando';
  if (/[\\/]\.claude[\\/]worktrees([\\/]|$)/i.test(cwd)) return 'push ou PR de dentro de um worktree de agente (só o orquestrador sobe)';
  for (let pasta = resolve(cwd); ; pasta = dirname(pasta)) {
    if (existsSync(join(pasta, '.git'))) {
      return relative(PROJETO, pasta) === '' ? null : 'push ou PR fora do repositório do projeto';
    }
    if (dirname(pasta) === pasta) return 'push ou PR fora de um repositório git';
  }
}

// A linha continuada (\ ou `) se lê separada e junta.
const ler = (comando) => {
  const repo = lerRepositorio();
  return [analisar(comando, repo), analisar(comando.replace(/[\\`]\r?\n/g, ' '), repo)];
};

/** Erra para o lado de bloquear: é guarda contra acidente. */
export function avaliarEntrada(comando, cwd) {
  const leituras = ler(comando);
  const proibido = leituras[0].proibido ?? leituras[1].proibido;
  if (proibido !== null) return proibido;
  return leituras.some((r) => r.sobe) ? foraDoProjeto(cwd) : null;
}

const PEDE_CONFIRMACAO = 'confirme o comando: push ou PR';
const PEDE_CONFIRMACAO_ESFORCO = 'confirme o esforço rapido em .claude/estado/esforco (dispensa todos os revisores, o qa e a autoanálise, D64)';
const CAMINHO_ESFORCO = /\.claude[\\/]estado[\\/]esforco(?=$|[\s"';&|><)])/i;
const ESCRITA_ESFORCO_SEGURO = /^\s*(?:mkdir\s+-p\s+["']?\.claude[\\/]estado["']?\s*&&\s*)?(?:printf\s+(?:['"]%s\\n['"]|['"]%s['"])\s+|echo\s+)(?:['"]?(?:medio|alto)['"]?)\s*>\s*["']?\.claude[\\/]estado[\\/]esforco["']?\s*$/i;
const LEITURA_OU_LIMPEZA_ESFORCO = /^\s*(?:cat|head|tail|rm(?:\s+-f)?)\s+["']?\.claude[\\/]estado[\\/]esforco["']?\s*$/i;

/** Pede confirmação quando o comando toca `.claude/estado/esforco` fora da escrita direta de `medio`/`alto` ou leitura/limpeza (D64). */
export function pedeConfirmacaoEsforco(comando) {
  if (typeof comando !== 'string' || !CAMINHO_ESFORCO.test(comando)) return null;
  if (ESCRITA_ESFORCO_SEGURO.test(comando) || LEITURA_OU_LIMPEZA_ESFORCO.test(comando)) return null;
  return PEDE_CONFIRMACAO_ESFORCO;
}

/** deny quando há motivo para negar; ask quando o comando sobe algo (push, remoto, escrita em PR) ou grava `rapido` em `.claude/estado/esforco`; senão null. */
export function decisao(comando, cwd) {
  const motivo = avaliarEntrada(comando, cwd);
  if (motivo !== null) return { decisao: 'deny', motivo };
  if (ler(comando).some((r) => r.sobe)) return { decisao: 'ask', motivo: PEDE_CONFIRMACAO };
  const motivoEsforco = pedeConfirmacaoEsforco(comando);
  if (motivoEsforco !== null) return { decisao: 'ask', motivo: motivoEsforco };
  return { decisao: null, motivo: null };
}

export const avaliar = (comando) => avaliarEntrada(comando, PROJETO);

function decidir(decisao, motivo, soConfirma = false) {
  // a falta de repositório configurado é só o aviso para configurar, sem o texto do "peça para ele rodar com !"
  const curto = soConfirma || motivo.startsWith(CONFIGURE);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decisao,
      permissionDecisionReason: curto
        ? `Guarda de git do projeto: ${motivo}.`
        : `Guarda de git do projeto: "${motivo}" passa pelo usuário. O push e o PR saem só da pasta do projeto para o origin ` +
        '(o repositório de .claude/pipeline.json), sem forçar nem apagar; o PR nasce rascunho (gh pr create --draft), o merge é do ' +
        'usuário, e todo push e todo PR pedem a confirmação dele; outro remoto, o token e publicar ficam com ele. ' +
        'Se o usuário pediu explicitamente, peça para ele rodar o comando com "!" no prompt.',
    },
  }));
}

async function principal() {
  const modo = process.env.PIPELINE_GUARDA_GIT ?? 'negar';
  if (modo === 'desligado') return;
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let comando;
  let cwd;
  try {
    const dados = JSON.parse(entrada);
    comando = dados.tool_input?.command;
    cwd = dados.cwd;
  } catch {
    comando = undefined;
  }
  if (typeof comando !== 'string') return decidir('deny', 'comando ilegível pela guarda');
  const { decisao: veredito, motivo } = decisao(comando, cwd);
  if (veredito === 'ask') decidir('ask', motivo, true);
  // sem repositório configurado não há o que confirmar: o modo perguntar não vale para essa recusa
  else if (veredito === 'deny') decidir(modo === 'perguntar' && !motivo.startsWith(CONFIGURE) ? 'ask' : 'deny', motivo);
}

const mesmoArquivo = (a, b) => {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};

if (process.argv[1] !== undefined && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) await principal();
