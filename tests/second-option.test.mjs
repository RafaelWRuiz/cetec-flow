import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasSecondOption, withSecondOption, secondOptionSeries } from '../src/lib/secondOption.ts'

const offer = { paid: 22, unpaid: 8, secondOptionPaid: 280, secondOptionUnpaid: 116, vacancies: 35, demand: 30 / 35, isTrainee: false }

test('segunda opção soma pagos e pendentes sem duplicar vagas nem alterar a origem', () => {
  const projected = withSecondOption(offer)
  assert.deepEqual([projected.paid, projected.unpaid, projected.vacancies, projected.demand], [302, 124, 35, 426 / 35])
  assert.deepEqual([offer.paid, offer.unpaid], [22, 8])
  assert.deepEqual(withSecondOption(offer), projected)
  const trainee = { ...offer, isTrainee: true }
  assert.equal(withSecondOption(trainee), trainee)
})

test('zero de segunda opção é conhecido; importações antigas ou incompletas são indisponíveis', () => {
  assert.equal(hasSecondOption([{ ...offer, secondOptionPaid: 0, secondOptionUnpaid: 0 }]), true)
  assert.equal(hasSecondOption([{ ...offer, secondOptionPaid: null }]), false)
  assert.equal(hasSecondOption([{ ...offer, secondOptionPaid: undefined }]), false)
  assert.equal(hasSecondOption([]), false)
})

test('histórico combinado exclui datas sem segunda opção em vez de produzir um salto artificial', () => {
  const source = [
    { referenceAt: '2026-10-08', enrollments: [{ ...offer, secondOptionPaid: null }] },
    { referenceAt: '2026-10-09', enrollments: [offer] },
  ]
  const result = secondOptionSeries(source)
  assert.equal(result.length, 1)
  assert.equal(result[0].referenceAt, '2026-10-09')
  assert.equal(result[0].enrollments[0].paid, 302)
  assert.equal(source[1].enrollments[0].paid, 22)
})
