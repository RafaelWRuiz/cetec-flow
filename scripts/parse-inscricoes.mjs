import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const decode = (value) => value.replace(/&nbsp;/gi, ' ').replace(/&aacute;/gi, 'á').replace(/&atilde;/gi, 'ã').replace(/&ccedil;/gi, 'ç').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&Aacute;/g, 'Á').replace(/&Atilde;/g, 'Ã').replace(/&Ccedil;/g, 'Ç').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&ordf;/gi, 'ª').replace(/&ordm;/gi, 'º').replace(/&#(d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const number = (value) => Number(String(value).replaceAll('.', '').replace(',', '.')) || 0
const cells = (html) => [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => decode(match[1]))

export function parseInscricoes(html, source = 'source.xls') {
  const sourceDate = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/)
  if (!sourceDate) throw new Error('Data/hora de referência ausente no arquivo; informe-a na importação.')
  const titles = [...html.matchAll(/E(\d{4})\.([SME])(\d{4})\s+-\s+([\s\S]*?)<\/strong>/gi)]
  const locais = []; const ofertas = []
  for (let index = 0; index < titles.length; index++) {
    const match = titles[index]; const title = decode(match[0]); const next = titles[index + 1]?.index ?? html.length
    const head = title.match(/^E(\d{4})\.([SME])(\d{4})\s+-\s+(.+?)\s+-\s+(.+?)\s+\(Região Administrativa(?: de)?\s+(.+?)\s+-\s+Região de Governo(?: de)?\s+(.+?)\)$/i) ?? title.match(/^E(\d{4})\.([SME])(\d{4})\s+-\s+(.+?)\s+-\s+(.+?)\s+\(Região Metropolitana de São Paulo\s+-\s+-\)$/i)
    if (!head) throw new Error(`Título de local inválido: ${title}`)
    const [, codigoEtec, tipoLocal, codigoLocal, municipio, nome, administrative = 'Região Metropolitana de São Paulo', government = '-'] = head
    const regiaoAdministrativa = administrative
    const regiaoGoverno = government
    const codigoCompleto = `E${codigoEtec}.${tipoLocal}${codigoLocal}`
    locais.push({ codigo_etec: `E${codigoEtec}`, tipo_local: tipoLocal, codigo_local: `${tipoLocal}${codigoLocal}`, codigo_completo: codigoCompleto, municipio, nome, regiao_administrativa: regiaoAdministrativa, regiao_governo: regiaoGoverno, titulo_original: title })
    // The first unit is embedded in the report's nested opening row.
    const section = html.slice(index === 0 ? Math.max(0, match.index - 1000) : match.index, next)
    for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const values = cells(row[1]); if (values.length !== 7 || values[0] === 'Curso') continue
      const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values
      if (!curso || !periodo) continue
      const isTreineiro = curso === 'Treineiro'
      const vagasNumero = number(vagas); const totalNumero = number(totalInscritos)
      ofertas.push({ codigo_local: codigoCompleto, curso, periodo, vagas: vagasNumero, pagos: number(pagos), nao_pagos: number(naoPagos), total_inscritos: totalNumero, demanda_original: demanda ? number(demanda) : null, demanda_calculada: vagasNumero > 0 ? totalNumero / vagasNumero : 0, is_treineiro: isTreineiro })
    }
    if (index === 0) {
      const values = cells(section); const header = values.indexOf('Curso')
      for (let cursor = header + 7; cursor >= 7 && cursor + 6 < values.length; cursor += 7) {
        const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values.slice(cursor, cursor + 7)
        if (!curso || curso === 'TOTAL' || periodo === 'Treineiro' || !/^\d+$/.test(vagas)) continue
        if (ofertas.some((offer) => offer.codigo_local === codigoCompleto && offer.curso === curso && offer.periodo === periodo)) continue
        const vagasNumero = number(vagas); const totalNumero = number(totalInscritos)
        ofertas.push({ codigo_local: codigoCompleto, curso, periodo, vagas: vagasNumero, pagos: number(pagos), nao_pagos: number(naoPagos), total_inscritos: totalNumero, demanda_original: number(demanda), demanda_calculada: vagasNumero > 0 ? totalNumero / vagasNumero : 0, is_treineiro: false })
      }
    }
  }
  const total = ofertas.reduce((sum, item) => ({ vagas: sum.vagas + item.vagas, pagos: sum.pagos + item.pagos, nao_pagos: sum.nao_pagos + item.nao_pagos, total_inscritos: sum.total_inscritos + item.total_inscritos }), { vagas: 0, pagos: 0, nao_pagos: 0, total_inscritos: 0 })
  const [, day, month, year, time] = sourceDate
  return { metadata: { edicao: 'Vestibulinho 2026.2', arquivo_origem: source, data_referencia: `${year}-${month}-${day}T${time}:00-03:00`, total_geral: { ...total, demanda: total.vagas ? total.total_inscritos / total.vagas : 0 } }, locais, ofertas }
}

if (process.argv.length > 3) {
  const input = resolve(process.argv[2]); const output = resolve(process.argv[3]); const html = await readFile(input, 'latin1'); const snapshot = parseInscricoes(html, basename(input)); await writeFile(output, JSON.stringify(snapshot, null, 2)); console.log(`Snapshot gerado: ${snapshot.locais.length} locais, ${snapshot.ofertas.length} registros`)
}
