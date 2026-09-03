import snapshot from './snapshots/2026.2/2026-06-05T20-22-00-03-00.json'

export type DailyPoint = { day: string; value: number }
export type Enrollment = { etec: string; regional: string; modality: string; course: string; axis?: string; period: string; paid: number; unpaid: number; vacancies: number; demand: number; target: number; daily: DailyPoint[]; isTrainee: boolean }
export type EtecPoint = { name: string; label: string; city: string; municipality: string; regional: string; x: number; y: number }
export type ExemptionMetrics = { solicitacoes: number; aprovadas: number; inscritos_com_isencao: number }
type Snapshot = typeof snapshot
export type SnapshotSeries = { referenceAt: string; enrollments: Enrollment[] }

function toEnrollments(source: Snapshot): Enrollment[] {
  const locais = new Map(source.locais.map((local) => [local.codigo_completo, local]))
  return source.ofertas.map((oferta) => {
    const local = locais.get(oferta.codigo_local)!
    return { etec: oferta.codigo_local, regional: local.regiao_administrativa, modality: 'Não informado no arquivo', course: oferta.curso, period: oferta.periodo, paid: oferta.pagos, unpaid: oferta.nao_pagos, vacancies: oferta.vagas, demand: oferta.demanda_calculada, target: 0, daily: [], isTrainee: oferta.is_treineiro }
  })
}

const snapshotFiles = import.meta.glob('./snapshots/**/*.json', { eager: true, import: 'default' }) as Record<string, Snapshot>
export const snapshotSeries: SnapshotSeries[] = Object.values(snapshotFiles).map((source) => ({ referenceAt: source.metadata.data_referencia, enrollments: toEnrollments(source) })).sort((a, b) => a.referenceAt.localeCompare(b.referenceAt))
export const etecs: EtecPoint[] = snapshot.locais.map((local) => ({ name: local.codigo_completo, label: `${local.nome} (${local.codigo_completo})`, city: local.municipio, municipality: local.municipio, regional: local.regiao_administrativa, x: 0, y: 0 }))
export const enrollments: Enrollment[] = toEnrollments(snapshot)
export const options = { regional: [...new Set(enrollments.map((item) => item.regional))], etec: etecs.map((item) => item.name), modality: [], course: [...new Set(enrollments.map((item) => item.course))], period: [...new Set(enrollments.map((item) => item.period))] }
export const sourceMetadata = snapshot.metadata
// The current export has no exemption data; this preserves the future source contract.
export const exemptionMetrics: ExemptionMetrics | null = null
