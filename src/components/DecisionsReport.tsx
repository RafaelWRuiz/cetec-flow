import { useMemo, useState } from 'react'
import type { Enrollment, EtecPoint } from '../data/mockData'
import { guaranteedByFirstOption, guaranteedSourceSupport, isSecondOptionLinkAllowed, matchSecondOptionOffers, paidShareOfApplicants, validOutgoingSourceIds, type MatchedSecondOptionOffer, type SecondOptionPayload } from '../lib/secondOption'
import { exportExcel } from '../lib/exportExcel'
import { exportScenarioPdfReport } from '../lib/exportPdf'
import { reportTimestamp } from '../lib/reportNaming'
import SecondOptionProjectionReport, { type CourseDecision, type ExportRequest } from './SecondOptionProjectionReport'

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DecisionsReport({ enrollments, etecs, isInScope, payload, includeSecondOption, referenceAt }: { enrollments: Enrollment[]; etecs: EtecPoint[]; isInScope: (enrollment: Enrollment) => boolean; payload: SecondOptionPayload | null; includeSecondOption: boolean; referenceAt: string }) {
  const [view, setView] = useState<'scenarios' | 'projection'>('projection')
  const [courseDecisions, setCourseDecisions] = useState<Record<string, CourseDecision>>({})
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  const report = useMemo(() => {
    if (!payload?.import) return null
    const matched = matchSecondOptionOffers(enrollments, etecs, payload.import.offers)
    const support = includeSecondOption ? guaranteedSourceSupport(matched, payload.links) : new Map<string, number>()
    const validSources = validOutgoingSourceIds(matched, payload.links)
    const demand = (entry: MatchedSecondOptionOffer, extra = 0) => {
      const paid = entry.enrollment.paid + (support.get(entry.offer.id) ?? 0) + extra
      return paid / entry.enrollment.vacancies
    }
    const decisions = payload.links.flatMap(link => {
      const a = matched.get(link.source_turma_id)
      const b = matched.get(link.destination_turma_id)
      if (!a || !b || !validSources.has(a.offer.id) || !validSources.has(b.offer.id) || guaranteedByFirstOption(a) || guaranteedByFirstOption(b) || a.enrollment.vacancies <= 0 || b.enrollment.vacancies <= 0) return []
      if (!isSecondOptionLinkAllowed(a, b) || !isSecondOptionLinkAllowed(b, a)) return []
      const reverse = payload.links.find(item => item.source_turma_id === b.offer.id && item.destination_turma_id === a.offer.id)
      if (!reverse || a.offer.id > b.offer.id) return []
      const baseA = demand(a)
      const baseB = demand(b)
      const onlyA = demand(a, reverse.applicant_count * paidShareOfApplicants(b))
      const onlyB = demand(b, link.applicant_count * paidShareOfApplicants(a))
      if (baseA >= 1.5 || baseB >= 1.5 || (onlyA < 1.5 && onlyB < 1.5)) return []
      return { a, b, baseA, baseB, onlyA, onlyB }
    }).filter(({ a, b }) => isInScope(a.enrollment) || isInScope(b.enrollment))
    const projectionCount = [...matched.values()].filter(entry => entry.enrollment.vacancies > 0 && isInScope(entry.enrollment) && entry.enrollment.paid / entry.enrollment.vacancies < 1.5).length
    return { decisions, projectionCount }
  }, [payload, enrollments, etecs, isInScope, includeSecondOption])

  const setCourseDecision = (id: string, value: CourseDecision) => setCourseDecisions(current => {
    const next = { ...current }
    if (next[id] === value) delete next[id]
    else next[id] = value
    return next
  })
  const decisionLabel = (id: string) => courseDecisions[id] === 'authorized' ? 'Autorizado' : courseDecisions[id] === 'denied' ? 'Não autorizado' : 'Sem análise'
  const exportScenarios = (format: 'xlsx' | 'pdf') => {
    if (!report?.decisions.length) return
    const courses = report.decisions.flatMap(({ a, b, baseA, baseB, onlyA, onlyB }, index) => [
      { pair: index + 1, entry: a, both: baseA, only: onlyA, decision: decisionLabel(a.offer.id) },
      { pair: index + 1, entry: b, both: baseB, only: onlyB, decision: decisionLabel(b.offer.id) },
    ])
    if (format === 'pdf') {
      exportScenarioPdfReport(courses.map(({ pair, entry, both, only, decision }) => ({ pair, city: entry.offer.municipality, unit: entry.offer.unit, course: entry.offer.course, period: entry.offer.period, paid: entry.enrollment.paid, vacancies: entry.enrollment.vacancies, both, only, decision })), referenceAt, includeSecondOption)
      return
    }
    const rows: (string | number)[][] = [
      ['Cenários de fechamento | 2ª opção'],
      [`Dados até ${reportTimestamp(referenceAt).label} | Recorte: ${includeSecondOption ? 'com 2ª opção' : 'somente pagos reais'} | ${report.decisions.length} ${report.decisions.length === 1 ? 'par' : 'pares'}`],
      ['Par', 'Cidade', 'Unidade', 'Curso', 'Período', 'Pagos', 'Vagas', 'Ambas abertas', 'Só este curso', 'Resultado', 'Decisão'],
    ]
    const rowKinds: ('title' | 'meta' | 'header' | 'authorized' | 'denied' | 'course')[] = ['title', 'meta', 'header']
    for (const { pair, entry, both, only, decision } of courses) {
      rows.push([pair, entry.offer.municipality, entry.offer.unit, entry.offer.course, entry.offer.period, entry.enrollment.paid, entry.enrollment.vacancies, both, only, only >= 1.5 ? 'Atinge 1,5' : 'Abaixo de 1,5', decision])
      rowKinds.push(decision === 'Autorizado' ? 'authorized' : decision === 'Não autorizado' ? 'denied' : 'course')
    }
    exportExcel([{ name: 'Cenários de fechamento', rows, rowKinds, columnWidths: [7, 19, 34, 54, 23, 10, 9, 17, 17, 18, 19] }], `Relatorio-de-Cenarios-de-Fechamento_${reportTimestamp(referenceAt).filename}.xlsx`)
  }
  const requestExport = (format: 'xlsx' | 'pdf') => {
    if (view === 'scenarios') exportScenarios(format)
    else setExportRequest(current => ({ format, token: (current?.token ?? 0) + 1 }))
  }

  if (!payload) return <p className="analysis-rank-empty" role="status">Carregando decisões…</p>
  if (payload.error) return <p className="analysis-rank-empty" role="status">{payload.error}</p>
  if (!payload.import) return <p className="analysis-rank-empty">Importe a planilha de vínculos para gerar o relatório de decisões.</p>
  if (!report) return null
  return <div className="decisions-report-shell">
    <div className="decisions-view-bar"><div className="decisions-view-tabs" role="tablist" aria-label="Visões de decisões"><button type="button" role="tab" aria-selected={view === 'projection'} className={view === 'projection' ? 'active' : ''} onClick={() => { setView('projection'); setExportRequest(null) }}>Projeção por curso</button><button type="button" role="tab" aria-selected={view === 'scenarios'} className={view === 'scenarios' ? 'active' : ''} onClick={() => { setView('scenarios'); setExportRequest(null) }}>Cenários de fechamento</button></div><div className="decisions-export-actions"><button type="button" onClick={() => requestExport('xlsx')} disabled={view === 'projection' ? !report.projectionCount : !report.decisions.length}>Exportar Excel</button><button type="button" onClick={() => requestExport('pdf')} disabled={view === 'projection' ? !report.projectionCount : !report.decisions.length}>Exportar PDF</button></div></div>
    {view === 'projection' ? <SecondOptionProjectionReport enrollments={enrollments} etecs={etecs} isInScope={isInScope} payload={payload} enabled={includeSecondOption} referenceAt={referenceAt} decisions={courseDecisions} onDecision={setCourseDecision} exportRequest={exportRequest} /> : <div className="decisions-report">
    {report.decisions.length ? report.decisions.map(({ a, b, baseA, baseB, onlyA, onlyB }) =>
      <section className="decisions-case" key={a.offer.id + '-' + b.offer.id}>
        <h3><span>{a.offer.municipality}</span><strong>{a.offer.unit}</strong></h3>
        <div className="table-responsive"><table className="decisions-table"><thead><tr><th scope="col">Cenário</th><th scope="col">{a.offer.course}<span>{a.offer.period}</span></th><th scope="col">{b.offer.course}<span>{b.offer.period}</span></th></tr></thead><tbody>
          <tr><th scope="row">Ambas abertas</th><td>{fmt.format(baseA)}</td><td>{fmt.format(baseB)}</td></tr>
          <tr><th scope="row">Só {a.offer.course}</th><td>{fmt.format(onlyA)}{onlyA >= 1.5 ? <strong className="decision-threshold">Atinge 1,5</strong> : null}</td><td className="decision-closed">Fechada</td></tr>
          <tr><th scope="row">Só {b.offer.course}</th><td className="decision-closed">Fechada</td><td>{fmt.format(onlyB)}{onlyB >= 1.5 ? <strong className="decision-threshold">Atinge 1,5</strong> : null}</td></tr>
          <tr className="decisions-choice-row"><th scope="row">Decisão</th><td className={courseDecisions[a.offer.id] === 'authorized' ? 'decision-choice-authorized' : courseDecisions[a.offer.id] === 'denied' ? 'decision-choice-denied' : 'decision-choice-pending'}><div className="second-option-report-decisions"><label><input type="checkbox" checked={courseDecisions[a.offer.id] === 'authorized'} onChange={() => setCourseDecision(a.offer.id, 'authorized')} aria-label={`Liberar ${a.offer.course}, ${a.offer.period}, ${a.offer.unit}`} /> Liberar</label><label><input type="checkbox" checked={courseDecisions[a.offer.id] === 'denied'} onChange={() => setCourseDecision(a.offer.id, 'denied')} aria-label={`Não liberar ${a.offer.course}, ${a.offer.period}, ${a.offer.unit}`} /> Não liberar</label></div></td><td className={courseDecisions[b.offer.id] === 'authorized' ? 'decision-choice-authorized' : courseDecisions[b.offer.id] === 'denied' ? 'decision-choice-denied' : 'decision-choice-pending'}><div className="second-option-report-decisions"><label><input type="checkbox" checked={courseDecisions[b.offer.id] === 'authorized'} onChange={() => setCourseDecision(b.offer.id, 'authorized')} aria-label={`Liberar ${b.offer.course}, ${b.offer.period}, ${b.offer.unit}`} /> Liberar</label><label><input type="checkbox" checked={courseDecisions[b.offer.id] === 'denied'} onChange={() => setCourseDecision(b.offer.id, 'denied')} aria-label={`Não liberar ${b.offer.course}, ${b.offer.period}, ${b.offer.unit}`} /> Não liberar</label></div></td></tr>
        </tbody></table></div>
      </section>
    ) : <p className="analysis-rank-empty">Nenhum par conciliado precisa de decisão neste recorte.</p>}
  </div>}
  </div>
}
