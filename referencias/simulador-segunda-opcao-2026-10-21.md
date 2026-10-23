# Simulador de viabilidade com segunda opção potencial

Data: 21/10/2026. Projeto: `github.com/RafaelWRuiz/cetec-flow`.

Status: especificação acordada com Rafael para implementação futura no painel. Esta etapa registra as decisões; não implementa nem publica a funcionalidade.

## 1. Objetivo e decisão de produto

Reformular o uso de segunda opção para estimar quais turmas podem atingir um parâmetro de demanda com candidatos potencialmente disponíveis de outras turmas.

O diferencial é a **segunda opção potencial**, em vez da soma integral de todas as escolhas registradas. Uma turma com demanda própria de 1,0 pode se tornar viável ao receber candidatos potenciais e alcançar, por exemplo, 1,5.

O parâmetro inicial será **1,5 candidato por vaga**, ajustável. É uma hipótese de simulação, não uma afirmação sobre o critério oficial de aprovação do Vestibulinho ou sobre o critério aplicado na planilha fornecida.

Diretores e supervisores regionais escolhem quais turmas abrir ou fechar nos casos dependentes entre si. O sistema calcula e explica as consequências. Não foi escolhido um algoritmo para maximizar automaticamente a quantidade de turmas abertas; programação inteira foi discutida e substituída, neste escopo, por decisões humanas sobre cenários transparentes.

## 2. Fonte e unidade de análise

A planilha recebida (“Aprovação de cursos 1ª fase”) é do semestre passado e foi fornecida para entender a estrutura e os campos. Os números e padrões estruturais abaixo devem ser validados contra a planilha deste ano, ainda não recebida. Não representam as ofertas nem as regras da nova edição. Seu cabeçalho-resumo informa 754 turmas, 738 aprovadas e 16 não aprovadas, mas não distribui a situação por oferta.

Campos observados no exemplar histórico: aprovado, município, unidade, curso, período, vagas, inscritos, demanda, “2ª opção vindo de outras turmas” e “2ª opção indo para outras turmas”, cada relação com sua quantidade de inscritos. Confirmar os nomes, preenchimento, tipos e significado dos campos na nova fonte.

Cada nó representa uma **oferta/turma**, identificada por unidade, local de oferta, curso, período e demais identificadores necessários para distinguir turmas. Não agrupar somente pelo nome do curso ou da escola. Preferir identificadores estáveis quando a fonte os fornecer.

Cada vínculo dirigido representa candidatos cuja primeira opção é A e cuja segunda opção é B. No exemplar histórico, o vínculo “indo de A para B” e “vindo de A para B”, apresentados em blocos diferentes do relatório, descrevem a mesma relação: não somá-los como grupos distintos. Reconfirmar essa correspondência no arquivo novo.

O registro de aprovação da fonte deve ser preservado separadamente da viabilidade calculada no simulador. No exemplar histórico, a coluna de aprovação individual estava vazia, mas isso não estabelece como virá o arquivo deste ano nem permite inferir o significado de células vazias.

## 3. Premissas da hipótese inicial

- Se uma turma não abrir, a inscrição segue para a segunda opção indicada, conforme regra informada por Rafael. A quantidade transferível não equivale a matrícula garantida.
- Se a turma abrir, seus inscritos que conseguem vaga permanecem na primeira opção. Apenas o excedente estimado contribui para a segunda opção.
- A estimativa proporcional pressupõe que as escolhas de segunda opção estejam distribuídas de maneira semelhante entre os classificados e os excedentes. Não há classificação individual disponível nesta hipótese.
- A segunda opção potencial é uma expectativa de candidatos disponíveis. Não modela, nesta primeira versão conceitual, presença na prova, habilitação, desistência ou efetivação de matrícula.
- Candidatos recebidos em segunda opção não são reenviados: não há terceira opção ou redistribuição em cadeia dessas mesmas pessoas.
- Contribuições de uma origem dependem da decisão sobre essa origem no cenário. Não usar o fechamento de uma turma para sustentar outra enquanto se considera a mesma origem aberta.

## 4. Fórmulas

Para cada turma de origem A:

- `I_A`: inscritos em primeira opção na base selecionada.
- `V_A`: vagas.
- `N_AB`: inscritos de A que indicaram B como segunda opção.
- `T`: parâmetro de demanda, inicialmente `1,5`.

Para uma origem aberta:

