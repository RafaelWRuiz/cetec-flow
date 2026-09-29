import { useEffect, useId, useRef, useState } from 'react'
import type { Enrollment, SnapshotSeries } from '../data/mockData'
import { compareReports, dailyReports, reportTotals } from '../lib/enrollmentReports'
import './EnrollmentReports.css'

const number = new Intl.NumberFormat('pt-BR')
const signed = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ratio = (paid: number, vacancies: number) => vacancies ? `${decimal.format(paid / vacancies)}x` : 'N/A'

type Props = { snapshots: SnapshotSeries[]; scope: string; groupLabel: string; groupFor: (item: Enrollment) => string; statusFiltered: boolean }

export default function EnrollmentReports({ snapshots, scope, groupLabel, groupFor, statusFiltered }: Props) {
  const [mode, setMode] = useState<'daily' | 'compare'>('daily')
  const [dailyMode, setDailyMode] = useState<'accumulated' | 'variation'>('accumulated')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.referenceAt) - Date.parse(b.referenceAt))
  const end = ordered.find(item => item.referenceAt === endAt) ?? ordered.at(-1)
  const start = ordered.find(item => item.referenceAt === startAt && Date.parse(item.referenceAt) <= Date.parse(end?.referenceAt ?? '')) ?? ordered[0]
  const daily = dailyReports(ordered).reverse()
  const comparisons = compareReports(start?.enrollments ?? [], end?.enrollments ?? [], groupFor)
  const initialTotals = reportTotals(start?.enrollments ?? [])
  const finalTotals = reportTotals(end?.enrollments ?? [])
  const totalDifference = finalTotals.total - initialTotals.total

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
    <div className="reports-controls">
      <div className="reports-switch" role="group" aria-label="Tipo de relatório">
        <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>Controle diário</button>
        <button type="button" aria-pressed={mode === 'compare'} onClick={() => setMode('compare')}>Comparar datas</button>
      </div>
      <div className="reports-switch reports-calculation-switch" role="group" aria-label="Forma de apresentação">
        <button type="button" aria-pressed={dailyMode === 'accumulated'} onClick={() => setDailyMode('accumulated')}>Acumulado por data</button>
        <button type="button" aria-pressed={dailyMode === 'variation'} onClick={() => setDailyMode('variation')}>Variação entre datas</button>
      </div>
    </div>
    {!ordered.length ? <p className="reports-note">Nenhuma importação disponível. Importe uma planilha para iniciar o histórico.</p> : <>
      {mode === 'daily' ? <>
        <p className="reports-note">Última importação de cada dia, no horário de Brasília. {dailyMode === 'variation' ? 'Diferença desde a data disponível anterior: pode incluir pagamentos, cancelamentos e correções. Não representa necessariamente novas inscrições do dia.' : 'Demanda efetiva = pagos regulares ÷ vagas regulares.'}</p>
        <div className="reports-table-scroll" tabIndex={0} role="region" aria-label="Tabela de controle diário">
          <table>
            <caption className="sr-only">{dailyMode === 'variation' ? 'Variação do saldo entre importações diárias' : 'Posição acumulada por data'}</caption>
            <thead><tr><th scope="col">Data e hora</th>{dailyMode === 'variation' && <th scope="col">Desde</th>}<th scope="col">{dailyMode === 'variation' ? 'Δ Pagos' : 'Pagos'}</th><th scope="col">{dailyMode === 'variation' ? 'Δ Não pagos' : 'Não pagos'}</th><th scope="col">{dailyMode === 'variation' ? 'Δ Inscrições' : 'Inscrições'}</th><th scope="col">Vagas{dailyMode === 'variation' ? ' na data' : ''}</th><th scope="col">Demanda efetiva{dailyMode === 'variation' ? ' na data' : ''}</th></tr></thead>
            <tbody>{daily.map(row => <tr key={row.referenceAt}>
              <th scope="row">{date(row.referenceAt)}</th>
              {dailyMode === 'variation' && <td>{row.previousAt ? date(row.previousAt) : 'Sem base anterior'}</td>}
              {(['paid', 'unpaid', 'total'] as const).map(key => <td key={key}>{dailyMode === 'variation' ? row.delta ? signed.format(row.delta[key]) : '—' : number.format(row[key])}</td>)}
              <td>{number.format(row.vacancies)}</td><td>{ratio(row.regularPaid, row.vacancies)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : <>
        <div className="reports-dates">
          <label>Data inicial<select value={start?.referenceAt ?? ''} onChange={event => setStartAt(event.target.value)}>{ordered.filter(item => Date.parse(item.referenceAt) <= Date.parse(end?.referenceAt ?? '')).map(item => <option key={item.referenceAt} value={item.referenceAt}>{date(item.referenceAt)}</option>)}</select></label>
          <label>Data final<select value={end?.referenceAt ?? ''} onChange={event => setEndAt(event.target.value)}>{ordered.map(item => <option key={item.referenceAt} value={item.referenceAt}>{date(item.referenceAt)}</option>)}</select></label>
        </div>
        <p className="reports-note">Por {groupLabel.toLowerCase()}. {dailyMode === 'variation' ? 'A variação pode incluir pagamentos, cancelamentos, correções e entradas ou saídas de ofertas.' : 'Acumulados mostram a posição em cada data selecionada.'} Base inicial zero: variação percentual N/A.</p>
        {ordered.length < 2 && <p className="reports-note">Há apenas uma importação. Importe outra data para comparar a evolução.</p>}
        <div className="reports-table-scroll" tabIndex={0} role="region" aria-label="Tabela de comparação entre datas">
          <table>
            <caption className="sr-only">Comparação de {start && date(start.referenceAt)} até {end && date(end.referenceAt)}</caption>
            {dailyMode === 'accumulated' ? <>
              <thead><tr>{[groupLabel, 'Inscritos iniciais', 'Inscritos finais', 'Diferença absoluta', 'Variação (%)', 'Efetivação final (%)'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{comparisons.map(row => <tr key={row.group}><th scope="row">{row.group}</th><td>{number.format(row.start.total)}</td><td>{number.format(row.end.total)}</td><td>{signed.format(row.difference)}</td><td>{row.percent === null ? 'N/A' : `${row.percent > 0 ? '+' : ''}${decimal.format(row.percent)}%`}</td><td>{row.conversion === null ? 'N/A' : `${decimal.format(row.conversion)}%`}</td></tr>)}</tbody>
              <tfoot><tr><th scope="row">Total do recorte</th><td>{number.format(initialTotals.total)}</td><td>{number.format(finalTotals.total)}</td><td>{signed.format(totalDifference)}</td><td>{initialTotals.total ? `${totalDifference > 0 ? '+' : ''}${decimal.format(totalDifference / initialTotals.total * 100)}%` : 'N/A'}</td><td>{finalTotals.total ? `${decimal.format(finalTotals.paid / finalTotals.total * 100)}%` : 'N/A'}</td></tr></tfoot>
            </> : <>
              <thead><tr>{[groupLabel, 'Δ Pagos', 'Δ Não pagos', 'Δ Inscrições', 'Variação (%)'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{comparisons.map(row => <tr key={row.group}><th scope="row">{row.group}</th><td>{signed.format(row.end.paid - row.start.paid)}</td><td>{signed.format(row.end.unpaid - row.start.unpaid)}</td><td>{signed.format(row.difference)}</td><td>{row.percent === null ? 'N/A' : `${row.percent > 0 ? '+' : ''}${decimal.format(row.percent)}%`}</td></tr>)}</tbody>
              <tfoot><tr><th scope="row">Total do recorte</th><td>{signed.format(finalTotals.paid - initialTotals.paid)}</td><td>{signed.format(finalTotals.unpaid - initialTotals.unpaid)}</td><td>{signed.format(totalDifference)}</td><td>{initialTotals.total ? `${totalDifference > 0 ? '+' : ''}${decimal.format(totalDifference / initialTotals.total * 100)}%` : 'N/A'}</td></tr></tfoot>
            </>}
          </table>
          {!comparisons.length && <p className="reports-note">Nenhuma oferta encontrada no recorte selecionado.</p>}
        </div>
      </>}
      {statusFiltered && <p className="reports-note">Filtro de situação ativo: as ofertas que atendem ao filtro podem mudar de uma data para outra.</p>}
    </>}
  </>

  return <section className="enrollment-reports">
    {!expanded && content}
    {expanded && <dialog className="reports-dialog" ref={dialog} aria-labelledby={titleId} onCancel={() => setExpanded(false)}>{content}</dialog>}
  </section>
}
