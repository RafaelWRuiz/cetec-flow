# Extracao de unidades do SGC

Este extrator trabalha somente com arquivos HTML ja salvos localmente. Ele nao abre navegador, nao possui URL do SGC, nao usa credenciais e nao faz requisicoes de rede.

1. No SGC, salve cada pagina da listagem de unidades em uma mesma pasta local. Use nomes que indiquem a pagina, por exemplo `unidades_pagina_1.html`, `unidades_pagina_2.html` e assim por diante.
2. Abra o Prompt de Comando (`cmd`) e execute exatamente:

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\extrair-unidades-sgc.mjs "C:\CAMINHO\PARA\A\PASTA\DOS\HTMLS" "output\unidades_sgc"
```

O comando gera `output\unidades_sgc.csv` para abrir no Excel e `output\unidades_sgc.json` para uso automatizado. Cada unidade contem os campos exibidos na tabela, os links de acao, a pagina do SGC e o nome do HTML de origem.

O script interrompe com erro caso um HTML nao tenha a tabela esperada, tenha colunas diferentes ou existam codigos de unidades repetidos entre paginas.

## Relatorio de unidades ativas sem inscricao

Para gerar somente as unidades com `Ativo = Sim` e `Inscricao = Nao`, execute:

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\gerar-relatorio-unidades-ativas-sem-inscricao.mjs "C:\CAMINHO\PARA\O\HTML\OU\PASTA" "output\unidades_ativas_sem_inscricao"
```

O gerador tambem le apenas arquivos locais e produz CSV e JSON.

## Coleta automatica no SGC

Este modo abre o Chrome local, mas nunca preenche CPF, senha ou MFA. Faca o login manualmente na janela aberta; quando a lista de unidades aparecer, volte ao `cmd` e pressione Enter. O robo le as paginas da listagem e salva apenas as unidades com `Ativo = Sim` e `Inscricao = Nao`.

O Chrome usa o perfil local `output\sgc-chrome-profile`, que pode reutilizar a sessao autenticada entre execucoes. A senha nunca e salva pelo robo; se a politica do Microsoft 365 exigir uma nova autenticacao, sera necessario entrar manualmente novamente.

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\coletar-relatorio-sgc.mjs
```

Os arquivos ficam em `output\relatorio_unidades_ativas_sem_inscricao.csv` e `output\relatorio_unidades_ativas_sem_inscricao.json`.

## Teste de inativacao de unidades

O teste abaixo altera somente as duas primeiras unidades do relatorio. O Chrome abre para login manual e o terminal pede a palavra `SALVAR` para cada unidade imediatamente antes do envio. O resultado de sucesso, erro ou pulo fica registrado em CSV e JSON.

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\testar-inativacao-unidades-sgc.mjs
```

Os arquivos de auditoria sao `output\teste_inativacao_2_unidades.csv` e `output\teste_inativacao_2_unidades.json`.

## Inativacao em lote: paginas 1 a 10

O lote processa as unidades do relatorio originadas das paginas 1 a 10. Ha uma unica confirmacao antes do inicio: digite `INATIVAR 404`. Cada unidade e conferida depois do salvamento; itens ja inativos ou com status diferente de `Em atividade` sao anotados, mas nao sofrem nova alteracao.

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\inativar-unidades-sgc-paginas-1-a-10.mjs
```

A auditoria fica em `output\inativacao_unidades_paginas_1_a_10.csv` e `output\inativacao_unidades_paginas_1_a_10.json`.

## Inativacao em lote: paginas 11 a 15

O lote final cobre as 137 unidades restantes do relatorio, nas paginas 11 a 15. Uma unica confirmacao e exigida antes do inicio: `INATIVAR 137`.

```cmd
cd /d "C:\Users\rafae\Documents\Projetos\CETEC-FLow"
node scripts\inativar-unidades-sgc-paginas-11-a-15.mjs
```

A auditoria fica em `output\inativacao_unidades_paginas_11_a_15.csv` e `output\inativacao_unidades_paginas_11_a_15.json`.
