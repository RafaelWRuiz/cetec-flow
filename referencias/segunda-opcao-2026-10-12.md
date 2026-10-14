# Considerar segunda opção

Implementação local do controle `2° Opção`, na mesma linha e logo após Presencial, antes de EAD e Treineiros.

A base local foi alinhada à `origin/main` em `67bcdff`, preservando a versão publicada: mapa de calor ativado por padrão, legenda de demanda e cinco categorias (Competitivo ≥ 2,0; Aceitável ≥ 1,5; Atenção ≥ 1,0; Ruim ≥ 0,5; Crítico < 0,5). As alterações de segunda opção foram reaplicadas sobre essa base. Build, 16 testes e navegador desktop/mobile passaram; a conferência confirmou as cinco categorias, o mapa ativado e a mudança de Ruim para Competitivo ao somar a segunda opção na oferta utilizada.

- Desmarcado por padrão: apresenta apenas a primeira opção.
- Marcado: soma pagos e não pagos das duas opções por oferta e mantém as vagas. Recalcula cursos, situação, mapa, indicadores, histórico, relatórios e resumo copiável.
- As contagens combinadas representam opções de inscrição, podendo repetir uma pessoa em cursos diferentes.
- Exportações antigas preservam segunda opção como ausente (`NULL`), distinguindo ausência de zero conhecido. O controle fica indisponível nas datas sem esses dados. O histórico combinado inclui somente datas com segunda opção disponível.
- Treineiros permanecem com a contagem original, sem soma de segunda opção.

## Validação

Exportação fornecida `Total_de_Inscritos_PAGOS_e_NÃO_PAGOS_por_curso (36).xls`, referência 09/10/2026 às 16:26: 422 locais e 2.962 ofertas. Totais reconciliados com o TOTAL GERAL da própria exportação:

| Medida | 1ª opção | 2ª opção |
| --- | ---: | ---: |
| Pagos | 126.514 | 122.715 |
| Não pagos | 40.328 | 38.523 |
| Total | 166.842 | 161.238 |

Vagas: 85.271, sem duplicação. Os totais acima incluem todos os registros; o painel aplica seu recorte selecionado.

16 testes de parser, cálculo e relatórios passaram. Build passou. Verificação no Chrome headless com respostas de API simuladas a partir da primeira oferta da exportação: 30 → 426 opções, 22 → 302 pagos, 8 → 124 não pagos, 35 vagas constantes e demanda por pagos de 8,63x. Alternância reversível, histórico antigo indisponível, desktop de 1440px e mobile de 390/320px passaram, sem erros de execução ou rolagem horizontal.

Lint dos arquivos de parser, API, cálculo e testes alterados passou. O lint global mantém cinco erros e dois avisos preexistentes em App, D3GeographicMap e EnrollmentReports.

## Publicação pendente

1. Aplicar `supabase/migrations/20261013015658_add_enrollment_second_option.sql` no projeto do painel. A migração é aditiva e não altera contagens antigas.
2. Publicar as mudanças do repositório.
3. Importar a exportação com as novas colunas. Se o arquivo já tiver sido importado com um parser anterior, conferir o histórico e reprocessar os dados da segunda opção a partir da fonte original; não inventar valores para os snapshots anteriores.
4. Conferir a API e a alternância no site publicado.

Nenhuma publicação, migração remota ou importação de produção foi executada nesta sessão.
