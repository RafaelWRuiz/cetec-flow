# Carregamento atual primeiro e histórico em segundo plano

O painel abre com uma única importação, preservando mapa de calor, cinco categorias, filtros e segunda opção. A resposta inicial traz também a lista leve de datas. Evolução e Relatórios exibem carregamento até o histórico completo estar disponível, evitando variações calculadas sobre datas incompletas. Cursos, desempenho e mapa ficam utilizáveis antes disso.

## Fluxo

- `GET /api/dashboard-data`: versão ativa e lista de importações concluídas até a data ativa. Sem cache HTTP do ponteiro ativo, para reconhecer imediatamente uma nova importação.
- `GET /api/dashboard-data?importId=<uuid>`: uma importação concluída da edição atual. Cache HTTP por importação, uma hora no navegador e um dia no CDN.
- O navegador carrega até três blocos simultaneamente, reutiliza blocos já baixados e publica o histórico completo de uma vez. Cada bloco reúne até 12 datas e usa um dicionário de ofertas para evitar repetir textos. Para as 55 datas atuais são cinco pedidos, em vez de 54 pedidos individuais. Falhas mostram nova tentativa e preservam a consulta aos dados atuais.
- `GET /api/dashboard-data?historyFor=<uuid>&part=<n>`: bloco compacto do histórico até a importação indicada, com cache HTTP. A lista inicial informa quantos blocos buscar. O navegador verifica todas as identidades e datas antes de exibir a série.
- A importação salva `dashboard/v1/<id>.json` no bucket privado existente antes de desativar a base anterior. O arquivo contém apenas os dados já públicos do painel; credenciais e arquivo original não são expostos.
- Também prepara `history/v1/<último-id>-<quantidade>.json` para os blocos históricos antes da ativação. Reutiliza blocos existentes e reconstrói os ausentes; falha no preparo preserva a base anterior. No primeiro uso de bases antigas sem arquivo, a API reconstrói o bloco em memória, sem gravar no banco/Storage. Cache de até 16 blocos por processo.
- Fontes antigas sem JSON pronto continuam legíveis por paginação do banco. Abrir o painel não grava no Storage. Cache de processo limitado a oito importações, com compartilhamento de consultas simultâneas. As novas importações passam a usar o arquivo preparado; não foi feito backfill remoto nesta sessão.
- Timestamps são normalizados em UTC para que a data salva durante a importação corresponda à data retornada pelo Postgres.

## Validação

| Medição | Resultado |
| --- | --- |
| API de produção anterior, primeira chamada | 11,94 s |
| API de produção anterior, seguinte | 7,12 s |
| Nova API local, primeira chamada real | 1,75 s |
| Nova API local, seguinte | 0,15 s |
| JSON inicial anterior, descompactado | 48.621.846 bytes |
| Novo JSON inicial, descompactado | 1.115.079 bytes |
| Registros iniciais | 2.962, em vez de 162.467 |
| Indicadores visíveis no Chrome local, servidor de desenvolvimento | 4,33 s |
| Histórico compacto, cinco blocos descompactados | 5.983.656 bytes (redução de 87,7%) |
| Histórico antigo sem arquivos prontos, primeira consulta local real | 7,11 s |
| Histórico completo com cache do processo aquecido, consulta local real | 0,21 s |

Ambientes diferentes: estes números confirmam a redução de trabalho e de payload, mas não garantem o tempo final na Vercel. A API nova foi medida somente por leitura da base real. A validação visual real preservou 157.053 inscrições presenciais e as contagens 480/215/357/568/596 das cinco categorias, iguais à referência publicada.

24 testes passaram, incluindo arquivos atual e históricos antes de ativação, falha de qualquer arquivo preservando a base anterior, paginação de 2.962 ofertas, codec preservando ofertas duplicadas/vagas/segunda opção ausente ou zero, leitura de blocos sem consultar ofertas, limite de concorrência, deduplicação e repetição após erro. Build, tipos da API/servidor e lint dos arquivos novos de carregamento/API passaram. Navegador com respostas controladas confirmou dados atuais disponíveis com histórico atrasado, segunda opção, mapa, cinco categorias, relatórios completos, seleção de datas, falha/retry e mobile sem rolagem horizontal. O contador de importações foi retirado; o painel exibe apenas uma mensagem breve enquanto aguarda o histórico.

## Publicação

Continua local. Publicar junto com a migração preparada para segunda opção. O bucket privado existente já suporta os novos arquivos; não há nova migração de cache. Após publicar, importar a nova exportação para gerar os arquivos atuais e históricos e validar tempos na produção. Sem esse preparo, a primeira reconstrução do histórico antigo ainda é lenta; o tempo de cache aquecido não representa uma abertura com processo frio na Vercel. Correções posteriores de ofertas/eixos de uma importação existente exigem regenerar os JSONs atual/histórico e invalidar os caches correspondentes.

## Ajuste visual e início mais rápido — 2026-10-13

O gráfico de evolução agora recebe os blocos em ordem cronológica e desenha o trecho recebido enquanto uma camada clara cobre a área ainda pendente. O eixo mantém as posições finais das datas, e um indicador discreto acompanha a última data desenhada. Se o histórico falhar, o trecho já disponível permanece visível com opção de tentar de novo.

O contorno geográfico foi separado da entrada principal do JavaScript e do mapa vetorial. A parte necessária para iniciar o painel caiu de 1.238.840 bytes / 336.570 comprimidos para 278.520 bytes / 83.890 comprimidos. Isso reduz em aproximadamente 75% o JavaScript comprimido que precisa ser executado antes dos efeitos do painel começarem. O arquivo do mapa ainda é baixado em paralelo para renderizar a geografia. `npm run build` passou; a suíte anterior de 24 testes continua registrada acima, sem nova execução nesta etapa.

O último painel atual também fica salvo no `localStorage` do próprio navegador. Em novas visitas o painel usa esses dados imediatamente e consulta a versão ativa em segundo plano; um aviso curto aparece durante essa atualização. O histórico não é salvo nesse cache local. A primeira visita naquele navegador ainda precisa buscar a importação atual na API.
