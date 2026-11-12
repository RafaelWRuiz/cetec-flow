import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Enrollment, EtecPoint } from '../data/mockData'
import { eligibleSecondOptionContributions, guaranteedSourceSupport, matchSecondOptionOffers, type MatchedSecondOptionOffer, type SecondOptionContribution, type SecondOptionPayload } from '../lib/secondOption'
import { exportExcel } from '../lib/exportExcel'
import { exportPdfReport } from '../lib/exportPdf'
import { reportFilename, reportTimestamp } from '../lib/reportNaming'

export type CourseDecision = 'authorized' | 'denied'
export type ExportRequest = { format: 'xlsx' | 'pdf'; token: number }
type Props = { enrollments: Enrollment[]; etecs: EtecPoint[]; isInScope: (item: Enrollment) => boolean; payload: SecondOptionPayload | null; enabled: boolean; referenceAt: string; decisions: Record<string, CourseDecision>; onDecision: (id: string, value: CourseDecision) => void; exportRequest: ExportRequest | null }
const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const demand = (paid: number, vacancies: number) => vacancies ? paid / vacancies : 0

export default function SecondOptionProjectionReport({ enrollments, etecs, isInScope, payload, enabled, referenceAt, decisions, onDecision, exportRequest }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingExport, setPendingExport] = useState<'xlsx' | 'pdf' | null>(null)
  const exportDialogRef = useRef<HTMLDialogElement>(null)
  const lastExportToken = useRef<number | null>(null)
  useEffect(() => {
    const dialog = exportDialogRef.current
    if (pendingExport && dialog && !dialog.open) dialog.showModal()
  }, [pendingExport])
  const report = useMemo(() => {
    if (!payload?.import) return null
    const matched = matchSecondOptionOffers(enrollments, etecs, payload.import.offers)
    const contributions = eligibleSecondOptionContributions(matched, payload.links)
    const support = guaranteedSourceSupport(matched, payload.links)
    const byDestination = new Map<string, SecondOptionContribution[]>()
    for (const contribution of contributions) {
      const id = contribution.destination.offer.id
      byDestination.set(id, [...(byDestination.get(id) ?? []), contribution])
    }
    const rows = [...matched.values()].filter(entry => entry.enrollment.vacancies > 0 && isInScope(entry.enrollment))
      .sort((a, b) => demand(a.enrollment.paid, a.enrollment.vacancies) - demand(b.enrollment.paid, b.enrollment.vacancies) || a.offer.municipality.localeCompare(b.offer.municipality, 'pt-BR'))
    return { rows, support, byDestination }
  }, [enrollments, etecs, isInScope, payload])
  const visible = report?.rows.filter(entry => demand(entry.enrollment.paid, entry.enrollment.vacancies) < 1.5) ?? []
  const status = (entry: MatchedSecondOptionOffer): 'Autorizado' | 'Não autorizado' | 'Sem análise' => decisions[entry.offer.id] === 'authorized' ? 'Autorizado' : decisions[entry.offer.id] === 'denied' ? 'Não autorizado' : 'Sem análise'
  const requestExport = (format: 'xlsx' | 'pdf') => {
    if (!report) return
    if (enabled) setPendingExport(format)
    else runExport(format, false)
  }
  const closeExportDialog = () => {
    exportDialogRef.current?.close()
    setPendingExport(null)
  }
  const runExport = (format: 'xlsx' | 'pdf', expanded: boolean) => {
    if (format === 'xlsx') exportReport(expanded)
    else exportPdf(expanded)
    closeExportDialog()
  }
  const exportReport = (expanded: boolean) => {
    if (!report) return
    const rows: (string | number)[][] = [
      ['Análise de demanda dos cursos | 2ª opção'],
      [`Dados até ${reportTimestamp(referenceAt).label} | Recorte: ${enabled ? 'com 2ª opção' : 'somente pagos reais'} | ${visible.length} ${visible.length === 1 ? 'curso abaixo' : 'cursos abaixo'} de 1,5 | ${expanded ? 'Origens incluídas' : 'Somente cursos'}`],
      ['Tipo', 'Cidade', 'Unidade', 'Curso', 'Período', 'Pagos', 'Vagas', 'Demanda atual', 'Vínculos', 'Excedente / pagos', 'Relação', 'Fator', '2ª opção', 'Demanda final', 'Decisão'],
    ]
    const rowKinds: ('title' | 'meta' | 'header' | 'authorized' | 'denied' | 'course' | 'origin')[] = ['title', 'meta', 'header']
    for (const entry of visible) {
      const { offer, enrollment } = entry
      const links = enabled ? report.byDestination.get(offer.id) ?? [] : []
      const estimated = enabled ? report.support.get(offer.id) ?? 0 : 0
      rows.push(['CURSO', offer.municipality, offer.unit, offer.course, offer.period, enrollment.paid, enrollment.vacancies, demand(enrollment.paid, enrollment.vacancies), links.reduce((sum, link) => sum + link.linkCount, 0), '', '', '', estimated, demand(enrollment.paid + estimated, enrollment.vacancies), status(entry)])
      rowKinds.push(decisions[offer.id] === 'authorized' ? 'authorized' : decisions[offer.id] === 'denied' ? 'denied' : 'course')
      if (expanded) for (const link of links) {
        rows.push(['Origem', link.source.offer.municipality, link.source.offer.unit, link.source.offer.course, link.source.offer.period, link.source.enrollment.paid, link.source.enrollment.vacancies, '', link.linkCount, `${link.surplusPaid} / ${link.source.enrollment.paid} = ${percent.format(link.proportion)}`, link.relation, link.factor, link.potential, '', ''])
        rowKinds.push('origin')
      }
    }
    exportExcel([{ name: 'Análise de cursos', rows, rowKinds, columnWidths: [11, 19, 34, 54, 23, 10, 9, 16, 10, 24, 30, 10, 13, 16, 19] }], reportFilename(referenceAt, 'xlsx'))
  }
  const exportPdf = (expanded: boolean) => {
    if (!report) return
    exportPdfReport(visible.map(entry => {
    const estimated = enabled ? report.support.get(entry.offer.id) ?? 0 : 0
    return { city: entry.offer.municipality, unit: entry.offer.unit, course: entry.offer.course, period: entry.offer.period, paid: entry.enrollment.paid, vacancies: entry.enrollment.vacancies, current: demand(entry.enrollment.paid, entry.enrollment.vacancies), estimated, projected: demand(entry.enrollment.paid + estimated, entry.enrollment.vacancies), decision: status(entry), origins: expanded ? report.byDestination.get(entry.offer.id) ?? [] : [] }
    }), referenceAt, enabled, expanded)
  }

  useEffect(() => {
    if (!exportRequest || !report || payload?.error || lastExportToken.current === exportRequest.token) return
    lastExportToken.current = exportRequest.token
    requestExport(exportRequest.format)
  })

  if (!payload) return <p className="analysis-rank-empty" role="status">Carregando vínculos da 2ª opção…</p>
  if (payload.error) return <p className="analysis-rank-empty" role="status">{payload.error}</p>
  if (!report) return <p className="analysis-rank-empty">Importe a planilha de vínculos para ver a projeção por curso.</p>

  return <div className="second-option-report">
    {createPortal(<dialog ref={exportDialogRef} className="second-option-export-dialog" aria-labelledby="second-option-export-title" aria-describedby="second-option-export-description" onClose={() => setPendingExport(null)} onClick={event => { if (event.target === event.currentTarget) closeExportDialog() }}>
      <button type="button" className="second-option-export-close" onClick={closeExportDialog} aria-label="Fechar janela de exportação">×</button>
      <p className="second-option-export-eyebrow">EXPORTAÇÃO · {pendingExport === 'pdf' ? 'PDF' : 'EXCEL'}</p>
      <h2 id="second-option-export-title">O que incluir no relatório?</h2>
      <p id="second-option-export-description">Escolha o nível de detalhe desta exportação.</p>
      <div className="second-option-export-options">
        <button type="button" onClick={() => runExport(pendingExport ?? 'xlsx', false)}><strong>Apenas cursos</strong><span>Resumo com demanda e decisão de cada curso.</span></button>
        <button type="button" onClick={() => runExport(pendingExport ?? 'xlsx', true)}><strong>Cursos + origens da 2ª opção</strong><span>Mostra a conta de cada origem abaixo do curso.</span></button>
      </div>
    </dialog>, document.body)}
    {visible.length ? <div className="second-option-report-scroll" role="region" aria-label="Cursos e decisões da 2ª opção" tabIndex={0}><table className="second-option-report-table"><thead><tr><th scope="col">Curso e local</th><th scope="col">Cidade</th><th scope="col">Pagos / vagas</th><th scope="col">Atual</th><th scope="col">2ª opção</th><th scope="col">{enabled ? 'Projetada' : 'Demanda'}</th><th scope="col">Resultado</th><th scope="col">Decisão</th></tr></thead><tbody>
      {visible.map(entry => {
        const { offer, enrollment } = entry
        const estimated = enabled ? report.support.get(offer.id) ?? 0 : 0
        const contributions = enabled ? report.byDestination.get(offer.id) ?? [] : []
        const projected = demand(enrollment.paid + estimated, enrollment.vacancies)
        return <FragmentRow key={offer.id} entry={entry} estimated={estimated} projected={projected} contributions={contributions} enabled={enabled} expanded={expandedId === offer.id} onExpand={() => setExpandedId(current => current === offer.id ? null : offer.id)} decision={decisions[offer.id]} onDecision={value => onDecision(offer.id, value)} />
      })}
    </tbody></table></div> : <p className="analysis-rank-empty">Nenhum curso corresponde aos filtros e ao recorte selecionados.</p>}
  </div>
}