```text
excedente_A = max(0, I_A - V_A)
fracao_excedente_A = excedente_A / I_A, se I_A > 0
fracao_excedente_A = 0, se I_A = 0
potencial_AB = N_AB * fracao_excedente_A
```

Para uma origem fechada no cenário:

```text
potencial_AB = N_AB
```

Para o destino B considerado para abertura:

```text
segunda_potencial_B = soma das contribuições das origens para B
base_estimada_B = I_B + segunda_potencial_B
demanda_propria_B = I_B / V_B
demanda_estimada_B = base_estimada_B / V_B
viavel_B = demanda_estimada_B >= T
```

Ofertas com vagas ausentes ou menores ou iguais a zero precisam de tratamento explícito; não dividir por zero nem classificá-las automaticamente.

**A demanda estimada é uma medida de procura potencial para viabilidade, não uma previsão de matrículas.** Não limitar a segunda opção potencial às vagas remanescentes nesta conta: esse limite impediria uma turma de demanda própria 1,0 de chegar a 1,5. O ingresso estimado limitado às vagas foi discutido como outra medida, mas não é o foco escolhido para este simulador.

O excedente de uma origem aberta é calculado com seus inscritos de primeira opção e suas vagas. Receber candidatos potenciais não aumenta o grupo que essa origem envia aos próprios destinos de segunda opção.

## 5. Exemplo da distribuição proporcional

A tem 60 inscritos e 40 vagas: 20 excedentes, equivalentes a `20 / 60 = 1/3` dos inscritos.

As escolhas dos 60 inscritos podem ser:

| Segunda opção | Inscritos que escolheram o destino | Potenciais se A abrir |
| --- | ---: | ---: |
| B | 20 | 6,666… |
| C | 15 | 5 |
| D | 10 | 3,333… |
| E | 5 | 1,666… |
| Sem segunda opção | 10 | 3,333… sem destino |
| Total | 60 | 20 |

Os 20 inscritos que escolheram B e os 20 excedentes totais são quantidades conceitualmente diferentes, embora coincidam neste exemplo. A conta `20 * (60 - 40) / 60` estima a parcela dos interessados em B que ficará sem vaga em A. Não direciona todos os excedentes para B.

Sem classificação individual, B pode receber de zero a 20 candidatos desse grupo; 6,666… é o valor esperado sob a hipótese proporcional. Não apresentá-lo como certeza ou como probabilidade comprovada de matrícula.

Se A fechar, as contribuições passam a B = 20, C = 15, D = 10 e E = 5. Os dez sem segunda opção não recebem um destino inventado.

Manter precisão decimal nos cálculos e arredondar somente na apresentação. Classificar contra o parâmetro usando o valor sem arredondamento.

## 6. Estados e decisões

Separar a decisão de abertura da avaliação matemática. Uma turma pode estar marcada para abrir e continuar abaixo do parâmetro; isso deve aparecer como inconsistência do cenário, sem ocultar a escolha do responsável.

| Estado de apresentação | Significado |
| --- | --- |
| Garantida pela primeira opção | Atinge T sem depender de contribuições. É a âncora inicial de abertura dentro da hipótese. |
| Viável no cenário | Atinge T com as contribuições compatíveis com as decisões atuais. |
| Pendente de decisão | Depende de escolhas sobre outras turmas ou não possui decisões suficientes para fechar a conta. |
| Fechada no cenário | O responsável escolheu fechá-la; a origem passa a disponibilizar integralmente seus vínculos de segunda opção. |

“Ainda não atingiu 1,5” não significa “fechada”. Antes de tratar uma turma como fechada por insuficiência de demanda, considerar o apoio potencial que pode receber no cenário. A avaliação abaixo do parâmetro não deve disparar fechamento automático.

Uma origem pendente não pode ser silenciosamente tratada como fechada para melhorar a demanda de outro curso. Na implementação, distinguir contribuições confirmadas pelas decisões de contribuições condicionais. A forma exata de exibir cenários incompletos permanece a definir; não transformar uma hipótese condicional em viabilidade consolidada.

## 7. Sequência de uso

