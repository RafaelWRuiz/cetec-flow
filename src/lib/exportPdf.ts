import type { SecondOptionContribution } from './secondOption'
import { reportFilename, reportTimestamp } from './reportNaming.ts'

export type PdfCourseRow = { city: string; unit: string; course: string; period: string; paid: number; vacancies: number; current: number; estimated: number; projected: number; decision: 'Autorizado' | 'Não autorizado' | 'Sem análise'; origins?: SecondOptionContribution[] }
type PdfItem = { kind: 'course' | 'continuation' | 'origin'; row: PdfCourseRow; origin?: SecondOptionContribution }

const formatDemand = (value: number) => value.toFixed(2).replace('.', ',')
const pdfString = (value: string) => value.replace(/[\u2010-\u2015]/g, '-').replace(/[^\x20-\xff]/g, '?').replace(/[\\()]/g, '\\$&')
const shorten = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 3)}...` : value
const compactCourse = (value: string) => value.replace(/^Ensino Médio com Habilitação Profissional de Técnico em\s+/i, 'EM Técnico em ')
const drawText = (x: number, y: number, value: string, size = 8, bold = false, color = '0.11 0.22 0.28') => `${color} rg BT /F${bold ? 2 : 1} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfString(value)}) Tj ET\n`

function pdfFromPages(pages: string[]) {
  const pageWidth = 842
  const pageHeight = 595
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
  pages.forEach((content, index) => {
    const pageId = 5 + index * 2
    const streamId = pageId + 1
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`
    objects[streamId] = `<< /Length ${content.length} >>\nstream\n${content}endstream`
  })
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([Uint8Array.from(pdf, character => character.charCodeAt(0))], { type: 'application/pdf' })
}

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function createPdfReport(rows: PdfCourseRow[], referenceAt: string, secondOptionEnabled: boolean, expanded = false) {
  const perPage = 16
  const pageItems: PdfItem[][] = [[]]
  for (const row of rows) {
    const group: PdfItem[] = [{ kind: 'course', row }, ...(expanded ? (row.origins ?? []).map(origin => ({ kind: 'origin' as const, row, origin })) : [])]
    if (group.length <= perPage && pageItems.at(-1)!.length + group.length > perPage) pageItems.push([])
    for (const item of group) {
      if (pageItems.at(-1)!.length >= perPage) {
        pageItems.push([])
        if (item.kind === 'origin') pageItems.at(-1)!.push({ kind: 'continuation', row })
      }
      pageItems.at(-1)!.push(item)
    }
  }
  const pages: string[] = []
  const pageCount = pageItems.length
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const currentRows = pageItems[pageIndex]
    let content = '0.02 0.33 0.40 rg 0 555 842 40 re f\n'
    content += drawText(28, 570, 'Análise de demanda dos cursos | 2ª opção', 16, true, '1 1 1')
    content += drawText(28, 537, `Dados até ${reportTimestamp(referenceAt).label}  |  ${secondOptionEnabled ? 'Com 2ª opção' : 'Somente pagos reais'}  |  ${rows.length} ${rows.length === 1 ? 'curso abaixo' : 'cursos abaixo'} de 1,5  |  ${expanded ? 'Origens incluídas' : 'Somente cursos'}`, 8)
    content += '0.91 0.96 0.97 rg 28 500 786 22 re f\n'
    const headers: [number, string][] = [[34, 'Curso / origem'], [305, 'Cidade'], [389, 'Pagos/vagas'], [454, 'Atual/vínc.'], [504, '2ª opção'], [554, 'Demanda'], [609, 'Resultado/fator'], [689, 'Decisão']]
    for (const [x, label] of headers) content += drawText(x, 508, label, 7, true, '0.02 0.33 0.40')
    currentRows.forEach((item, index) => {
      const { row } = item
      const top = 500 - index * 27
      if (item.kind === 'origin' && item.origin) {
        const origin = item.origin
        content += drawText(42, top - 11, shorten(`Origem: ${compactCourse(origin.source.offer.course)}`, 46), 7.5)
        content += drawText(42, top - 21, shorten(`${origin.source.offer.period} - ${origin.source.offer.unit}`, 60), 6.5, false, '0.38 0.44 0.48')
        content += drawText(305, top - 15, shorten(origin.source.offer.municipality, 18), 7)
        content += drawText(389, top - 15, `${origin.source.enrollment.paid} / ${origin.source.enrollment.vacancies}`, 7)
        content += drawText(454, top - 15, String(origin.linkCount), 7)
        content += drawText(504, top - 15, formatDemand(origin.potential), 7)
        content += drawText(554, top - 15, `${Math.round(origin.proportion * 100)}%`, 7)
        content += drawText(609, top - 15, `${shorten(origin.relation, 12)} ${Math.round(origin.factor * 100)}%`, 6.5)
      } else {
        if (row.decision === 'Autorizado') content += `0.91 0.96 0.91 rg 28 ${top - 27} 786 27 re f\n`
        else if (row.decision === 'Não autorizado') content += `0.99 0.91 0.91 rg 28 ${top - 27} 786 27 re f\n`
        else content += `0.94 0.965 0.976 rg 28 ${top - 27} 786 27 re f\n`
        content += drawText(34, top - 11, shorten(`${compactCourse(row.course)}${item.kind === 'continuation' ? ' (continua)' : ''}`, 48), 8, true)
        content += drawText(34, top - 21, shorten(`${row.period} - ${row.unit}`, 63), 6.5, false, '0.38 0.44 0.48')
        content += drawText(305, top - 15, shorten(row.city, 18), 7)
        content += drawText(389, top - 15, `${row.paid} / ${row.vacancies}`, 7)
        content += drawText(454, top - 15, formatDemand(row.current), 7)
        content += drawText(504, top - 15, secondOptionEnabled ? String(row.estimated) : '-', 7)
        content += drawText(554, top - 15, formatDemand(row.projected), 7, true)
        content += drawText(609, top - 15, row.projected >= 1.5 ? 'Atinge 1,5' : 'Abaixo 1,5', 7)
        content += drawText(689, top - 15, row.decision, 7, true, row.decision === 'Autorizado' ? '0.09 0.40 0.20' : row.decision === 'Não autorizado' ? '0.70 0.14 0.09' : '0.40 0.45 0.50')
      }
    })
    content += drawText(28, 29, 'Pagos são reais. A 2ª opção, quando ativa, é uma estimativa.', 8, false, '0.38 0.44 0.48')
    content += drawText(759, 29, `${pageIndex + 1} / ${pageCount}`, 8, false, '0.38 0.44 0.48')
    pages.push(content)
  }

  return pdfFromPages(pages)
}