function FragmentRow({ entry, estimated, projected, contributions, enabled, expanded, onExpand, decision, onDecision }: { entry: MatchedSecondOptionOffer; estimated: number; projected: number; contributions: SecondOptionContribution[]; enabled: boolean; expanded: boolean; onExpand: () => void; decision?: CourseDecision; onDecision: (value: CourseDecision) => void }) {
  const { offer, enrollment } = entry
  return <>
    <tr className={decision === 'authorized' ? 'second-option-row-authorized' : decision === 'denied' ? 'second-option-row-denied' : 'second-option-row-pending'}>
      <td><button type="button" className="second-option-report-open" onClick={onExpand} aria-expanded={expanded} aria-label={`${expanded ? 'Fechar' : 'Abrir'} origens de ${offer.course}, ${offer.period}`}><span aria-hidden="true">{expanded ? '▾' : '▸'}</span><strong>{offer.course}</strong></button><small>{offer.period} · {offer.unit}</small></td>
      <td>{offer.municipality}</td>
      <td>{integer.format(enrollment.paid)} / {integer.format(enrollment.vacancies)}</td><td>{decimal.format(demand(enrollment.paid, enrollment.vacancies))}</td><td>{enabled ? integer.format(estimated) : '—'}</td><td><strong>{decimal.format(projected)}</strong></td><td>{projected >= 1.5 ? 'Atinge 1,5' : 'Abaixo de 1,5'}</td>
      <td><div className="second-option-report-decisions"><label><input type="checkbox" checked={decision === 'authorized'} onChange={() => onDecision('authorized')} aria-label={`Liberar ${offer.course}, ${offer.period}, ${offer.unit}`} /> Liberar</label><label><input type="checkbox" checked={decision === 'denied'} onChange={() => onDecision('denied')} aria-label={`Não liberar ${offer.course}, ${offer.period}, ${offer.unit}`} /> Não liberar</label></div></td>
    </tr>
    {expanded && <tr className="second-option-report-detail"><td colSpan={8}><strong>Origens da 2ª opção</strong>{contributions.length ? <div className="second-option-report-detail-scroll"><table><thead><tr><th>Origem</th><th>Pagos / vagas</th><th>Vínculos</th><th>Excedente / pagos</th><th>Fator</th><th>Contribuição</th></tr></thead><tbody>{contributions.map((link, index) => <tr key={`${link.source.offer.id}-${index}`}><td>{link.source.offer.course} · {link.source.offer.period}<small>{link.source.offer.unit} · {link.source.offer.municipality}</small></td><td>{integer.format(link.source.enrollment.paid)} / {integer.format(link.source.enrollment.vacancies)}</td><td>{integer.format(link.linkCount)}</td><td>{integer.format(link.surplusPaid)} / {integer.format(link.source.enrollment.paid)} = {percent.format(link.proportion)}</td><td>{link.relation} · {percent.format(link.factor)}</td><td>{decimal.format(link.potential)}</td></tr>)}</tbody></table></div> : <p>{enabled ? 'Nenhuma origem elegível contribui para este curso.' : '2ª opção desativada neste recorte.'}</p>}<p>Contribuições somadas: {decimal.format(contributions.reduce((sum, link) => sum + link.potential, 0))} → {integer.format(estimated)} candidatos estimados após arredondamento.</p></td></tr>}
  </>
}
