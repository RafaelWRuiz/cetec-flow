import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asWebRequest, sendWebResponse } from './http.mjs'

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

async function handle(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return json({ import: null, links: [] })
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: record, error } = await supabase.from('cetec_second_option_imports')
    .select('id, source_file_name, reference_at, offers')
    .eq('edition', 'Vestibulinho 2027.1').eq('status', 'completed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return json({ error: 'Não foi possível carregar a planilha de segunda opção.' }, 500)
  if (!record) return json({ import: null, links: [] })
  const links: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error: pageError } = await supabase.from('cetec_second_option_links')
      .select('source_turma_id, destination_turma_id, applicant_count')
      .eq('import_id', record.id).order('id', { ascending: true }).range(from, from + 999)
    if (pageError) return json({ error: 'Não foi possível carregar os vínculos de segunda opção.' }, 500)
    links.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }
  return json({ import: record, links })
}

export default async function handler(request: Request | IncomingMessage, response?: ServerResponse) {
  return sendWebResponse(await handle(await asWebRequest(request)), response)
}
