import { createInterface } from 'node:readline/promises'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const SGC_BASE_URL = 'https://sgcvestibulinho.cps.sp.gov.br'
const SGC_UNIDADES_URL = `${SGC_BASE_URL}/sistema/painel/unidade`
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const REPORT_PATH = 'output/relatorio_unidades_ativas_sem_inscricao.json'
const TEST_LIMIT = 2
const SGC_PROFILE_PATH = resolve('output/sgc-chrome-profile')

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

async function salvarAuditoria(outputPrefix, results) {
  const output = resolve(outputPrefix)
  await mkdir(dirname(output), { recursive: true })
  const columns = ['codigo', 'nome', 'cidade', 'pagina_sgc', 'resultado', 'status_antes', 'status_depois', 'detalhe', 'url_edicao']
  const csv = `\uFEFF${columns.join(';')}\n${results.map((result) => columns.map((column) => csvCell(result[column])).join(';')).join('\n')}\n`
  await writeFile(`${output}.json`, `${JSON.stringify({ objetivo: 'Alterar Status da unidade para Inativa', total_processadas: results.length, resultados: results }, null, 2)}\n`, 'utf8')
  await writeFile(`${output}.csv`, csv, 'utf8')
}

export async function testarInativacaoUnidadesSgc(outputPrefix = 'output/teste_inativacao_2_unidades') {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'))
  const targets = report.unidades.slice(0, TEST_LIMIT)
  if (targets.length !== TEST_LIMIT) throw new Error(`O relatório precisa conter ao menos ${TEST_LIMIT} unidades.`)

  console.log('Unidades selecionadas para o teste:')
  for (const [index, unit] of targets.entries()) console.log(`${index + 1}. ${unit.codigo} - ${unit.nome} (${unit.cidade})`)

  // Reuse the local session created during the first manual login.
  const browser = await chromium.launchPersistentContext(SGC_PROFILE_PATH, { executablePath: CHROME_PATH, headless: false })
  const results = []
  try {
    const page = await browser.newPage()
    await page.goto(SGC_UNIDADES_URL, { waitUntil: 'domcontentloaded' })
    await garantirAcesso(page)

    for (const unit of targets) {
      const result = {
        codigo: unit.codigo,
        nome: unit.nome,
        cidade: unit.cidade,
        pagina_sgc: unit.pagina_sgc,
        resultado: 'erro',
        status_antes: '',
        status_depois: '',
        detalhe: '',
        url_edicao: absoluteUrl(unit.acao_editar_url),
      }
      try {
        await page.goto(result.url_edicao, { waitUntil: 'domcontentloaded' })
        const status = page.locator('#status')
        await status.waitFor({ state: 'visible', timeout: 30000 })
        result.status_antes = await status.locator('option:checked').innerText()
        await status.selectOption('0')
        result.status_depois = await status.locator('option:checked').innerText()
        if (result.status_depois !== 'Inativa') throw new Error(`O campo Status da unidade ficou em "${result.status_depois}".`)

        const confirmation = await ask(`\n${unit.codigo} - ${unit.nome}\nStatus atual: ${result.status_antes}. Novo status: Inativa. Digite SALVAR para confirmar esta alteração ou pressione Enter para pular: `)
        if (confirmation !== 'SALVAR') {
          result.resultado = 'ignorada_pelo_usuario'
          result.detalhe = 'A alteração não foi confirmada no terminal.'
          results.push(result)
          continue
        }

        await page.locator('button[type="submit"]').click()
        await page.waitForTimeout(800)
        await page.goto(result.url_edicao, { waitUntil: 'domcontentloaded' })
        await status.waitFor({ state: 'visible', timeout: 30000 })
        const persistedStatus = await status.locator('option:checked').innerText()
        if (persistedStatus !== 'Inativa') throw new Error(`Após salvar, o status retornou como "${persistedStatus}".`)

        result.resultado = 'sucesso'
        result.status_depois = persistedStatus
        result.detalhe = 'Status confirmado como Inativa após recarregar a edição.'
      } catch (error) {
        result.detalhe = error instanceof Error ? error.message : String(error)
      }
      results.push(result)
    }
  } finally {
    await browser.close()
    await salvarAuditoria(outputPrefix, results)
  }

  const success = results.filter((result) => result.resultado === 'sucesso').length
  const failures = results.filter((result) => result.resultado === 'erro').length
  const skipped = results.filter((result) => result.resultado === 'ignorada_pelo_usuario').length
  console.log(`\nAuditoria salva: ${resolve(outputPrefix)}.csv e ${resolve(outputPrefix)}.json`)
  console.log(`Resultado: ${success} sucesso(s), ${failures} erro(s), ${skipped} ignorada(s).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await testarInativacaoUnidadesSgc()
}
