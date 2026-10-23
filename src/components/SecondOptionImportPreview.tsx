import { useRef, useState } from 'react'
import {
  analyzeSecondOptionFile,
  numberOrDash,
  type SecondOptionImportReport,
} from '../utils/secondOptionImport'
import './SecondOptionImportPreview.css'

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const fileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${number.format(bytes / 1024)} KB`
  : `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

export default function SecondOptionImportPreview() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<SecondOptionImportReport | null>(null)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  function selectFile(nextFile: File | null) {
    setFile(nextFile)
    setReport(null)
    setError('')
  }

  async function analyzeFile() {
    if (!file || analyzing) return
    setAnalyzing(true)
    setReport(null)
    setError('')
    await new Promise((resolve) => window.setTimeout(resolve, 30))
    try {
      setReport(await analyzeSecondOptionFile(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível analisar este arquivo.')
    } finally {
      setAnalyzing(false)
    }
  }

  function clearAnalysis() {
    selectFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const errorCount = report?.checks.filter((check) => check.status === 'error').length ?? 0
  const warningCount = report?.checks.filter((check) => check.status === 'warning').length ?? 0

  return (
    <div className="sim-preview-shell sim-import-shell">
      <header className="sim-preview-header">
        <div className="sim-preview-identity">
          <span className="sim-preview-mark" aria-hidden="true">CPS</span>
          <span className="sim-preview-divider" aria-hidden="true" />
          <div>
            <strong>Vestibulinho</strong>
            <span>Planejamento de ofertas</span>
          </div>
        </div>
        <div className="sim-preview-header-actions">
          <a className="sim-preview-local-link" href="?tela=simulador-segunda-opcao">Voltar ao simulador</a>
          <span className="sim-preview-local">Prévia local</span>
        </div>
      </header>

      <main className="sim-preview-main">
        <nav className="sim-preview-breadcrumb" aria-label="Navegação estrutural">
          <span>Painel</span><span aria-hidden="true">/</span><a href="?tela=simulador-segunda-opcao">Simulador de abertura</a><span aria-hidden="true">/</span><strong>Importar planilha</strong>
        </nav>

        <section className="sim-preview-intro sim-import-intro">
          <div>
            <p className="sim-preview-eyebrow">Preparação da base</p>
            <h1>Conferir planilha de demanda</h1>
            <p className="sim-preview-description">Leia o arquivo neste navegador e confira turmas, números e vínculos de segunda opção antes de conectar a base ao painel.</p>
          </div>
        </section>

        <section className="sim-import-source" aria-labelledby="sim-import-source-title">
          <div className="sim-import-source-copy">
            <p className="sim-preview-eyebrow">Etapa 1</p>
            <h2 id="sim-import-source-title">Selecione o relatório</h2>
            <p>Este protótipo lê o relatório HTML que pode vir salvo com extensão <code>.xls</code>.</p>
          </div>

          <label className="sim-import-file-picker">
            <span className="sim-import-file-icon" aria-hidden="true">↑</span>
            <span className="sim-import-file-label">Arquivo do computador</span>
            <span className="sim-import-file-name">{file ? file.name : 'Escolher arquivo .xls'}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.html,.htm,text/html"
              onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
              aria-label="Selecionar relatório de demanda em formato HTML ou XLS"
            />
            {file && <small>{fileSize(file.size)}</small>}
          </label>

          <div className="sim-import-actions">
            <button className="sim-import-primary" type="button" onClick={analyzeFile} disabled={!file || analyzing}>
              {analyzing ? 'Analisando arquivo…' : 'Analisar arquivo local'}
            </button>
            {(file || report || error) && <button className="sim-import-clear" type="button" onClick={clearAnalysis} disabled={analyzing}>Limpar</button>}
          </div>

          <div className="sim-import-privacy" role="note">
            <span aria-hidden="true">i</span>
            <p>O arquivo é lido somente neste navegador. Esta tela não envia nem grava dados no painel.</p>
          </div>
          {analyzing && <p className="sim-import-progress" role="status">Lendo as turmas e comparando as duas listas de segunda opção…</p>}
          {error && <p className="sim-import-error" role="alert">{error}</p>}
        </section>

        {report && (
          <section className="sim-import-results" aria-labelledby="sim-import-results-title" aria-live="polite">
            <div className="sim-import-results-heading">
              <div>
                <p className="sim-preview-eyebrow">Etapa 2 · Prévia local</p>
                <h2 id="sim-import-results-title">Resultado da conferência</h2>
                <p>{report.fileName} <span aria-hidden="true">·</span> {fileSize(report.fileSize)}</p>
              </div>
              <span className={`sim-import-status${errorCount ? ' has-error' : warningCount ? ' has-warning' : ''}`}>
                {errorCount ? `${errorCount} pontos para corrigir` : warningCount ? `${warningCount} pontos para revisar` : 'Estrutura conferida'}
              </span>
            </div>

            <div className="sim-import-metrics" aria-label="Resumo do arquivo">
              <div><strong>{number.format(report.sourceRows)}</strong><span>linhas de turma</span></div>
              <div><strong>{number.format(report.linkedPairs)}</strong><span>vínculos conferidos</span></div>
              <div><strong>{number.format(report.outgoingCandidates)}</strong><span>indicações de saída</span></div>
              <div><strong>{number.format(report.incomingCandidates)}</strong><span>indicações recebidas</span></div>
            </div>

            <div className="sim-import-checks" aria-label="Validações">
              <div className="sim-import-section-heading">
                <div>
                  <p className="sim-preview-eyebrow">Qualidade dos dados</p>
                  <h3>O que foi conferido</h3>
                </div>
                <span>{errorCount + warningCount ? `${errorCount + warningCount} itens precisam de atenção` : 'Sem divergências nesta conferência'}</span>
              </div>
              {report.checks.map((check) => (
                <div className={`sim-import-check is-${check.status}`} key={check.title}>
                  <span className="sim-import-check-state" aria-label={check.status === 'success' ? 'Conferido' : check.status === 'error' ? 'Erro' : 'Atenção'}>
                    {check.status === 'success' ? '✓' : check.status === 'error' ? '!' : '·'}
                  </span>
                  <div>
                    <strong>{check.title}</strong>
                    <p>{check.detail}</p>
                    {check.examples?.length ? <small className="sim-import-check-examples">Exemplos: {check.examples.join(' · ')}</small> : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="sim-import-data-note">
              <strong>Leitura dos vínculos</strong>
              <p>As contagens “indo” e “vindo” descrevem as mesmas relações por lados opostos. Elas são comparadas entre si, não somadas. Uma turma citada pode não estar listada como oferta neste relatório; nesse caso, o vínculo fica sem conferência recíproca e não é tratado como erro. Inscritos sem indicação de saída contabilizada são considerados pessoas que não escolheram segunda opção.</p>
            </div>

            <section className="sim-import-sample" aria-labelledby="sim-import-sample-title">
              <div className="sim-import-section-heading">
                <div>
                  <p className="sim-preview-eyebrow">Amostra</p>
                  <h3 id="sim-import-sample-title">Primeiras {report.offers.length} turmas</h3>
                </div>
                <span>Prévia resumida</span>
              </div>
              <div className="sim-import-table-head" aria-hidden="true">
                <span>Turma e curso</span><span>Inscritos / vagas</span><span>Demanda</span><span>2ª opção recebida</span><span>2ª opção indicada</span>
              </div>
              <div className="sim-import-offer-list">
                {report.offers.map((offer, index) => (
                  <article className="sim-import-offer-row" key={`${offer.id}-${index}`}>
                    <div className="sim-import-offer-name">
                      <strong>{offer.course || 'Curso sem descrição'}</strong>
                      <span>{offer.municipality} · {offer.unit}</span>
                      <small>Turma {offer.id} · {offer.period || 'Período não informado'}</small>
                    </div>
                    <div className="sim-import-data-cell"><span className="sim-import-mobile-label">Inscritos / vagas</span><strong>{numberOrDash(offer.applicants)} / {numberOrDash(offer.seats)}</strong></div>
                    <div className="sim-import-data-cell"><span className="sim-import-mobile-label">Demanda</span><strong>{numberOrDash(offer.demand)}</strong></div>
                    <div className="sim-import-data-cell"><span className="sim-import-mobile-label">2ª opção recebida</span><strong>{number.format(offer.incomingCount)}</strong></div>
                    <div className="sim-import-data-cell"><span className="sim-import-mobile-label">2ª opção indicada</span><strong>{number.format(offer.outgoingCount)}</strong></div>
                  </article>
                ))}
              </div>
              <p className="sim-import-footnote">A análise local percorre a tabela para conferir os vínculos, mas esta tela mantém apenas totais e uma amostra de até oito turmas. Nenhuma linha é gravada no painel.</p>
            </section>
          </section>
        )}

        <footer className="sim-preview-footer">
          <span>Prévia de importação · ambiente local</span>
          <span>Sem envio ao painel e sem alteração de dados</span>
        </footer>
      </main>
    </div>
  )
}
