import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchDashboard, loadDashboardHistory } from '../src/lib/dashboardLoading.ts'
import { compactHistory, expandHistory } from '../src/lib/compactHistory.ts'

test('histórico compacto preserva ofertas duplicadas, vagas e ausência de segunda opção', async () => {
  const offer = { etec: 'E1', regional: 'Regional', modality: '', course: 'Curso', axis: '', period: 'Manhã', vacancies: 40, target: 0, daily: [], isTrainee: false, paid: 22, unpaid: 8, demand: .75, secondOptionPaid: null, secondOptionUnpaid: null }
  const series = [{ referenceAt: '2026-10-01', enrollments: [offer, { ...offer }] }, { referenceAt: '2026-10-02', enrollments: [{ ...offer, paid: 40, demand: 1.2, secondOptionPaid: 0, secondOptionUnpaid: 3 }, { ...offer, vacancies: 35, demand: 30 / 35 }] }]
  const pack = compactHistory(['old', 'current'], series)
  assert.equal(pack.offers.length, 2)
  assert.deepEqual(expandHistory(pack), series)
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ compactHistory: pack }) }
  try {
    const current = { importId: 'current', snapshots: [series[1]], historyPacks: 1, history: series.map((item, index) => ({ id: pack.importIds[index], referenceAt: item.referenceAt })) }
    assert.deepEqual(await loadDashboardHistory(current, 'https://test.local/compact', new AbortController().signal, () => {}), series)
    await loadDashboardHistory(current, 'https://test.local/compact', new AbortController().signal, () => {})
    assert.equal(calls, 1)
    await assert.rejects(loadDashboardHistory({ ...current, history: [...current.history, { id: 'missing', referenceAt: '2026-10-03' }] }, 'https://test.local/compact', new AbortController().signal, () => {}), /incompleto/)
  } finally { globalThis.fetch = original }
})

test('deduplica a abertura e carrega histórico com no máximo três consultas simultâneas', async () => {
  const original = globalThis.fetch
  let calls = 0; let active = 0; let maximum = 0
  const current = { importId: 'current', snapshots: [{ referenceAt: '2026-10-12', enrollments: [] }], history: Array.from({ length: 7 }, (_, index) => ({ id: `old-${index}`, referenceAt: `2026-10-0${index + 1}` })) }
  globalThis.fetch = async url => {
    calls++; active++; maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active--
    const id = new URL(url).searchParams.get('importId')
    const result = id ? { snapshots: [{ referenceAt: current.history.find(item => item.id === id).referenceAt, enrollments: [] }] } : current
    return Response.json(result)
  }
  try {
    const base = 'https://test.local/dashboard-concurrency'
    const [first, second] = await Promise.all([fetchDashboard(base), fetchDashboard(base)])
    assert.equal(first, second)
    assert.equal(calls, 1)
    const series = await loadDashboardHistory(first, base, new AbortController().signal, () => {})
    assert.equal(series.length, 8)
    assert.equal(series.at(-1).referenceAt, '2026-10-12')
    assert.equal(maximum, 3)
    assert.equal(first.snapshots.length, 1)
    await loadDashboardHistory(first, base, new AbortController().signal, () => {})
    assert.equal(calls, 8, 'datas já carregadas são reutilizadas')
  } finally { globalThis.fetch = original }
})

test('não publica histórico parcial e permite repetir uma data que falhou', async () => {
  const original = globalThis.fetch
  const current = { importId: 'active', snapshots: [{ referenceAt: '2026-10-12', enrollments: [] }], history: [{ id: 'broken', referenceAt: '2026-10-10' }] }
  let failure = true
  globalThis.fetch = async () => failure ? Response.json({ error: 'Indisponível' }, { status: 500 }) : Response.json({ snapshots: [{ referenceAt: '2026-10-10', enrollments: [] }] })
  try {
    await assert.rejects(loadDashboardHistory(current, 'https://test.local/retry', new AbortController().signal, () => {}), /Indisponível/)
    assert.equal(current.snapshots.length, 1)
    failure = false
    assert.equal((await loadDashboardHistory(current, 'https://test.local/retry', new AbortController().signal, () => {})).length, 2)
    const controller = new AbortController(); controller.abort()
    await assert.rejects(loadDashboardHistory(current, 'https://test.local/retry', controller.signal, () => {}), { name: 'AbortError' })
  } finally { globalThis.fetch = original }
})
