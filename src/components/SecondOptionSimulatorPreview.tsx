import { useState } from 'react'
import { realSecondOptionSample, type RealSampleOffer, type RealSampleOfferId } from '../data/secondOptionRealSample'
import './SecondOptionSimulatorPreview.css'

type Decision = 'undecided' | 'open' | 'closed'
type Offer = RealSampleOffer

const offers = realSecondOptionSample.offers
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const ratio = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function potentialFrom(origin: Offer, count: number, decision: Decision) {
  if (decision === 'closed') return count
  if (origin.firstChoice <= origin.seats || origin.firstChoice <= 0) return 0
  return count * ((origin.firstChoice - origin.seats) / origin.firstChoice)
}

function otherOffer(offer: Offer) {
  return offers.find((candidate) => candidate.id !== offer.id)!
}

function supportFromOtherOffers(target: Offer, threshold: number) {
  return realSecondOptionSample.supportingOrigins.reduce((total, origin) => {
    if (!origin.seats || !origin.firstChoice || origin.firstChoice / origin.seats < threshold) return total
    const count = origin.destinations[target.id] ?? 0
    return total + count * Math.max(0, origin.firstChoice - origin.seats) / origin.firstChoice
  }, 0)
}

export default function SecondOptionSimulatorPreview({ embedded = false }: { embedded?: boolean }) {
  const [threshold, setThreshold] = useState(1.5)
  const [decisions, setDecisions] = useState<Record<RealSampleOfferId, Decision>>({
    '6018': 'open',
    '7244': 'closed',
  })

  const rows = offers.map((target) => {
    const decision = decisions[target.id]
    const confirmed = decision === 'closed' ? 0 : supportFromOtherOffers(target, threshold) + offers.reduce((total, origin) => {
      if (origin.id === target.id) return total
      const count = origin.destinations[target.id] ?? 0
      return total + potentialFrom(origin, count, decisions[origin.id])
    }, 0)
    const conditional = decision === 'closed' ? [] : offers.flatMap((origin) => {
      if (origin.id === target.id || decisions[origin.id] !== 'undecided') return []
      const count = origin.destinations[target.id] ?? 0
      return count ? [{ origin, count }] : []
    })
    const estimate = target.firstChoice + confirmed
    const demand = target.seats > 0 ? estimate / target.seats : null
    const situation = decision === 'closed'
      ? 'Fechada neste cenário'
      : decision === 'undecided'
        ? 'Aguardando decisão'
        : demand !== null && demand >= threshold
          ? 'Atinge o parâmetro'
          : 'Abaixo do parâmetro'
    return { offer: target, confirmed, conditional, estimate, demand, situation, decision }
  })

  const openCount = rows.filter((row) => row.decision === 'open').length
  const closedCount = rows.filter((row) => row.decision === 'closed').length
  const pendingCount = rows.filter((row) => row.decision === 'undecided').length
  const underTarget = rows.filter((row) => row.decision === 'open' && row.demand !== null && row.demand < threshold)

  function scenarioDemand(openOffer: Offer, closedOffer: Offer) {
    const scenario = {
      [openOffer.id]: 'open',
      [closedOffer.id]: 'closed',
    } as Record<RealSampleOfferId, Decision>
    const target = openOffer
    const confirmed = supportFromOtherOffers(target, threshold) + potentialFrom(
      closedOffer,
      closedOffer.destinations[target.id] ?? 0,
      scenario[closedOffer.id],
    )
    return (target.firstChoice + confirmed) / target.seats
  }

  function applyScenario(openOffer: Offer, closedOffer: Offer) {
    setDecisions({
      [openOffer.id]: 'open',
      [closedOffer.id]: 'closed',
    } as Record<RealSampleOfferId, Decision>)
  }

  function changeDecision(id: RealSampleOfferId, decision: Decision) {
    setDecisions((current) => ({ ...current, [id]: decision }))
  }

  function resetScenario() {
    setDecisions({ '6018': 'undecided', '7244': 'undecided' })
  }

  const Content = embedded ? 'div' : 'main'

  return (
    <div className={'sim-preview-shell' + (embedded ? ' sim-preview-embedded' : '')}>
      {!embedded && <header className="sim-preview-header">
        <div className="sim-preview-identity">
          <span className="sim-preview-mark" aria-hidden="true">CPS</span>
          <span className="sim-preview-divider" aria-hidden="true" />
          <div>
            <strong>Vestibulinho</strong>
            <span>Planejamento de ofertas</span>
          </div>
        </div>
        <div className="sim-preview-header-actions">
          <a className="sim-preview-local-link" href="?tela=importar-segunda-opcao">Importar planilha</a>
          <span className="sim-preview-local">Prévia local</span>
        </div>
      </header>}

      <Content className="sim-preview-main">
        {!embedded && <nav className="sim-preview-breadcrumb" aria-label="Navegação estrutural">
          <span>Painel</span><span aria-hidden="true">/</span><strong>Simulador de abertura</strong>
        </nav>}

        <section className="sim-preview-intro">
          <div>
            {embedded ? <h3>Simulação de abertura de turmas</h3> : <h1>Simulação de abertura de turmas</h1>}
            <p className="sim-preview-source">Base de {realSecondOptionSample.reference} · Capão Bonito · 2 turmas</p>
          </div>
          <label className="sim-threshold-control">
            <span>Parâmetro de demanda</span>
            <span className="sim-threshold-input-wrap">
              <input aria-label="Parâmetro de demanda em candidatos por vaga" type="number" min="0.1" step="0.1" value={threshold} onChange={(event) => { const next = Number(event.target.value); if (next > 0) setThreshold(next) }} />
              <span>candidatos por vaga</span>
            </span>
          </label>
        </section>

        <section className="sim-overview" aria-label="Resumo do cenário">
          <div><strong>{offers.length}</strong><span>Turmas no recorte</span></div>
          <div><strong>{openCount}</strong><span>Marcadas para abrir</span></div>
          <div><strong>{closedCount}</strong><span>Fechadas no cenário</span></div>
          <div className={pendingCount ? 'is-pending' : ''}><strong>{pendingCount}</strong><span>Pendentes de decisão</span></div>
        </section>

        <section className="sim-scenario" aria-labelledby="sim-scenario-title">
          <div className="sim-section-heading">
            <div>
              <h2 id="sim-scenario-title">Escolha qual turma abrir</h2>
            </div>
            <button className="sim-reset-button" type="button" onClick={resetScenario}>Limpar decisões</button>
          </div>

          <div className="sim-choice-grid">
            {offers.map((openOffer, index) => {
              const closedOffer = otherOffer(openOffer)
              const scenarioResult = scenarioDemand(openOffer, closedOffer)
              const outsideSupport = supportFromOtherOffers(openOffer, threshold)
              const closedTransfer = closedOffer.destinations[openOffer.id] ?? 0
              const selected = decisions[openOffer.id] === 'open' && decisions[closedOffer.id] === 'closed'
              return (
                <button className="sim-choice" type="button" aria-pressed={selected} key={openOffer.id} onClick={() => applyScenario(openOffer, closedOffer)}>
                  <span className="sim-choice-number">0{index + 1}</span>
                  <span className="sim-choice-copy">
                    <strong>Abrir {openOffer.course.replace('Técnico em ', '')} · fechar {closedOffer.course.replace('Técnico em ', '')}</strong>
                    <small>{number.format(outsideSupport)} de outras turmas + {number.format(closedTransfer)} da turma fechada</small>
                  </span>
                  <span className="sim-choice-result">{ratio.format(scenarioResult)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="sim-offers" aria-labelledby="sim-offers-title">
          <div className="sim-section-heading sim-offers-heading">
            <div><h2 id="sim-offers-title">Turmas e demanda estimada</h2></div>
            <span className="sim-offers-count">{offers.length} ofertas</span>
          </div>

          {underTarget.length > 0 && (
            <div className="sim-inline-alert" role="status">
              <span className="sim-alert-mark" aria-hidden="true">!</span>
              <p><strong>{underTarget.length} turma{underTarget.length > 1 ? 's' : ''} marcada{underTarget.length > 1 ? 's' : ''} para abrir abaixo do parâmetro.</strong> Avalie outra decisão.</p>
            </div>
          )}

          <div className="sim-table-head" aria-hidden="true">
            <span>Turma</span><span>1ª opção / vagas</span><span>2ª opção potencial</span><span>Demanda estimada</span><span>Decisão</span>
          </div>
          <div className="sim-offer-list">
            {rows.map(({ offer, confirmed, conditional, estimate, demand, situation, decision }) => (
              <article className={'sim-offer-row' + (decision === 'closed' ? ' is-closed' : '')} key={offer.id}>
                <div className="sim-offer-name">
                  <strong>{offer.course}</strong>
                  <span>{offer.unit} · {offer.municipality} · {offer.period}</span>
                  <small>Turma {offer.id} · {situation}</small>
                </div>
                <div className="sim-data-cell"><span className="sim-mobile-label">1ª opção / vagas</span><strong>{number.format(offer.firstChoice)} / {number.format(offer.seats)}</strong></div>
                <div className="sim-data-cell">
                  <span className="sim-mobile-label">2ª opção potencial</span>
                  <strong>{decision === 'closed' ? '—' : number.format(confirmed)}</strong>
                  {conditional.map(({ origin, count }) => <small key={origin.id}>Se {origin.course.replace('Técnico em ', '')} fechar: +{number.format(count)}</small>)}
                </div>
                <div className="sim-demand-cell">
                  {demand === null || decision === 'closed'
                    ? <strong className="sim-demand-closed">—</strong>
                    : <><strong className={demand >= threshold ? 'is-viable' : 'is-below'}>{ratio.format(demand)}</strong><span>{number.format(estimate)} candidatos potenciais</span></>}
                </div>
                <div className="sim-decision-cell">
                  <label className="sim-decision-select">
                    <span className="sim-mobile-label">Decisão</span>
                    <select aria-label={'Decisão para ' + offer.course} value={decision} onChange={(event) => changeDecision(offer.id, event.target.value as Decision)}>
                      <option value="undecided">Decidir</option><option value="open">Abrir</option><option value="closed">Fechar</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          <p className="sim-table-footnote">O apoio das outras turmas considera excedentes proporcionais. Uma turma fechada libera todos os vínculos registrados para a segunda opção.</p>
        </section>

        {!embedded && <footer className="sim-preview-footer">
          <span>Simulador de oferta</span>
          <span>Parâmetro atual: {ratio.format(threshold)} candidato por vaga</span>
        </footer>}
      </Content>
    </div>
  )
}
