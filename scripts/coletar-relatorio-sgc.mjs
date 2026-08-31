import { createInterface } from 'node:readline/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { parseUnidadesSgc } from './extrair-unidades-sgc.mjs'

const SGC_UNIDADES_URL = 'https://sgcvestibulinho.cps.sp.gov.br/sistema/painel/unidade'
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const SGC_PROFILE_PATH = resolve('output/sgc-chrome-profile')
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

async function aguardarLogin() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  await terminal.question('\nConclua o login manualmente no Chrome. Quando a lista de unidades aparecer, pressione Enter aqui para iniciar a coleta: ')
  terminal.close()
}

async function garantirAcesso(page) {
  const listaVisivel = await page.locator('#tbl-solicitacao').waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
  if (listaVisivel) {
    console.log('Sessão do SGC reutilizada.')
    return
  }
  await aguardarLogin()
  await page.goto(SGC_UNIDADES_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('#tbl-solicitacao').waitFor({ state: 'visible', timeout: 30000 })
}

async function totalPaginas(page) {
  const values = await page.locator('select[name="page"] option').evaluateAll((options) => options.map((option) => Number(option.getAttribute('value'))).filter(Number.isFinite))
  if (!values.length) throw new Error('A lista de unidades não foi encontrada. Confirme o login e a tela exibida antes de pressionar Enter.')
  return Math.max(...values)
}

export async function coletarRelatorioSgc(outputPrefix) {
  // Keep the local Chrome session so the user does not need to authenticate on every run.
  const browser = await chromium.launchPersistentContext(SGC_PROFILE_PATH, { executablePath: CHROME_PATH, headless: false })
  try {
    const page = await browser.newPage()
    await page.goto(SGC_UNIDADES_URL, { waitUntil: 'domcontentloaded' })
    await garantirAcesso(page)

    const pages = await totalPaginas(page)
    const unidades = []
    for (let currentPage = 1; currentPage <= pages; currentPage++) {
      const url = `${SGC_UNIDADES_URL}?page=${currentPage}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.locator('#tbl-solicitacao').waitFor({ state: 'visible', timeout: 30000 })
      unidades.push(...parseUnidadesSgc(await page.content(), `sgc_unidades_pagina_${currentPage}.html`))
      console.log(`Página ${currentPage}/${pages} coletada.`)
    }

    // The SGC can legitimately show distinct units with the same displayed code.
    // Keep every row and surface the repeated codes for later audit instead of losing data.
    const codigosRepetidos = [...new Set(unidades.filter((row, index) => unidades.findIndex((candidate) => candidate.codigo === row.codigo) !== index).map((row) => row.codigo))]

    const filtradas = unidades.filter((unidade) => unidade.ativo === 'Ativo' && unidade.inscricao === 'Não habilitada')
    const output = resolve(outputPrefix)
    await mkdir(dirname(output), { recursive: true })
    const relatorio = {
      criterio: { ativo: 'Sim', inscricao: 'Não' },
      total_paginas_coletadas: pages,
      total_unidades_lidas: unidades.length,
      total_unidades_no_relatorio: filtradas.length,
      codigos_repetidos_na_origem: codigosRepetidos,
      unidades: filtradas,
    }
    const columns = Object.keys(filtradas[0] ?? {})
    const csv = `\uFEFF${columns.join(';')}\n${filtradas.map((row) => columns.map((column) => csvCell(row[column])).join(';')).join('\n')}\n`
    await writeFile(`${output}.json`, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8')
    await writeFile(`${output}.csv`, csv, 'utf8')
    console.log(`\nRelatório salvo: ${output}.csv e ${output}.json`)
    console.log(`${filtradas.length} unidade(s) com Ativo = Sim e Inscrição = Não.`)
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPrefix = process.argv[2] ?? 'output/relatorio_unidades_ativas_sem_inscricao'
  await coletarRelatorioSgc(outputPrefix)
}
