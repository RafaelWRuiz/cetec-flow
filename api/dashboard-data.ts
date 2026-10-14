import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asWebRequest, sendWebResponse } from './http.mjs'
import { EDITION, loadPreparedDashboard } from '../server/dashboardCache.mjs'
import { historyGroups, historyRecords, loadHistoryPack } from '../server/historyCache.mjs'
import type { ImportRecord } from '../server/dashboardCache.ts'

const json = (body: Record<string, unknown>, status = 200, versioned = false) => new Response(JSON.stringify(body), { status, headers: {
  'cache-control': versioned ? 'public, max-age=3600, s-maxage=86400' : 'no-store',
  'content-type': 'application/json; charset=utf-8',
} })

async function handle(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return json({ snapshots: null })
  const params = new URL(request.url).searchParams
  const historyFor = params.get('historyFor')
  const requestedId = historyFor ?? params.get('importId')
  const part = Number(params.get('part'))
  if (historyFor && (!params.has('part') || !Number.isInteger(part) || part < 0)) return json({ error: 'Bloco inválido.' }, 400)
  if (requestedId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)) return json({ error: 'Importação inválida.' }, 400)
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const columns = 'id, edition, source_file_name, reference_at'
  let query = supabase.from('cetec_imports').select(columns).eq('edition', EDITION).eq('status', 'completed')
  query = requestedId ? query.eq('id', requestedId) : query.eq('is_active', true)
  const { data: active, error: activeError } = await query.order('reference_at', { ascending: false }).limit(1).maybeSingle<ImportRecord>()
  if (activeError) return json({ error: 'Não foi possível carregar a versão ativa.' }, 500)
  if (!active) return requestedId ? json({ error: 'Importação não encontrada.' }, 404) : json({ snapshots: null })
  try {
    if (historyFor) {
      const groups = historyGroups(await historyRecords(supabase, active))
      if (!groups[part]) return json({ error: 'Bloco não encontrado.' }, 404)
      return json({ compactHistory: await loadHistoryPack(supabase, groups[part], url) }, 200, true)
    }
    const preparedPromise = loadPreparedDashboard(supabase, active, url)
    if (requestedId) return json({ ...await preparedPromise }, 200, true)
    const historyPromise = historyRecords(supabase, active).then(data => ({ data, error: false }), () => ({ data: [] as ImportRecord[], error: true }))
    const [prepared, historyResult] = await Promise.all([preparedPromise, historyPromise])
    return json({ ...prepared, historyPacks: historyGroups(historyResult.data).length, history: historyResult.data.map(item => ({ id: item.id, referenceAt: new Date(item.reference_at).toISOString() })), historyError: historyResult.error ? 'Não foi possível consultar o histórico.' : null })
  } catch {
    return json({ error: 'Não foi possível carregar os dados da versão ativa.' }, 500)
  }
}

export default async function handler(request: Request | IncomingMessage, response?: ServerResponse) {
  return sendWebResponse(await handle(await asWebRequest(request)), response)
}
