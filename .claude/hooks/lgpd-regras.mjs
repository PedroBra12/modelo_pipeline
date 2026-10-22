// Regras do confere-lgpd. Vêm do otto (metricasboss/otto, MIT; .claude/skills/ORIGEM.md),
// com o artigo certo da LGPD, sem regra presa a um projeto ou a uma arquitetura. Cada regra traz o que ela pega e o que deixa passar; o teste confere todos.
// Este arquivo fica fora da varredura: os exemplos violam de propósito. "<cpf>" vira um CPF válido só na hora do teste,
// para nenhum CPF válido ficar escrito.
// - nivel: "critico" e "alto" bloqueiam (no Edit/Write e no commit); "medio" só avisa.
// - arquivos: "todos" (inclusive teste, semente e .md), "codigo" (fora os testes), "sql" ou "config" (.env*, YAML,
//   TOML, scripts de shell e .http, inclusive os de teste).
// - regex: confere o conteúdo; caminho: confere só o nome do arquivo; binario: vale só para arquivo binário que não
//   seja dos tipos do "fora". Nas duas últimas, os exemplos são caminhos.
// - fora: os caminhos onde a regra não vale. validador: confere o trecho achado (confere-lgpd.mjs).
// - semSupressao: o achado não se suprime, porque a correção é sempre a mesma (gerar o dado, tirar a chave).
// - maiusculas: a regex distingue maiúscula de minúscula.
// Hash e HMAC não são anonimização (Art. 12): nenhuma regra se cala por eles.
// Cada coluna e cada campo é um achado próprio (o contexto vai num lookbehind): suprimir um não esconde o vizinho.

const LOG = String.raw`\b(console|logger|log)\.\w+\(`;
const NA_LINHA = String.raw`[^\n;]{0,500}?`; // o resto da instrução, na mesma linha (passa do ")" de um mascarar(...))
const MASCARADO = String.raw`(?<!\b(mascar|mask|redig|redact|sanitiz|anon[iy]mi)\w*\(\s*[\w.]*)`; // o campo dentro de mascarar(...)
const PESSOA = String.raw`(user|usuario|contato|ficha|pessoa|titular|cliente|lead|membro)s?`;
const CAMPO = String.raw`(cpf|e_?mail|celular|telefone|documento|nascimento|(contato|ficha|pessoa|titular|lead|cliente)\.nome)`;
const COLUNA = String.raw`((cpf|documento|celular|telefone|e_?mail|nascimento|data_nascimento|endereco|sobrenome|nome_completo|apelido|whatsapp|instagram)(?!_(hmac|cifrad|id\b|verificad|confirmad))\w*|rg|cep)`;
const CAMPO_DA_IA = String.raw`(cpf|documento|celular|telefone|e_?mail|nascimento|ficha|historico|nome|observac\w*|nota|notas|conversa\w*)`;
const SENSIVEL = String.raw`(saude\w*|diagnostic\w*|cid(_?10)?|prontuario\w*|alergi\w*|medicament\w*|gestante|gestacao|gravidez|tipo_sanguineo|hiv|soropositiv\w*|convenio_medico|plano_de_saude|pcd|deficienc\w*|biometri\w*|impressao_digital|reconhecimento_facial|religi\w*|etnia|raca|cor_da_pele|orientacao_sexual|vida_sexual|sindicat\w*|filiacao_(sindical|partidaria|religiosa)|partido_politico|opiniao_politica|genetic\w*|genom\w*)`;
const CONSENTE = String.raw`\w*(consent|opt_?in|aceite|aceita|marketing|promoc|newsletter|permite_?contato)\w*`;
const NA_INSTRUCAO = String.raw`(?:(?!;)[\s\S])`; // até o fim da instrução (o comentário SQL já virou espaço)
const CRIA = String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?`;
const ALTERA = String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?`;
const ADD = String.raw`\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?`;
const NAO_E_TIPO = String.raw`(?!(is|in|not|and|or|between|like)\b)`; // "check (documento is not null)" não é coluna
const IMPORTA = String.raw`\b(from\s+|require\(\s*|import\(\s*)["']`; // import, require e import(); o package.json vai por "nome":
const TELEMETRIA = String.raw`@sentry/[\w-]+|dd-trace|@datadog/[\w-]+|logrocket|@fullstory/[\w-]+|@microsoft/clarity|@hotjar/[\w-]+|posthog-js|posthog-node|mixpanel(-browser)?|@amplitude/[\w-]+`;
const VALOR_DE_SEGREDO = String.raw`["'\`](?=[^"'\`\n]*\d)(?!/)`; // abre o valor: tem um dígito e não é uma rota

