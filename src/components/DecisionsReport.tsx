import { useEffect, useMemo, useState } from 'react'
import type { Enrollment, EtecPoint } from '../data/mockData'

type Offer = { id: string; municipality: string; unit: string; course: string; period: string; applicants: number; seats: number }
type Link = { source_turma_id: string; destination_turma_id: string; applicant_count: number }
type Payload = { import: { source_file_name: string; offers: Offer[] } | null; links: Link[]; error?: string }
type Matched = { offer: Offer; enrollment: Enrollment }
const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default function DecisionsReport({ enrollments, etecs }: { enrollments: Enrollment[]; etecs: EtecPoint[] }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/decisoes').then(response => response.json()).then((value: Payload) => {
      if (active) setPayload(value)
    }).catch(() => { if (active) setPayload({ import: null, links: [], error: 'Não foi possível carregar os vínculos.' }) })
    return () => { active = false }
  }, [])

  const report = useMemo(() => {
    if (!payload?.import) return null
    const names = new Map(etecs.map(etec => [etec.name, normalize(etec.label.replace(/\s*\([^)]*\)\s*$/, ''))]))
    const matched = new Map<string, Matched>()
    let unresolved = 0
    for (const offer of payload.import.offers) {
      const options = enrollments.filter(item => !item.isTrainee && item.vacancies === offer.seats
        && normalize(item.course) === normalize(offer.course)
        && normalize(item.period) === normalize(offer.period)
        && normalize(etecs.find(etec => etec.name === item.etec)?.municipality ?? '') === normalize(offer.municipality)
        && names.get(item.etec) === normalize(offer.unit))
      if (options.length === 1) matched.set(offer.id, { offer, enrollment: options[0] })
      else unresolved += 1
    }
    const weight = (origin: Matched, destination: Matched) => {
      if (normalize(origin.offer.course) === normalize(destination.offer.course)) return 0.9
      const sourceAxis = origin.enrollment.axis
      const destinationAxis = destination.enrollment.axis
      if (!sourceAxis || !destinationAxis) return null
      return normalize(sourceAxis) === normalize(destinationAxis) ? 0.8 : 0.6
    }
    const guaranteed = (entry: Matched) => entry.enrollment.vacancies > 0
      && entry.enrollment.paid / entry.enrollment.vacancies >= 1.5
    const paidShare = (entry: Matched) => entry.offer.applicants > 0
      ? Math.min(1, entry.enrollment.paid / entry.offer.applicants) : 0
    const support = new Map<string, number>()
    for (const link of payload.links) {
      const source = matched.get(link.source_turma_id)
      const destination = matched.get(link.destination_turma_id)
      if (!source || !destination || !guaranteed(source)) continue
      const factor = weight(source, destination)
      if (factor === null) continue
      const available = Math.max(0, source.enrollment.paid - source.enrollment.vacancies) / source.enrollment.paid
      support.set(destination.offer.id, (support.get(destination.offer.id) ?? 0) + link.applicant_count * paidShare(source) * available * factor)
    }
    const demand = (entry: Matched, extra = 0) => {
      const paid = entry.enrollment.paid + Math.round((support.get(entry.offer.id) ?? 0) + extra)
      return paid / entry.enrollment.vacancies
    }
    const decisions = payload.links.flatMap(link => {
      const a = matched.get(link.source_turma_id)
      const b = matched.get(link.destination_turma_id)
      if (!a || !b || guaranteed(a) || guaranteed(b) || a.enrollment.vacancies <= 0 || b.enrollment.vacancies <= 0) return []
      const reverse = payload.links.find(item => item.source_turma_id === b.offer.id && item.destination_turma_id === a.offer.id)
      if (!reverse || a.offer.id > b.offer.id) return []
      const ab = weight(a, b)
      const ba = weight(b, a)
      if (ab === null || ba === null) return []
      const baseA = demand(a)
      const baseB = demand(b)
      const onlyA = demand(a, reverse.applicant_count * paidShare(b) * ba)
      const onlyB = demand(b, link.applicant_count * paidShare(a) * ab)
      if (baseA >= 1.5 || baseB >= 1.5 || (onlyA < 1.5 && onlyB < 1.5)) return []
      return { a, b, baseA, baseB, onlyA, onlyB }
    })
    return { decisions, unresolved, matched: matched.size }
  }, [payload, enrollments, etecs])

  if (!payload) return <p className="analysis-rank-empty" role="status">Carregando decisões…</p>
  if (payload.error) return <p className="analysis-rank-empty" role="status">{payload.error}</p>
  if (!payload.import) return <p className="analysis-rank-empty">Importe a planilha de vínculos para gerar o relatório de decisões.</p>
  if (!report) return null
  return <div className="decisions-report">
    <p>Planilha de vínculos: {payload.import.source_file_name}. {report.matched} turmas conciliadas com a base de pagos; {report.unresolved} sem correspondência única. A parcela paga de cada vínculo é estimada pela proporção de pagos na turma de origem.</p>
    {report.decisions.length ? report.decisions.map(({ a, b, baseA, baseB, onlyA, onlyB }) =>
      <section className="decisions-case" key={a.offer.id + '-' + b.offer.id}>
        <h3>{a.offer.municipality} · {a.offer.unit}</h3>
        <div className="table-responsive"><table className="analysis-rank-table"><thead><tr><th>Cenário</th><th>{a.offer.course} · {a.offer.period}</th><th>{b.offer.course} · {b.offer.period}</th></tr></thead><tbody>
          <tr><th>Ambas abertas</th><td>{fmt.format(baseA)}</td><td>{fmt.format(baseB)}</td></tr>
          <tr><th>Só {a.offer.course}</th><td>{fmt.format(onlyA)}{onlyA >= 1.5 ? ' · atinge' : ''}</td><td>Fechada</td></tr>
          <tr><th>Só {b.offer.course}</th><td>Fechada</td><td>{fmt.format(onlyB)}{onlyB >= 1.5 ? ' · atinge' : ''}</td></tr>
        </tbody></table></div>
      </section>
    ) : <p className="analysis-rank-empty">Nenhum conflito entre turmas conciliadas foi encontrado.</p>}
  </div>
}
