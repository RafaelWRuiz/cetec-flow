import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { parseInscricoes, parseInscricoesXlsx } from '../scripts/parse-inscricoes.mjs'

const html = await readFile(new URL('../Total_de_Inscritos_PAGOS_e_NÃO_PAGOS_por_curso.xls', import.meta.url), 'latin1')
const snapshot = parseInscricoes(html)
test('importa blocos S, M e E, incluindo a primeira unidade', () => { assert.equal(snapshot.metadata.edicao, 'Vestibulinho 2027.1'); assert.equal(snapshot.locais.length, 340); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'S')); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'M')); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'E')); assert.equal(snapshot.locais[0].codigo_completo, 'E0063.S0000') })
test('preserva ofertas, treineiro, acentos e demanda recalculada', () => { assert.equal(snapshot.ofertas.filter((item) => !item.is_treineiro).length, 1059); assert.equal(snapshot.ofertas.filter((item) => item.is_treineiro).length, 340); assert.ok(snapshot.ofertas.every((item) => item.curso !== 'TOTAL' && item.periodo !== 'TOTAL')); const item = snapshot.ofertas.find((offer) => offer.curso === 'Zootecnia'); assert.equal(item.demanda_calculada, 2); assert.ok(snapshot.locais.some((item) => item.municipio.includes('Adamantina'))) })
test('reconcilia o total geral', () => { const total = snapshot.metadata.total_geral; assert.deepEqual([total.vagas, total.pagos, total.nao_pagos, total.total_inscritos], [29063, 56470, 30609, 87079]) })

const xlsxSample = 'C:/Users/rafae/OneDrive/CETEC Vestibulinho/demanda2026_1/demanda_2026-05-03.xlsx'
test('importa a exportação .xlsx do Vestibulinho', { skip: !existsSync(xlsxSample) }, async () => {
  const file = await readFile(xlsxSample)
  const xlsxSnapshot = await parseInscricoesXlsx(file, 'demanda_2026-05-03.xlsx')
  assert.equal(xlsxSnapshot.metadata.data_referencia, '2026-05-03T09:57:00-03:00')
  assert.equal(xlsxSnapshot.locais.length, 340)
  assert.equal(xlsxSnapshot.ofertas.filter((item) => !item.is_treineiro).length, 1059)
  assert.equal(xlsxSnapshot.ofertas.filter((item) => item.is_treineiro).length, 0)
  assert.deepEqual([xlsxSnapshot.metadata.total_geral.vagas, xlsxSnapshot.metadata.total_geral.pagos, xlsxSnapshot.metadata.total_geral.nao_pagos, xlsxSnapshot.metadata.total_geral.total_inscritos], [29063, 8792, 14715, 23507])
})
