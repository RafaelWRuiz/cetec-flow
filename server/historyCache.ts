import type { SupabaseClient } from '@supabase/supabase-js'
import { compactHistory, HISTORY_PACK_SIZE, type CompactHistory } from '../src/lib/compactHistory.ts'
import { BUCKET, loadPreparedDashboard, type ImportRecord, type PreparedDashboard } from './dashboardCache.ts'

const cache = new Map<string, CompactHistory>()
const pending = new Map<string, Promise<CompactHistory>>()
const pathFor = (records: ImportRecord[]) => `history/v1/${records.at(-1)!.id}-${records.length}.json`
export function historyGroups<T>(records: T[]): T[][] {
  return Array.from({ length: Math.ceil(records.length / HISTORY_PACK_SIZE) }, (_, index) => records.slice(index * HISTORY_PACK_SIZE, (index + 1) * HISTORY_PACK_SIZE))
}

export async function historyRecords(supabase: SupabaseClient, active: ImportRecord) {
  const { data, error } = await supabase.from('cetec_imports').select('id, edition, source_file_name, reference_at').eq('edition', active.edition).eq('status', 'completed').lte('reference_at', active.reference_at).order('reference_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as ImportRecord[]
}

export async function loadHistoryPack(supabase: SupabaseClient, records: ImportRecord[], namespace: string, current?: PreparedDashboard): Promise<CompactHistory> {
  const key = `${namespace}:${records.map(item => item.id).join(',')}`
  const cached = cache.get(key)
  if (cached) return cached
  const existing = pending.get(key)
  if (existing) return existing
  const task = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).download(pathFor(records))
    if (!error && data) {
      try {
        const pack = JSON.parse(await data.text()) as CompactHistory
        if (pack.version === 1 && JSON.stringify(pack.importIds) === JSON.stringify(records.map(item => item.id)) && pack.snapshots?.length === records.length && pack.snapshots.every((snapshot, index) => Date.parse(snapshot.referenceAt) === Date.parse(records[index].reference_at)) && Array.isArray(pack.offers)) return pack
      } catch { /* Rebuild missing or corrupt packs from the source snapshots. */ }
    }
    const snapshots: PreparedDashboard[] = new Array(records.length)
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
    while (cache.size > 16) cache.delete(cache.keys().next().value!)
    return pack
  } finally { pending.delete(key) }
}

export async function savePreparedHistory(supabase: SupabaseClient, active: ImportRecord, current: PreparedDashboard, namespace: string) {
  const previous = (await historyRecords(supabase, active)).filter(item => item.id !== active.id)
  const records = [...previous, active].sort((a, b) => Date.parse(a.reference_at) - Date.parse(b.reference_at) || a.id.localeCompare(b.id))
  for (const group of historyGroups(records)) {
    const pack = await loadHistoryPack(supabase, group, namespace, current)
    const { error } = await supabase.storage.from(BUCKET).upload(pathFor(group), Buffer.from(JSON.stringify(pack)), { contentType: 'application/json', upsert: true })
    if (error) throw error
  }
}
