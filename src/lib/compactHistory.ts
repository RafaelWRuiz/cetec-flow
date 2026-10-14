import type { Enrollment, SnapshotSeries } from '../data/mockData'

export const HISTORY_PACK_SIZE = 12
type Offer = [string, string, string, string, string | null, string, number, boolean, number, Enrollment['daily']]
export type CompactHistory = {
  version: 1
  importIds: string[]
  offers: Offer[]
  snapshots: { referenceAt: string; rows: [number, number, number, number | null, number | null][] }[]
}

export function compactHistory(importIds: string[], snapshots: SnapshotSeries[]): CompactHistory {
  const offers: Offer[] = []
  const dictionary = new Map<string, number>()
  return { version: 1, importIds, offers, snapshots: snapshots.map(snapshot => ({
    referenceAt: snapshot.referenceAt,
    rows: snapshot.enrollments.map(item => {
      const { paid, unpaid, secondOptionPaid, secondOptionUnpaid } = item
      const offer: Offer = [item.etec, item.regional, item.modality, item.course, item.axis ?? null, item.period, item.vacancies, item.isTrainee, item.target, item.daily]
      const key = JSON.stringify(offer)
      let index = dictionary.get(key)
      if (index === undefined) { index = offers.length; dictionary.set(key, index); offers.push(offer) }
      return [index, paid, unpaid, secondOptionPaid ?? null, secondOptionUnpaid ?? null]
    }),
  })) }
}

export function expandHistory(pack: CompactHistory): SnapshotSeries[] {
  if (pack.version !== 1 || !Array.isArray(pack.offers) || !Array.isArray(pack.snapshots)) throw new Error('Histórico inválido.')
  return pack.snapshots.map(snapshot => ({ referenceAt: snapshot.referenceAt, enrollments: snapshot.rows.map(([index, paid, unpaid, secondOptionPaid, secondOptionUnpaid]) => {
    const offer = pack.offers[index]
    if (!offer || !Number.isFinite(paid) || !Number.isFinite(unpaid)) throw new Error('Histórico inválido.')
    const [etec, regional, modality, course, axis, period, vacancies, isTrainee, target, daily] = offer
    return { etec, regional, modality, course, ...(axis === null ? {} : { axis }), period, vacancies, isTrainee, target, daily, paid, unpaid, secondOptionPaid, secondOptionUnpaid, demand: vacancies ? (paid + unpaid) / vacancies : 0 }
  }) }))
}
