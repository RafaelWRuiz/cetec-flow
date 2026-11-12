export function reportTimestamp(referenceAt: string) {
  const date = new Date(referenceAt)
  if (Number.isNaN(date.getTime())) return { label: referenceAt || 'Data não informada', filename: 'sem-data' }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return {
    label: `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`,
    filename: `${parts.year}-${parts.month}-${parts.day}_${parts.hour}h${parts.minute}`,
  }
}

export const reportFilename = (referenceAt: string, extension: 'xlsx' | 'pdf') => `Relatorio-de-Cursos-e-Segunda-Opcao_${reportTimestamp(referenceAt).filename}.${extension}`
