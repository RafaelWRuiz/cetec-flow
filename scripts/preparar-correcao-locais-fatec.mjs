import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseInscricoes, parseInscricoesXlsx } from './parse-inscricoes.mjs'

const EDITION = 'Vestibulinho 2027.1'
const BUCKET = 'cetec-flow-imports'
const OUTPUT = 'tmp/correcao-locais-fatec-2026-09-30'
const fields = ['course', 'period', 'vacancies', 'paid', 'unpaid', 'is_trainee']
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function loadRows(importId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('cetec_enrollment_snapshots')
      .select('id,import_id,local_code,etec_code,local_type,municipality,etec_name,regional,government_region,course,period,vacancies,paid,unpaid,is_trainee')
      .eq('import_id', importId).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

const { data: imports, error: importsError } = await supabase.from('cetec_imports')
  .select('id,source_file_name,source_path,reference_at,records_count')
  .eq('edition', EDITION).eq('status', 'completed').order('reference_at')
if (importsError) throw importsError
if (!imports?.length) throw new Error('Nenhuma importação concluída encontrada.')

const sites = new Map()
const corrections = []
const backup = []
let checkedRows = 0

for (const item of imports) {
  const [{ data: file, error: downloadError }, rows] = await Promise.all([
    supabase.storage.from(BUCKET).download(item.source_path),
    loadRows(item.id),
  ])
  if (downloadError) throw downloadError
  const bytes = Buffer.from(await file.arrayBuffer())
  const snapshot = /\.xlsx$/i.test(item.source_file_name)
    ? await parseInscricoesXlsx(bytes, item.source_file_name)
    : parseInscricoes(bytes.toString('latin1'), item.source_file_name)
  if (rows.length !== item.records_count || snapshot.ofertas.length !== rows.length) {
    throw new Error(`Contagem divergente na importação ${item.id}.`)
  }
  const locationByCode = new Map(snapshot.locais.map((local) => [local.codigo_completo, local]))
  let previousRecognized = null
  const oldCodeByFatec = new Map()
  for (const local of snapshot.locais) {
    if (local.tipo_local === 'F') oldCodeByFatec.set(local.codigo_completo, previousRecognized)
    else previousRecognized = local.codigo_completo
  }
  const available = new Map()
  for (const row of rows) {
    const key = JSON.stringify([row.local_code, ...fields.map((field) => row[field])])
    const candidates = available.get(key) ?? []
    candidates.push(row)
    available.set(key, candidates)
  }
  for (let index = 0; index < snapshot.ofertas.length; index++) {
    const offer = snapshot.ofertas[index]
    const local = locationByCode.get(offer.codigo_local)
    if (!local) throw new Error(`Local ausente para a oferta ${index} da importação ${item.id}.`)
    const expected = {
      course: offer.curso,
      period: offer.periodo,
      vacancies: offer.vagas,
      paid: offer.pagos,
      unpaid: offer.nao_pagos,
      is_trainee: offer.is_treineiro,
    }
    const oldCode = local.tipo_local === 'F' ? oldCodeByFatec.get(local.codigo_completo) : local.codigo_completo
    const key = JSON.stringify([oldCode, ...fields.map((field) => expected[field])])
    let row = available.get(key)?.pop()
    let alreadyCorrected = false
    if (!row && local.tipo_local === 'F') {
      const correctedKey = JSON.stringify([local.codigo_completo, ...fields.map((field) => expected[field])])
      row = available.get(correctedKey)?.pop()
      alreadyCorrected = Boolean(row)
    }
    if (!oldCode || !row) throw new Error(`Oferta ${index} da importação ${item.id} não coincide com a planilha original.`)
    checkedRows++
    if (local.tipo_local !== 'F') continue
    if (alreadyCorrected) {
      if (row.local_type !== 'F' || row.etec_code !== local.codigo_etec ||
        row.municipality !== local.municipio || row.etec_name !== local.nome ||
        row.regional !== local.regiao_administrativa || row.government_region !== local.regiao_governo) {
        throw new Error(`Metadados Fatec inesperados na oferta ${index} da importação ${item.id}.`)
      }
      continue
    }
    const oldLocal = locationByCode.get(oldCode)
    if (!oldLocal || row.etec_code !== oldLocal.codigo_etec || row.local_type !== oldLocal.tipo_local ||
      row.municipality !== oldLocal.municipio || row.etec_name !== oldLocal.nome ||
      row.regional !== oldLocal.regiao_administrativa || row.government_region !== oldLocal.regiao_governo) {
      throw new Error(`Metadados antigos inesperados na oferta ${index} da importação ${item.id}.`)
    }
    if (!sites.has(local.codigo_completo)) sites.set(local.codigo_completo, { index: sites.size, local })
    else {
      const known = sites.get(local.codigo_completo).local
      if (['codigo_etec', 'municipio', 'nome', 'regiao_administrativa', 'regiao_governo']
        .some((field) => known[field] !== local[field])) {
        throw new Error(`Metadados variáveis para ${local.codigo_completo}; é necessário separar por importação.`)
      }
    }
    const siteIndex = sites.get(local.codigo_completo).index
    corrections.push({ id: row.id, oldCode, siteIndex })
    backup.push({ id: row.id, import_id: item.id, previous: {
      local_code: row.local_code, etec_code: row.etec_code, local_type: row.local_type,
      municipality: row.municipality, etec_name: row.etec_name, regional: row.regional,
      government_region: row.government_region,
    }, corrected: local.codigo_completo })
  }
  if ([...available.values()].some((candidates) => candidates.length)) {
    throw new Error(`A importação ${item.id} contém ofertas adicionais ausentes na planilha original.`)
  }
  console.log(`${item.reference_at}: ${rows.length} ofertas verificadas`)
}

if (sites.size !== 39 || imports.length < 39 || !corrections.length) {
  throw new Error(`Escopo inesperado: ${imports.length} importações, ${sites.size} locais Fatec.`)
}

const siteValues = [...sites.values()].map(({ index, local }) => `(${index},${quote(local.codigo_completo)},${quote(local.codigo_etec)},${quote(local.municipio)},${quote(local.nome)},${quote(local.regiao_administrativa)},${quote(local.regiao_governo)})`).join(',\n')
const correctionValues = corrections.map((correction) => `(${correction.id},${quote(correction.oldCode)},${correction.siteIndex})`).join(',\n')
const sql = `BEGIN;
CREATE TEMP TABLE fatec_sites (site_index integer PRIMARY KEY, local_code text, etec_code text, municipality text, etec_name text, regional text, government_region text) ON COMMIT DROP;
CREATE TEMP TABLE fatec_corrections (row_id bigint PRIMARY KEY, old_code text, site_index integer) ON COMMIT DROP;
INSERT INTO fatec_sites VALUES\n${siteValues};
INSERT INTO fatec_corrections VALUES\n${correctionValues};
DO $$ BEGIN
  IF (SELECT count(*) FROM public.cetec_imports WHERE edition = '${EDITION}' AND status = 'completed') <> ${imports.length}
  THEN RAISE EXCEPTION 'Novas importações detectadas; gere um novo plano'; END IF;
  IF (SELECT count(*) FROM fatec_corrections c JOIN public.cetec_enrollment_snapshots s
      ON s.id = c.row_id AND s.local_code = c.old_code) <> ${corrections.length}
  THEN RAISE EXCEPTION 'Pré-verificação falhou; nenhuma linha foi corrigida'; END IF;
END $$;
UPDATE public.cetec_enrollment_snapshots s
SET local_code = site.local_code, etec_code = site.etec_code, local_type = 'F',
    municipality = site.municipality, etec_name = site.etec_name,
    regional = site.regional, government_region = site.government_region
FROM fatec_corrections c JOIN fatec_sites site ON site.site_index = c.site_index
WHERE s.id = c.row_id AND s.local_code = c.old_code;
DO $$ BEGIN
  IF (SELECT count(*) FROM fatec_corrections c JOIN fatec_sites site ON site.site_index = c.site_index
      JOIN public.cetec_enrollment_snapshots s ON s.id = c.row_id
      WHERE s.local_code = site.local_code AND s.local_type = 'F') <> ${corrections.length}
  THEN RAISE EXCEPTION 'Pós-verificação falhou; transação revertida'; END IF;
END $$;
COMMIT;
`

await mkdir('tmp', { recursive: true })
await Promise.all([
  writeFile(`${OUTPUT}.sql`, sql),
  writeFile(`${OUTPUT}-backup.json`, JSON.stringify({ edition: EDITION, imports: imports.map(({ id, reference_at }) => ({ id, reference_at })), rows: backup }, null, 2)),
])
console.log(`Plano criado: ${imports.length} importações, ${sites.size} Fatecs, ${checkedRows} ofertas verificadas, ${backup.length} linhas a corrigir.`)
