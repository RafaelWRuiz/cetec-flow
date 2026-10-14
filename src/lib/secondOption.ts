import type { Enrollment, SnapshotSeries } from '../data/mockData'

export const hasSecondOption = (items: Enrollment[]) => items.some(item => !item.isTrainee)
  && items.filter(item => !item.isTrainee).every(item => item.secondOptionPaid != null && item.secondOptionUnpaid != null)

// Always project from the original first-option counts; toggling never mutates the source.
export function withSecondOption(item: Enrollment): Enrollment {
  if (item.isTrainee) return item
  const paid = item.paid + (item.secondOptionPaid ?? 0)
  const unpaid = item.unpaid + (item.secondOptionUnpaid ?? 0)
  return { ...item, paid, unpaid, demand: item.vacancies ? (paid + unpaid) / item.vacancies : 0 }
}

export function secondOptionSeries(snapshots: SnapshotSeries[]): SnapshotSeries[] {
  return snapshots.filter(snapshot => hasSecondOption(snapshot.enrollments))
    .map(snapshot => ({ ...snapshot, enrollments: snapshot.enrollments.map(withSecondOption) }))
}
