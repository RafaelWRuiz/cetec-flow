import { useEffect, useId, useRef, useState } from 'react'
import type { Enrollment, SnapshotSeries } from '../data/mockData'
import { dailyReports } from '../lib/enrollmentReports'
import './EnrollmentReports.css'

const number = new Intl.NumberFormat('pt-BR')
const signed = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ratio = (paid: number, vacancies: number) => vacancies ? `${decimal.format(paid / vacancies)}x` : 'N/A'
const weekday = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date(value))
const percentage = (value: number | null) => value === null ? 'N/A' : `${value > 0 ? '+' : ''}${decimal.format(value)}%`

type Props = { snapshots: SnapshotSeries[]; scope: string; statusFiltered: boolean }

export default function EnrollmentReports({ snapshots, scope, statusFiltered }: Props) {
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.referenceAt) - Date.parse(b.referenceAt))
  const daily = dailyReports(ordered).reverse()

  useEffect(() => {
    if (!expanded) return
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => {
      element?.close()
      document.body.style.overflow = previousOverflow
      expandButton.current?.focus()
    }
  }, [expanded])

  const content = <>
    <div className="reports-heading">
      <h3 id={titleId}>Relatórios de inscrições</h3>
      {expanded ? <button type="button" onClick={() => setExpanded(false)}>Fechar <span aria-hidden="true">×</span></button> :
        <button ref={expandButton} type="button" onClick={() => setExpanded(true)} aria-haspopup="dialog">Expandir ↗</button>}
    </div>
    <p className="reports-scope">{scope}</p>
    {!ordered.length ? <p className="reports-note">Nenhuma importação disponível. Importe uma planilha para iniciar o histórico.</p> : <>
      <p className="reports-note">Última importação de cada dia, no horário de Brasília. A tabela combina o valor acumulado e a evolução em relação ao dia anterior disponível. Demanda efetiva = pagos regulares ÷ vagas regulares.</p>
      <div className="reports-weekend-legend" aria-label="Legenda dos dias do fim de semana"><span><i className="reports-day-swatch reports-day-saturday" aria-hidden="true"/>Sábado</span><span><i className="reports-day-swatch reports-day-sunday" aria-hidden="true"/>Domingo</span></div>
      <div className="reports-table-scroll" tabIndex={0} role="region" aria-label="Tabela de evolução diária">
        <table>
          <caption className="sr-only">Evolução diária das inscrições, pagamentos e não pagamentos</caption>
          <thead><tr>{['Data e hora', 'Pagos', 'Δ pagos', 'Var. pagos (%)', 'Não pagos', 'Δ não pagos', 'Var. não pagos (%)', 'Inscrições', 'Δ inscrições', 'Var. inscrições (%)', 'Vagas', 'Demanda efetiva'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{daily.map(row => { const day = weekday(row.referenceAt); return <tr key={row.referenceAt} className={day === 'Sat' ? 'reports-day-saturday' : day === 'Sun' ? 'reports-day-sunday' : undefined}><th scope="row">{date(row.referenceAt)}</th><td>{number.format(row.paid)}</td><td>{row.delta ? signed.format(row.delta.paid) : 'Base inicial'}</td><td>{percentage(row.percent.paid)}</td><td>{number.format(row.unpaid)}</td><td>{row.delta ? signed.format(row.delta.unpaid) : '—'}</td><td>{percentage(row.percent.unpaid)}</td><td>{number.format(row.total)}</td><td>{row.delta ? signed.format(row.delta.total) : '—'}</td><td>{percentage(row.percent.total)}</td><td>{number.format(row.vacancies)}</td><td>{ratio(row.regularPaid, row.vacancies)}</td></tr> })}</tbody>
        </table>
      </div>
      {statusFiltered && <p className="reports-note">Filtro de situação ativo: as ofertas que atendem ao filtro podem mudar de uma data para outra.</p>}
    </>}
  </>

  return <section className="enrollment-reports">
    {!expanded && content}
    {expanded && <dialog className="reports-dialog" ref={dialog} aria-labelledby={titleId} onCancel={() => setExpanded(false)}>{content}</dialog>}
  </section>
}
