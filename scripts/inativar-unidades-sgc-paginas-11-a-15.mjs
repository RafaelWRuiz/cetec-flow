import { createInterface } from 'node:readline/promises'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const SGC_BASE_URL = 'https://sgcvestibulinho.cps.sp.gov.br'
const SGC_UNIDADES_URL = `${SGC_BASE_URL}/sistema/painel/unidade`
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const SGC_PROFILE_PATH = resolve('output/sgc-chrome-profile')
const REPORT_PATH = 'output/relatorio_unidades_ativas_sem_inscricao.json'
const FIRST_PAGE = 11
const LAST_PAGE = 15

const ask = async (message) => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await terminal.question(message)
  terminal.close()
  return answer.trim()
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const absoluteUrl = (url) => new URL(url, SGC_BASE_URL).href

async function garantirAcesso(page) {
  const listaVisivel = await page.locator('#tbl-solicitacao').waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
  if (listaVisivel) {
    console.log('Sessão do SGC reutilizada.')
    return
  }
  await ask('\nConclua o login manualmente no Chrome. Quando a lista de unidades aparecer, pressione Enter aqui: ')
  await page.goto(SGC_UNIDADES_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('#tbl-solicitacao').waitFor({ state: 'visible', timeout: 30000 })
}

async function salvarAuditoria(outputPrefix, results, totalPlanejado) {
  const output = resolve(outputPrefix)
  await mkdir(dirname(output), { recursive: true })
  const columns = ['codigo', 'nome', 'cidade', 'pagina_sgc', 'resultado', 'status_antes', 'status_depois', 'detalhe', 'url_edicao']
  const csv = `\uFEFF${columns.join(';')}\n${results.map((result) => columns.map((column) => csvCell(result[column])).join(';')).join('\n')}\n`
  const summary = Object.fromEntries(['sucesso', 'erro', 'ja_inativa', 'status_inesperado'].map((status) => [status, results.filter((result) => result.resultado === status).length]))
  await writeFile(`${output}.json`, `${JSON.stringify({ objetivo: `Inativar unidades das páginas ${FIRST_PAGE} a ${LAST_PAGE}`, total_planejado: totalPlanejado, total_processado: results.length, resumo: summary, resultados: results }, null, 2)}\n`, 'utf8')
  await writeFile(`${output}.csv`, csv, 'utf8')
}

export async function inativarUnidadesPaginas11a15(outputPrefix = 'output/inativacao_unidades_paginas_11_a_15') {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'))
  const targets = report.unidades.filter((unit) => unit.pagina_sgc >= FIRST_PAGE && unit.pagina_sgc <= LAST_PAGE)
  if (!targets.length) throw new Error(`Nenhuma unidade das páginas ${FIRST_PAGE} a ${LAST_PAGE} foi encontrada no relatório.`)

  console.log(`Lote selecionado: ${targets.length} unidades das páginas ${FIRST_PAGE} a ${LAST_PAGE}.`)
  console.log(`Primeira: ${targets[0].codigo} - ${targets[0].nome}`)
  console.log(`Última: ${targets.at(-1).codigo} - ${targets.at(-1).nome}`)

  const browser = await chromium.launchPersistentContext(SGC_PROFILE_PATH, { executablePath: CHROME_PATH, headless: false })
  const results = []
  try {
    const page = await browser.newPage()
    await page.goto(SGC_UNIDADES_URL, { waitUntil: 'domcontentloaded' })
    await garantirAcesso(page)

    const confirmation = await ask(`\nEste lote pode alterar até ${targets.length} unidades. Digite INATIVAR ${targets.length} para iniciar ou pressione Enter para cancelar: `)
    if (confirmation !== `INATIVAR ${targets.length}`) {
      console.log('Lote cancelado: nenhuma unidade foi alterada.')
      return
    }

    for (const [index, unit] of targets.entries()) {
      const result = { codigo: unit.codigo, nome: unit.nome, cidade: unit.cidade, pagina_sgc: unit.pagina_sgc, resultado: 'erro', status_antes: '', status_depois: '', detalhe: '', url_edicao: absoluteUrl(unit.acao_editar_url) }
      try {
        await page.goto(result.url_edicao, { waitUntil: 'domcontentloaded' })
        const status = page.locator('#status')
        await status.waitFor({ state: 'visible', timeout: 30000 })
        result.status_antes = await status.locator('option:checked').innerText()
        if (result.status_antes === 'Inativa') {
          result.resultado = 'ja_inativa'
          result.status_depois = 'Inativa'
          result.detalhe = 'Nenhuma alteração enviada; a unidade já estava inativa.'
        } else if (result.status_antes !== 'Em atividade') {
          result.resultado = 'status_inesperado'
          result.status_depois = result.status_antes
          result.detalhe = 'Nenhuma alteração enviada; o status atual não era Em atividade.'
        } else {
          await status.selectOption('0')
          if (await status.inputValue() !== '0') throw new Error('O campo Status da unidade não foi selecionado como Inativa.')
          await page.locator('button[type="submit"]').click()
          await page.waitForTimeout(400)
          await page.goto(result.url_edicao, { waitUntil: 'domcontentloaded' })
          await status.waitFor({ state: 'visible', timeout: 30000 })
          const persistedStatus = await status.locator('option:checked').innerText()
          if (persistedStatus !== 'Inativa') throw new Error(`Após salvar, o status retornou como "${persistedStatus}".`)
          result.resultado = 'sucesso'
          result.status_depois = persistedStatus
          result.detalhe = 'Status confirmado como Inativa após recarregar a edição.'
        }
      } catch (error) {
        result.detalhe = error instanceof Error ? error.message : String(error)
      }
      results.push(result)
      console.log(`${index + 1}/${targets.length}: ${unit.codigo} - ${result.resultado}`)
    }
  } finally {
    await browser.close()
    await salvarAuditoria(outputPrefix, results, targets.length)
  }

  const success = results.filter((result) => result.resultado === 'sucesso').length
  const errors = results.filter((result) => result.resultado === 'erro').length
  console.log(`\nAuditoria salva: ${resolve(outputPrefix)}.csv e ${resolve(outputPrefix)}.json`)
  console.log(`Resultado: ${success} sucesso(s), ${errors} erro(s). Consulte a auditoria para os demais status.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await inativarUnidadesPaginas11a15()
}
