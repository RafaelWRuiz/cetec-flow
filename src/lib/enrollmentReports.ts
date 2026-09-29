import type { Enrollment, SnapshotSeries } from '../data/mockData'

export function reportTotals(items: Enrollment[]) {
  return items.reduce((sum, item) => ({
    paid: sum.paid + item.paid,
    unpaid: sum.unpaid + item.unpaid,
    total: sum.total + item.paid + item.unpaid,
    regularPaid: sum.regularPaid + (item.isTrainee ? 0 : item.paid),
    vacancies: sum.vacancies + (item.isTrainee ? 0 : item.vacancies),
  }), { paid: 0, unpaid: 0, total: 0, regularPaid: 0, vacancies: 0 })
}

export function dailyReports(snapshots: SnapshotSeries[]) {
  const days = new Map<string, SnapshotSeries>()
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  for (const snapshot of [...snapshots].sort((a, b) => Date.parse(a.referenceAt) - Date.parse(b.referenceAt))) {
    days.set(dayFormat.format(new Date(snapshot.referenceAt)), snapshot)
  }
  const positions = [...days.values()].map(snapshot => ({ referenceAt: snapshot.referenceAt, ...reportTotals(snapshot.enrollments) }))
  return positions.map((position, index) => {
    const previous = positions[index - 1]
    return { ...position, previousAt: previous?.referenceAt, delta: previous ? {
      paid: position.paid - previous.paid,
      unpaid: position.unpaid - previous.unpaid,
      total: position.total - previous.total,
    } : null }
  })
}

export function compareReports(initial: Enrollment[], final: Enrollment[], groupFor: (item: Enrollment) => string) {
  const groups = new Map<string, { initial: Enrollment[]; final: Enrollment[] }>()
  for (const [side, items] of [['initial', initial], ['final', final]] as const) {
    for (const item of items) {
      const key = groupFor(item)
      const group = groups.get(key) ?? { initial: [], final: [] }
      group[side].push(item)
      groups.set(key, group)
    }
  }
  return [...groups].map(([group, items]) => {
    const start = reportTotals(items.initial)
    const end = reportTotals(items.final)
    const difference = end.total - start.total
    return { group, start, end, difference, percent: start.total ? difference / start.total * 100 : null,
      conversion: end.total ? end.paid / end.total * 100 : null }
  }).sort((a, b) => b.difference - a.difference || a.group.localeCompare(b.group, 'pt-BR'))
}