/** Coluna que casa com `coluna`, dentro de uma instrução que casa com `instrucao` (o que vem antes dela). */
const colunaEm = (instrucao, coluna, depois) =>
  String.raw`(?=\b` + coluna + String.raw`"?\s)(?<=` + instrucao + String.raw`)` + coluna + depois;

export const REGRAS = [
  // Dado literal: vale em todo arquivo, inclusive teste, semente e documentação
  {
    id: 'cpf_literal', nivel: 'critico', arquivos: 'todos', validador: 'cpf', semSupressao: true,
    regex: String.raw`\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b`,
    artigo: 'LGPD Art. 5º, I',
    problema: 'CPF válido escrito no arquivo; qualquer CPF válido pode ser de alguém',
    correcao: 'gere o CPF na hora do teste (com um gerador) e não o escreva em arquivo',
    pega: [`const cpf = '<cpf>';`],
    passa: [`const cpf = '123.456.789-00';`, `const cpf = gerarCpf();`],
  },
  {
    id: 'rg_literal', nivel: 'alto', arquivos: 'todos',
    regex: String.raw`\b\d{1,2}\.\d{3}\.\d{3}-[0-9x]\b`,
    artigo: 'LGPD Art. 5º, I',
    problema: 'RG escrito no arquivo',
    correcao: 'gere o documento na hora do teste; o de verdade só existe no banco, cifrado',
    pega: [`rg: '00.000.000-0'`],
    passa: [`versao: '1.2.3-4'`, `rg: gerarRg()`],
  },
  {
    id: 'telefone_literal', nivel: 'alto', arquivos: 'todos', validador: 'ddd',
    regex: String.raw`\(\d{2}\)\s?9?\s?\d{4}[\s-]?\d{4}\b|\+55\s?\(?\d{2}\)?\s?9?\s?\d{4}[\s-]?\d{4}\b|\b55\d{2}9\d{8}\b|\b\d{2}9\d{8}\b|\b\d{2}\s9\d{4}-\d{4}\b`,
    artigo: 'LGPD Art. 5º, I',
    problema: 'telefone com DDD que existe escrito no arquivo',
    correcao: 'gere o número na hora do teste, ou use um DDD que não existe, como o 20',
    pega: [`celular: '(62) 90000-0000'`, `to: '5562900000000'`, `'+55 62 90000-0000'`, `celular: '62900000000'`, `celular: '(62) 9 0000-0000'`],
    passa: [`celular: '(20) 90000-0000'`, `to: '5520900000000'`, `celular: '20900000000'`, `const total = 6290000000;`],
  },
  {
    id: 'email_literal', nivel: 'alto', arquivos: 'todos', validador: 'email_real',
    regex: String.raw`\b[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b`,
    artigo: 'LGPD Art. 5º, I',
    problema: 'e-mail de domínio que existe escrito no arquivo',
    correcao: 'use um domínio reservado: example.com, .test ou .invalid',
    pega: [`email: 'ana.souza@lojaficticia.com.br'`],
    passa: [`email: 'ana.souza@example.com'`, `email: 'ana@loja.test'`, `import x from 'react@18.3.1';`, `git clone git@github.com:org/repo.git`],
  },
  {
    id: 'cartao_literal', nivel: 'critico', arquivos: 'todos', validador: 'luhn', semSupressao: true,
    regex: String.raw`\b[3-6]\d{3}([ -]?)\d{4}\1\d{4}\1\d{2,4}\b`,
    artigo: 'LGPD Art. 46',
    problema: 'número de cartão escrito no arquivo',
    correcao: 'cartão não entra no repositório; no teste, gere na hora',
    pega: [`cartao: '4111 1111 1111 1111'`],
    passa: [`cartao: '4111 1111 1111 1112'`],
  },
  {
    id: 'chave_conhecida', nivel: 'critico', arquivos: 'todos', semSupressao: true, maiusculas: true,
    regex: String.raw`\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|\bsk-(ant-)?[A-Za-z0-9_-]{32,}|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abpors]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b|\bEAA[A-Za-z0-9]{40,}`,
    artigo: 'LGPD Art. 46',
    problema: 'chave de API ou token de serviço escrito no arquivo',
    correcao: 'tire a chave, troque-a no serviço e leia de variável de ambiente ou de arquivo de ambiente fora do repositório',
    pega: [`const chave = 'sk_test_0000000000000000';`, `id: AKIA0000000000000000`],
    passa: [`const chave = process.env.CHAVE_DO_SERVICO;`, `image: postgres:17@sha256:eaa0000000000000000000000000000000000000000000000000000000000000`],
  },
  {
    id: 'chave_privada', nivel: 'critico', arquivos: 'todos', semSupressao: true,
    regex: String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----`,
    artigo: 'LGPD Art. 46',
    problema: 'chave privada escrita no arquivo',
    correcao: 'tire a chave, troque-a e gere a do teste na hora',
    pega: ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----'],
    passa: ['-----BEGIN PUBLIC KEY-----'],
  },
  {
    id: 'segredo_em_config', nivel: 'critico', arquivos: 'config',
    regex: String.raw`^\s*(export\s+)?[\w.-]*(password|passwd|senha|secret|segredo|token|chave|api_?key|private_?key)[\w.-]*\s*[=:]\s*(?!["'\`]?\s*$)(?![\$<{])["'\`]?[^\s#"'\`$<{]{4,}`,
    artigo: 'LGPD Art. 46',
    problema: 'senha, chave ou token escrito num arquivo de configuração',
    correcao: 'no .env.example, deixe vazio ou com <preencha>; o valor fica num arquivo de ambiente fora do repositório',
    pega: ['POSTGRES_PASSWORD: app123', 'CHAVE_DE_CIFRA=abcdefghij0123456789', 'export API_KEY="0123456789abcdef"'],
    passa: ['POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}', 'CHAVE_DE_CIFRA=', 'CHAVE_DE_CIFRA=<preencha>', 'PORTA_API=4100'],
  },
  {
    id: 'arquivo_de_dados', nivel: 'alto', arquivos: 'todos',
    caminho: String.raw`\.(xlsx|xlsm|xls|ods|numbers|sqlite3?|db|dump|bak|backup|parquet|zip|7z|rar|gz|tgz|pdf)$`,
    artigo: 'LGPD Art. 46',
    problema: 'planilha, banco, backup, pacote ou PDF no repositório: o conteúdo não se confere, e pode ser a base de clientes',
    correcao: 'o teste gera o arquivo na hora, a partir de dado inventado em texto; o arquivo de dados não entra no repositório',
    pega: ['docs/base-de-clientes.xlsx', 'local/copia.dump'],
    passa: ['docs/arquitetura.md', 'src/simulador.ts'],
  },
  {
    id: 'imagem_no_repositorio', nivel: 'medio', arquivos: 'todos',
    caminho: String.raw`\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$`,
    artigo: 'LGPD Art. 46',
    problema: 'imagem no repositório; um print de tela pode mostrar cliente de verdade',
    correcao: 'confira que a imagem não mostra pessoa nem dado de pessoa',
    pega: ['docs/print-da-tela.png'],
    passa: ['public/icone.svg'],
  },
  {
    id: 'binario_desconhecido', nivel: 'alto', arquivos: 'todos', binario: true,
    fora: String.raw`\.(png|jpe?g|gif|webp|heic|bmp|tiff?|ico|woff2?|ttf|otf|eot|mp4|webm|xlsx|xlsm|xls|ods|numbers|sqlite3?|db|dump|bak|backup|parquet|zip|7z|rar|gz|tgz|pdf)$`,
    artigo: 'LGPD Art. 46',
    problema: 'arquivo binário de tipo desconhecido (ou texto em UTF-16 sem BOM): o conteúdo não se confere',
    correcao: 'grave em texto UTF-8, ou gere o arquivo na hora do teste; se é um tipo de binário que o projeto usa, ponha a extensão no "fora" desta regra',
    pega: ['local/semente.dat'],
    passa: ['apps/web/public/logo.png'],
  },

  // Segredo no código (fora os testes)
  {
    id: 'senha_literal', nivel: 'critico', arquivos: 'codigo',
    regex: String.raw`\b\w*(password|passwd|senha)\w*["'\`]?\s*[:=]\s*` + VALOR_DE_SEGREDO + String.raw`[^"'\`\s]{4,}["'\`]`,
    artigo: 'LGPD Art. 46',
    problema: 'senha escrita no código',
    correcao: 'leia de variável de ambiente; senha de usuário só com hash',
    pega: [`const senhaAdmin = 'Trocar123';`, `{ "senha": "Trocar123" }`],
    passa: [`const senhaAdmin = process.env.SENHA_ADMIN;`, `{ senha: 'muito curta' }`, `const ROTA_TROCAR_SENHA = '/v1/eu/senha';`, `const erroSenha = 'senha_fraca';`],
  },
  {
    id: 'segredo_literal', nivel: 'critico', arquivos: 'codigo',
    regex: String.raw`\b\w*(api_?key|api_?secret|client_?secret|secret|segredo|token|chave)\w*["'\`]?\s*[:=]\s*` + VALOR_DE_SEGREDO + String.raw`[a-z0-9_\-+/=]{20,}["'\`]`,
    artigo: 'LGPD Art. 46',
    problema: 'chave, token ou segredo escrito no código',
    correcao: 'leia de variável de ambiente ou de arquivo de ambiente fora do repositório',
    pega: [`const tokenDaMeta = 'abcdefghij0123456789xyz';`, `{ "apiKey": "abcdefghij0123456789xyzABCDEF" }`, `{ 'client_secret': 'abcdefghij0123456789xyz' }`],
    passa: [`const tokenDaMeta = process.env.TOKEN_META;`, `const chave = 'contatos.celular:ler';`, `const chaveDoCache = 'contatos/busca/por-conta';`, `const chaveDoServico = 'APP_CHAVE_DE_ACESSO';`],
  },
  {
    id: 'jwt_literal', nivel: 'alto', arquivos: 'todos',
    regex: String.raw`\beyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}`,
    artigo: 'LGPD Art. 46',
    problema: 'JWT escrito no arquivo; o token carrega a identidade de alguém',
    correcao: 'gere o token na hora, com chave de teste',
    pega: [`const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJhZGV0ZXN0ZQ';`],
    passa: [`const t = assinar({ sub: id });`],
  },

  // Log, erro e URL
  {
    id: 'log_do_corpo', nivel: 'critico', arquivos: 'codigo',
    regex: LOG + NA_LINHA + MASCARADO + String.raw`\b(req|request|pedido)\.(body|corpo)\b`,
    artigo: 'LGPD Arts. 6º, III e 46',
    problema: 'o corpo do pedido vai inteiro para o log, com o que o titular mandou',
    correcao: 'logue a rota, o id e o status; o corpo, nunca',
    pega: [`logger.info('pedido recebido', req.body);`, `console.log(JSON.stringify(pedido.corpo));`, `logger.info('hash conferido', req.body);`],
    passa: [`logger.info('pedido recebido', { rota: req.path });`, `logger.info(mascarar(req.body));`],
  },
  {
    id: 'log_de_objeto_pessoal', nivel: 'alto', arquivos: 'codigo',
    regex: LOG + NA_LINHA + MASCARADO + String.raw`\b` + PESSOA + String.raw`\b(?:\s*[,)}]|\.(?!\w*id\b)[a-z_]\w*)`,
    artigo: 'LGPD Arts. 6º, III e 46',
    problema: 'objeto de uma pessoa (contato, ficha, lead, usuário) indo para o log',
    correcao: 'logue só o id (um pseudônimo, o mínimo aceito): logger.info("contato criado", { id: contato.id })',
    pega: [`logger.info(contato);`, `console.log('achou', { contato });`, `logger.warn('falhou', user.email);`, `logger.info('falhou hash', contato);`],
    passa: [`logger.info('contato criado', { id: contato.id });`, "logger.info(`contato ${contato.id} sem linha`);", `catalog.info(contato);`, `logger.info('sem unidade', contato.organizacaoId);`],
  },
  {
    id: 'log_de_campo_pessoal', nivel: 'alto', arquivos: 'codigo',
    regex: LOG + String.raw`(` + NA_LINHA + String.raw`\$\{[^}\n]*?` + MASCARADO + String.raw`\b` + CAMPO + String.raw`\b[^}\n]*\}|(` + NA_LINHA + String.raw`[(,{:])?\s*[\w.]*` + MASCARADO + String.raw`\b` + CAMPO + String.raw`\s*[,)}])`,
    artigo: 'LGPD Arts. 6º, III e 46',
    problema: 'campo pessoal (CPF, e-mail, celular, nascimento, nome do contato) indo para o log',
    correcao: 'logue o id; se precisar do campo, mascarado por uma função de mascarar',
    pega: ["logger.info(`enviado para ${contato.celular}`);", `logger.info('login', { email: pessoa.email });`, `console.log(cpf);`, "logger.info(`hash de ${contato.email}`);", `logger.info('x', { celular: mascarar(contato.celular), email: contato.email });`],
    passa: [`logger.info('e-mail inválido', { campo: 'email' });`, "logger.info(`enviado para ${mascarar(contato.celular)}`);", `logger.info({ temEmail: true });`, "log.info(`API ouvindo em ${endereco}`);"],
  },
  {
    id: 'log_de_ip', nivel: 'medio', arquivos: 'codigo',
    regex: String.raw`^(?!.*\b(anon[iy]mi|mascar|mask)\w*\s*\().*` + LOG + String.raw`[^)\n]*(\b(req|request|pedido)\.ip\b|remote_?addr|x-forwarded-for)`,
    artigo: 'LGPD Arts. 5º, I e 7º, II; Marco Civil (Lei 12.965/14), Art. 15',
    problema: 'IP no log comum',
    correcao: 'IP só no registro de acesso, que o Marco Civil obriga a guardar por 6 meses, com acesso restrito e apagado depois; no log comum, anonimizado: anonimizarIp(req.ip)',
    pega: [`logger.info('acesso', req.ip);`],
    passa: [`logger.info('acesso', anonimizarIp(req.ip));`],
  },
  {
    id: 'pii_em_erro', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`(\bnew\s+\w*(error|erro)\w*|\berro\w*)\s*\(` + NA_LINHA + String.raw`(\$\{[^}\n]*?` + MASCARADO + String.raw`\b` + CAMPO + String.raw`\b[^}\n]*\}|\+\s*[\w.]*` + MASCARADO + String.raw`\b` + CAMPO + ')',
    artigo: 'LGPD Art. 46',
    problema: 'campo pessoal na mensagem de erro, que vai para log e tela',
    correcao: 'ponha só o id no erro: `contato ${contato.id} não achado`',
    pega: ["throw new Error(`contato não achado: ${contato.email}`);", `return erro('duplicado: ' + ficha.cpf);`],
    passa: ["throw new Error(`contato ${contato.id} não achado`);", `return erro('e-mail inválido');`, "throw new Error(`duplicado: ${mascarar(contato.email)}`);"],
  },
  {
    id: 'pii_na_url', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`[?&](cpf|e_?mail|telefone|celular|phone|rg|documento|nascimento)=|/:(cpf|e_?mail|celular|telefone|documento)\b|/\{(cpf|e_?mail|celular|telefone|documento)\}`,
    artigo: 'LGPD Art. 46',
    problema: 'dado pessoal na URL, que fica no log do servidor, no proxy e no histórico',
    correcao: 'mande no corpo de um POST, e a rota de busca pelo índice cego',
    pega: ["fetch(`/v1/contatos?email=${email}`)", `rota.get('/v1/contatos/por-celular/:celular', ler)`],
    passa: [`rota.post('/v1/contatos/busca', buscar)`, `rota.get('/v1/contatos/:contatoId', ler)`],
  },

  // Banco (e Art. 11)
  {
    id: 'select_estrela_pessoal', nivel: 'medio', arquivos: 'codigo',
    regex: String.raw`\bselect\s+\*\s+from\s+("?\w+"?\.)?"?(contatos|fichas?|pessoas|usuarios|users|clientes|customers|leads|membros)\b|selectFrom\(\s*["'\`]([\w.]+\.)?(contatos|fichas?|pessoas|usuarios|users|clientes|customers|leads|membros)["'\`]\s*\)` + NA_INSTRUCAO + String.raw`{0,200}?\.selectAll\(\s*\)`,
    artigo: 'LGPD Art. 6º, III (necessidade)',
    problema: 'select * numa tabela de pessoas traz mais do que a finalidade pede',
    correcao: 'liste só as colunas que esta rota usa',
    pega: [`select * from contatos.contatos where id = $1`, `db.selectFrom('contatos.leads').selectAll()`],
    passa: [`select id, nome from contatos.contatos where id = $1`, `select count(*) from contatos.contatos`],
  },
  {
    id: 'coluna_pessoal_em_tabela', nivel: 'medio', arquivos: 'sql',
    regex:
      colunaEm(CRIA + String.raw`[\w."]+\s*\(` + NA_INSTRUCAO + String.raw`*[(,\n]\s*"?`, COLUNA, String.raw`"?\s+` + NAO_E_TIPO + String.raw`\w`) + '|' +
      colunaEm(ALTERA + String.raw`[\w."]+` + NA_INSTRUCAO + String.raw`*` + ADD, COLUNA, String.raw`"?\s+\w`),
    artigo: 'LGPD Arts. 6º, III e 46',
    problema: 'coluna de dado pessoal (documento, celular, e-mail, nascimento, endereço) numa tabela',
    correcao: 'confirme que é preciso guardar o campo (finalidade e necessidade), que ele fica cifrado ou com acesso restrito e que há prazo de retenção; se o dado é de empresa e não de pessoa, suprima dizendo de quem é',
    pega: [
      'create table app.leads (\n  id uuid not null,\n  celular text\n);',
      'alter table app.leads add column email text;',
      'create table app.pedidos (\n  id uuid not null,\n  endereco_entrega text\n);',
      'create table app.leads (id uuid not null, cpf_cnpj text);',
      'alter table app.leads add column origem text, add column celular text;',
      'create table app.leads (\n  id uuid not null, -- dono; nunca nulo\n  celular text\n);',
    ],
    passa: [
      'create table app.contatos (\n  id uuid not null,\n  email_hmac bytea,\n  email_verificado boolean\n);',
      'create table app.leads (\n  id uuid not null\n);\ncreate index on app.leads (id);',
    ],
  },
  {
    id: 'dado_sensivel_em_tabela', nivel: 'alto', arquivos: 'sql',
    regex: String.raw`(?:^|[(,]|` + ADD + String.raw`)\s*"?` + SENSIVEL + String.raw`"?\s+(text|varchar|character|char|citext|bytea|jsonb?|boolean|smallint|integer|int\d?|bigint|numeric|date|timestamptz|timestamp|uuid)\b`,
    artigo: 'LGPD Arts. 5º, II e 11',
    problema: 'dado sensível (saúde, gestação, biometria, religião, origem, opinião política, filiação, vida sexual, genético) numa tabela',
    correcao: 'pede a base legal do Art. 11 (legítimo interesse não vale), acesso restrito e cifra; se o campo não é dado de pessoa, suprima dizendo o que ele é',
    pega: ['create table app.atendimentos (\n  id uuid not null,\n  diagnostico text\n);', '  gestante boolean,', 'alter table app.atendimentos add column if not exists diagnostico text;'],
    passa: ['create table app.atendimentos (\n  id uuid not null,\n  sala text\n);', '  filiacao_mae text,'],
  },
  {
    id: 'campo_sensivel_no_codigo', nivel: 'medio', arquivos: 'codigo',
    regex: String.raw`\b` + SENSIVEL + String.raw`"?\s*[:=]`,
    artigo: 'LGPD Arts. 5º, II e 11',
    problema: 'campo de dado sensível no código',
    correcao: 'confira a base legal do Art. 11, quem acessa e onde ele é guardado',
    pega: [`const ficha = { diagnostico: entrada.diagnostico };`],
    passa: [`const ficha = { observacao: entrada.observacao };`],
  },
  {
    id: 'sql_concatenado', nivel: 'critico', arquivos: 'codigo',
    regex: String.raw`\bsql\.raw\(\s*(\`[^\`]*\$\{|["'][^"']*["']\s*\+)|\.(query|execute|unsafe)\(\s*(\`[^\`]*\$\{|["'][^"']*["']\s*\+)`,
    artigo: 'LGPD Art. 46',
    problema: 'SQL montado com texto de fora: injeção expõe a base inteira',
    correcao: 'parâmetro ($1) ou o sql`` do query builder, nunca concatenação nem sql.raw',
    pega: ["await pool.query(`select id from contatos.contatos where nome = '${nome}'`);", `sql.raw('select ' + coluna)`],
    passa: [`await pool.query('select id from contatos.contatos where nome = $1', [nome]);`, "sql`select id from contatos.contatos where nome = ${nome}`"],
  },

  // Terceiros, IA e consentimento
  {
    id: 'pii_para_ia', nivel: 'critico', arquivos: 'codigo',
    regex: String.raw`(?=\b` + CAMPO_DA_IA + String.raw`\b)(?<=\b(provedor_?ia|ia|llm)\.\w+\s*\(` + NA_INSTRUCAO + String.raw`{0,400})\b` + CAMPO_DA_IA + String.raw`\b`,
    artigo: 'LGPD Arts. 6º, I a III, 33 e 39',
    problema: 'dado pessoal, nota ou histórico ligado a um contato indo para a IA',
    correcao: 'só com base legal, contrato com o operador da IA e política do projeto que permita esse dado; sem isso, só um marcador como {primeiro_nome}',
    pega: ['await ia.escrever({\n  modelo,\n  celular: contato.celular,\n});', 'await llm.escrever({ nome: contato.nome, nota: contato.observacao });', 'await deps.ia.sugerirMensagem({ celular });'],
    passa: ["await ia.escrever({\n  modelo,\n  marcador: '{primeiro_nome}',\n});", `const ia = criarClienteIA({ nome: 'falso' });`, `constructor(ia: ClienteIA, conversas: Conversas) {}`],
  },
  {
    id: 'telemetria_de_fora', nivel: 'medio', arquivos: 'codigo',
    regex: IMPORTA + String.raw`(` + TELEMETRIA + String.raw`)["']|"(` + TELEMETRIA + String.raw`)"\s*:|\b(static\.hotjar\.com|clarity\.ms|fullstory\.com|cdn\.logrocket\.io)\b`,
    artigo: 'LGPD Arts. 33, 39 e 46',
    problema: 'telemetria, gravação de sessão ou analytics de fora: leva o pedido e a tela, com dado pessoal, para fora do Brasil',
    correcao: 'tire o dado pessoal antes de sair e registre o fornecedor como operador (contrato e transferência internacional); se já está acertado, suprima dizendo isso',
    pega: [`import * as Sentry from '@sentry/node';`, `"logrocket": "^8.0.0",`],
    passa: [`import { registrar } from './registro';`],
  },
  {
    id: 'analytics_com_pii', nivel: 'critico', arquivos: 'codigo',
    regex: String.raw`\b(gtag|dataLayer\.push|analytics\.(track|identify|page)|mixpanel\.(track|identify|people\.set)|amplitude\.(track|logEvent|setUserId)|posthog\.(capture|identify)|fbq|ttq\.(track|identify))\s*\(` + NA_INSTRUCAO + String.raw`{0,300}?\b(cpf|e_?mail|celular|telefone|phone|nome|name|documento|nascimento)\b`,
    artigo: 'LGPD Arts. 6º, III, 7º, § 5º, 8º e 33',
    problema: 'dado pessoal mandado para ferramenta de analytics ou de anúncio',
    correcao: 'só evento sem PII, com consentimento para essa finalidade; nunca e-mail, celular ou nome, nem em hash',
    pega: [`gtag('event', 'login', { email: contato.email });`, `fbq('track', 'Lead', { em: hash(contato.email) });`],
    passa: [`gtag('event', 'login', { metodo: 'senha' });`],
  },
  {
    id: 'webhook_de_terceiro', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`hooks\.slack\.com|discord(app)?\.com/api/webhooks|api\.telegram\.org/bot|hooks\.zapier\.com|webhook\.site|pipedream\.net|requestbin`,
    artigo: 'LGPD Arts. 33, 39 e 46',
    problema: 'webhook de terceiro no código; o dado pessoal pode sair por ele',
    correcao: 'o endereço do webhook é configuração (variável de ambiente), com destino conferido; nunca um endereço no código',
    pega: [`const destino = 'https://hooks.slack.com/services/T0/B0/X0';`],
    passa: [`const destino = config.webhookDeSaida;`],
  },
  {
    id: 'envio_externo_com_pessoa', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`\b(axios\.(post|put|patch)|fetch|got\.(post|put|patch)|ky\.(post|put|patch))\s*\((?!\s*["'\`]/)` + NA_INSTRUCAO + String.raw`{0,300}?\b(user|usuario|contato|ficha|pessoa|cpf|e_?mail|celular|telefone)\b`,
    artigo: 'LGPD Arts. 33, 39 e 46',
    problema: 'dado de uma pessoa saindo por HTTP para fora, sem a conferência do destino',
    correcao: 'mande só o mínimo de campos, para um destino conferido e com base legal; pseudonimizado (hash, HMAC) continua pessoal; se o destino é o próprio sistema ou um operador acertado, suprima dizendo isso',
    pega: [`await fetch(destino, { method: 'POST', body: JSON.stringify(contato) });`, `await fetch(destino.url, { headers: { assinatura: hmac(segredo, corpo) }, body: JSON.stringify(contato) });`],
    passa: [`await fetch('/v1/contatos', { method: 'POST', body: JSON.stringify(contato) });`, `await fetch(destino, { body: JSON.stringify({ total }) });`],
  },
  {
    id: 'consentimento_marcado', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`\b` + CONSENTE + String.raw`\b[^\n]*\.default\(\s*true\s*\)|\b` + CONSENTE + String.raw`"?\s+boolean\s+(not\s+null\s+)?default\s+true\b|\b` + CONSENTE + String.raw`\b[^\n>]*\bdefaultChecked\b(?!\s*=\s*\{\s*false\s*\})`,
    artigo: 'LGPD Art. 5º, XII e Art. 8º',
    problema: 'consentimento marcado por padrão; consentimento é manifestação livre e inequívoca',
    correcao: 'o padrão é falso, e o sim guarda quem, quando, o texto e a versão',
    pega: [`aceitaMarketing: z.boolean().default(true),`, `aceitaPromocoes: z.boolean().default(true),`, `consentimento_marketing boolean not null default true,`, `<input type='checkbox' name='consentimento' defaultChecked />`],
    passa: [`aceitaMarketing: z.boolean().default(false),`, `consentimento_marketing boolean not null default false,`, `<input type='checkbox' name='consentimento' />`],
  },
  {
    id: 'cookie_sem_consentimento', nivel: 'medio', arquivos: 'codigo', validador: 'sem_consentimento',
    regex: String.raw`(?:^.*\n){0,2}^.*(document\.cookie\s*=|\bcookies\(\)\.set\(|\bres\.cookie\()`,
    artigo: 'LGPD Arts. 7º e 8º',
    problema: 'cookie sem consentimento por perto; só o estritamente necessário (a sessão) dispensa',
    correcao: 'condicione ao consentimento da finalidade, ou diga na supressão que o cookie é necessário',
    pega: [`document.cookie = 'origem=' + campanha;`],
    passa: [`if (consentimento.permite('funcional')) {\n  document.cookie = 'origem=' + campanha;\n}`],
  },
  {
    id: 'localstorage_pessoal', nivel: 'alto', arquivos: 'codigo',
    regex: String.raw`\blocalStorage\.setItem\([^)]*\b(user|usuario|contato|ficha|pessoa|cpf|e_?mail|celular|telefone|token|sessao)`,
    artigo: 'LGPD Art. 46',
    problema: 'dado pessoal ou token no localStorage, sem cifra e lido por qualquer script da página',
    correcao: 'a sessão vai em cookie httpOnly; dado pessoal não fica no navegador',
    pega: [`localStorage.setItem('contato', JSON.stringify(contato));`],
    passa: [`localStorage.setItem('tema', 'escuro');`],
  },
  {
    id: 'geolocalizacao_sem_base', nivel: 'medio', arquivos: 'codigo',
    regex: String.raw`^(?!.*(consent|base_?legal)).*\b(getCurrentPosition|watchPosition)\s*\(`,
    artigo: 'LGPD Arts. 7º e 8º',
    problema: 'geolocalização sem consentimento nem base legal no mesmo fluxo',
    correcao: "condicione: if (consentimento.permite('localizacao')) ...; de empregado, consentimento é base fraca: registre a base",
    pega: [`navigator.geolocation.getCurrentPosition(salvar);`],
    passa: [`if (consentimento.permite('localizacao')) navigator.geolocation.getCurrentPosition(salvar);`],
  },
  {
    id: 'cache_sem_ttl', nivel: 'medio', arquivos: 'codigo',
    regex: String.raw`^(?!.*\b(ttl|expira\w*|expire\w*|setex|ex|px)\b).*\b(cache|redis)\.set\([^)]*\b(user|usuario|contato|ficha|pessoa|perfil|cpf|e_?mail|celular)`,
    artigo: 'LGPD Arts. 15 e 16',
    problema: 'dado pessoal em cache sem prazo; ele sobrevive à anonimização',
    correcao: "dê prazo: cache.set(chave, valor, { ttl: 3600 })",
    pega: [`await cache.set('contato:' + id, contato);`],
    passa: [`await cache.set('contato:' + id, contato, { ttl: 3600 });`],
  },
];
