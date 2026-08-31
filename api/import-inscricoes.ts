import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseInscricoes } from '../scripts/parse-inscricoes.mjs'
import { asWebRequest, sendWebResponse } from './http.mjs'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const BUCKET = 'cetec-flow-imports'

type ImportRow = {
  import_id: string
  local_code: string
  etec_code: string
  local_type: string
  municipality: string
  etec_name: string
  regional: string
  government_region: string
  course: string
  period: string
  vacancies: number
  paid: number
  unpaid: number
  is_trainee: boolean
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))

async function handle(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const allowedEmails = (process.env.CETEC_IMPORTER_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!url || !serviceRoleKey || !allowedEmails.length) return json({ error: 'Importação ainda não foi configurada no servidor.' }, 503)
  if (!token) return json({ error: 'Faça login para importar uma planilha.' }, 401)

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.email || !allowedEmails.includes(user.email.toLowerCase())) return json({ error: 'Este usuário não tem permissão para importar planilhas.' }, 403)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_FILE_BYTES) return json({ error: 'A planilha ultrapassa o limite de 5 MB.' }, 413)

  const fileName = decodeURIComponent(request.headers.get('x-file-name') ?? 'importacao.xls')
  if (!/\.xls$/i.test(fileName)) return json({ error: 'Envie a exportação .xls do Vestibulinho.' }, 415)

  const file = Buffer.from(await request.arrayBuffer())
  if (!file.length) return json({ error: 'A planilha está vazia.' }, 400)
  if (file.length > MAX_FILE_BYTES) return json({ error: 'A planilha ultrapassa o limite de 5 MB.' }, 413)

  let snapshot: ReturnType<typeof parseInscricoes>
  try {
    snapshot = parseInscricoes(file.toString('latin1'), fileName)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Não foi possível ler a planilha.' }, 422)
  }

  if (!snapshot.locais.length || !snapshot.ofertas.length) return json({ error: 'A planilha não possui locais ou ofertas válidas.' }, 422)

  const checksum = createHash('sha256').update(file).digest('hex')
  const { data: duplicate, error: duplicateError } = await supabase.from('cetec_imports').select('id, reference_at').eq('source_checksum', checksum).maybeSingle()
  if (duplicateError) return json({ error: 'Não foi possível verificar importações anteriores.' }, 500)
  if (duplicate) return json({ error: `Esta mesma planilha já foi importada em ${new Date(duplicate.reference_at).toLocaleString('pt-BR')}.` }, 409)

  const editionPath = snapshot.metadata.edicao.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const sourcePath = `${editionPath}/${new Date().toISOString()}-${checksum.slice(0, 12)}.xls`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(sourcePath, file, {
    contentType: 'application/vnd.ms-excel',
    upsert: false,
  })
  if (uploadError) return json({ error: 'Não foi possível salvar o arquivo original.' }, 500)

  const total = snapshot.metadata.total_geral
  const { data: importRecord, error: importError } = await supabase.from('cetec_imports').insert({
    edition: snapshot.metadata.edicao,
    source_file_name: fileName,
    source_checksum: checksum,
    source_path: sourcePath,
    reference_at: snapshot.metadata.data_referencia,
    status: 'processing',
    records_count: snapshot.ofertas.length,
    total_paid: total.pagos,
    total_unpaid: total.nao_pagos,
    total_vacancies: total.vagas,
  }).select('id').single()
  if (importError || !importRecord) return json({ error: 'Não foi possível registrar a importação.' }, 500)

  const localByCode = new Map(snapshot.locais.map((local) => [local.codigo_completo, local]))
  const rows: ImportRow[] = snapshot.ofertas.map((offer) => {
    const local = localByCode.get(offer.codigo_local)
    if (!local) throw new Error(`Local não encontrado para ${offer.codigo_local}.`)
    return {
      import_id: importRecord.id,
      local_code: offer.codigo_local,
      etec_code: local.codigo_etec,
      local_type: local.tipo_local,
      municipality: local.municipio,
      etec_name: local.nome,
      regional: local.regiao_administrativa,
      government_region: local.regiao_governo,
      course: offer.curso,
      period: offer.periodo,
      vacancies: offer.vagas,
      paid: offer.pagos,
      unpaid: offer.nao_pagos,
      is_trainee: offer.is_treineiro,
    }
  })

  try {
    for (const batch of chunk(rows, 250)) {
      const { error } = await supabase.from('cetec_enrollment_snapshots').insert(batch)
      if (error) throw error
    }
    await supabase.from('cetec_imports').update({ is_active: false }).eq('edition', snapshot.metadata.edicao).eq('is_active', true)
    const { error: activateError } = await supabase.from('cetec_imports').update({ is_active: true, status: 'completed' }).eq('id', importRecord.id)
    if (activateError) throw activateError
  } catch (error) {
    await supabase.from('cetec_imports').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Falha ao gravar as ofertas.' }).eq('id', importRecord.id)
    return json({ error: 'A importação não foi publicada. Os dados anteriores foram preservados.' }, 500)
  }

  return json({
    edition: snapshot.metadata.edicao,
    referenceAt: snapshot.metadata.data_referencia,
    records: snapshot.ofertas.length,
    totals: { paid: total.pagos, unpaid: total.nao_pagos, enrolled: total.total_inscritos },
  })
}

export default async function handler(request: Request | IncomingMessage, response?: ServerResponse) {
  return sendWebResponse(await handle(await asWebRequest(request)), response)
}
