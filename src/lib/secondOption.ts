import type { Enrollment, EtecPoint, SnapshotSeries } from '../data/mockData'

export type SecondOptionOffer = { id: string; municipality: string; unit: string; course: string; period: string; applicants: number; seats: number }
export type SecondOptionLink = { source_turma_id: string; destination_turma_id: string; applicant_count: number }
export type SecondOptionPayload = { import: { source_file_name: string; offers: SecondOptionOffer[] } | null; links: SecondOptionLink[]; error?: string }
export type MatchedSecondOptionOffer = { offer: SecondOptionOffer; enrollment: Enrollment }

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const sameCityOnlyDestination = normalize('Adamantina')

function destinationRelation(source: MatchedSecondOptionOffer, destination: MatchedSecondOptionOffer): { label: string; factor: number } {
  if (normalize(source.offer.course) === normalize(destination.offer.course)
    && normalize(source.offer.period) !== normalize(destination.offer.period)) return { label: 'Mesmo curso, outro período', factor: 0.9 }
  const sourceAxis = normalize(source.enrollment.axis ?? '')
  const destinationAxis = normalize(destination.enrollment.axis ?? '')
  return sourceAxis && sourceAxis === destinationAxis
    ? { label: 'Mesmo eixo', factor: 0.8 }
    : { label: 'Outro eixo ou eixo não identificado', factor: 0.6 }
}

export function isSecondOptionLinkAllowed(source: MatchedSecondOptionOffer, destination: MatchedSecondOptionOffer) {
  return normalize(destination.offer.municipality) !== sameCityOnlyDestination
    || normalize(source.offer.municipality) === sameCityOnlyDestination
}

export function matchSecondOptionOffers(enrollments: Enrollment[], etecs: EtecPoint[], offers: SecondOptionOffer[]) {
  const etecByName = new Map(etecs.map(etec => [etec.name, etec]))
  const key = (municipality: string, unit: string, course: string, period: string, seats: number) => [normalize(municipality), normalize(unit), normalize(course), normalize(period), seats].join('\u0000')
  const enrollmentIndex = new Map<string, Enrollment[]>()
  for (const item of enrollments) {
    if (item.isTrainee) continue
    const etec = etecByName.get(item.etec)
    if (!etec) continue
    const itemKey = key(etec.municipality, etec.label.replace(/\s*\([^)]*\)\s*$/, ''), item.course, item.period, item.vacancies)
    const matches = enrollmentIndex.get(itemKey) ?? []
    matches.push(item)
    enrollmentIndex.set(itemKey, matches)
  }
  const matched = new Map<string, MatchedSecondOptionOffer>()
  for (const offer of offers) {
    const options = enrollmentIndex.get(key(offer.municipality, offer.unit, offer.course, offer.period, offer.seats)) ?? []
    if (options.length === 1) matched.set(offer.id, { offer, enrollment: options[0] })
  }
  return matched
}

export const guaranteedByFirstOption = (entry: MatchedSecondOptionOffer) => entry.enrollment.vacancies > 0
  && entry.enrollment.paid / entry.enrollment.vacancies >= 1.5

export const paidShareOfApplicants = (entry: MatchedSecondOptionOffer) => entry.offer.applicants > 0
  ? Math.min(1, entry.enrollment.paid / entry.offer.applicants) : 0

export function validOutgoingSourceIds(matched: Map<string, MatchedSecondOptionOffer>, links: SecondOptionLink[]) {
  const outgoing = new Map<string, number>()
  for (const link of links) outgoing.set(link.source_turma_id, (outgoing.get(link.source_turma_id) ?? 0) + link.applicant_count)
  return new Set([...matched].filter(([id, entry]) => (outgoing.get(id) ?? 0) <= entry.offer.applicants).map(([id]) => id))
}

export type SecondOptionContribution = { source: MatchedSecondOptionOffer; destination: MatchedSecondOptionOffer; linkCount: number; surplusPaid: number; proportion: number; relation: string; factor: number; potential: number }

export function eligibleSecondOptionContributions(matched: Map<string, MatchedSecondOptionOffer>, links: SecondOptionLink[]): SecondOptionContribution[] {
  const contributions: SecondOptionContribution[] = []
  const validSources = validOutgoingSourceIds(matched, links)
  for (const link of links) {
    const source = matched.get(link.source_turma_id)
    const destination = matched.get(link.destination_turma_id)
    if (!source || !destination || !guaranteedByFirstOption(source)) continue
    if (!isSecondOptionLinkAllowed(source, destination)) continue
    if (!validSources.has(source.offer.id)) continue
    if (source.enrollment.paid <= 0) continue
    const surplusPaid = Math.max(0, source.enrollment.paid - source.enrollment.vacancies)
    const proportion = surplusPaid / source.enrollment.paid
    const { label: relation, factor } = destinationRelation(source, destination)
    const potential = Math.floor(link.applicant_count * proportion * factor)
    contributions.push({ source, destination, linkCount: link.applicant_count, surplusPaid, proportion, relation, factor, potential })
  }
  return contributions
}

export function guaranteedSourceSupport(matched: Map<string, MatchedSecondOptionOffer>, links: SecondOptionLink[]) {
  const support = new Map<string, number>()
  for (const { destination, potential } of eligibleSecondOptionContributions(matched, links)) {
    support.set(destination.offer.id, (support.get(destination.offer.id) ?? 0) + potential)
  }
  return support
}

export function secondOptionSeries(snapshots: SnapshotSeries[], etecs: EtecPoint[], offers: SecondOptionOffer[], links: SecondOptionLink[]): SnapshotSeries[] {
  return snapshots.map(snapshot => {
    const matched = matchSecondOptionOffers(snapshot.enrollments, etecs, offers)
    const support = guaranteedSourceSupport(matched, links)
    const supportByEnrollment = new Map<Enrollment, number>()
    for (const [offerId, entry] of matched) supportByEnrollment.set(entry.enrollment, support.get(offerId) ?? 0)
    return {
      ...snapshot,
      enrollments: snapshot.enrollments.map(item => {
        const potential = supportByEnrollment.get(item) ?? 0
        return {
          ...item,
          secondOptionPaid: potential,
          secondOptionUnpaid: 0,
        }
      }),
    }
  })
}

