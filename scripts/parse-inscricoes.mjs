import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const decode = (value) => value.replace(/&nbsp;/gi, ' ').replace(/&aacute;/gi, 'á').replace(/&atilde;/gi, 'ã').replace(/&ccedil;/gi, 'ç').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&Aacute;/g, 'Á').replace(/&Atilde;/g, 'Ã').replace(/&Ccedil;/g, 'Ç').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&ordf;/gi, 'ª').replace(/&ordm;/gi, 'º').replace(/&#(d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const number = (value) => Number(String(value).replaceAll('.', '').replace(',', '.')) || 0
const cells = (html) => [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => decode(match[1]))

const parseLocationTitle = (title) => {
  const head = title.match(/^E(\d{4})\.([SME])(\d{4})\s+-\s+(.+?)\s+-\s+(.+?)\s+\(Região Administrativa(?: de)?\s+(.+?)\s+-\s+Região de Governo(?: de)?\s+(.+?)\)$/i) ?? title.match(/^E(\d{4})\.([SME])(\d{4})\s+-\s+(.+?)\s+-\s+(.+?)\s+\(Região Metropolitana de São Paulo\s+-\s+-\)$/i)
  if (!head) throw new Error(`Título de local inválido: ${title}`)
  const [, codigoEtec, tipoLocal, codigoLocal, municipio, nome, administrative = 'Região Metropolitana de São Paulo', government = '-'] = head
  const codigoCompleto = `E${codigoEtec}.${tipoLocal}${codigoLocal}`
  return {
    codigo_etec: `E${codigoEtec}`,
    tipo_local: tipoLocal,
    codigo_local: `${tipoLocal}${codigoLocal}`,
    codigo_completo: codigoCompleto,
    municipio,
    nome,
    regiao_administrativa: administrative,
    regiao_governo: government,
    titulo_original: title,
  }
}

const createOffer = (codigoLocal, values) => {
  const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values
  const vagasNumero = number(vagas); const totalNumero = number(totalInscritos)
  return {
    codigo_local: codigoLocal,
    curso,
    periodo,
    vagas: vagasNumero,
    pagos: number(pagos),
    nao_pagos: number(naoPagos),
    total_inscritos: totalNumero,
    demanda_original: demanda ? number(demanda) : null,
    demanda_calculada: vagasNumero > 0 ? totalNumero / vagasNumero : 0,
    is_treineiro: curso === 'Treineiro',
  }
}

const createSnapshot = ({ source, sourceDate, locais, ofertas }) => {
  if (!sourceDate) throw new Error('Data/hora de referência ausente no arquivo; informe-a na importação.')
  const total = ofertas.reduce((sum, item) => ({ vagas: sum.vagas + item.vagas, pagos: sum.pagos + item.pagos, nao_pagos: sum.nao_pagos + item.nao_pagos, total_inscritos: sum.total_inscritos + item.total_inscritos }), { vagas: 0, pagos: 0, nao_pagos: 0, total_inscritos: 0 })
  const [, day, month, year, time] = sourceDate
  return { metadata: { edicao: 'Vestibulinho 2026.2', arquivo_origem: source, data_referencia: `${year}-${month}-${day}T${time}:00-03:00`, total_geral: { ...total, demanda: total.vagas ? total.total_inscritos / total.vagas : 0 } }, locais, ofertas }
}

const decodeXml = (value) => decode(value)
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))

const zipEntry = (file, expectedName) => {
  let offset = 0
  while (offset + 30 <= file.length && file.readUInt32LE(offset) === 0x04034b50) {
    const flags = file.readUInt16LE(offset + 6)
    const compression = file.readUInt16LE(offset + 8)
    const compressedSize = file.readUInt32LE(offset + 18)
    const fileNameLength = file.readUInt16LE(offset + 26)
    const extraLength = file.readUInt16LE(offset + 28)
    if (flags & 0x08) throw new Error('A planilha possui um formato compactado não suportado.')
    const nameStart = offset + 30
    const name = file.subarray(nameStart, nameStart + fileNameLength).toString('utf8')
    const contentStart = nameStart + fileNameLength + extraLength
    const contentEnd = contentStart + compressedSize
    if (name === expectedName) {
      const compressed = file.subarray(contentStart, contentEnd)
      if (compression === 0) return compressed.toString('utf8')
      if (compression === 8) return inflateRawSync(compressed).toString('utf8')
      throw new Error('A planilha usa uma compactação não suportada.')
    }
    offset = contentEnd
  }
  throw new Error(`A planilha não possui o arquivo interno ${expectedName}.`)
}

