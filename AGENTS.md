# <nome do projeto>

Faz:          o mapa do repositório. As regras que não se negociam estão no `CLAUDE.md`; a arquitetura, em
              `docs/arquitetura.md`; as decisões, em `docs/decisoes.md`.
Não faz:      regra própria: onde este mapa e o `CLAUDE.md` divergirem, vale o `CLAUDE.md`.
Pastas:       <pasta>/        <o que mora nela, numa linha>
              docs/           plano, arquitetura, decisões, fases e a autoanálise do pipeline (docs/pipeline/)
              .claude/        o pipeline (skill), os agentes e os hooks
Regras daqui: antes de mexer numa pasta, leia o AGENTS.md dela e os das pastas acima.
              Toda tarefa que muda o repositório segue a skill `pipeline`.
Como testar:  <o comando do portão rápido e o da suíte completa>.

<!--
Modelo do AGENTS.md de uma pasta de trabalho (o confere-docs exige "Faz:", "Não faz:" e "Como testar:"):

# <pasta>

Faz:          o que a pasta faz, em poucas linhas.
Não faz:      o que parece ser dela e não é, e onde mora.
Depende de:   as pastas e pacotes que ela importa.
Expõe:        o contrato público: rotas, tipos, funções e eventos que outra pasta pode usar.
Regras daqui: os invariantes que valem só aqui.
Como testar:  o comando.
-->
