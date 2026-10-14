export const EDITION = 'Vestibulinho 2027.1'
export const BUCKET = 'cetec-flow-imports'

const pathFor = id => `dashboard/v1/${id}.json`
const normalizeCourseKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  .replace(/^ensino medio com habilitacao profissional de tecnico em\s+/, '')
  .replace(/^tecnico em\s+/, '')
  .replace(/\s+-\s+(?:m[- ]?tec|mnp|ead|20% online|integrado ao ensino medio|novotec)\b.*$/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

export async function loadCourseAxes(supabase) {
  const { data, error } = await supabase.from('cetec_course_axes').select('course_key, technological_axis')
  if (error) return new Map()
  return new Map((data ?? []).map(item => [item.course_key, item.technological_axis]))
}

export function prepareDashboard(item, rows, axes) {
  const referenceAt = new Date(item.reference_at).toISOString()
  const etecs = [...new Map(rows.map(row => [row.local_code, { name: row.local_code, label: `${row.etec_name ?? row.local_code} (${row.local_code})`, city: row.municipality ?? '', municipality: row.municipality ?? '', regional: row.regional ?? '', x: 0, y: 0 }])).values()]
  const enrollments = rows.map(row => ({ etec: row.local_code, regional: row.regional ?? '', modality: 'Não informado no arquivo', course: row.course, axis: axes.get(normalizeCourseKey(row.course)) ?? '', period: row.period, paid: row.paid, unpaid: row.unpaid, secondOptionPaid: row.second_option_paid ?? null, secondOptionUnpaid: row.second_option_unpaid ?? null, vacancies: row.vacancies, demand: row.vacancies ? (row.paid + row.unpaid) / row.vacancies : 0, target: 0, daily: [], isTrainee: row.is_trainee }))
  return { version: 1, importId: item.id, sourceMetadata: { edicao: item.edition, arquivo_origem: item.source_file_name, data_referencia: referenceAt }, etecs, snapshots: [{ referenceAt, enrollments }] }
}

export async function savePreparedDashboard(supabase, prepared) {
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(prepared.importId), Buffer.from(JSON.stringify(prepared)), { contentType: 'application/json', upsert: true })
  if (error) throw error
}

const cache = new Map()
const pending = new Map()
export async function loadPreparedDashboard(supabase, item, namespace) {
  const key = `${namespace}:${item.id}`
  const cached = cache.get(key)
  if (cached) return cached
  const existing = pending.get(key)
  if (existing) return existing
  const task = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).download(pathFor(item.id))
    if (!error && data) {
      try {
        const prepared = JSON.parse(await data.text())
        if (prepared.version === 1 && prepared.importId === item.id && prepared.sourceMetadata?.edicao === item.edition && prepared.snapshots?.length === 1 && Date.parse(prepared.snapshots[0].referenceAt) === Date.parse(item.reference_at) && Array.isArray(prepared.snapshots[0].enrollments) && Array.isArray(prepared.etecs)) return prepared
      } catch { /* Missing/corrupt artifacts fall back to the source rows. */ }
    }
    const rows = []
    const axesPromise = loadCourseAxes(supabase)
    for (let from = 0; ; from += 1000) {
      const { data: page, error: rowsError } = await supabase.from('cetec_enrollment_snapshots').select('*').eq('import_id', item.id).order('id', { ascending: true }).range(from, from + 999)
      if (rowsError) throw rowsError
      rows.push(...(page ?? []))
      if (!page || page.length < 1000) break
    }
    return prepareDashboard(item, rows, await axesPromise)
  })()
  pending.set(key, task)
  try {
    const prepared = await task
    cache.set(key, prepared)
    while (cache.size > 8) cache.delete(cache.keys().next().value)
    return prepared
  } finally { pending.delete(key) }
}