export function exportPdfReport(rows: PdfCourseRow[], referenceAt: string, secondOptionEnabled: boolean, expanded = false) {
  downloadPdf(createPdfReport(rows, referenceAt, secondOptionEnabled, expanded), reportFilename(referenceAt, 'pdf'))
}

export type PdfScenarioRow = { pair: number; city: string; unit: string; course: string; period: string; paid: number; vacancies: number; both: number; only: number; decision: string }

export function createScenarioPdfReport(rows: PdfScenarioRow[], referenceAt: string, secondOptionEnabled: boolean) {
  const perPage = 14
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    let content = '0.02 0.33 0.40 rg 0 555 842 40 re f\n'
    content += drawText(28, 570, 'Cenários de fechamento | 2ª opção', 16, true, '1 1 1')
    content += drawText(28, 537, `Dados até ${reportTimestamp(referenceAt).label}  |  ${secondOptionEnabled ? 'Com 2ª opção' : 'Somente pagos reais'}  |  ${rows.length / 2} pares`, 8)
    content += '0.91 0.96 0.97 rg 28 500 786 22 re f\n'
    for (const [x, label] of [[34, 'Par'], [62, 'Curso / unidade'], [300, 'Cidade'], [377, 'Pagos/vagas'], [452, 'Ambas'], [510, 'Só este'], [575, 'Resultado'], [665, 'Decisão']] as [number, string][]) content += drawText(x, 508, label, 7, true, '0.02 0.33 0.40')
    rows.slice(pageIndex * perPage, (pageIndex + 1) * perPage).forEach((row, index) => {
      const top = 500 - index * 29
      content += `${row.decision === 'Autorizado' ? '0.91 0.96 0.91' : row.decision === 'Não autorizado' ? '0.99 0.91 0.91' : '0.94 0.965 0.976'} rg 28 ${top - 29} 786 29 re f\n`
      content += drawText(34, top - 17, String(row.pair), 7, true)
      content += drawText(62, top - 12, shorten(compactCourse(row.course), 42), 8, true)
      content += drawText(62, top - 23, shorten(`${row.period} - ${row.unit}`, 49), 6.5, false, '0.38 0.44 0.48')
      content += drawText(300, top - 17, shorten(row.city, 16), 7)
      content += drawText(377, top - 17, `${row.paid} / ${row.vacancies}`, 7)
      content += drawText(452, top - 17, formatDemand(row.both), 7)
      content += drawText(510, top - 17, formatDemand(row.only), 7, true)
      content += drawText(575, top - 17, row.only >= 1.5 ? 'Atinge 1,5' : 'Abaixo 1,5', 7)
      content += drawText(665, top - 17, row.decision, 7, true)
    })
    content += drawText(28, 29, 'Ambas: cursos abertos. Só este: demanda se o outro curso do par fechar.', 8, false, '0.38 0.44 0.48')
    content += drawText(759, 29, `${pageIndex + 1} / ${pageCount}`, 8, false, '0.38 0.44 0.48')
    return content
  })
  return pdfFromPages(pages)
}

export function exportScenarioPdfReport(rows: PdfScenarioRow[], referenceAt: string, secondOptionEnabled: boolean) {
  downloadPdf(createScenarioPdfReport(rows, referenceAt, secondOptionEnabled), `Relatorio-de-Cenarios-de-Fechamento_${reportTimestamp(referenceAt).filename}.pdf`)
}