1. Selecionar base e parâmetro de demanda.
2. Identificar as turmas que se sustentam pela primeira opção e calcular seus excedentes proporcionais.
3. Exibir a situação das demais turmas com o apoio dessas origens e explicitar dependências ainda pendentes.
4. Permitir ao diretor ou supervisor simular abrir/fechar turmas dependentes entre si.
5. Recalcular o cenário completo a cada mudança, a partir dos inscritos originais, vínculos e decisões atuais.
6. Mostrar quem ganhou ou perdeu apoio, os valores anteriores e novos e as inconsistências que precisam de revisão.

O cálculo deve produzir o mesmo resultado para as mesmas decisões, independentemente da ordem dos cliques. Não acumular transferências sobre resultados anteriores nem fechar e reabrir automaticamente turmas em ciclos.

## 8. Exemplos de decisões dependentes

### Apoio insuficiente até uma origem fechar

B tem demanda própria 1,0. Com excedentes de origens garantidas, chega a 1,3. Se C fechar, B chega a 1,6. Até a decisão sobre C, apresentar essa possibilidade como condicional.

### Duas alternativas incompatíveis

B e C têm 40 vagas e 40 inscritos cada. Vinte inscritos de B escolheram C; vinte de C escolheram B. Não há apoio externo no exemplo.

| Cenário | Demanda de B | Demanda de C | Leitura |
| --- | ---: | ---: | --- |
| Ambas abertas | 1,0 | 1,0 | Nenhuma atinge 1,5; origens abertas não têm excedentes. |
| B aberta, C fechada | 1,5 | Fechada | B recebe os 20 interessados vindos de C. |
| B fechada, C aberta | Fechada | 1,5 | C recebe os 20 interessados vindos de B. |

Não declarar ambas viáveis contando simultaneamente os candidatos como se ambas estivessem fechadas. O responsável escolhe a alternativa e enxerga seus efeitos.

Mensagem ilustrativa: “B só atinge o parâmetro se C fechar. Neste cenário, ambas estão marcadas para abrir; reveja uma das decisões.” Exibir essa explicação somente quando a dependência tiver sido calculada, não inferi-la sem evidência.

## 9. Informações necessárias na tela

- Parâmetro vigente e identificação da base utilizada.
- Inscritos de primeira opção, vagas e demanda própria por turma.
- Segunda opção registrada, segunda opção potencial e demanda estimada, sem confundir as medidas.
- Contribuição detalhada por origem, indicando se vem de excedente proporcional de turma aberta ou de transferência integral por fechamento.
- Dependências condicionais de decisões ainda não tomadas.
- Decisão atual de abrir/fechar e avaliação de viabilidade no cenário.
- Comparação do efeito de abrir B/fechar C e da alternativa inversa, quando aplicável.
- Indicação explícita de estimativa proporcional, ausência de dados e inconsistências.

Rótulo principal sugerido e aceito conceitualmente: **“Demanda estimada com segunda opção”**. A interface deve permitir conferir por que o número mudou.

## 10. Integridade e limites para a implementação

- Importar os vínculos entre origem e destino: totais agregados de segunda opção por oferta, sozinhos, não permitem calcular este modelo.
- Reconciliar as perspectivas “vindo” e “indo”; divergências devem ser informadas, não somadas nem resolvidas inventando dados.
- Validar que as escolhas por origem não excedam seus inscritos na mesma base; somas menores podem incluir pessoas sem segunda opção ou lacunas da fonte, que precisam ser distinguidas quando possível.
- Não equiparar dado ausente a zero conhecido.
- Conservar a soma dos excedentes estimados por origem, considerando a parcela sem segunda opção; ao fechar uma origem, não disponibilizar mais candidatos do que seus vínculos registrados.
- Não subtrair integralmente os vínculos “indo” da primeira opção de uma turma aberta. A indicação de segunda opção, por si só, não é saída.
- Não somar “primeira opção + potenciais” de todas as turmas como se fossem pessoas únicas: a demanda do destino é um indicador de cenário; os inscritos originais continuam sendo uma medida distinta.
- Se origem e destino estiverem fechados, não considerar a relação como ingresso em turma aberta nem reenviar a quantidade para outro destino.
- Aplicar os cálculos no conjunto necessário de origens e destinos; filtros visuais por município/regional não devem apagar silenciosamente contribuições externas.

## 11. Pontos a definir antes de programar