const columnIndex = (reference) => {
  const letters = reference.match(/[A-Z]+/i)?.[0] ?? ''
  return [...letters.toUpperCase()].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0)
}

const xlsxRows = (file) => {
  const sharedStrings = [...zipEntry(file, 'xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => decodeXml(match[1]))
  const sheet = zipEntry(file, 'xl/worksheets/sheet1.xml')
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map((row) => {
    const values = Array(7).fill('')
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const reference = cell[1].match(/\br="([^"]+)"/i)?.[1]
      const column = reference ? columnIndex(reference) : 0
      if (!column || column > values.length) continue
      const type = cell[1].match(/\bt="([^"]+)"/i)?.[1]
      const raw = cell[2]
      const value = raw.match(/<v>([\s\S]*?)<\/v>/i)?.[1] ?? raw.match(/<t[^>]*>([\s\S]*?)<\/t>/i)?.[1] ?? ''
      values[column - 1] = type === 's' ? (sharedStrings[Number(value)] ?? '') : decodeXml(value)
    }
    return values.map((value) => value.replace(/\s+/g, ' ').trim())
  })
}

export function parseInscricoes(html, source = 'source.xls') {
  const sourceDate = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/)
  if (!sourceDate) throw new Error('Data/hora de referência ausente no arquivo; informe-a na importação.')
  const titles = [...html.matchAll(/E(\d{4})\.([SME])(\d{4})\s+-\s+([\s\S]*?)<\/strong>/gi)]
  const locais = []; const ofertas = []
  for (let index = 0; index < titles.length; index++) {
    const match = titles[index]; const title = decode(match[0]); const next = titles[index + 1]?.index ?? html.length
    const local = parseLocationTitle(title)
    const codigoCompleto = local.codigo_completo
    locais.push(local)
    // The first unit is embedded in the report's nested opening row.
    const section = html.slice(index === 0 ? Math.max(0, match.index - 1000) : match.index, next)
    for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const values = cells(row[1]); if (values.length !== 7 || values[0] === 'Curso') continue
      const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values
      if (!curso || !periodo) continue
      ofertas.push(createOffer(codigoCompleto, [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda]))
    }
    if (index === 0) {
      const values = cells(section); const header = values.indexOf('Curso')
      for (let cursor = header + 7; cursor >= 7 && cursor + 6 < values.length; cursor += 7) {
        const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values.slice(cursor, cursor + 7)
        if (!curso || curso === 'TOTAL' || periodo === 'Treineiro' || !/^\d+$/.test(vagas)) continue
        if (ofertas.some((offer) => offer.codigo_local === codigoCompleto && offer.curso === curso && offer.periodo === periodo)) continue
        ofertas.push(createOffer(codigoCompleto, [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda]))
      }
    }
  }
  return createSnapshot({ source, sourceDate, locais, ofertas })
}

export async function parseInscricoesXlsx(file, source = 'source.xlsx') {
  const rows = xlsxRows(file)

  const sourceDate = rows.flat().join(' ').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/)
  const sectionStarts = rows.flatMap((values, index) => /^E\d{4}\.[SME]\d{4}\s+-/i.test(values[0]) ? [{ index, title: values[0] }] : [])
  const locais = []; const ofertas = []

  for (let sectionIndex = 0; sectionIndex < sectionStarts.length; sectionIndex++) {
    const section = sectionStarts[sectionIndex]
    const local = parseLocationTitle(section.title)
    locais.push(local)
    const end = sectionStarts[sectionIndex + 1]?.index ?? rows.length
    for (let rowIndex = section.index + 1; rowIndex < end; rowIndex++) {
      const values = rows[rowIndex]
      const [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda] = values
      const isTreineiro = curso === 'Treineiro'
      if (!curso || curso === 'Curso' || curso === 'TOTAL' || !periodo || (!isTreineiro && !/^\d+(?:[.,]\d+)?$/.test(vagas))) continue
      ofertas.push(createOffer(local.codigo_completo, [curso, periodo, vagas, pagos, naoPagos, totalInscritos, demanda]))
    }
  }

  return createSnapshot({ source, sourceDate, locais, ofertas })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.length > 3) {
  const input = resolve(process.argv[2]); const output = resolve(process.argv[3]); const html = await readFile(input, 'latin1'); const snapshot = parseInscricoes(html, basename(input)); await writeFile(output, JSON.stringify(snapshot, null, 2)); console.log(`Snapshot gerado: ${snapshot.locais.length} locais, ${snapshot.ofertas.length} registros`)
}
