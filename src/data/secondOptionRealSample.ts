export type RealSampleOfferId = '6018' | '7244'

export type RealSampleOffer = {
  id: RealSampleOfferId
  municipality: string
  unit: string
  course: string
  period: string
  firstChoice: number
  seats: number
  destinations: Partial<Record<RealSampleOfferId, number>>
}

export type RealSampleSupportingOrigin = {
  id: string
  firstChoice: number
  seats: number
  destinations: Partial<Record<RealSampleOfferId, number>>
}

// Recorte derivado do relatório de demanda de 21/10/2026, às 16:59.
export const realSecondOptionSample = {
  reference: '21/10/2026 às 16:59',
  supportingOrigins: [
    { id: '6189', firstChoice: 137, seats: 35, destinations: { '6018': 21, '7244': 15 } },
    { id: '7321', firstChoice: 309, seats: 40, destinations: { '7244': 1 } },
  ] satisfies RealSampleSupportingOrigin[],
  offers: [
    {
      id: '6018',
      municipality: 'Capão Bonito',
      unit: 'Etec Dr. Celso Charuri',
      course: 'Técnico em Edificações',
      period: 'Noite',
      firstChoice: 19,
      seats: 35,
      destinations: { '7244': 6 },
    },
    {
      id: '7244',
      municipality: 'Capão Bonito',
      unit: 'Etec Dr. Celso Charuri',
      course: 'Técnico em Serviços Jurídicos',
      period: 'Noite',
      firstChoice: 42,
      seats: 35,
      destinations: { '6018': 24 },
    },
  ] satisfies RealSampleOffer[],
}
