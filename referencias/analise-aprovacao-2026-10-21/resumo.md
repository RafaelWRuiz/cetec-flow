# Inspeção estrutural de uma planilha histórica — 21/10/2026

## Escopo

O arquivo recebido é do semestre passado. Serve como exemplo do formato e dos campos para preparar o tratamento da planilha deste ano, que ainda será recebida. Números e conferências abaixo descrevem somente esse exemplo e não são diagnóstico nem premissa sobre a edição atual.

Fonte lida em modo somente leitura: uma aba (`Plan1`), 13.158 linhas por 12 colunas e cabeçalho tabular na linha 9. SHA-256: `250e1eb276ec702d1057fbb14568447d765c9e365d8a517648d436624fcea`.

## Campos observados

Resumo inicial na coluna A: título, total de turmas e totais agregados de cursos aprovados e não aprovados. A tabela começa na linha 9 e contém `Aprovado`, `Município`, `Unidade`, `Curso`, `Período`, `Vagas`, `Inscritos`, `Demanda`, `2ª opção vindo de outras turmas`, `Inscritos`, `2ª opção indo para outras turmas`, `Inscritos`.

Uma linha inicia os dados de uma turma. Linhas seguintes podem continuar listagens de segunda opção, deixando em branco os campos de identificação repetidos. O leitor precisa carregar a turma atual ao percorrer essas linhas.

Os vínculos de segunda opção aparecem nas perspectivas “vindo” e “indo”. No exemplo histórico, relações cujas duas ofertas estão identificadas na lista podem ser conferidas entre essas perspectivas. Validar novamente com a planilha deste ano.

Em três linhas do exemplo, `Vagas` combina a quantidade e um rótulo de situação, como `80 Atenção`. O parser separa o número e preserva o texto; verificar se essa convenção aparece na planilha nova. A coluna individual `Aprovado` está vazia no exemplo, embora o resumo traga totais agregados 738/16. Não presumir que o campo ou sua codificação estarão iguais na próxima planilha.

## Controles exploratórios no exemplo histórico

O script identificou 754 ofertas, 9.381 registros de segunda opção recebida e 10.326 registros enviados. Em 8.658 pares entre ofertas identificadas, ambas as perspectivas apresentam a mesma quantidade. Os vínculos com rótulos fora da lista também foram contabilizados pelo script, mas seu significado operacional não foi determinado. Essas frequências servem apenas para testar a extração do arquivo antigo.

Demanda própria foi recalculada como inscritos ÷ vagas e conferiu com a coluna `Demanda` no exemplo. Usando 1,5 só como ilustração, 242 ofertas históricas atingiriam o valor apenas pela primeira opção. Isso não identifica cursos aprovados nem prevê dados da próxima edição.

## Como preparar a planilha deste ano

Quando a nova fonte chegar, verificar: cabeçalhos e abas; identificador único da oferta; início e continuação das linhas; tipos de valores; população correspondente a `Inscritos`; significado e preenchimento de `Aprovado`; presença das duas perspectivas de segunda opção; e como distinguir destinos que não aparecem na lista principal. Comparar o esquema antes de reutilizar o parser. Não transportar as contagens do semestre passado como premissas.

O parser neste diretório guarda só um diagnóstico compacto, sem cópia das 13 mil linhas: executar `python analisar.py "<caminho do arquivo xlsx>"`. Ele documenta a leitura do formato histórico; adaptar e conferir contra o novo esquema antes de usá-lo para 2026/27.
