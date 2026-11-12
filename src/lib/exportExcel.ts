type Cell = string | number
type RowKind = 'title' | 'meta' | 'header' | 'authorized' | 'denied' | 'course' | 'origin'
type Sheet = { name: string; rows: Cell[][]; rowKinds?: RowKind[]; columnWidths?: number[] }

const encoder = new TextEncoder()
const xmlText = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
const columnName = (index: number) => {
  let result = ''
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result
  return result
}
const cellStyle = (cell: Cell, rowIndex: number, kind?: RowKind) => kind === 'title' || kind === 'header' || (!kind && rowIndex === 0) ? 1 : kind === 'authorized' ? 2 : kind === 'denied' ? 3 : kind === 'course' ? 5 : kind === 'origin' ? 0 : cell === 'Sem análise' ? 4 : 0
const sheetXml = ({ rows, rowKinds, columnWidths }: Sheet) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${rowKinds ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''}${columnWidths ? `<cols>${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`
  const style = cellStyle(cell, rowIndex, rowKinds?.[rowIndex])
  return typeof cell === 'number' && Number.isFinite(cell)
    ? `<c r="${reference}" s="${style}"><v>${cell}</v></c>`
    : `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${xmlText(String(cell))}</t></is></c>`
}).join('')}</row>`).join('')}</sheetData></worksheet>`

function crc32(bytes: Uint8Array) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

function zipFiles(files: { name: string; contents: string }[]) {
  const chunks: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const body = encoder.encode(file.contents)
    const crc = crc32(body)
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x0800, true)
    header.setUint32(14, crc, true)
    header.setUint32(18, body.length, true)
    header.setUint32(22, body.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    chunks.push(local, body)

    const central = new Uint8Array(46 + name.length)
    const entry = new DataView(central.buffer)
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, body.length, true)
    entry.setUint32(24, body.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.set(name, 46)
    directory.push(central)
    offset += local.length + body.length
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const footer = new DataView(end.buffer)
  footer.setUint32(0, 0x06054b50, true)
  footer.setUint16(8, files.length, true)
  footer.setUint16(10, files.length, true)
  footer.setUint32(12, directorySize, true)
  footer.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end].map(part => new Uint8Array(part)), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function exportExcel(sheets: Sheet[], filename: string) {
  const files = [
    { name: '[Content_Types].xml', contents: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', contents: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', contents: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlText(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', contents: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', contents: '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF005568"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF166534"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFB42318"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF667085"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF4F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDE8E8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F6F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, contents: sheetXml(sheet) })),
  ]
  const url = URL.createObjectURL(zipFiles(files))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