1. Qual população de inscritos usar: pagos, total ou outra elegibilidade; os totais dos vínculos precisam corresponder à mesma população. Não misturar, por exemplo, vínculos totais com denominador apenas de pagos.
2. Como obter a planilha completa, seus identificadores de turma e o vínculo com as ofertas/snapshots já existentes. O trecho colado serve para conceituar, não comprova cobertura completa dos dados.
3. Como representar decisões pendentes na tela e comparar alternativas sem apresentar contribuições condicionais como confirmadas.
4. Escopo de decisão de diretores/supervisores, persistência e compartilhamento dos cenários. São questões futuras; não há autorização de mudança oficial de oferta implícita em uma simulação.
5. Como o novo simulador será acessado pelo controle de segunda opção ou por uma tela própria, e quais visualizações do painel poderão usar seus resultados. Não foi decidido reativar a soma integral anterior.
6. Se a âncora de abertura por primeira opção admitirá exceções manuais. O ponto inicial acordado considera essas turmas garantidas dentro do modelo.

## 12. Critérios de aceitação para implementação futura

- A distribuição 60 inscritos/40 vagas do exemplo conserva 20 excedentes e calcula B = 6,666… quando a origem abre e B = 20 quando fecha.
- Origem aberta sem excedentes contribui zero; origem fechada disponibiliza os vínculos integrais registrados.
- Os cenários B/C reproduzem a tabela sem dupla contagem de vínculos nem sustentação circular fictícia.
- Uma turma pode atingir T após receber segunda opção potencial e permanecer aberta sem liberar integralmente seus próprios inscritos.
- Uma turma abaixo de T permanece pendente até decisão, sem fechamento automático por insuficiência.
- Alterar uma decisão recalcula todos os destinos afetados e revela turmas marcadas para abrir que deixaram de atingir T.
- Trocar a ordem das decisões e voltar ao mesmo cenário produz os mesmos números.
- Alterar T recalcula a avaliação sem arredondamento prévio.
- Ausência de dados, divergências de vínculos e origens fora do filtro ficam explícitas.

## 13. Relação com o controle anterior

O documento `referencias/segunda-opcao-2026-10-12.md` registra a implementação histórica de soma integral da segunda opção. Esta especificação descreve a evolução conceitual para um simulador com contribuições condicionadas à origem. Não apaga nem reinterpreta os registros históricos de implementação e publicação.

## 14. Protótipo local de importação e validação

- A tela de prévia local fica disponível em desenvolvimento por `?tela=importar-segunda-opcao`, também acessível pelo link no esboço do simulador. Não altera o caminho normal do painel nem habilita a rota em produção.
- O fluxo aceita o relatório HTML salvo com extensão `.xls`, identifica o cabeçalho de 11 campos e percorre a tabela somente após ação explícita do usuário. XLS/XLSX binário ainda não é aceito por este protótipo.
- O arquivo é analisado no navegador. Não há chamada à API de importação, gravação no Supabase, exportação ou envio das linhas para fora da tela. O resultado mantém totais, verificações e até oito ofertas de amostra.
- As listas agregadas de “2ª opção indo” viram relações origem→destino; a lista de “2ª opção vindo” é comparada por turma e quantidade para detectar divergências, sem somar as duas perspectivas.
- A prévia aponta IDs ausentes ou duplicados, números inválidos, inconsistência entre demanda e inscritos/vagas, relações não conciliadas, referências a turmas ausentes, saídas acima dos inscritos, listas vazias e trechos que não puderam ser interpretados. Exemplos limitados de IDs/relacionamentos acompanham as verificações.
- O protótipo de código foi compilado com `npm run build`. A análise do arquivo completo ainda não foi executada nesta etapa; a fonte continua sem gravação no painel.

Próximo passo: abrir a prévia local, selecionar a fonte recebida e revisar os totais e exemplos de validação. Depois de confirmar o tratamento e as regras de cobertura, decidir como integrar a fonte ao modelo do painel e ao motor de cenários.

### Correção da reconciliação “indo x vindo”

A primeira regra contava como divergência qualquer relação que existisse em apenas uma lista, inclusive quando a turma referenciada não tinha linha no arquivo. Isso produzia falso positivo: nos exemplos exibidos (5927→7464, 7381→7480, 7381→5390, 6650→6729), os IDs de destino não aparecem como ofertas neste relatório. O importador agora compara quantidades somente quando origem e destino estão presentes; vínculos para IDs ausentes são descritos como não conferíveis. Divergências entre duas turmas presentes continuam sendo erro. Compilação `npm run build` aprovada. Ainda não foi feita a análise completa dos dados pela tela.
