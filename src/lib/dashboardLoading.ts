import type { EtecPoint, SnapshotSeries } from '../data/mockData'
import { expandHistory, type CompactHistory } from './compactHistory.ts'

export type HistoryEntry = { id: string; referenceAt: string }
export type DashboardResponse = { importId?: string; etecs?: EtecPoint[]; snapshots?: SnapshotSeries[] | null; history?: HistoryEntry[]; historyError?: string | null; historyPacks?: number; compactHistory?: CompactHistory }
const pending = new Map<string, Promise<DashboardResponse>>()
const snapshots = new Map<string, DashboardResponse>()
const latestDashboardKey = 'cetec-flow:latest-dashboard:v1'

export function readLatestDashboardCache(): DashboardResponse | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const saved = JSON.parse(localStorage.getItem(latestDashboardKey) ?? 'null') as { version?: number; payload?: DashboardResponse } | null
    return saved?.version === 1 && saved.payload?.importId && saved.payload.snapshots?.length ? saved.payload : null
  } catch { return null }
}

export async function fetchDashboard(url: string): Promise<DashboardResponse> {
  const cached = snapshots.get(url)
  if (cached) return cached
  const existing = pending.get(url)
  if (existing) return existing
  const task = (async () => {
    const response = await fetch(url)
    const result = await response.json() as DashboardResponse & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar os dados.')
    if (url.includes('importId=') || url.includes('historyFor=')) {
      snapshots.set(url, result)
      while (snapshots.size > 64) snapshots.delete(snapshots.keys().next().value!)
    }
    if (!url.includes('?') && result.importId && result.snapshots?.length && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(latestDashboardKey, JSON.stringify({ version: 1, payload: result })) } catch { /* Browser storage may be unavailable or full. */ }
    }
    return result
  })()
  pending.set(url, task)
  try { return await task } finally { pending.delete(url) }
}

export async function loadDashboardHistory(current: DashboardResponse, baseUrl: string, signal: AbortSignal, progress: (loaded: number, total: number) => void, onPartial?: (series: SnapshotSeries[]) => void): Promise<SnapshotSeries[]> {
  if (current.historyError) throw new Error(current.historyError)
  const initial = current.snapshots ?? []
  if (current.historyPacks !== undefined && current.importId) {
    const packs: CompactHistory[] = new Array(current.historyPacks)
    const completed: boolean[] = new Array(current.historyPacks).fill(false)
    let cursor = 0
    let visiblePackCount = 0
    const publishPrefix = () => {
      while (completed[visiblePackCount]) visiblePackCount++
      progress(visiblePackCount, packs.length)
      if (visiblePackCount) onPartial?.(packs.slice(0, visiblePackCount).flatMap(expandHistory))
    }
    const workers = Array.from({ length: Math.min(3, packs.length) }, async () => {
      while (cursor < packs.length) {
        signal.throwIfAborted()
        const part = cursor++
        const payload = await fetchDashboard(`${baseUrl}?historyFor=${encodeURIComponent(current.importId!)}&part=${part}`)
        signal.throwIfAborted()
        if (!payload.compactHistory) throw new Error('Não foi possível carregar o histórico.')
        packs[part] = payload.compactHistory
        completed[part] = true
        publishPrefix()
      }
    })
    const outcomes = await Promise.allSettled(workers)
    const failure = outcomes.find(item => item.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    signal.throwIfAborted()
    const ids = packs.flatMap(pack => pack.importIds)
    const expected = current.history ?? []
    const result = packs.flatMap(expandHistory)
    if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index].id || result[index]?.referenceAt !== expected[index].referenceAt)) throw new Error('O histórico recebido está incompleto.')
    return result.length ? result : initial
  }
  const entries = (current.history ?? []).filter(item => item.id !== current.importId)
  let cursor = 0
  let loaded = 0
  const result = [...initial]
  progress(0, entries.length)
  const workers = Array.from({ length: Math.min(3, entries.length) }, async () => {
    while (cursor < entries.length) {
      signal.throwIfAborted()
      const entry = entries[cursor++]
      const payload = await fetchDashboard(`${baseUrl}?importId=${encodeURIComponent(entry.id)}`)
      signal.throwIfAborted()
      const snapshot = payload.snapshots?.find(item => item.referenceAt === entry.referenceAt)
      if (!snapshot) throw new Error('Uma importação do histórico não pôde ser carregada.')
      result.push(snapshot)
      progress(++loaded, entries.length)
      if (onPartial) {
        const loadedById = new Map(result.map(item => [item.referenceAt, item]))
        const prefix = entries.slice(0, loaded).map(entry => loadedById.get(entry.referenceAt)).filter((item): item is SnapshotSeries => Boolean(item))
        onPartial(prefix)
      }
    }
  })
  const outcomes = await Promise.allSettled(workers)
  const failure = outcomes.find(item => item.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  signal.throwIfAborted()
  // Publish the history only when complete; partial data must not imply false deltas.
  return result.sort((a, b) => Date.parse(a.referenceAt) - Date.parse(b.referenceAt))
}
