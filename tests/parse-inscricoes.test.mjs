import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseInscricoes } from '../scripts/parse-inscricoes.mjs'

const html = await readFile(new URL('../Total_de_Inscritos_PAGOS_e_NÃO_PAGOS_por_curso.xls', import.meta.url), 'latin1')
const snapshot = parseInscricoes(html)
test('importa blocos S, M e E, incluindo a primeira unidade', () => { assert.equal(snapshot.locais.length, 340); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'S')); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'M')); assert.ok(snapshot.locais.some((item) => item.tipo_local === 'E')); assert.equal(snapshot.locais[0].codigo_completo, 'E0063.S0000') })
test('preserva ofertas, treineiro, acentos e demanda recalculada', () => { assert.equal(snapshot.ofertas.filter((item) => !item.is_treineiro).length, 1059); assert.equal(snapshot.ofertas.filter((item) => item.is_treineiro).length, 340); const item = snapshot.ofertas.find((offer) => offer.curso === 'Zootecnia'); assert.equal(item.demanda_calculada, 2); assert.ok(snapshot.locais.some((item) => item.municipio.includes('Adamantina'))) })
test('reconcilia o total geral', () => { const total = snapshot.metadata.total_geral; assert.deepEqual([total.vagas, total.pagos, total.nao_pagos, total.total_inscritos], [29063, 56470, 30609, 87079]) })
