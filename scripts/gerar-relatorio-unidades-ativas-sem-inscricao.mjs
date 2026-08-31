import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseUnidadesSgc } from './extrair-unidades-sgc.mjs'

async function inputFiles(input) {
  const path = resolve(input)
  if ((await stat(path)).isFile()) return [path]
  const entries = await readdir(path, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && ['.html', '.htm'].includes(extname(entry.name).toLowerCase()))
    .map((entry) => resolve(path, entry.name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function gerarRelatorioUnidadesAtivasSemInscricao(input, outputPrefix) {
  const files = await inputFiles(input)
  if (!files.length) throw new Error('Nenhum arquivo HTML foi encontrado na origem informada.')

  const unidades = []
  for (const file of files) unidades.push(...parseUnidadesSgc(await readFile(file, 'utf8'), file))
  const filtradas = unidades.filter((unidade) => unidade.ativo === 'Ativo' && unidade.inscricao === 'Não habilitada')
  const output = resolve(outputPrefix)
  await mkdir(dirname(output), { recursive: true })

  const relatorio = {
    criterio: { ativo: 'Sim', inscricao: 'Não' },
    arquivos_processados: files.map((file) => basename(file)),
    total_unidades: filtradas.length,
    unidades: filtradas,
  }
  const columns = Object.keys(filtradas[0] ?? {})
  const csv = `\uFEFF${columns.join(';')}\n${filtradas.map((row) => columns.map((column) => csvCell(row[column])).join(';')).join('\n')}\n`
  await writeFile(`${output}.json`, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8')
  await writeFile(`${output}.csv`, csv, 'utf8')
  return { files: files.length, rows: filtradas.length, output }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, outputPrefix] = process.argv
  if (!input || !outputPrefix) {
    console.error('Uso: node scripts\\gerar-relatorio-unidades-ativas-sem-inscricao.mjs <html-ou-pasta> <prefixo-de-saida>')
    process.exitCode = 1
  } else {
    const result = await gerarRelatorioUnidadesAtivasSemInscricao(input, outputPrefix)
    console.log(`Relatório concluído: ${result.rows} unidades de ${result.files} arquivo(s).`)
    console.log(`Arquivos gerados: ${result.output}.csv e ${result.output}.json`)
  }
}
