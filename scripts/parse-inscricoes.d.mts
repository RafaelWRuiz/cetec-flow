export type SourceLocation = {
  codigo_etec: string
  tipo_local: string
  codigo_local: string
  codigo_completo: string
  municipio: string
  nome: string
  regiao_administrativa: string
  regiao_governo: string
  titulo_original: string
}

export type SourceOffer = {
  codigo_local: string
  curso: string
  periodo: string
  vagas: number
  pagos: number
  nao_pagos: number
  total_inscritos: number
  demanda_original: number | null
  demanda_calculada: number
  is_treineiro: boolean
}

export type EnrollmentSnapshot = {
  metadata: {
    edicao: string
    arquivo_origem: string
    data_referencia: string
    total_geral: { vagas: number; pagos: number; nao_pagos: number; total_inscritos: number; demanda: number }
  }
  locais: SourceLocation[]
  ofertas: SourceOffer[]
}

export function parseInscricoes(html: string, source?: string): EnrollmentSnapshot
