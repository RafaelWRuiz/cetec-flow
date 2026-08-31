import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asWebRequest, sendWebResponse } from './http.mjs'

type ImportRecord = { id: string; edition: string; source_file_name: string; reference_at: string }
type SnapshotRow = { local_code: string; municipality: string | null; etec_name: string | null; regional: string | null; course: string; period: string; vacancies: number; paid: number; unpaid: number; is_trainee: boolean }

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' } })

async function loadRows(supabase: SupabaseClient, importId: string) {
  const rows: SnapshotRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('cetec_enrollment_snapshots').select('local_code, municipality, etec_name, regional, course, period, vacancies, paid, unpaid, is_trainee').eq('import_id', importId).range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function handle(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return json({ snapshots: null })

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: active, error: activeError } = await supabase.from('cetec_imports').select('id, edition, source_file_name, reference_at').eq('is_active', true).eq('status', 'completed').order('reference_at', { ascending: false }).limit(1).maybeSingle<ImportRecord>()
  if (activeError) return json({ error: 'Não foi possível carregar a versão ativa.' }, 500)
  if (!active) return json({ snapshots: null })

  const { data: previous, error: previousError } = await supabase.from('cetec_imports').select('id, edition, source_file_name, reference_at').eq('edition', active.edition).eq('status', 'completed').neq('id', active.id).order('reference_at', { ascending: false }).limit(1).maybeSingle<ImportRecord>()
  if (previousError) return json({ error: 'Não foi possível carregar o histórico.' }, 500)

  try {
    const imports = [previous, active].filter(Boolean) as ImportRecord[]
    const loaded = await Promise.all(imports.map(async (item) => ({ item, rows: await loadRows(supabase, item.id) })))
    const current = loaded.at(-1)!
    const etecs = [...new Map(current.rows.map((row) => [row.local_code, { name: row.local_code, label: `${row.etec_name ?? row.local_code} (${row.local_code})`, city: row.municipality ?? '', municipality: row.municipality ?? '', regional: row.regional ?? '', x: 0, y: 0 }])).values()]
    const snapshots = loaded.map(({ item, rows }) => ({ referenceAt: item.reference_at, enrollments: rows.map((row) => ({ etec: row.local_code, regional: row.regional ?? '', modality: 'Não informado no arquivo', course: row.course, period: row.period, paid: row.paid, unpaid: row.unpaid, vacancies: row.vacancies, demand: row.vacancies ? (row.paid + row.unpaid) / row.vacancies : 0, target: 0, daily: [], isTrainee: row.is_trainee })) }))
    return json({ sourceMetadata: { edicao: active.edition, arquivo_origem: active.source_file_name, data_referencia: active.reference_at }, etecs, snapshots })
  } catch {
    return json({ error: 'Não foi possível carregar os dados da versão ativa.' }, 500)
  }
}

export default async function handler(request: Request | IncomingMessage, response?: ServerResponse) {
  return sendWebResponse(await handle(await asWebRequest(request)), response)
}
