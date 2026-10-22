// Apoio dos testes (não é teste): monta um projeto numa pasta temporária com os hooks copiados e um pipeline.json
// que o teste escolhe, para o teste não depender do .claude/pipeline.json de verdade.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOKS = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PADRAO = {
  repositorio: 'acme/app',
  portaoRapido: 'checar:rapido',
  pastasDeTrabalho: ['^(apps|packages|src)/[^/]+(?=/)', '^\\.claude/hooks(?=/)'],
};

/** Grava .claude/pipeline.json no projeto: um objeto vira JSON; um texto vai como está. */
export function escreverConfig(projeto, config) {
  mkdirSync(join(projeto, '.claude'), { recursive: true });
  writeFileSync(join(projeto, '.claude', 'pipeline.json'), typeof config === 'string' ? config : JSON.stringify(config, null, 2));
}

/** Copia os hooks (sem testes nem .md) para <projeto>/.claude/hooks e grava o pipeline.json. Devolve a pasta dos hooks copiados. */
export function copiarHooks(projeto, config = CONFIG_PADRAO) {
  const destino = join(projeto, '.claude', 'hooks');
  cpSync(HOOKS, destino, {
    recursive: true,
    filter: (origem) => !/\.test\.mjs$/.test(origem) && !/\.md$/.test(origem) && basename(origem) !== 'teste-apoio.mjs',
  });
  escreverConfig(projeto, config);
  return destino;
}
