const courseAliases: readonly [RegExp, string][] = [
 [/Desenvolvimento de Sistemas/i, 'D.S.'],
 [/Nutrição e Dietética/i, 'Nutrição'],
 [/Serviços Jurídicos/i, 'Serv. Jurídicos'],
 [/Manutenção e Suporte em Informática/i, 'Manut. e Suporte em Info.'],
 [/Informática para Internet/i, 'Info. Internet'],
 [/Sistemas de Energia Renovável/i, 'Sist. Energia Renovável'],
 [/Segurança do Trabalho/i, 'Seg. do Trabalho'],
 [/Redes de Computadores/i, 'Redes'],
 [/Comércio Exterior/i, 'Com. Exterior'],
 [/Desenho de Construção Civil/i, 'Des. Construção Civil'],
 [/Programação de Jogos Digitais/i, 'Jogos Digitais'],
 [/Produção de Áudio e Vídeo/i, 'Prod. Áudio e Vídeo'],
 [/Organização Esportiva/i, 'Org. Esportiva'],
 [/Transações Imobiliárias/i, 'Trans. Imobiliárias'],
 [/Especialização em /i, 'Esp. em '],
]

export const shortenCourseForWhatsApp = (course: string) =>
 courseAliases.reduce((label, [pattern, replacement]) => label.replace(pattern, replacement), course)
