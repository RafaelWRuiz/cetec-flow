# AGENTS.md — ponte deste repositório com o Brain

## Identidade lógica

- Projeto: `github.com/RafaelWRuiz/cetec-flow`
- Remoto canônico: `https://github.com/RafaelWRuiz/cetec-flow.git`
- Contexto Brain: `1. Projetos/Robôs CGTEC/projeto.md` (frente ARED/Vestibulinho, vínculo provisório)

Esta identidade não depende do diretório local. Use o remoto Git para validá-la; formas HTTPS e SSH do mesmo repositório representam a mesma identidade.

## Antes de trabalhar

1. Tente localizar o Brain pela variável de ambiente `BRAIN_ROOT`.
2. Para cada candidato, valide a presença de `AGENTS.md` e `_Regras/CONSTITUICAO.md`. Nunca presuma um caminho sem essa validação.
3. Se `BRAIN_ROOT` estiver indisponível ou for inválido, consulte as raízes de OneDrive disponíveis no ambiente: `OneDrive`, `OneDriveConsumer` e `OneDriveCommercial`.
4. Para cada raiz disponível, teste o candidato `<raiz-OneDrive>/Brain` e aceite-o somente se os dois marcadores forem validados.
5. Com o Brain validado, leia `<Brain>/AGENTS.md` e o contexto deste projeto em `<Brain>/1. Projetos/Robôs CGTEC/projeto.md`.
6. Antes de criar um ativo potencialmente reutilizável, consulte `<Brain>/4. Recursos/`.

Se nenhum candidato válido for encontrado, trabalhe normalmente no repositório, mas informe claramente que o Brain não está acessível e que nenhum contexto foi presumido. Não grave caminhos absolutos locais ou caminhos permanentes para contornar isso.

## Após trabalho relevante

Atualize o contexto vinculado no Brain e registre o acontecimento em `<Brain>/2. Memória/Cronos/` usando a data da sessão. Atualize `memory.md` apenas quando houver mudança real no estado consolidado, prioridades ou próximos passos.

## Limites

- Código, testes, dependências e instruções específicas deste software permanecem neste repositório.
- Regras globais, contexto, decisões e registros cronológicos pertencem ao Brain.
- Não copie código, dados ou documentação inteira para o Brain; registre referências e decisões. Avalie Recursos apenas para ativos genuinamente reutilizáveis.
