import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyReports, compareReports, reportTotals } from '../src/lib/enrollmentReports.ts'

const offer = (paid, unpaid, extra = {}) => ({ course: 'DS', etec: 'E001', vacancies: 40, paid, unpaid, isTrainee: false, ...extra })
test('demanda excludes trainees but registration totals include the selected trainees', () => {
  const totals = reportTotals([offer(111, 26), offer(8, 2, { isTrainee: true })])
  assert.equal(totals.total, 147)
  assert.equal(totals.regularPaid / totals.vacancies, 2.775)
})
test('daily reports select latest Brazil-day import and preserve negative balances and gaps', () => {
  const rows = dailyReports([
    { referenceAt: '2026-09-04T10:00:00-03:00', enrollments: [offer(20, 5)] },
    { referenceAt: '2026-09-03T01:00:00Z', enrollments: [offer(12, 10)] },
    { referenceAt: '2026-09-02T10:00:00-03:00', enrollments: [offer(10, 10)] },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].paid, 12)
  assert.equal(rows[0].delta, null)
  assert.deepEqual(rows[1].delta, { paid: 8, unpaid: -5, total: 3 })
  assert.equal(rows[1].previousAt, '2026-09-03T01:00:00Z')
})
test('comparison includes added and removed courses, with undefined percent for initial zero', () => {
  const rows = compareReports([offer(10, 10), offer(5, 0, { course: 'Old' })], [offer(30, 10), offer(4, 0, { course: 'New' })], item => item.course)
  const ds = rows.find(row => row.group === 'DS')
  assert.equal(ds.difference, 20)
  assert.equal(ds.percent, 100)
  assert.equal(ds.conversion, 75)
  assert.equal(rows.find(row => row.group === 'New').percent, null)
  assert.equal(rows.find(row => row.group === 'Old').difference, -5)
})
test('empty history does not invent dates', () => assert.deepEqual(dailyReports([]), []))
