import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/dashboard-data.ts'
import importHandler from '../api/import-inscricoes.ts'
import { prepareDashboard } from '../server/dashboardCache.ts'
import { compactHistory } from '../src/lib/compactHistory.ts'

test('bloco pronto entrega várias datas com uma leitura de Storage e sem consultar ofertas', async () => fakeEnvironment('history-pack', async () => {
  const records = [{ ...record, id: '22222222-2222-4222-8222-222222222222', reference_at: '2026-10-08T19:26:00+00:00' }, record]
  const pack = compactHistory(records.map(item => item.id), records.flatMap(item => prepareDashboard(item, [row], new Map()).snapshots))
  let reads = 0
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    assert.ok(!parsed.pathname.includes('cetec_enrollment_snapshots'))
    if (parsed.pathname.includes('/storage/')) { reads++; return Response.json(pack) }
    return Response.json(parsed.searchParams.get('reference_at')?.startsWith('lte.') ? records : [record])
  }
  for (let i = 0; i < 2; i++) {
    const response = await handler(new Request(`https://dashboard.test/api/dashboard-data?historyFor=${record.id}&part=0`))
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).compactHistory, pack)
    assert.match(response.headers.get('cache-control'), /s-maxage/)
  }
  assert.equal(reads, 1)
  assert.equal((await handler(new Request(`https://dashboard.test/api/dashboard-data?historyFor=${record.id}&part=9`))).status, 404)
  assert.equal((await handler(new Request(`https://dashboard.test/api/dashboard-data?historyFor=${record.id}&part=-1`))).status, 400)
}))

const record = { id: '11111111-1111-4111-8111-111111111111', edition: 'Vestibulinho 2027.1', source_file_name: 'source.xls', reference_at: '2026-10-09T19:26:00+00:00' }
const row = { local_code: 'E0063.S0000', municipality: 'Adamantina', etec_name: 'Etec', regional: 'Presidente Prudente', course: 'Agropecuária', period: 'Manhã', vacancies: 35, paid: 22, unpaid: 8, second_option_paid: 280, second_option_unpaid: 116, is_trainee: false }

async function fakeEnvironment(name, fn) {
  const originalFetch = globalThis.fetch
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, CETEC_IMPORT_PASSWORD: process.env.CETEC_IMPORT_PASSWORD }
  process.env.SUPABASE_URL = `https://${name}.supabase.test`
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.CETEC_IMPORT_PASSWORD = 'test-password'
  try { await fn() } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
}

test('abertura usa o arquivo pronto e devolve apenas a base atual mais lista de datas', async () => fakeEnvironment('prepared', async () => {
  const prepared = prepareDashboard(record, [row], new Map())
  const queries = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url); queries.push(parsed)
    if (parsed.pathname.includes('/storage/')) return Response.json(prepared)
    assert.ok(!parsed.pathname.includes('cetec_enrollment_snapshots'))
    return Response.json(parsed.searchParams.has('lte') || parsed.searchParams.get('reference_at')?.startsWith('lte.') ? [record, { id: '22222222-2222-4222-8222-222222222222', reference_at: '2026-10-08T19:26:00+00:00' }] : [record])
  }
  const response = await handler(new Request('https://dashboard.test/api/dashboard-data'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.snapshots.length, 1)
  assert.equal(payload.snapshots[0].referenceAt, payload.history[0].referenceAt)
  assert.equal(payload.history.length, 2)
  assert.equal(payload.snapshots[0].enrollments[0].secondOptionPaid, 280)
  const storageReads = queries.filter(url => url.pathname.includes('/storage/')).length
  const versioned = await handler(new Request(`https://dashboard.test/api/dashboard-data?importId=${record.id}`))
  assert.match(versioned.headers.get('cache-control'), /s-maxage/)
  assert.equal(queries.filter(url => url.pathname.includes('/storage/')).length, storageReads)
  assert.equal((await handler(new Request('https://dashboard.test/api/dashboard-data?importId=bad'))).status, 400)
}))

test('importação antiga sem arquivo pronto preserva paginação, todas as ofertas e não escreve ao abrir', async () => fakeEnvironment('fallback', async () => {
  const seenOffsets = []
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.method ?? 'GET', 'GET')
    const parsed = new URL(url)
    if (parsed.pathname.includes('/storage/')) return Response.json({ message: 'missing' }, { status: 404 })
    if (parsed.pathname.includes('cetec_course_axes')) return Response.json([])
    if (parsed.pathname.includes('cetec_enrollment_snapshots')) {
      const offset = Number(parsed.searchParams.get('offset') ?? 0); seenOffsets.push(offset)
      const count = offset < 2000 ? 1000 : 962
      return Response.json(Array.from({ length: count }, () => row))
    }
    return Response.json([record])
  }
  const response = await handler(new Request(`https://dashboard.test/api/dashboard-data?importId=${record.id}`))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).snapshots[0].enrollments.length, 2962)
  assert.deepEqual(seenOffsets, [0, 1000, 2000])
}))

test('arquivo pronto é gravado antes de ativar nova importação; falha preserva base anterior', async () => {
  for (const fail of [false, 'current', 'history']) await fakeEnvironment(`import-${fail}`, async () => {
    const events = []
    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url); const method = options.method ?? 'GET'
      if (parsed.pathname.includes('/storage/')) {
        if (parsed.pathname.includes('history/')) {
          if (method === 'GET') return Response.json({ message: 'missing' }, { status: 404 })
          events.push('history-prepared')
          if (fail === 'history') return Response.json({ message: 'storage unavailable' }, { status: 500 })
          assert.equal(JSON.parse(Buffer.from(options.body).toString()).snapshots.length, 1)
        }
        if (parsed.pathname.includes('dashboard/')) {
          events.push('prepared')
          if (fail === 'current') return Response.json({ message: 'storage unavailable' }, { status: 500 })
          const content = JSON.parse(Buffer.from(options.body).toString())
          assert.equal(content.snapshots[0].enrollments[0].secondOptionPaid, 280)
          assert.equal(content.snapshots.length, 1)
        }
        return Response.json({ Key: 'test' })
      }
      if (parsed.pathname.includes('cetec_course_axes')) return Response.json([])
      if (parsed.pathname.includes('cetec_enrollment_snapshots')) { events.push('rows'); return Response.json([]) }
      if (method === 'GET') return Response.json([])
      if (method === 'POST') return Response.json({ id: record.id })
      const body = JSON.parse(options.body)
      if (body.is_active === false) events.push('deactivate')
      if (body.is_active === true) events.push('activate')
      return Response.json([])
    }
    const title = 'E0063.S0000 - Adamantina - Etec (Região Administrativa de Presidente Prudente - Região de Governo de Adamantina)'
    const cells = ['Agropecuária', 'Manhã', '35', '22', '8', '30', '0,86', '280', '116', '396']
    const html = `09/10/2026 16:26 <strong>${title}</strong><tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`
    const response = await importHandler(new Request('https://dashboard.test/api/import-inscricoes', { method: 'POST', headers: { 'x-import-password': 'test-password', 'x-file-name': 'source.xls' }, body: Buffer.from(html, 'latin1') }))
    assert.equal(response.status, fail ? 500 : 200)
    assert.ok(events.indexOf('prepared') > events.indexOf('rows'))
    if (fail) assert.ok(!events.includes('deactivate') && !events.includes('activate'))
    else {
      assert.ok(events.indexOf('prepared') < events.indexOf('activate'))
      assert.ok(events.indexOf('history-prepared') < events.indexOf('activate'))
    }
  })
})
