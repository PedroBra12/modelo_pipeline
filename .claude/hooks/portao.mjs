// Hook Stop: se houve código alterado (marca-alterado.mjs) e o portão rápido existe no package.json,
// roda `npm run <portaoRapido>` (o nome vem de .claude/pipeline.json; o padrão é checar:rapido).
// Vermelho: devolve o erro para o Claude corrigir antes de encerrar.
// Verde: pede uma vez a revisão do pipeline (skill pipeline) e depois libera.
// Sem o script no package.json, não faz nada. Com o pipeline.json ilegível, só avisa: o portão nunca bloqueia por isso.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerPortao } from './config.mjs';

const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const estado = join(raiz, '.claude', 'estado');
const listaAlterados = join(estado, 'alterados.txt');
const revisaoPedida = join(estado, 'revisao-pedida');
const responder = (saida) => process.stdout.write(JSON.stringify(saida));

let entrada = '';
for await (const pedaco of process.stdin) entrada += pedaco;
let continuandoPorHook = false;
try {
  continuandoPorHook = JSON.parse(entrada || '{}').stop_hook_active === true;
} catch {
  continuandoPorHook = false;
}

const alterados = existsSync(listaAlterados)
  ? readFileSync(listaAlterados, 'utf8').split('\n').filter((l) => l !== '')
  : [];

/** O package.json tem o script? Arquivo ausente ou ilegível = não tem. */
function temScript(nome) {
  try {
    return JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts?.[nome] !== undefined;
  } catch {
    return false;
  }
}

if (alterados.length > 0) {
  const { valor: nome, erro } = lerPortao(join(raiz, '.claude', 'pipeline.json'));
  if (erro !== null) {
    responder({ systemMessage: `Portão rápido não rodou: ${erro}.` });
  } else if (temScript(nome)) {
    // o nome passou pela validação do config.mjs (só letras, dígitos, "_", ":", "." e "-"); shell só para achar o npm.cmd no Windows
    const r = spawnSync(`npm run -s ${nome}`, { cwd: raiz, encoding: 'utf8', shell: true, timeout: 170_000 });
    const verde = r.error === undefined && r.status === 0;
    const saida = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`.trim().split('\n').slice(-60).join('\n');

    if (!verde && continuandoPorHook) {
      responder({ systemMessage: `Portão rápido ainda vermelho (npm run ${nome}). Veja a saída antes de seguir.` });
    } else if (!verde) {
      responder({
        decision: 'block',
        reason: `Portão rápido vermelho: \`npm run ${nome}\` falhou. Corrija antes de encerrar (skill pipeline).\n\n${saida}`,
      });
    } else if (!existsSync(revisaoPedida)) {
      // vale também na parada que segue um bloqueio vermelho: o marcador garante que o pedido sai uma vez só
      writeFileSync(revisaoPedida, '');
      responder({
        decision: 'block',
        reason:
          `Portão rápido verde. Falta a revisão do pipeline (skill pipeline) para: ${alterados.join(', ')}. ` +
          'Rode os revisores, ou diga em uma linha por que a mudança é trivial, e encerre.',
      });
    } else {
      rmSync(listaAlterados, { force: true });
      rmSync(revisaoPedida, { force: true });
    }
  }
}
