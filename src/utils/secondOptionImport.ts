export type ImportCheckStatus = 'success' | 'warning' | 'error'

export type ImportCheck = {
  status: ImportCheckStatus
  title: string
  detail: string
  examples?: string[]
}

export type ImportedOfferPreview = {
  id: string
  municipality: string
  unit: string
  course: string
  period: string
  applicants: number | null
  seats: number | null
  demand: number | null
  incomingCount: number
  outgoingCount: number
}

export type SecondOptionImportReport = {
  fileName: string
  fileSize: number
  sourceRows: number
  uniqueOffers: number
  duplicateOfferIds: number
  missingOfferIds: number
  linkedPairs: number
  outgoingCandidates: number
  incomingCandidates: number
  mismatchedPairs: number
  demandMismatches: number
  invalidNumericRows: number
  offersWithoutPositiveSeats: number
  outgoingOverApplicants: number
  applicantsWithoutSecondOption: number
  blankOutgoingLists: number
  unparsedEntries: number
  offers: ImportedOfferPreview[]
  checks: ImportCheck[]
}

type RowData = {
  id: string
  municipality: string
  unit: string
  course: string
  period: string
  applicants: number | null
  seats: number | null
  demand: number | null
  incomingEntries: RelatedTurma[]
  outgoingEntries: RelatedTurma[]
}

type RelatedTurma = { id: string; count: number }
type PairMap = Map<string, number>

const HEADER_FIELDS = [
  'Município',
  'Código da unidade',
  'Unidade',
  'Turma',
  'Curso',
  'Período',
  'Vagas',
  'Inscritos',
  'Demanda',
  '2ª opção vindo de outras turmas',
  '2ª opção indo para outras turmas',
] as const

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function normalizeHeader(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function readCell(row: HTMLTableRowElement, index: number | undefined) {
  if (index === undefined) return ''
  return row.cells.item(index)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function columnIndex(headers: string[], field: typeof HEADER_FIELDS[number]) {
  const normalized = headers.map(normalizeHeader)
  switch (field) {
    case 'Município': return normalized.findIndex((header) => header === 'municipio')
    case 'Código da unidade': return normalized.findIndex((header) => header.includes('codigo da unidade'))
    case 'Unidade': return normalized.findIndex((header) => header === 'unidade')
    case 'Turma': return normalized.findIndex((header) => header === 'turma')
    case 'Curso': return normalized.findIndex((header) => header === 'curso')
    case 'Período': return normalized.findIndex((header) => header === 'periodo')
    case 'Vagas': return normalized.findIndex((header) => header === 'vagas')
    case 'Inscritos': return normalized.findIndex((header) => header === 'inscritos')
    case 'Demanda': return normalized.findIndex((header) => header === 'demanda')
    case '2ª opção vindo de outras turmas': return normalized.findIndex((header) => header.includes('2a opcao vindo') || header.includes('segunda opcao vindo'))
    case '2ª opção indo para outras turmas': return normalized.findIndex((header) => header.includes('2a opcao indo') || header.includes('segunda opcao indo'))
  }
}

function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCount(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, '')
      : trimmed
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseRelatedTurmas(value: string) {
  const matches = Array.from(value.matchAll(/\bTurma\s+(\d+)\D{0,32}?(\d+)\s+inscrito(?:s)?/gi))
  const listedTurmas = Array.from(value.matchAll(/\bTurma\s+\d+/gi)).length
  const unparsed = Math.max(listedTurmas - matches.length, 0)
  return {
    pairs: matches.map((match) => ({ id: match[1], count: Number(match[2]) })),
    unparsed: unparsed || (value.trim() && !/nenhum inscrito/i.test(value) && !matches.length ? 1 : 0),
  }
}

function parseRelatedTurma(description: string, countText: string) {
  if (!description.trim() && !countText.trim()) return { pair: null, invalid: false }
  if (/^nenhum inscrito$/i.test(description.trim()) && !countText.trim()) {
    return { pair: null, invalid: false }
  }
  const id = description.match(/\bTurma\s+(\d+)\b/i)?.[1]
  const count = parseCount(countText)
  return id && count !== null
    ? { pair: { id, count }, invalid: false }
    : { pair: null, invalid: true }
}

function addPair(map: PairMap, origin: string, destination: string, count: number) {
  const key = `${origin}>${destination}`
  map.set(key, (map.get(key) ?? 0) + count)
}

function pairTotal(map: PairMap, predicate: (origin: string, destination: string) => boolean) {
  let total = 0
  for (const [key, count] of map) {
    const [origin, destination] = key.split('>')
    if (predicate(origin, destination)) total += count
  }
  return total
}

function decodeHtml(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text
    .replace(/^\uFEFF/, '')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â€™/g, '’')
}

function findTableHeader(document: Document) {
  let best: { table: HTMLTableElement; rowIndex: number; indexes: number[]; score: number } | null = null
  for (const table of Array.from(document.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).slice(0, 20)
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const headers = Array.from(row.cells).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      const indexes = HEADER_FIELDS.map((field) => columnIndex(headers, field))
      const score = indexes.filter((index) => index >= 0).length
      if (!best || score > best.score) best = { table, rowIndex, indexes, score }
    }
  }
  return best
}

