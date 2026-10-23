# Continuação — importação de segunda opção

Data: 21/10/2026
Projeto: CETEC-FLow

## Contexto

A planilha recebida (`Demanda_Cursos_Tempo_Real.xls`) é HTML salvo com extensão `.xls` e tem 11 colunas. As colunas “2ª opção vindo” e “2ª opção indo” armazenam relações em texto longo. O importador local foi criado para validar o formato no navegador. A conferência foi ajustada: somente compara uma relação quando as turmas de origem e destino estão presentes no relatório; vínculos sem uma das turmas são “não conferíveis”, não divergências automáticas. `npm run build` passou. A análise completa do arquivo ainda não foi executada.

## Proposta para a FAT

Pedir um Excel com duas abas:

1. **Turmas** — uma linha por turma: código, município, unidade, curso, período, vagas, inscritos na 1ª opção e demanda.
2. **Relações de segunda opção** — uma linha por relação: município, unidade, curso e código da turma de origem; município, unidade, curso e código da turma de destino; quantidade de candidatos.

Manter os códigos das turmas para identificação pelo sistema e os nomes para leitura humana. Uma relação `5927 → 7464 | 1` quer dizer que um candidato da turma 5927 escolheu 7464 como segunda opção. A contagem é indicação potencial, não matrícula garantida. Com a tabela normalizada, “indo” e “vindo” podem ser calculados a partir da mesma relação e conferidos.

## Mensagem pronta para o Teams

A FAT teria como disponibilizar a planilha com duas abas? Isso ajudaria a leitura e a conferência das informações de segunda opção.

**Aba 1 — Turmas**

Uma linha por turma, com código da turma, município, unidade, curso, período, vagas, inscritos na 1ª opção e demanda.

**Aba 2 — Relações de segunda opção**

Uma linha por relação, indicando a turma de origem, a turma escolhida como segunda opção e a quantidade de candidatos. Para facilitar a leitura, poderiam constar também município, unidade e curso de origem e de destino, além dos códigos das turmas.

Por exemplo: município de origem: São Paulo; unidade: Etec Exemplo; curso: Administração; turma de origem: 5927; município de destino: Araçatuba; unidade: Etec Exemplo 2; curso: Transações Imobiliárias; turma de destino: 7464; quantidade: 1.

Nesse exemplo, um candidato da turma 5927 escolheu a turma 7464 como segunda opção. Assim, as informações de “indo” e “vindo” podem ser conferidas a partir da mesma relação. A quantidade representa indicações de segunda opção, não matrículas garantidas.

## Próximos passos

- Enviar a mensagem à chefia/FAT e confirmar se conseguem fornecer essa estrutura.
- Quando chegar a planilha deste ano, conferir amostra e escopo antes de processar tudo.
- Se a exportação atualizada chegar, usar a prévia local `?tela=importar-segunda-opcao` para importar e revisar os totais antes de integrar ao simulador.

## Nova exportação recebida em 22/10/2026

Inspeção estrutural apenas, sem análise semântica completa: `Demanda_Cursos_Tempo_Real (1).xls` continua sendo HTML com extensão `.xls`, agora com 13 colunas. Mantém os campos da turma e separa texto da relação e quantidade em quatro campos: “2ª opção vindo de outras turmas”, “Inscritos · vindo”, “2ª opção indo para outras turmas” e “Inscritos · indo”. A tabela usa `rowspan` nos dados da turma: a linha inicial tem 13 células e as linhas de continuidade de relações têm quatro. Estrutura é mais legível que a exportação anterior e separa as contagens, porém códigos de turma continuam embutidos em descrições e a mesclagem vertical complica ingestão. Identificados 2.220 registros de turma (2.221 linhas completas contando cabeçalho; ~30.288 linhas HTML após expandir relações visualmente). O importador existente espera 11 colunas e não é compatível ainda. Próximo passo: adaptar leitura respeitando `rowspan` ou solicitar exportação tabular plana com código de origem, código de destino e quantidade em cada linha. Nenhuma importação completa foi executada.

### Suporte à exportação com 13 colunas (22/10/2026)

Atualizado `src/utils/secondOptionImport.ts` para reconhecer os dois cabeçalhos (formato anterior de 11 campos e exportação atual com 13 colunas), reconstruir os registros de turma usando as linhas iniciais com 13 células e vincular as linhas de continuação com quatro células, ler as quantidades separadas e extrair os IDs de turma do texto das relações. A validação de reciprocidade continua comparando apenas pares em que ambas as turmas aparecem como ofertas. A interface identifica o formato novo. `npm run build` e `git diff --check` passaram. O arquivo real não foi integralmente analisado; a primeira análise ocorrerá quando o usuário selecionar o arquivo na prévia.

## Cruzamento pontual com o banco CETEC-FLow (22/10/2026)

Consulta somente leitura ao projeto Supabase configurado no repositório. A importação ativa tinha referência em 22/10/2026 08:40 BRT e 2.541 registros. A tabela `cetec_enrollment_snapshots` não contém o código `Turma` da planilha: `local_code` é o código da unidade (por exemplo, E0165.S0000). Os 240 IDs únicos externos da planilha (230 destinos e 148 origens; há interseção) foram cruzados pela descrição exata de unidade, curso e período. Resultado: 230/230 destinos e 146/148 origens têm registro correspondente no snapshot ativo; nenhuma descrição teve correspondência ambígua. As duas origens não encontradas são 3532 e 3695, ambas descritas como “Treineiro”. Portanto, estar ausente como linha na planilha não significa estar ausente do banco; o cruzamento por nomes não equivale a vínculo pelo ID da turma nem confirma elegibilidade/abertura. O snapshot do banco é posterior à consulta impressa no arquivo (21/10/2026 16:59 BRT), e a tabela não mantém pares direcionados origem-destino para recompor o fluxo.

## Decisão de 22/10/2026 — estimativa inicial no recorte “2ª Opção”

Foi definido o primeiro comportamento desejado para o painel: ao ativar “2ª Opção”, compor a **demanda estimada** de cada destino com candidatos potenciais vindos de origens elegíveis, sem somar esses potenciais aos totais de inscrições pagas/confirmadas.

Uma origem é elegível quando sua demanda de primeira opção **paga** supera 1,5 candidato por vaga. Para cada relação origem→destino, calcular:

`candidatos da origem que indicaram o destino × (pagos na origem − vagas da origem) ÷ pagos na origem`

As estimativas de várias origens são somadas no destino. A demanda exibida usa inscritos pagos de primeira opção + estimativa potencial, dividido pelas vagas. O parâmetro inicial é 1,5; poderá ser configurável depois. A indicação é potencial, não matrícula confirmada. Não somar a segunda opção aos KPIs de inscritos.

### Estado técnico e próximo passo

- O painel ainda tem uma prévia/simulador com dados de demonstração; o checkbox “2ª Opção” no recorte global permanece desativado.
- A importação do relatório de segunda opção atualmente só faz prévia local; as relações origem→destino ainda não são persistidas nem conectadas ao painel.
- Os campos agregados `secondOptionPaid`/`secondOptionUnpaid` não guardam a origem de cada indicação e, sozinhos, não permitem aplicar a fórmula por relação.
- Próximo passo: conectar as relações importadas (origem, destino e quantidade) aos dados atuais de primeira opção paga e vagas; depois, ativar o recorte para compor somente a demanda estimada, preservando os totais de inscrições.
- Esta regra é a etapa inicial. Cenários de fechar/abrir turmas e redistribuição integral de vínculos permanecem no simulador e não são resolvidos automaticamente por este recorte.
