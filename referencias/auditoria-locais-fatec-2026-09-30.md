# Auditoria dos locais Fatec — Vestibulinho 2027.1

Fonte: exportação ativa `Total_de_Inscritos_PAGOS_e_NÃO_PAGOS_por_curso (23).xls`, referência `2026-09-30T12:54:00+00:00`. Auditoria feita em 30/09/2026, somente leitura.

## Causa

O parser reconhecia cabeçalhos `S`, `M` e `E`, mas a planilha também usa `F` para ofertas em Fatecs. Cada bloco `F` era incorporado ao local reconhecido imediatamente anterior. Isso alterou o detalhamento por local, sem alterar o total geral de vagas e inscrições.

A planilha tem **39 locais Fatec**, com **61 ofertas regulares**, **2377 vagas**, **2706 pagos** e **878 não pagos**. As 2962 linhas de ofertas do snapshot continuam presentes; a correção é de atribuição. Também há linhas de treineiro nesses blocos. As 39 importações concluídas da edição 2027.1 foram verificadas: todas contêm 39 locais `F` e preservam a contagem de ofertas.

## Atribuições a corrigir no snapshot ativo

| Local correto na planilha | Município | Ofertas regulares | Pagos | Local que recebeu as ofertas |
|---|---|---:|---:|---|
| `E0063.F0291` Etec Eng. Herval Bellusci - Fatec Adamantina | Adamantina | 1 | 6 | `E0063.S0000` Etec Eng. Herval Bellusci |
| `E0055.F0291` Etec Prof. Eudécio Luiz Vicente - Fatec Adamantina | Adamantina | 2 | 23 | `E0055.S0000` Etec Prof. Eudécio Luiz Vicente |
| `E0006.F0004` Etec Polivalente de Americana - Fatec Americana-Ministro Ralph Biasi | Americana | 2 | 68 | `E0006.S0000` Etec Polivalente de Americana |
| `E0165.F0177` Etec de Araçatuba - Fatec Araçatuba-Prof. Fernando Amaral de Almeida Prado | Araçatuba | 2 | 79 | `E0165.E0001` Etec de Araçatuba - EE Manoel Bento da Cruz |
| `E0024.F0290` Etec Pref. Alberto Feres - Fatec Araras-Antonio Brambilla | Araras | 2 | 91 | `E0024.E0001` Etec Pref. Alberto Feres - EE Dr. Cesário Coimbra |
| `E0135.F0196` Etec Rodrigues de Abreu - Fatec Bauru | Bauru | 2 | 154 | `E0135.S0000` Etec Rodrigues de Abreu |
| `E0306.F0183` Etec de Bragança Paulista - Fatec Bragança Paulista-Jornalista Omair Fagundes de Oliveira | Bragança Paulista | 2 | 183 | `E0306.S0000` Etec de Bragança Paulista |
| `E0144.F0143` Etec de Carapicuíba - Fatec Carapicuíba | Carapicuíba | 1 | 133 | `E0144.S0000` Etec de Carapicuíba |
| `E0078.F0109` Etec Dr. Júlio Cardoso - Fatec Franca-Dr. Thomaz Novelino | Franca | 1 | 42 | `E0078.S0000` Etec Dr. Júlio Cardoso |
| `E0046.F0109` Etec Prof. Carmelino Corrêa Júnior - Fatec Franca-Dr. Thomaz Novelino | Franca | 1 | 9 | `E0046.S0000` Etec Prof. Carmelino Correa Júnior |
| `E0088.F0119` Etec Mons. Antonio Magliano - Fatec Garça-Deputado Julio Julinho Marcondes de Moura | Garça | 1 | 30 | `E0088.S0000` Etec Mons. Antonio Magliano |
| `E0026.F0106` Etec Prof. Alfredo de Barros Santos - Fatec Guratinguetá-Prof. João Mod | Guaratinguetá | 2 | 119 | `E0026.S0000` Etec Prof. Alfredo de Barros Santos |
| `E0218.F0278` Etec João Maria Stevanatto - Fatec Itapira-Ogari de Castro Pacheco | Itapira | 1 | 12 | `E0218.S0000` Etec João Maria Stevanatto |
| `E0249.F0155` Etec de Itaquaquecetuba - Fatec Itaquaquecetuba | Itaquaquecetuba | 1 | 74 | `E0249.S0000` Etec de Itaquaquecetuba |
| `E0086.F0178` Etec Martinho Di Ciero - Fatec Itu-Dom Amaury Castanho | Itu | 2 | 95 | `E0086.S0000` Etec Martinho Di Ciero |
| `E0256.F0173` Etec Bento Carlos Botelho do Amaral - Fatec Jaboticabal-Nilo de Stéfani | Jaboticabal | 3 | 53 | `E0233.S0000` Etec Prof. José Ignácio Azevedo Filho |
| `E0148.F0192` Etec de Lins - Fatec Lins-Prof. Antonio Seabra | Lins | 1 | 17 | `E0148.E0001` Etec de Lins - EE Fernando Costa |
| `E0060.F0120` Etec Francisco Garcia - Fatec Mococa-Mário Robertson de Syllos | Mococa | 1 | 23 | `E0060.S0000` Etec Francisco Garcia |
| `E0009.F0120` Etec João Baptista de Lima Figueiredo - Fatec Mococa-Mário Robertson de Syllos | Mococa | 2 | 41 | `E0009.S0000` Etec João Baptista de Lima Figueiredo |
| `E0096.F0163` Etec Pedro Ferreira Alves - Fatec Mogi Mirim-Arthur de Azevedo | Mogi Mirim | 2 | 46 | `E0096.S0000` Etec Pedro Ferreira Alves |
| `E0232.F0312` Etec Prof. José Carlos Seno Júnior - Fatec de Olímpia | Olímpia | 1 | 12 | `E0232.M0005` Etec Prof. José Carlos Seno Júnior - Extensão Faculdade de Olimpia - UNIESP S.A. |
| `E0066.F0021` Etec Jacinto Ferreira de Sá - Fatec Ourinhos | Ourinhos | 2 | 43 | `E0066.E0001` Etec Jacinto Ferreira de Sá - EE Virginia Ramalho |
| `E0068.F0113` Etec João Gomes de Araújo - Fatec Pindamonhangaba-José Renato Guaycuru San Martim | Pindamonhangaba | 1 | 50 | `E0068.S0000` Etec João Gomes de Araújo |
| `E0056.F0175` Etec Cel. Fernando Febeliano da Costa - Fatec Piracicaba-Dep. Roque Trevisan | Piracicaba | 1 | 40 | `E0056.S0000` Etec Cel. Fernando Febeliano da Costa |
| `E0202.F0001` Etec Prof. Jadyr Salles - Fatec Porto Ferreira | Porto Ferreira | 1 | 46 | `E0202.S0000` Etec Prof. Jadyr Salles |
| `E0032.F0157` Etec Prof. Dr. Antônio Eufrásio de Toledo - Fatec Presidente Prudente | Presidente Prudente | 2 | 40 | `E0032.S0000` Etec Prof. Dr. Antônio Eufrásio de Toledo |
| `E0239.F0299` Etec de Registro - Fatec Registro | Registro | 1 | 61 | `E0239.S0000` Etec de Registro |
| `E0091.F0269` Etec Paulino Botelho - Fatec São Carlos | São Carlos | 1 | 15 | `E0091.E0006` Etec Paulino Botelho - EE Cidade Aracy IV |
| `E0045.F0204` Etec Carlos de Campos - Fatec Ipiranga-Pastor Enéas Tognini | São Paulo | 1 | 12 | `E0045.S0000` Etec Carlos de Campos |
| `E0211.F0111` Etec da Zona Leste - Fatec Zona Leste | São Paulo | 2 | 192 | `E0211.M0003` Etec da Zona Leste - Ceu São Miguel - Luiz Melodia |
| `E0273.F0001` Etec Sebrae - Extensão Fatec Sebrae | São Paulo | 1 | 25 | `E0273.S0000` Etec Sebrae |
| `E0186.F0257` Etec Tereza Aparecida Cardoso Nunes de Oliveira - Fatec Itaquera-Prof. Miguel Reale | São Paulo | 1 | 11 | `E0186.M0002` Etec Tereza Aparecida Cardoso Nunes de Oliveira - CEU Rei Pelé |
| `E0188.F0189` Etec de São Sebastião - Fatec São Sebastião | São Sebastião | 2 | 109 | `E0188.S0000` Etec de São Sebastião |
| `E0074.F0176` Etec José Martimiano da Silva - Fatec Sertãozinho-Dep. Waldyr Alceu Trigo | Sertãozinho | 2 | 179 | `E0074.E0003` Etec José Martimiano da Silva - EE Winston Churchill |
| `E0016.F0003` Etec Fernando Prestes - Fatec Sorocaba-José Crespo Gonzales | Sorocaba | 2 | 153 | `E0016.E0004` Etec Fernando Prestes - EE João Clímaco de Camargo Pires |
| `E0019.F0022` Etec Dr. Adail Nunes da Silva - Fatec Taquaritinga | Taquaritinga | 2 | 51 | `E0019.S0000` Etec Dr. Adail Nunes da Silva |
| `E0101.F0132` Etec Sales Gomes - Fatec Tatuí-Prof. Wilson Roberto Ribeiro de Camargo | Tatuí | 2 | 64 | `E0101.S0000` Etec Sales Gomes |
| `E0125.F0251` Etec Dr. Geraldo José Rodrigues Alckmin - Fatec Taubaté | Taubaté | 3 | 256 | `E0125.S0000` Etec Dr. Geraldo José Rodrigues Alckmin |
| `E0197.F0301` Etec Prof. Elias Miguel Junior - Fatec Votorantim | Votorantim | 1 | 49 | `E0197.S0000` Etec Prof. Elias Miguel Junior |

## Araçatuba

- `E0165.S0000`: sede da Etec de Araçatuba, sem as duas ofertas AMS no arquivo.
- `E0165.E0001`: EE Manoel Bento da Cruz, com Recursos Humanos e Redes de Computadores.
- `E0165.F0177`: Fatec Araçatuba, com Administração e Desenvolvimento de Sistemas M-Tec AMS (79 pagos, 15 não pagos e 80 vagas no total).

A API publicada mostra apenas os dois primeiros locais porque o terceiro foi omitido na importação. O parser local já foi corrigido; os dados publicados e o histórico ainda exigem reprocessamento.