function numberOrDash(value: number | null) {
  return value === null ? 'sem dado' : numberFormat.format(value)
}

export async function analyzeSecondOptionFile(file: File): Promise<SecondOptionImportReport> {
  const text = decodeHtml(await file.arrayBuffer())
  if (!/^\s*(?:<!doctype\s+html|<html|<table)/i.test(text)) {
    throw new Error('Este protótipo aceita o relatório HTML salvo com extensão .xls. O arquivo selecionado parece estar em outro formato.')
  }

  const document = new DOMParser().parseFromString(text, 'text/html')
  const header = findTableHeader(document)
  if (!header || header.score !== HEADER_FIELDS.length) {
    const recognized = header?.score ?? 0
    const missing = header
      ? HEADER_FIELDS.filter((_, index) => header.indexes[index] < 0)
      : [...HEADER_FIELDS]
    throw new Error(`Não encontrei o cabeçalho esperado: reconheci ${recognized} de ${HEADER_FIELDS.length} campos. Ausentes: ${missing.join(', ')}.`)
  }

  const indexes = Object.fromEntries(HEADER_FIELDS.map((field, index) => [field, header.indexes[index]])) as Record<typeof HEADER_FIELDS[number], number>
  const headerLabels = Array.from(header.table.rows[header.rowIndex].cells).map((cell) => normalizeHeader(cell.textContent ?? ''))
  const incomingCountColumn = headerLabels.findIndex((label) => label === 'inscritos vindo')
  const outgoingCountColumn = headerLabels.findIndex((label) => label === 'inscritos indo')
  const hasSplitRelationRows = incomingCountColumn >= 0 && outgoingCountColumn >= 0
  const sourceRows: RowData[] = []
  let invalidNumericRows = 0
  let blankOutgoingLists = 0
  let offersWithoutPositiveSeats = 0
  let unparsedEntries = 0
  const invalidNumericExamples: string[] = []
  const unparsedExamples: string[] = []

  const tableRows = Array.from(header.table.rows).slice(header.rowIndex + 1)
  let currentOffer: RowData | null = null
  const rowLabelFor = (offer: RowData | null) => offer?.id || offer?.course || 'sem identificação'
  const recordUnparsed = (offer: RowData | null, count: number) => {
    if (!count) return
    unparsedEntries += count
    if (unparsedExamples.length < 5) unparsedExamples.push(rowLabelFor(offer))
  }
  const addOffer = (values: string[]) => {
    const applicants = parseCount(values[7])
    const seats = parseCount(values[6])
    const demand = parseDecimal(values[8])
    const offer: RowData = {
      id: values[3],
      municipality: values[0],
      unit: values[2],
      course: values[4],
      period: values[5],
      applicants,
      seats,
      demand,
      incomingEntries: [],
      outgoingEntries: [],
    }
    if (applicants === null || seats === null || (seats > 0 && demand === null)) {
      invalidNumericRows += 1
      if (invalidNumericExamples.length < 5) invalidNumericExamples.push(rowLabelFor(offer))
    }
    if (seats === null || seats <= 0) offersWithoutPositiveSeats += 1
    sourceRows.push(offer)
    return offer
  }
  const addSplitRelation = (offer: RowData, row: HTMLTableRowElement, descriptionIndex: number, countIndex: number, direction: 'incoming' | 'outgoing') => {
    const parsed = parseRelatedTurma(readCell(row, descriptionIndex), readCell(row, countIndex))
    if (parsed.pair) offer[direction === 'incoming' ? 'incomingEntries' : 'outgoingEntries'].push(parsed.pair)
    else if (parsed.invalid) recordUnparsed(offer, 1)
  }

  for (const row of tableRows) {
    if (hasSplitRelationRows) {
      if (row.cells.length >= 13) {
        const offerValues = HEADER_FIELDS.slice(0, 9).map((field) => readCell(row, indexes[field]))
        if (offerValues.every((value) => !value)) continue
        currentOffer = addOffer(offerValues)
        addSplitRelation(currentOffer, row, 9, 10, 'incoming')
        addSplitRelation(currentOffer, row, 11, 12, 'outgoing')
      } else if (row.cells.length === 4 && currentOffer) {
        addSplitRelation(currentOffer, row, 0, 1, 'incoming')
        addSplitRelation(currentOffer, row, 2, 3, 'outgoing')
      }
      continue
    }

    const values = HEADER_FIELDS.map((field) => readCell(row, indexes[field]))
    if (values.every((value) => !value)) continue
    const offer = addOffer(values)
    const incoming = parseRelatedTurmas(values[9])
    const outgoing = parseRelatedTurmas(values[10])
    offer.incomingEntries.push(...incoming.pairs)
    offer.outgoingEntries.push(...outgoing.pairs)
    recordUnparsed(offer, incoming.unparsed + outgoing.unparsed)
  }

  if (!sourceRows.length) throw new Error('Encontrei o cabeçalho, mas não encontrei linhas de turmas abaixo dele.')
  for (const offer of sourceRows) {
    if (!offer.outgoingEntries.length) {
      blankOutgoingLists += 1
    }
  }

  const outgoing: PairMap = new Map()
  const incoming: PairMap = new Map()
  const unassignedByOffer = new Map<string, number>()
  let outgoingOverApplicants = 0
  let outgoingExcessCandidates = 0
  let demandMismatches = 0
  let offersWithoutDeclaredDemand = 0
  const outgoingOverExamples: string[] = []
  const demandMismatchExamples: string[] = []

  for (const offer of sourceRows) {
    if (offer.id) {
      for (const entry of offer.outgoingEntries) addPair(outgoing, offer.id, entry.id, entry.count)
      for (const entry of offer.incomingEntries) addPair(incoming, entry.id, offer.id, entry.count)
    }

    const outgoingCount = offer.outgoingEntries.reduce((sum, entry) => sum + entry.count, 0)
    if (offer.applicants !== null) {
      if (outgoingCount > offer.applicants) {
        outgoingOverApplicants += 1
        outgoingExcessCandidates += outgoingCount - offer.applicants
        if (outgoingOverExamples.length < 5) outgoingOverExamples.push(offer.id || offer.course || 'sem identificação')
      }
      if (outgoingCount < offer.applicants) unassignedByOffer.set(offer.id, (unassignedByOffer.get(offer.id) ?? 0) + offer.applicants - outgoingCount)
    }
    if (offer.demand === null) offersWithoutDeclaredDemand += 1
    else if (offer.applicants !== null && offer.seats !== null && offer.seats > 0) {
      const calculated = offer.applicants / offer.seats
      if (Math.abs(calculated - offer.demand) > 0.011) {
        demandMismatches += 1
        if (demandMismatchExamples.length < 5) demandMismatchExamples.push(offer.id || offer.course || 'sem identificação')
      }
    }
  }

  const offerIds = new Set(sourceRows.map((offer) => offer.id).filter(Boolean))
  const idCounts = new Map<string, number>()
  for (const offer of sourceRows) if (offer.id) idCounts.set(offer.id, (idCounts.get(offer.id) ?? 0) + 1)
  const duplicateOfferIds = Array.from(idCounts.values()).filter((count) => count > 1).length
  const missingIdOffers = sourceRows.filter((offer) => !offer.id)
  const missingOfferIds = missingIdOffers.length
  const duplicateOfferExamples = Array.from(idCounts.entries()).filter(([, count]) => count > 1).slice(0, 5).map(([id]) => id)
  const missingOfferExamples = missingIdOffers.slice(0, 5).map((offer) => offer.course || offer.unit || offer.municipality || 'linha sem descrição')
  const allPairKeys = new Set([...outgoing.keys(), ...incoming.keys()])
  let mismatchedPairs = 0
  let linkedPairs = 0
  const mismatchedPairExamples: string[] = []
  for (const key of allPairKeys) {
    const [origin, destination] = key.split('>')
    if (!offerIds.has(origin) || !offerIds.has(destination)) continue
    if ((outgoing.get(key) ?? 0) !== (incoming.get(key) ?? 0)) {
      mismatchedPairs += 1
      if (mismatchedPairExamples.length < 5) {
        mismatchedPairExamples.push(`${origin} → ${destination}: indo ${outgoing.get(key) ?? 0}, vindo ${incoming.get(key) ?? 0}`)
      }
    }
    else if (outgoing.has(key) && incoming.has(key)) linkedPairs += 1
  }

  const outgoingCandidates = Array.from(outgoing.values()).reduce((sum, count) => sum + count, 0)
  const incomingCandidates = Array.from(incoming.values()).reduce((sum, count) => sum + count, 0)
  const applicantsWithoutSecondOption = Array.from(unassignedByOffer.values()).reduce((sum, count) => sum + count, 0)
  const offersWithUnassignedApplicants = unassignedByOffer.size
  const structureDetail = hasSplitRelationRows
    ? '13 colunas reconhecidas; descrições e quantidades das relações foram lidas nas linhas de continuação.'
    : `${HEADER_FIELDS.length} campos esperados reconhecidos no relatório.`

  const checks: ImportCheck[] = [
    { status: 'success', title: 'Estrutura', detail: structureDetail },
    {
      status: duplicateOfferIds || missingOfferIds || invalidNumericRows ? 'error' : 'success',
      title: 'Identificação e números',
      detail: `${sourceRows.length} linhas de turma; ${duplicateOfferIds} IDs repetidos, ${missingOfferIds} IDs ausentes e ${invalidNumericRows} linhas com vagas, inscritos ou demanda inválidos.`,
      examples: [...duplicateOfferExamples, ...missingOfferExamples, ...invalidNumericExamples].slice(0, 5),
    },
    {
      status: mismatchedPairs ? 'error' : 'success',
      title: '“Indo” x “vindo”',
      detail: mismatchedPairs
        ? `${mismatchedPairs} relações entre turmas listadas na planilha têm quantidades diferentes; ${linkedPairs} conferem.`
        : `${linkedPairs} relações entre turmas listadas na planilha conferem.`,
      examples: mismatchedPairExamples,
    },
    {
      status: demandMismatches ? 'warning' : 'success',
      title: 'Demanda',
      detail: demandMismatches
        ? `${demandMismatches} linhas diferem de inscritos ÷ vagas por mais de 0,01; ${offersWithoutPositiveSeats} turmas têm zero ou nenhuma vaga informada.`
        : `${offersWithoutDeclaredDemand} linhas sem demanda calculável e ${offersWithoutPositiveSeats} turmas sem vagas positivas; nas demais, inscritos ÷ vagas confere com o valor informado.`,
      examples: demandMismatchExamples,
    },
    {
      status: outgoingOverApplicants ? 'warning' : 'success',
      title: 'Inscritos e opções de saída',
      detail: `${outgoingOverApplicants} turmas têm mais indicações de saída que inscritos de 1ª opção (${numberFormat.format(outgoingExcessCandidates)} indicação(ões) excedente(s)); ${blankOutgoingLists} turmas não listam saídas. Considerando que quem não aparece nas saídas não escolheu 2ª opção: ${numberFormat.format(applicantsWithoutSecondOption)} inscritos em ${offersWithUnassignedApplicants} turmas ficam nessa situação.`,
      examples: outgoingOverExamples,
    },
    ...(unparsedEntries ? [{ status: 'warning' as const, title: 'Leitura das listas', detail: `${unparsedEntries} ocorrências de “Turma” não seguiram o padrão turma + inscritos e precisam de revisão.`, examples: unparsedExamples }] : []),
  ]

  const offers: ImportedOfferPreview[] = sourceRows.slice(0, 8).map((offer) => ({
    id: offer.id || 'Sem ID',
    municipality: offer.municipality,
    unit: offer.unit,
    course: offer.course,
    period: offer.period,
    applicants: offer.applicants,
    seats: offer.seats,
    demand: offer.demand,
    incomingCount: pairTotal(incoming, (_origin, destination) => destination === offer.id),
    outgoingCount: pairTotal(outgoing, (origin) => origin === offer.id),
  }))

  return {
    fileName: file.name,
    fileSize: file.size,
    sourceRows: sourceRows.length,
    uniqueOffers: offerIds.size,
    duplicateOfferIds,
    missingOfferIds,
    linkedPairs,
    outgoingCandidates,
    incomingCandidates,
    mismatchedPairs,
    demandMismatches,
    invalidNumericRows,
    offersWithoutPositiveSeats,
    outgoingOverApplicants,
    applicantsWithoutSecondOption,
    blankOutgoingLists,
    unparsedEntries,
    offers,
    checks,
  }
}

export { numberOrDash }
