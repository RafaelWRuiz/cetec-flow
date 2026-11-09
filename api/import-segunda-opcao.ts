import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asWebRequest, sendWebResponse } from './http.mjs'

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})
const passwordMatches = (expected: string, supplied: string) => {
  const a = Buffer.from(expected)
  const b = Buffer.from(supplied)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = process.env.CETEC_IMPORT_PASSWORD
  if (!url || !key || !password) return json({ error: 'Importação ainda não foi configurada no servidor.' }, 503)
  if (!passwordMatches(password, request.headers.get('x-import-password') ?? '')) return json({ error: 'Senha de importação inválida.' }, 401)
  const body = await request.json().catch(() => null) as {
    edition?: string
    sourceFileName?: string
    sourceChecksum?: string
    referenceAt?: string | null
    sourceRows?: number
    offers?: { id: string; municipality: string; unit: string; course: string; period: string; applicants: number | null; seats: number | null }[]
    links?: { sourceTurmaId: string; destinationTurmaId: string; applicantCount: number }[]
  } | null
  if (!body || body.edition !== 'Vestibulinho 2027.1' || !body.sourceFileName || !/^[a-f0-9]{64}$/i.test(body.sourceChecksum ?? '')
    || !Array.isArray(body.links) || !Array.isArray(body.offers) || body.offers.length !== body.sourceRows
    || !Number.isInteger(body.sourceRows) || body.sourceRows! < 1) {
    return json({ error: 'Dados da planilha de segunda opção inválidos.' }, 400)
  }
  if (body.referenceAt && !Number.isFinite(Date.parse(body.referenceAt))) return json({ error: 'Data de referência inválida.' }, 400)
  if (body.links.some(link => !link.sourceTurmaId || !link.destinationTurmaId || link.sourceTurmaId === link.destinationTurmaId || !Number.isInteger(link.applicantCount) || link.applicantCount < 0)) {
    return json({ error: 'A planilha contém vínculos inválidos.' }, 400)
  }
  const ids = new Set(body.offers.map(offer => offer.id))
  if (ids.size !== body.offers.length || body.offers.some(offer => !offer.id || !offer.unit || !offer.course || !offer.period || !Number.isInteger(offer.applicants) || !Number.isInteger(offer.seats))
    || body.links.some(link => !ids.has(link.sourceTurmaId) || !ids.has(link.destinationTurmaId))) {
    return json({ error: 'As turmas e seus vínculos não conferem.' }, 400)
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const checksum = body.sourceChecksum!
  const { data: existing, error: lookupError } = await supabase.from('cetec_second_option_imports').select('id').eq('source_checksum', checksum).maybeSingle()
  if (lookupError) return json({ error: 'Não foi possível consultar importações anteriores.' }, 500)
  if (existing) return json({ error: 'Esta planilha já foi importada.' }, 409)
  const { data: record, error: insertError } = await supabase.from('cetec_second_option_imports').insert({
    edition: body.edition, source_file_name: body.sourceFileName, source_checksum: checksum,
    reference_at: body.referenceAt ?? null, source_rows: body.sourceRows, linked_pairs: body.links.length,
    offers: body.offers,
  }).select('id').single()
  if (insertError || !record) return json({ error: 'Não foi possível registrar a planilha.' }, 500)
  const links = body.links.map(link => ({ import_id: record.id, source_turma_id: link.sourceTurmaId, destination_turma_id: link.destinationTurmaId, applicant_count: link.applicantCount }))
  for (let offset = 0; offset < links.length; offset += 500) {
    const { error } = await supabase.from('cetec_second_option_links').insert(links.slice(offset, offset + 500))
    if (error) {
      await supabase.from('cetec_second_option_imports').delete().eq('id', record.id)
      return json({ error: 'Não foi possível gravar todos os vínculos. Nenhuma importação parcial foi mantida.' }, 500)
    }
  }
  return json({ records: body.sourceRows, links: links.length })
}

export default async function handler(request: Request | IncomingMessage, response?: ServerResponse) {
  return sendWebResponse(await handle(await asWebRequest(request)), response)
}
