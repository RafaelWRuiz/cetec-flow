import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const normalize = (value) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const attribute = (html, name) => html.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? ''
const iconState = (html, yes, no) => /fa-check-circle/i.test(html) ? yes : /fa-times-circle/i.test(html) ? no : ''
const urls = (html) => [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1])

function pageFromHtml(html, source) {
  const pageSelect = html.match(/<select\b[^>]*\bname=["']page["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? ''
  const selected = pageSelect.match(/<option\b[^>]*\bvalue=["'](\d+)["'][^>]*\bselected(?:=["'][^"']*["'])?[^>]*>/i)
  const fromName = basename(source).match(/(?:pagina|página|page)[\s_-]*(\d+)/i)
  return Number(selected?.[1] ?? fromName?.[1] ?? 0) || null
}

export function parseUnidadesSgc(html, source = 'pagina.html') {
  const table = html.match(/<table\b(?=[^>]*\bid=["']tbl-solicitacao["'])[^>]*>([\s\S]*?)<\/table>/i)?.[1]
  if (!table) throw new Error(`Tabela de unidades não encontrada em ${source}.`)

  const header = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => normalize(match[1]))
  const expected = ['Ativo', 'Inscrição', 'Código', 'Regional', 'Sede', 'Nome', 'Cidade', 'Ação']
  if (header.length !== expected.length || header.some((item, index) => item !== expected[index])) {
    throw new Error(`Colunas inesperadas em ${source}: ${header.join(', ') || 'nenhuma'}.`)
  }

  const pagina_sgc = pageFromHtml(html, source)
  const rows = []
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    if (cells.length !== expected.length) continue

    const contents = cells.map((cell) => cell[2])
    const actionUrls = urls(contents[7])
    rows.push({
      ativo: iconState(contents[0], 'Ativo', 'Inativo'),
      inscricao: iconState(contents[1], 'Habilitada', 'Não habilitada'),
      codigo: normalize(contents[2]),
      regional: normalize(contents[3]),
      sede: normalize(contents[4]),
      nome: normalize(contents[5]),
      cidade: normalize(contents[6]),
      acao_editar_url: actionUrls.find((url) => /\/edit\//i.test(url)) ?? '',
      acao_excluir_url: actionUrls.find((url) => /\/delete\//i.test(url)) ?? '',
      pagina_sgc,
      arquivo_origem: basename(source),
    })
  }
  return rows
}

async function htmlFiles(input) {
  const entries = await readdir(input, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && ['.html', '.htm'].includes(extname(entry.name).toLowerCase()))
    .map((entry) => resolve(input, entry.name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function extractUnidadesSgc(inputDirectory, outputPrefix) {
  const files = await htmlFiles(resolve(inputDirectory))
  if (!files.length) throw new Error('Nenhum arquivo .html ou .htm foi encontrado na pasta informada.')

  const rows = []
  for (const file of files) rows.push(...parseUnidadesSgc(await readFile(file, 'utf8'), file))
  rows.sort((a, b) => (a.pagina_sgc ?? Number.MAX_SAFE_INTEGER) - (b.pagina_sgc ?? Number.MAX_SAFE_INTEGER) || a.codigo.localeCompare(b.codigo, 'pt-BR'))

  const duplicateCodes = rows.filter((row, index) => rows.findIndex((candidate) => candidate.codigo === row.codigo) !== index)
  if (duplicateCodes.length) throw new Error(`Há códigos repetidos entre os HTMLs: ${[...new Set(duplicateCodes.map((row) => row.codigo))].join(', ')}`)

  const columns = Object.keys(rows[0])
  const csv = `\uFEFF${columns.join(';')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(';')).join('\n')}\n`
  const output = resolve(outputPrefix)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(`${output}.json`, `${JSON.stringify({ total_unidades: rows.length, unidades: rows }, null, 2)}\n`, 'utf8')
  await writeFile(`${output}.csv`, csv, 'utf8')
  return { files: files.length, rows: rows.length, output }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , inputDirectory, outputPrefix] = process.argv
  if (!inputDirectory || !outputPrefix) {
    console.error('Uso: node scripts\\extrair-unidades-sgc.mjs <pasta-com-htmls> <prefixo-de-saida>')
    process.exitCode = 1
  } else {
    const result = await extractUnidadesSgc(inputDirectory, outputPrefix)
    console.log(`Extração concluída: ${result.rows} unidades de ${result.files} arquivo(s).`)
    console.log(`Arquivos gerados: ${result.output}.csv e ${result.output}.json`)
  }
}
