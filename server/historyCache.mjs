import { BUCKET, loadPreparedDashboard } from './dashboardCache.mjs'

export const HISTORY_PACK_SIZE = 12
const cache = new Map()
const pending = new Map()
const pathFor = records => `history/v1/${records.at(-1).id}-${records.length}.json`

export function historyGroups(records) {
  return Array.from({ length: Math.ceil(records.length / HISTORY_PACK_SIZE) }, (_, index) => records.slice(index * HISTORY_PACK_SIZE, (index + 1) * HISTORY_PACK_SIZE))
}

export async function historyRecords(supabase, active) {
  const { data, error } = await supabase.from('cetec_imports').select('id, edition, source_file_name, reference_at').eq('edition', active.edition).eq('status', 'completed').lte('reference_at', active.reference_at).order('reference_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

const compactHistory = (importIds, snapshots) => {
  const offers = []
  const dictionary = new Map()
  return { version: 1, importIds, offers, snapshots: snapshots.map(snapshot => ({
    referenceAt: snapshot.referenceAt,
    rows: snapshot.enrollments.map(item => {
      const { paid, unpaid, secondOptionPaid, secondOptionUnpaid } = item
      const offer = [item.etec, item.regional, item.modality, item.course, item.axis ?? null, item.period, item.vacancies, item.isTrainee, item.target, item.daily]
      const key = JSON.stringify(offer)
      let index = dictionary.get(key)
      if (index === undefined) { index = offers.length; dictionary.set(key, index); offers.push(offer) }
      return [index, paid, unpaid, secondOptionPaid ?? null, secondOptionUnpaid ?? null]
    }),
  })) }
}

export async function loadHistoryPack(supabase, records, namespace, current) {
  const key = `${namespace}:${records.map(item => item.id).join(',')}`
  const cached = cache.get(key)
  if (cached) return cached
  const existing = pending.get(key)
  if (existing) return existing
  const task = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).download(pathFor(records))
    if (!error && data) {
      try {
        const pack = JSON.parse(await data.text())
        if (pack.version === 1 && JSON.stringify(pack.importIds) === JSON.stringify(records.map(item => item.id)) && pack.snapshots?.length === records.length && pack.snapshots.every((snapshot, index) => Date.parse(snapshot.referenceAt) === Date.parse(records[index].reference_at)) && Array.isArray(pack.offers)) return pack
      } catch { /* Rebuild missing or corrupt packs from the source snapshots. */ }
    }
    const snapshots = new Array(records.length)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, records.length) }, async () => {
      while (cursor < records.length) {
        const index = cursor++
        snapshots[index] = records[index].id === current?.importId ? current : await loadPreparedDashboard(supabase, records[index], namespace)
      }
    }))
    return compactHistory(records.map(item => item.id), snapshots.flatMap(item => item.snapshots))
  })()
  pending.set(key, task)
  try {
    const pack = await task
    cache.set(key, pack)
    while (cache.size > 16) cache.delete(cache.keys().next().value)
    return pack
  } finally { pending.delete(key) }
}

export async function savePreparedHistory(supabase, active, current, namespace) {
  const previous = (await historyRecords(supabase, active)).filter(item => item.id !== active.id)
  const records = [...previous, active].sort((a, b) => Date.parse(a.reference_at) - Date.parse(b.reference_at) || a.id.localeCompare(b.id))
  for (const group of historyGroups(records)) {
    const pack = await loadHistoryPack(supabase, group, namespace, current)
    const { error } = await supabase.storage.from(BUCKET).upload(pathFor(group), Buffer.from(JSON.stringify(pack)), { contentType: 'application/json', upsert: true })
    if (error) throw error
  }
}
