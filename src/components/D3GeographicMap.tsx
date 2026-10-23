import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { MUN_BY_REGIONAL, REGIONAIS, SAO_PAULO_FALLBACK_LOCATIONS, SAO_PAULO_UNIT_LOCATIONS, SP_BORDER, type MapFeatureCollection } from '../data/aredMapData'
import { REGIONAL_BY_ETEC_CODE } from '../data/regionalByEtecCode'
import capitalRegionalGeometry from '../data/capitalRegionalGeometry.json'
import capitalRegionalCityGeometry from '../data/capitalRegionalCityGeometry.json'
import type { EtecPoint } from '../data/mockData'

type RegionalStatus = 'competitive' | 'acceptable' | 'attention' | 'bad' | 'critical' | 'unavailable'
type OfferLocationStatusCounts = { total: number; competitive: number; acceptable: number; attention: number; bad: number; critical: number; label?: 'Locais de oferta' | 'Turmas' }
type MapProps = { etecs: EtecPoint[]; selected: string; visible: string[]; selectedRegionals: string[]; selectedMunicipalities: string[]; focusedRegional: string; focusedMunicipality: string; resetKey: number; regionalDemands: Record<string, number>; municipalityDemands: Record<string, number>; regionalLocationStatusCounts: Record<string, OfferLocationStatusCounts>; municipalityLocationStatusCounts: Record<string, OfferLocationStatusCounts>; saoPauloRegionalDemands: Record<string, number>; saoPauloRegionalLocationStatusCounts: Record<string, OfferLocationStatusCounts>; colorByStatus: boolean; mapStatusKey: string; onSelect: (name: string) => void; onGeographicSelect: (label: string, etecs: string[]) => void; onRegionalCitiesSelect: (regional: string) => void; onGeographicClear: () => void; onReady: () => void }
type Feature = MapFeatureCollection['features'][number]
const mergedRegionalFeatures: Feature[] = REGIONAIS.features.map((feature) => {
  const geometry = (capitalRegionalGeometry as Record<string, Feature['geometry']>)[String(feature.properties.regional ?? '')]
  return geometry ? { ...feature, geometry } : feature
})
const mergedRegionais: MapFeatureCollection = { ...REGIONAIS, features: mergedRegionalFeatures }
type UnitPoint = { etec: EtecPoint; x: number; y: number; originX: number; originY: number }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const regionalForUnit = (name: string) => REGIONAL_BY_ETEC_CODE[name.split('.')[0].replace(/^E0*/i, '')] ?? ''
const CAPITAL_LOCATION_MATCH_BY_CODE: Record<string, string> = {
  '159': 'parque da juventude',
  '220': 'parque belem',
  '221': 'jardim angela',
  '253': 'jornalista roberto marinho',
  '260': 'santa ifigenia',
}
const locationForCapitalUnit = (unit: EtecPoint) => {
  const code = unit.name.split('.')[0].replace(/^E0*/i, '')
  const explicitMatch = CAPITAL_LOCATION_MATCH_BY_CODE[code]
  return SAO_PAULO_UNIT_LOCATIONS.find((item) => item.match === explicitMatch) ?? SAO_PAULO_UNIT_LOCATIONS.find((item) => normalize(unit.label).includes(item.match))
}
const demandStatusForMap = (value: number): Exclude<RegionalStatus, 'unavailable'> => value >= 2 ? 'competitive' : value >= 1.5 ? 'acceptable' : value >= 1 ? 'attention' : value >= 0.5 ? 'bad' : 'critical'
const demandLabelForMap = (value: number) => ({ competitive: 'Competitivo', acceptable: 'Aceitável', attention: 'Atenção', bad: 'Ruim', critical: 'Crítico' })[demandStatusForMap(value)]
const demandDescriptionForMap = (value: number | undefined) => value === undefined ? 'Sem vagas no recorte' : `Demanda: ${value.toFixed(2).replace('.', ',')} pagos/vaga · ${demandLabelForMap(value)}`
const rgba = (value: string, alpha: number) => {
  const parsed = d3.color(value)
  if (!parsed) return value
  const color = d3.rgb(parsed)
  return `rgba(${color.r},${color.g},${color.b},${alpha})`
}
const getCssToken = (styles: CSSStyleDeclaration, name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
const mixColor = (start: string, end: string, weight: number) => d3.interpolateRgb(start, end)(Math.max(0, Math.min(1, weight)))
const brightenColor = (color: string, amount: number) => d3.rgb(color).brighter(amount).formatHex()
const hasDarkBackground = (color: string) => {
  const { r, g, b } = d3.rgb(color)
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) < 155
}
const EXTERNAL_REGIONAL_LABELS: Record<string, { railPosition: number; maxWidth: number; lines: string[] }> = {
  'Grande São Paulo Noroeste': { railPosition: 0.9, maxWidth: 150, lines: ['Grande São Paulo Noroeste'] },
  'Grande São Paulo Leste': { railPosition: 1, maxWidth: 140, lines: ['Grande São Paulo Leste'] },
  'Grande São Paulo Sul/Baixada Santista': { railPosition: 0.8, maxWidth: 210, lines: ['Grande São Paulo Sul/Baixada Santista'] },
}

type MapTheme = {
  background: string
  stateFill: string
  stateStroke: string
  municipalNeutralFill: string
  municipalNeutralStroke: string
  municipalSelectedStroke: string
  municipalSelectedFill: string
  markerFill: string
  markerHoverFill: string
  markerStroke: string
  regionalStroke: string
  regionalHoverStroke: string
  regionalPalette: Record<string, string>
  statusPalette: Record<Exclude<RegionalStatus, 'unavailable'>, string>
}

function buildMapTheme(container: HTMLDivElement): MapTheme {
  const styles = window.getComputedStyle(container)
  const cpsBlue = getCssToken(styles, '--cps-blue', '#005C6D')
  const cpsBlueDark = getCssToken(styles, '--cps-blue-dark', '#004854')
  const cpsCyan = getCssToken(styles, '--cps-cyan', '#00C1CF')
  const cpsCyanLight = getCssToken(styles, '--cps-cyan-light', '#00D8E8')
  const cpsBlueAccent = getCssToken(styles, '--cps-blue-accent', '#4C7EFF')
  const cpsGreen = getCssToken(styles, '--cps-green', '#A0C340')
  const cpsYellow = getCssToken(styles, '--cps-yellow', '#FFC24C')
  const cpsViolet = getCssToken(styles, '--cps-violet', '#8A29E6')
  const cpsCoral = getCssToken(styles, '--cps-coral', '#FF4C4D')
  const cpsPink = getCssToken(styles, '--cps-pink', '#FF4CA2')
  const cpsRed = getCssToken(styles, '--cps-red', '#B20000')
  const cpsSuccess = getCssToken(styles, '--cps-success', '#389A4B')
  const cpsAttention = getCssToken(styles, '--cps-attention', '#F0A51A')
  const cpsError = getCssToken(styles, '--cps-error', '#C74848')
  const cpsBg = getCssToken(styles, '--cps-bg', '#F8F8F8')
  const cpsSurface = getCssToken(styles, '--cps-surface', '#FFFFFF')
  const cpsBorder = getCssToken(styles, '--cps-border', '#DADADA')
  // A discrete palette keeps neighboring regions distinct instead of blending into one hue.
  const regionalColors = [
    cpsBlue,
    mixColor(cpsCyan, cpsBlue, 0.22),
    mixColor(cpsYellow, cpsBlue, 0.32),
    mixColor(cpsViolet, cpsBlueAccent, 0.42),
    cpsBlueAccent,
    mixColor(cpsPink, cpsViolet, 0.34),
    mixColor(cpsGreen, cpsBlue, 0.28),
    mixColor(cpsCoral, cpsYellow, 0.36),
    mixColor(cpsCyanLight, cpsBlue, 0.38),
    mixColor(cpsYellow, cpsCoral, 0.22),
    mixColor(cpsViolet, cpsBlue, 0.24),
    mixColor(cpsCyan, cpsBlueDark, 0.34),
    mixColor(cpsGreen, cpsYellow, 0.26),
    mixColor(cpsCoral, cpsPink, 0.38),
    mixColor(cpsRed, cpsViolet, 0.46),
    mixColor(cpsBlueDark, cpsViolet, 0.32),
  ]
  const regionalPalette = Object.fromEntries(REGIONAIS.features.map((feature, index) => [String(feature.properties.regional ?? ''), regionalColors[index]]))

  return {
    background: mixColor(cpsBg, cpsSurface, 0.22),
    stateFill: mixColor(cpsBg, cpsSurface, 0.48),
    stateStroke: mixColor(cpsBorder, cpsBlueDark, 0.32),
    municipalNeutralFill: mixColor(cpsBg, cpsBorder, 0.45),
    municipalNeutralStroke: mixColor(cpsBorder, cpsBlueDark, 0.1),
    municipalSelectedStroke: cpsBlueDark,
    municipalSelectedFill: mixColor(cpsBlue, cpsCyan, 0.15),
    markerFill: cpsCyan,
    markerHoverFill: mixColor(cpsBlueAccent, cpsCyan, 0.35),
    markerStroke: cpsSurface,
    regionalStroke: rgba(cpsBlueDark, 0.48),
    regionalHoverStroke: rgba(cpsCyanLight, 0.94),
    regionalPalette,
    statusPalette: { competitive: cpsSuccess, acceptable: cpsCyan, attention: cpsAttention, bad: '#E57373', critical: '#8B0000' },
  }
}

function unitsForMunicipality(etecs: EtecPoint[], municipality: string) {
  return etecs.filter((etec) => normalize(etec.municipality) === normalize(municipality))
}

function radialize(points: UnitPoint[], anchor: [number, number]) {
  if (points.length < 2) return points
  const radius = Math.min(18, 8 + points.length * 1.8)
  return points.map((point, index) => ({ ...point, x: anchor[0] + Math.cos(-Math.PI / 2 + Math.PI * 2 * index / points.length) * radius, y: anchor[1] + Math.sin(-Math.PI / 2 + Math.PI * 2 * index / points.length) * radius }))
}

function separateOverlappingPoints(points: UnitPoint[], minimumDistance = 5) {
  const positioned: UnitPoint[] = []
  return points.map((point, index) => {
    let x = point.x
    let y = point.y
    for (let attempt = 0; attempt < 18 && positioned.some((item) => Math.hypot(item.x - x, item.y - y) < minimumDistance); attempt++) {
      const angle = index * 2.39996 + attempt * 0.93
      const radius = minimumDistance + Math.floor(attempt / 3) * 2.2
      x = point.x + Math.cos(angle) * radius
      y = point.y + Math.sin(angle) * radius
    }
    const separated = { ...point, x, y }
    positioned.push(separated)
    return separated
  })
}

export default function D3GeographicMap({ etecs, selected, visible, selectedRegionals, selectedMunicipalities, focusedRegional, focusedMunicipality, resetKey, regionalDemands, municipalityDemands, regionalLocationStatusCounts, municipalityLocationStatusCounts, saoPauloRegionalDemands, saoPauloRegionalLocationStatusCounts, colorByStatus, mapStatusKey, onSelect, onGeographicSelect, onRegionalCitiesSelect, onGeographicClear, onReady }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onGeographicSelect, onRegionalCitiesSelect, onGeographicClear })
  const resetMap = useRef<null | (() => void)>(null)
  const focusRegional = useRef<null | ((regional: string) => void)>(null)
  const focusCapital = useRef<null | (() => void)>(null)
  const focusMunicipality = useRef<null | ((municipality: string) => void)>(null)
  const markerState = useRef({ selected, visible })
  const etecsRef = useRef(etecs)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const selectedRegionalKey = selectedRegionals.join('|')
  const selectedMunicipalityKey = selectedMunicipalities.join('|')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const updateSize = () => {
      const width = Math.round(container.clientWidth)
      const height = Math.round(container.clientHeight)
      setContainerSize((current) => current.width === width && current.height === height ? current : { width, height })
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    updateSize()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    callbacks.current = { onSelect, onGeographicSelect, onRegionalCitiesSelect, onGeographicClear }
  }, [onSelect, onGeographicClear, onGeographicSelect, onRegionalCitiesSelect])

  useEffect(() => {
    markerState.current = { selected, visible }
  }, [selected, visible])

  useEffect(() => {
    d3.select(containerRef.current).selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').each(function (point) {
      const isSaoPaulo = d3.select(this).classed('is-sao-paulo-unit')
      d3.select(this).select('.ared-unit-dot').attr('r', isSaoPaulo ? (point.etec.name === selected ? 4.2 : 2.5) : (point.etec.name === selected ? 6.5 : 5.2))
    })
  }, [selected])

  useEffect(() => {
    etecsRef.current = etecs
  }, [etecs])

  useEffect(() => { resetMap.current?.() }, [resetKey])

  useEffect(() => { focusRegional.current?.(focusedRegional) }, [focusedRegional])

  useEffect(() => {
    if (normalize(focusedMunicipality) === 'sao paulo') focusCapital.current?.()
    else if (!focusedRegional && !focusedMunicipality) resetMap.current?.()
    else focusMunicipality.current?.(focusedMunicipality)
  }, [focusedMunicipality, focusedRegional])

  useEffect(() => {
    // Filter changes rebuild the map; geographic drill-down keeps its current view.
    const activeEtecs = etecsRef.current.filter((etec) => markerState.current.visible.includes(etec.name))
    const container = containerRef.current
    if (!container) return undefined
    const width = Math.max(containerSize.width || container.clientWidth, 320)
    const height = Math.max(containerSize.height || container.clientHeight, 220)
    const theme = buildMapTheme(container)
    const heatColorFor = (demand: number | undefined) => demand === undefined ? theme.municipalNeutralStroke : theme.statusPalette[demandStatusForMap(demand)]
    // Keep a compact label zone so the state itself uses the available map height.
    const stateBottomPadding = Math.max(20, Math.round(height * 0.07))
    const projection = d3.geoMercator().fitExtent([[20, 8], [width - 20, height - stateBottomPadding]], mergedRegionais as d3.ExtendedFeatureCollection)
    const path = d3.geoPath(projection)
    const selectedMunicipalityFeatures = selectedMunicipalities.flatMap((municipality) => Object.entries(MUN_BY_REGIONAL).flatMap(([regional, data]) => {
      const feature = data.features.find((item) => normalize(String(item.properties.name ?? '')) === normalize(municipality))
      return feature ? [{ regional, feature }] : []
    }))
    const selectedMunicipalityRegions = new Set(selectedMunicipalityFeatures.map((item) => item.regional))
    const showMunicipalityOutlines = selectedMunicipalityFeatures.length > 1 && selectedMunicipalityRegions.size > 1
    const capitalFeature = Object.values(MUN_BY_REGIONAL).flatMap((collection) => collection.features).find((feature) => normalize(String(feature.properties.name ?? '')) === 'sao paulo')
    const capitalRegionals = [...new Set(etecs.filter((etec) => normalize(etec.municipality) === 'sao paulo').map((etec) => regionalForUnit(etec.name)).filter(Boolean))]
    const capitalCenters = (mapProjection: d3.GeoProjection) => capitalRegionals.map((regional) => {
        const locations = etecs.filter((etec) => normalize(etec.municipality) === 'sao paulo' && regionalForUnit(etec.name) === regional).flatMap((etec) => {
          const location = locationForCapitalUnit(etec)
          const projected = location ? mapProjection([location.lon, location.lat]) : null
          return projected ? [projected] : []
        })
        return { regional, x: d3.mean(locations, (point) => point[0]) ?? 0, y: d3.mean(locations, (point) => point[1]) ?? 0 }
      })
    const capitalPartition = (mapProjection: d3.GeoProjection, mapPath: d3.GeoPath) => {
      if (!capitalFeature || capitalRegionals.length < 2) return null
      const bounds = mapPath.bounds(capitalFeature as d3.GeoPermissibleObjects)
      const centers = capitalCenters(mapProjection)
      const voronoi = d3.Delaunay.from(centers, (item) => item.x, (item) => item.y).voronoi([bounds[0][0] - 2, bounds[0][1] - 2, bounds[1][0] + 2, bounds[1][1] + 2])
      return { cells: centers.map((item, index) => ({ regional: item.regional, d: voronoi.renderCell(index) })), cityPath: mapPath(capitalFeature as d3.GeoPermissibleObjects) ?? '' }
    }
    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', 'Mapa geográfico das Etecs no Estado de São Paulo')
    const tooltip = d3.select(container).append('div').attr('class', 'ared-map-tooltip')
    const back = d3.select(container).append('button').attr('class', 'ared-map-back').attr('type', 'button').text('Voltar ao estado').style('display', 'none')
    const saoPauloUnitsPanel = d3.select(container).append('aside').attr('class', 'sao-paulo-units-panel').attr('aria-label', 'Unidades de São Paulo por regional').style('display', 'none')
    const hideSaoPauloUnits = () => saoPauloUnitsPanel.style('display', 'none').selectAll('*').remove()
    const showSaoPauloUnits = (units: EtecPoint[]) => {
      if (!units.length) { hideSaoPauloUnits(); return }
      saoPauloUnitsPanel.style('display', 'grid').selectAll('*').remove()
      saoPauloUnitsPanel.append('strong').text('São Paulo · regionais das unidades')
      const regionalCounts = [...new Set(units.map((unit) => regionalForUnit(unit.name)).filter(Boolean))].map((regional) => ({ regional, count: units.filter((unit) => regionalForUnit(unit.name) === regional).length }))
      const legend = saoPauloUnitsPanel.append('div').attr('class', 'sao-paulo-regional-legend').attr('aria-label', 'Quantidade de locais por regional')
      legend.selectAll<HTMLSpanElement, typeof regionalCounts[number]>('span').data(regionalCounts).join('span').each(function (item) {
        const entry = d3.select(this)
        entry.append('i').style('background-color', theme.regionalPalette[item.regional] ?? theme.markerFill)
        entry.append('span').text(`${item.regional.replace('Grande São Paulo ', 'GSP ')} · ${item.count}`)
      })
      const list = saoPauloUnitsPanel.append('div').attr('class', 'sao-paulo-units-list')
      list.selectAll<HTMLButtonElement, EtecPoint>('button').data(units).join('button').attr('type', 'button').attr('title', (unit) => `${unit.label.replace(/\s*\([^)]*\)\s*$/, '')} · ${regionalForUnit(unit.name)}`).attr('aria-label', (unit) => `${unit.label.replace(/\s*\([^)]*\)\s*$/, '')}, ${regionalForUnit(unit.name)}`).each(function (unit, index) {
        const button = d3.select(this)
        button.append('b').text(index + 1).style('background-color', theme.regionalPalette[regionalForUnit(unit.name)] ?? theme.markerFill)
        button.append('span').text(unit.label.replace(/\s*\([^)]*\)\s*$/, ''))
      }).on('click', (_event, unit) => callbacks.current.onSelect(unit.name))
    }
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', theme.background)
    const spBorder = svg.append('path').datum(SP_BORDER as d3.ExtendedFeature).attr('class', 'ared-sp-border').attr('d', path).attr('fill', theme.stateFill).attr('stroke', theme.stateStroke).attr('stroke-width', 1.25)
    const regionalLayer = svg.append('g')
    const selectedMunicipalityLayer = svg.append('g').attr('pointer-events', 'none')
    const municipalityLayer = svg.append('g').attr('opacity', 0)
    const labelLayer = svg.append('g').attr('pointer-events', 'none')
    let activeRegional = ''
    let activeMunicipality = ''
    let municipalityTooltipsEnabled = true
    let regionalTooltipsEnabled = true
    const regionalUnits = (regional: string) => [
      ...(MUN_BY_REGIONAL[regional]?.features ?? []).filter((feature) => normalize(String(feature.properties.name ?? '')) !== 'sao paulo').flatMap((feature) => unitsForMunicipality(activeEtecs, String(feature.properties.name ?? ''))),
      ...activeEtecs.filter((etec) => normalize(etec.municipality) === 'sao paulo' && regionalForUnit(etec.name) === regional),
    ]
    const hideTip = () => tooltip.style('display', 'none')
    const showTip = (event: MouseEvent, title: string, subtitle: string, units: EtecPoint[], action: string, isLocalOffer = false, locationStatuses?: OfferLocationStatusCounts) => {
      const percentage = (value: number) => locationStatuses?.total ? `${Math.round(value / locationStatuses.total * 100)}%` : '0%'
      const statusDetails = locationStatuses ? `<div class="ared-tip-statuses"><div><span class="status-competitive">Competitivo</span><b>${locationStatuses.competitive} (${percentage(locationStatuses.competitive)})</b></div><div><span class="status-acceptable">Aceitável</span><b>${locationStatuses.acceptable} (${percentage(locationStatuses.acceptable)})</b></div><div><span class="status-attention">Atenção</span><b>${locationStatuses.attention} (${percentage(locationStatuses.attention)})</b></div><div><span class="status-bad">Ruim</span><b>${locationStatuses.bad} (${percentage(locationStatuses.bad)})</b></div><div><span class="status-critical">Crítico</span><b>${locationStatuses.critical} (${percentage(locationStatuses.critical)})</b></div></div>` : ''
      const total = locationStatuses?.total ?? units.length
      const totalLabel = locationStatuses ? (locationStatuses.label ?? 'Locais de oferta') : isLocalOffer ? (units.length === 1 ? 'Local de oferta' : 'Locais de oferta') : 'Etecs'
      const snapshotDetail = locationStatuses ? '' : `<div class="ared-tip-detail">${total ? 'Dados do snapshot disponíveis' : 'Sem dados no recorte'}</div>`
      tooltip.style('display', 'block').html(`<div class="ared-tip-title">${title}</div>${subtitle ? `<div class="ared-tip-sub">${subtitle}</div>` : ''}<div class="ared-tip-total"><span>${totalLabel}</span><b>${total}</b></div>${statusDetails}${snapshotDetail}${action ? `<div class="ared-tip-action">${action}</div>` : ''}`)
      const [pointerX, pointerY] = d3.pointer(event, container)
      const tooltipNode = tooltip.node()
      const tooltipWidth = tooltipNode?.offsetWidth ?? 220
      const tooltipHeight = tooltipNode?.offsetHeight ?? 140
      const padding = 8
      const opensLeft = pointerX + 14 + tooltipWidth > container.clientWidth - padding
      const opensUp = pointerY + 12 + tooltipHeight > container.clientHeight - padding
      const preferredLeft = opensLeft ? pointerX - tooltipWidth - 14 : pointerX + 14
      const preferredTop = opensUp ? pointerY - tooltipHeight - 12 : pointerY + 12
      const left = Math.max(padding, Math.min(preferredLeft, container.clientWidth - tooltipWidth - padding))
      const top = Math.max(padding, Math.min(preferredTop, container.clientHeight - tooltipHeight - padding))
      tooltip.style('left', `${left}px`).style('top', `${top}px`)
    }

    const resetZoom = () => {
      activeRegional = ''
      activeMunicipality = ''
      hideTip()
      municipalityTooltipsEnabled = true
      regionalTooltipsEnabled = true
      hideSaoPauloUnits()
      back.style('display', 'none')
      regionalLayer.interrupt().selectAll('*').interrupt()
      municipalityLayer.interrupt().selectAll('*').interrupt()
      selectedMunicipalityLayer.interrupt()
      labelLayer.interrupt()
      spBorder.interrupt()
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      regionalLayer.transition().duration(500).attr('opacity', 1)
      selectedMunicipalityLayer.transition().duration(400).attr('opacity', 1)
      regionalLayer.selectAll('.ared-reg-path').transition().duration(400).attr('opacity', 1)
      labelLayer.transition().duration(400).attr('opacity', 1)
      spBorder.transition().duration(400).attr('opacity', 1)
      callbacks.current.onGeographicClear()
    }
    resetMap.current = resetZoom
    back.on('click', resetZoom)

    const renderUnits = (data: MapFeatureCollection, municipalPath: d3.GeoPath, municipalProjection: d3.GeoProjection, focus: (municipality: string) => void, regional: string, showAllCapitalUnits: boolean) => {
      const regionalCapitalCenter = capitalCenters(municipalProjection).find((item) => item.regional === regional)
      data.features.forEach((feature) => {
        const municipality = String(feature.properties.name ?? '')
        const isSaoPaulo = normalize(municipality) === 'sao paulo'
        const units = unitsForMunicipality(activeEtecs, municipality).filter((unit) => !isSaoPaulo || showAllCapitalUnits || regionalForUnit(unit.name) === regional)
        if (!units.length) return
        const centroid = municipalPath.centroid(feature as d3.ExtendedFeature) as [number, number]
        const rawPoints = units.map((etec, index) => {
          const known = normalize(municipality) === 'sao paulo' ? locationForCapitalUnit(etec) : undefined
          const fallback = SAO_PAULO_FALLBACK_LOCATIONS[index % SAO_PAULO_FALLBACK_LOCATIONS.length]
          const regionalSection = (capitalRegionalCityGeometry as Record<string, Feature['geometry']>)[regionalForUnit(etec.name)]
          const regionalFeature = capitalFeature && regionalSection ? { ...capitalFeature, geometry: regionalSection } : feature
          const knownPositionIsInSection = known && (showAllCapitalUnits || d3.geoContains(regionalFeature as d3.ExtendedFeature, [known.lon, known.lat]))
          const capitalPosition = isSaoPaulo ? knownPositionIsInSection ? municipalProjection([known.lon, known.lat]) : showAllCapitalUnits ? municipalProjection(fallback) : regionalCapitalCenter ? [regionalCapitalCenter.x, regionalCapitalCenter.y] : municipalProjection(fallback) : null
          const x = capitalPosition?.[0] ?? centroid[0]
          const y = capitalPosition?.[1] ?? centroid[1]
          return { etec, x, y, originX: x, originY: y }
        })
        const points = isSaoPaulo ? separateOverlappingPoints(rawPoints) : radialize(rawPoints, centroid)
        points.forEach((point, index) => {
          const marker = municipalityLayer.append('g').datum(point).attr('class', `ared-unit-marker${isSaoPaulo ? ' is-sao-paulo-unit' : ''}`).attr('transform', `translate(${point.x},${point.y})`).attr('tabindex', markerState.current.visible.includes(point.etec.name) ? 0 : -1).attr('role', 'button').attr('aria-label', `Selecionar ${point.etec.name}`).attr('opacity', markerState.current.visible.includes(point.etec.name) ? 1 : 0.18)
          const unitRegional = regionalForUnit(point.etec.name)
          const markerFill = isSaoPaulo ? (theme.regionalPalette[unitRegional] ?? theme.markerFill) : theme.markerFill
          marker.append('circle').attr('class', 'ared-unit-dot').attr('r', isSaoPaulo ? (point.etec.name === markerState.current.selected ? 4.2 : 2.5) : (point.etec.name === markerState.current.selected ? 6.5 : 5.2)).attr('fill', markerFill).attr('stroke', theme.markerStroke)
          if (!isSaoPaulo) marker.append('text').attr('class', 'ared-unit-label').attr('y', 0.4).text(index + 1)
          marker.append('title').text(`${point.etec.name}, ${isSaoPaulo ? unitRegional : municipality}`)
          marker.on('mouseenter', function () {
            d3.select(this).select<SVGCircleElement>('.ared-unit-dot').attr('fill', theme.markerHoverFill)
          }).on('mousemove', (event) => showTip(event, point.etec.label, isSaoPaulo ? unitRegional : municipality, [point.etec], 'Clique para filtrar a unidade', true)).on('mouseleave', function () {
            d3.select(this).select<SVGCircleElement>('.ared-unit-dot').attr('fill', markerFill)
            hideTip()
          }).on('click', (event) => {
            event.stopPropagation()
            if (!markerState.current.visible.includes(point.etec.name)) return
            activeMunicipality = municipality
            focus(municipality)
            municipalityLayer.selectAll<SVGPathElement, Feature>('.ared-mun-path').classed('selected', (item) => String(item.properties.name) === municipality).transition().duration(200).attr('opacity', (item) => String(item.properties.name) === municipality ? 1 : 0.18)
            municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => item.etec.name === point.etec.name ? 1 : normalize(item.etec.municipality) === normalize(municipality) && markerState.current.visible.includes(item.etec.name) ? 0.7 : 0.18)
            callbacks.current.onSelect(point.etec.name)
          }).on('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') marker.dispatch('click') })
        })
      })
    }

    const zoomToRegional = (regional: string, color: string, selectCities = false) => {
      activeRegional = regional
      activeMunicipality = ''
      hideTip()
      // Prevent the municipality now under a stationary pointer from inheriting an old tooltip.
      municipalityTooltipsEnabled = false
      // The regional path can remain below the pointer during the zoom transition.
      regionalTooltipsEnabled = false
      hideSaoPauloUnits()
      back.style('display', 'block')
      // Cancel hover/reset animations before changing the visible map layer.
      regionalLayer.interrupt().selectAll('*').interrupt()
      municipalityLayer.interrupt().selectAll('*').interrupt()
      selectedMunicipalityLayer.interrupt()
      labelLayer.interrupt()
      spBorder.interrupt()
      regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(400).attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.12)
      regionalLayer.transition().duration(500).attr('opacity', 0)
      selectedMunicipalityLayer.transition().duration(300).attr('opacity', 0)
      labelLayer.transition().duration(300).attr('opacity', 0)
      spBorder.transition().duration(400).attr('opacity', 0)
      const source = MUN_BY_REGIONAL[regional]
      if (!source) return
      const capitalCitySelected = normalize(focusedMunicipality) === 'sao paulo' && selectedMunicipalities.some((municipality) => normalize(municipality) === 'sao paulo')
      const capitalSection = (capitalRegionalCityGeometry as Record<string, Feature['geometry']>)[regional]
      const regionalCapitalFeature = capitalFeature && capitalSection ? { ...capitalFeature, geometry: capitalSection } : null
      const data: MapFeatureCollection = { ...source, features: capitalCitySelected && capitalFeature ? [capitalFeature] : [...source.features.filter((feature) => normalize(String(feature.properties.name ?? '')) !== 'sao paulo'), ...(regionalCapitalFeature ? [regionalCapitalFeature] : [])] }
      const capitalRegionalContext = focusedRegional || (selectedRegionals.length === 1 ? selectedRegionals[0] : regional)
      const showAllCapitalUnits = capitalCitySelected && !focusedRegional && selectedRegionals.length !== 1
      const unitsForRegionalMunicipality = (municipality: string) => unitsForMunicipality(activeEtecs, municipality).filter((unit) => normalize(municipality) !== 'sao paulo' || (showAllCapitalUnits ? capitalCitySelected : regionalForUnit(unit.name) === capitalRegionalContext))
      const canRestoreMunicipality = Boolean(focusedMunicipality) && data.features.some((item) => String(item.properties.name ?? '') === focusedMunicipality)
      const municipalProjection = d3.geoMercator().fitExtent([[30, 30], [width - 30, height - 30]], data as d3.ExtendedFeatureCollection)
      const municipalPath = d3.geoPath(municipalProjection)
      const focus = (municipality: string) => {
        const feature = data.features.find((item) => String(item.properties.name) === municipality)
        if (!feature) return
        if (normalize(municipality) === 'sao paulo') showSaoPauloUnits(unitsForRegionalMunicipality(municipality))
        else hideSaoPauloUnits()
        if (normalize(municipality) === 'sao paulo' && capitalCitySelected) {
          municipalityLayer.interrupt().attr('transform', null)
          return
        }
        const bounds = municipalPath.bounds(feature as d3.ExtendedFeature)
        const dx = bounds[1][0] - bounds[0][0]; const dy = bounds[1][1] - bounds[0][1]
        const scale = Math.min(2.55, Math.max(1.35, Math.min((width * 0.44) / dx, (height * 0.44) / dy)))
        municipalityLayer.raise().transition().duration(620).ease(d3.easeCubicOut).attr('transform', `translate(${width / 2 - scale * ((bounds[0][0] + bounds[1][0]) / 2)},${height / 2 - scale * ((bounds[0][1] + bounds[1][1]) / 2)}) scale(${scale})`)
      }
      focusMunicipality.current = (municipality) => {
        if (!municipality) { clearMunicipality(false); return }
        activeMunicipality = municipality
        focus(municipality)
      }
      const clearMunicipality = (notify = true) => {
        activeMunicipality = ''
        hideSaoPauloUnits()
        municipalityLayer.transition().duration(520).ease(d3.easeCubicOut).attr('transform', null)
        municipalityLayer.selectAll<SVGPathElement, Feature>('.ared-mun-path')
          .classed('selected', false)
          .attr('fill', (item) => unitsForRegionalMunicipality(String(item.properties.name ?? '')).length ? municipalityBaseFill(String(item.properties.name ?? '')) : municipalityNeutralFill)
          .attr('stroke', (item) => municipalityBorder(String(item.properties.name ?? ''))).attr('stroke-width', 1.25)
          .transition().duration(200).attr('opacity', 1)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => markerState.current.visible.includes(item.etec.name) ? 1 : 0.18)
        if (notify) callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
      }
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      const municipalityColorFor = (municipality: string) => colorByStatus ? heatColorFor(normalize(municipality) === 'sao paulo' && !capitalCitySelected ? saoPauloRegionalDemands[regional] : municipalityDemands[normalize(municipality)]) : color
      const isSelectedMunicipality = (municipality: string) => !selectedMunicipalities.length || selectedMunicipalities.some((item) => normalize(item) === normalize(municipality))
      const municipalityBaseFill = (municipality: string) => normalize(municipality) === 'sao paulo' && capitalCitySelected ? municipalityNeutralFill : isSelectedMunicipality(municipality) ? rgba(municipalityColorFor(municipality), colorByStatus ? 0.72 : 0.56) : theme.municipalNeutralFill
      const municipalityHoverFill = (municipality: string) => normalize(municipality) === 'sao paulo' && capitalCitySelected ? municipalityNeutralFill : isSelectedMunicipality(municipality) ? rgba(brightenColor(municipalityColorFor(municipality), 0.45), 0.78) : mixColor(theme.municipalNeutralFill, theme.stateFill, 0.32)
      const municipalityNeutralFill = colorByStatus ? mixColor(theme.municipalNeutralFill, theme.municipalNeutralStroke, 0.38) : theme.municipalNeutralFill
      const municipalityBorder = (municipality: string) => rgba(theme.municipalSelectedStroke, isSelectedMunicipality(municipality) ? 0.68 : 0.4)
      const paths = municipalityLayer.selectAll<SVGPathElement, Feature>('path').data(data.features).join('path').attr('class', 'ared-mun-path').attr('d', (item) => municipalPath(item as d3.GeoPermissibleObjects) ?? '').attr('fill', (item) => unitsForRegionalMunicipality(String(item.properties.name ?? '')).length ? municipalityBaseFill(String(item.properties.name ?? '')) : municipalityNeutralFill).attr('stroke', (item) => municipalityBorder(String(item.properties.name ?? ''))).attr('stroke-width', 1.25).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke').style('cursor', (item) => isSelectedMunicipality(String(item.properties.name ?? '')) ? 'pointer' : 'default').attr('opacity', 1)
      paths.on('mouseenter', function (_event, item) {
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality === municipality || !isSelectedMunicipality(municipality)) return
        const hasUnits = unitsForRegionalMunicipality(municipality).length > 0
        d3.select(this).attr('fill', hasUnits ? municipalityHoverFill(municipality) : municipalityNeutralFill).attr('stroke', hasUnits ? theme.municipalSelectedStroke : municipalityBorder(municipality)).attr('stroke-width', hasUnits ? 1.8 : 1.25)
      }).on('mousemove', (event, item) => { const municipality = String(item.properties.name ?? ''); if (!municipalityTooltipsEnabled || !isSelectedMunicipality(municipality)) { hideTip(); return }; const regionalCapitalSlice = normalize(municipality) === 'sao paulo' && !capitalCitySelected; const units = unitsForRegionalMunicipality(municipality); const demand = regionalCapitalSlice ? saoPauloRegionalDemands[regional] : municipalityDemands[normalize(municipality)]; const statuses = regionalCapitalSlice ? saoPauloRegionalLocationStatusCounts[regional] : municipalityLocationStatusCounts[normalize(municipality)]; showTip(event, municipality, colorByStatus ? demandDescriptionForMap(demand) : '', units, '', false, statuses) }).on('mouseleave', function (_event, item) {
        municipalityTooltipsEnabled = true
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality !== municipality) {
          const hasUnits = unitsForRegionalMunicipality(municipality).length > 0
          d3.select(this).attr('fill', hasUnits ? municipalityBaseFill(municipality) : municipalityNeutralFill).attr('stroke', municipalityBorder(municipality)).attr('stroke-width', 1.25)
        }
        hideTip()
      }).on('click', (event, item) => {
        event.stopPropagation()
        const municipality = String(item.properties.name ?? ''); const units = unitsForRegionalMunicipality(municipality)
        if (!units.length || !isSelectedMunicipality(municipality)) return
        if (activeMunicipality === municipality) { clearMunicipality(); return }
        activeMunicipality = municipality
        focus(municipality)
        paths.classed('selected', (entry) => String(entry.properties.name) === municipality)
          .attr('fill', (entry) => String(entry.properties.name) === municipality ? municipalityHoverFill(municipality) : (unitsForRegionalMunicipality(String(entry.properties.name ?? '')).length ? municipalityBaseFill(String(entry.properties.name ?? '')) : municipalityNeutralFill))
          .attr('stroke', (entry) => String(entry.properties.name) === municipality ? theme.municipalSelectedStroke : municipalityBorder(String(entry.properties.name ?? '')))
          .attr('stroke-width', (entry) => String(entry.properties.name) === municipality ? 1.8 : 1.25)
          .transition().duration(200).attr('opacity', (entry) => String(entry.properties.name) === municipality ? 1 : 0.22)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (unit) => normalize(unit.etec.municipality) === normalize(municipality) && markerState.current.visible.includes(unit.etec.name) ? 1 : 0.18)
        callbacks.current.onGeographicSelect(municipality, units.map((unit) => unit.name))
      })
      const localCapitalPartition = capitalCitySelected ? capitalPartition(municipalProjection, municipalPath) : null
      if (localCapitalPartition) {
        const clipId = 'ared-capital-municipal-clip'
        municipalityLayer.append('defs').append('clipPath').attr('id', clipId).append('path').attr('d', localCapitalPartition.cityPath)
        municipalityLayer.append('g').attr('clip-path', `url(#${clipId})`).attr('pointer-events', 'none').selectAll('path').data(localCapitalPartition.cells).join('path')
          .attr('class', 'ared-capital-municipal-slice').attr('d', (cell) => cell.d).attr('fill', (cell) => rgba(theme.regionalPalette[cell.regional] ?? color, 0.72))
        municipalityLayer.append('path').attr('d', localCapitalPartition.cityPath).attr('fill', 'none').attr('stroke', municipalityBorder('São Paulo')).attr('stroke-width', 1.25).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none')
      }
      if (canRestoreMunicipality) {
        municipalityLayer.attr('opacity', 1)
        paths.attr('opacity', 1)
      } else {
        // Paint target polygons before fading the regional layer. Staggering the
        // polygons left a visible white map while the new layer was still empty.
        municipalityLayer.attr('opacity', 1)
      }
      const municipalLabelBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
      const positionMunicipalLabel = (center: [number, number], lines: string[]) => {
        const width = Math.max(...lines.map((line) => line.length)) * 5.8 + 6
        const height = lines.length * 11 + 5
        const offsets: Array<[number, number]> = [[0, 0], [0, -15], [0, 15], [-24, -10], [24, -10], [-26, 12], [26, 12], [-42, 0], [42, 0]]
        for (const [offsetX, offsetY] of offsets) {
          const box = { left: center[0] + offsetX - width / 2, right: center[0] + offsetX + width / 2, top: center[1] + offsetY - height / 2, bottom: center[1] + offsetY + height / 2 }
          const overlaps = municipalLabelBoxes.some((placed) => box.left < placed.right + 3 && box.right > placed.left - 3 && box.top < placed.bottom + 3 && box.bottom > placed.top - 3)
          if (!overlaps) { municipalLabelBoxes.push(box); return [center[0] + offsetX, center[1] + offsetY] as [number, number] }
        }
        return center
      }
      data.features.forEach((item) => {
        const municipality = String(item.properties.name ?? '')
        if (data.features.length > 25 && normalize(municipality) !== 'sao paulo') return
        if (!unitsForRegionalMunicipality(municipality).length) return
        const capitalCenter = normalize(municipality) === 'sao paulo' && !capitalCitySelected ? capitalCenters(municipalProjection).find((entry) => entry.regional === regional) : null
        const center: [number, number] = capitalCenter ? [capitalCenter.x, capitalCenter.y - 14] : municipalPath.centroid(item as d3.ExtendedFeature)
        const words = municipality.split(' ')
        const shouldWrap = municipality.length > 13 && words.length > 1
        const lines = shouldWrap ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [municipality]
        const [labelX, labelY] = positionMunicipalLabel(center, lines)
        const label = municipalityLayer.append('text').attr('class', 'ared-mun-label').attr('x', labelX).attr('y', labelY)
        label.selectAll('tspan').data(lines).join('tspan').attr('x', labelX).attr('dy', (_line, index) => lines.length === 1 ? '0' : index === 0 ? '-.45em' : '1.05em').text((line) => line)
        label.attr('opacity', 0).transition().duration(600).delay(300).attr('opacity', 1)
      })
      renderUnits(data, municipalPath, municipalProjection, focus, capitalCitySelected ? capitalRegionalContext : regional, showAllCapitalUnits)
      if (canRestoreMunicipality) focusMunicipality.current?.(focusedMunicipality)
      // A direct regional click applies the same context through its city filter.
      else if (selectCities) callbacks.current.onRegionalCitiesSelect(regional)
      // A city filter can open its regional without replacing that explicit filter.
      else if (!selectedMunicipalities.length) callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
    }

    focusRegional.current = (regional) => {
      if (!regional) { resetZoom(); return }
      const feature = mergedRegionalFeatures.find((item) => String(item.properties.regional ?? '') === regional)
      if (!feature) return
      zoomToRegional(regional, theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D'))
    }
    focusCapital.current = () => {
      const regional = focusedRegional || (selectedRegionals.length === 1 ? selectedRegionals[0] : 'Grande São Paulo Leste')
      zoomToRegional(regional, theme.regionalPalette[regional] ?? theme.markerFill)
    }

    const stateRegionalFill = (regional: string) => {
      const demand = regionalDemands[regional]
      const isHighlighted = selectedRegionals.length < 2 || selectedRegionals.includes(regional)
      const color = colorByStatus ? heatColorFor(demand) : (theme.regionalPalette[regional] ?? theme.markerFill)
      return isHighlighted ? mixColor(color, theme.stateFill, colorByStatus ? 0.18 : showMunicipalityOutlines ? 0.8 : 0.42) : theme.municipalNeutralFill
    }
    const canShowRegional = (regional: string) => !selectedRegionals.length || selectedRegionals.includes(regional)
    const regionalHoverFill = (regional: string) => {
      const color = colorByStatus ? heatColorFor(regionalDemands[regional]) : (theme.regionalPalette[regional] ?? theme.markerFill)
      return brightenColor(color, 0.38)
    }
    const highlightRegional = (regional: string) => {
      if (activeRegional || !canShowRegional(regional)) return
      regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').interrupt().transition().duration(180)
        .attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.62)
        .attr('fill', (item) => String(item.properties.regional) === regional ? regionalHoverFill(regional) : stateRegionalFill(String(item.properties.regional)))
        .attr('stroke', (item) => String(item.properties.regional) === regional ? theme.regionalHoverStroke : theme.regionalStroke)
        .attr('stroke-width', (item) => String(item.properties.regional) === regional ? 1.8 : 1.1)
    }
    const clearRegionalHighlight = (regional: string, relatedTarget: EventTarget | null) => {
      if (relatedTarget instanceof Element && relatedTarget.getAttribute('data-regional') === regional) return
      if (!activeRegional) {
        regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').interrupt().transition().duration(180)
          .attr('opacity', 1).attr('fill', (item) => stateRegionalFill(String(item.properties.regional)))
          .attr('stroke', (item) => selectedRegionals.length < 2 || selectedRegionals.includes(String(item.properties.regional)) ? theme.regionalStroke : theme.municipalNeutralStroke).attr('stroke-width', 1.1)
      }
      hideTip()
    }
    const stateCapitalCenters = capitalRegionals.flatMap((regional) => {
      const geometry = (capitalRegionalCityGeometry as Record<string, Feature['geometry']>)[regional]
      if (!geometry) return []
      const feature: Feature = { type: 'Feature', properties: { regional }, geometry }
      const [x, y] = path.centroid(feature as d3.ExtendedFeature)
      return Number.isFinite(x) && Number.isFinite(y) ? [{ regional, x, y }] : []
    })
    const regionalLabelPlacements: Record<string, { x: number; y: number; lines: string[] }> = {}
    const placedRegionalLabelBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
    const capitalBounds = capitalFeature ? path.bounds(capitalFeature as d3.ExtendedFeature) : [[width * 0.4, height * 0.4], [width * 0.5, height * 0.5]]
    const capitalWidth = Math.max(12, capitalBounds[1][0] - capitalBounds[0][0])
    const capitalHeight = Math.max(12, capitalBounds[1][1] - capitalBounds[0][1])
    const railStart: [number, number] = [Math.max(6, capitalBounds[0][0] - capitalWidth * 0.55), Math.min(height - 12, capitalBounds[1][1] + capitalHeight * 3.3)]
    const railEnd: [number, number] = [Math.min(width - 12, capitalBounds[1][0] + capitalWidth * 0.3), Math.max(8, capitalBounds[0][1] + capitalHeight * 0.9)]
    Object.entries(EXTERNAL_REGIONAL_LABELS).sort(([, a], [, b]) => b.railPosition - a.railPosition).forEach(([regional, label]) => {
      const lines = width < 260
        ? ['Grande São Paulo', regional.includes('Noroeste') ? 'Noroeste' : regional.includes('Leste') ? 'Leste' : 'Sul/Baixada Santista']
        : label.lines
      const textWidth = Math.min(label.maxWidth, Math.max(...lines.map((line) => line.length * 5.6)))
      const textHeight = lines.length * 11
      const targetX = railStart[0] + (railEnd[0] - railStart[0]) * label.railPosition
      const targetY = railStart[1] + (railEnd[1] - railStart[1]) * label.railPosition + 10
      const outsideMainland = (x: number, y: number) => {
        for (let sampleX = x; sampleX <= x + textWidth; sampleX += 8) {
          for (let index = 0; index < lines.length; index += 1) {
            const baseline = y + (index - (lines.length - 1) / 2) * 11
            for (const sampleY of [baseline - 8, baseline - 4, baseline + 1]) {
              const geographicPoint = projection.invert?.([sampleX, sampleY])
              if (!geographicPoint || d3.geoContains(SP_BORDER as d3.ExtendedFeature, geographicPoint)) return false
            }
          }
        }
        return true
      }
      let best: { x: number; y: number; score: number } | null = null
      const minX = Math.max(6, targetX - 150)
      const maxX = Math.min(width - textWidth - 6, targetX + 150)
      const minY = Math.max(12, targetY - 35)
      const maxY = Math.min(height - 5, targetY + 75)
      for (let y = minY; y <= maxY; y += 3) {
        for (let x = minX; x <= maxX; x += 3) {
          const box = { left: x, right: x + textWidth, top: y - textHeight / 2 - 2, bottom: y + textHeight / 2 + 2 }
          if (placedRegionalLabelBoxes.some((placed) => box.left < placed.right + 4 && box.right > placed.left - 4 && box.top < placed.bottom + 4 && box.bottom > placed.top - 4)) continue
          if (!outsideMainland(x, y)) continue
          const dx = x - targetX
          const dy = y - targetY
          const score = dx * dx + dy * dy * 2
          if (!best || score < best.score) best = { x, y, score }
        }
      }
      if (best) {
        regionalLabelPlacements[regional] = { x: best.x, y: best.y, lines }
        placedRegionalLabelBoxes.push({ left: best.x, right: best.x + textWidth, top: best.y - textHeight / 2 - 2, bottom: best.y + textHeight / 2 + 2 })
      }
    })
    mergedRegionalFeatures.forEach((feature) => {
      const regional = String(feature.properties.regional ?? '')
      const demand = regionalDemands[regional]
      const isHighlighted = selectedRegionals.length < 2 || selectedRegionals.includes(regional)
      const canShowRegionalTooltip = canShowRegional(regional)
      const color = colorByStatus ? heatColorFor(demand) : (theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D'))
      const fill = stateRegionalFill(regional)
      const labelIsLight = hasDarkBackground(color)
      const stroke = isHighlighted ? theme.regionalStroke : theme.municipalNeutralStroke
      regionalLayer.append('path').datum(feature).attr('class', 'ared-reg-path').attr('data-regional', regional).attr('d', path(feature as d3.GeoPermissibleObjects) ?? '').attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 1.1).attr('stroke-linejoin', 'round').style('cursor', canShowRegionalTooltip ? 'pointer' : 'default').on('mouseenter', () => highlightRegional(regional)).on('mousemove', (event) => { if (activeRegional || !regionalTooltipsEnabled || !canShowRegionalTooltip) { hideTip(); return }; showTip(event, regional, colorByStatus ? demandDescriptionForMap(demand) : '', regionalUnits(regional), '', false, regionalLocationStatusCounts[regional]) }).on('mouseleave', function (event) {
        regionalTooltipsEnabled = true
        clearRegionalHighlight(regional, event.relatedTarget)
      }).on('click', (event) => { event.stopPropagation(); if (!canShowRegionalTooltip) return; if (activeRegional === regional && !activeMunicipality) resetZoom(); else zoomToRegional(regional, color, !capitalRegionals.includes(regional)) })
      const center = path.centroid(feature as d3.ExtendedFeature); const parts = regional.split('/')
      const externalLabel = EXTERNAL_REGIONAL_LABELS[regional]
      if (externalLabel) {
        const labelPosition = regionalLabelPlacements[regional]
        if (!labelPosition) return
        const { x: labelX, y: labelY } = labelPosition
        const capitalCenter = stateCapitalCenters.find((item) => item.regional === regional)
        if (capitalCenter) {
          labelLayer.append('line').attr('class', 'ared-reg-label-guide').attr('x1', capitalCenter.x).attr('y1', capitalCenter.y).attr('x2', labelX - 4).attr('y2', labelY).attr('stroke', theme.regionalStroke).attr('stroke-width', 1.1).attr('stroke-dasharray', '3 3')
          labelLayer.append('circle').attr('class', 'ared-reg-label-anchor').attr('cx', capitalCenter.x).attr('cy', capitalCenter.y).attr('r', 2.6).attr('fill', theme.regionalPalette[regional] ?? theme.municipalSelectedStroke).attr('stroke', theme.markerStroke).attr('stroke-width', 1.1)
        }
        labelPosition.lines.forEach((line, index) => labelLayer.append('text').attr('class', 'ared-reg-label ared-reg-label-external').attr('x', labelX).attr('y', labelY + (index - (labelPosition.lines.length - 1) / 2) * 11).attr('text-anchor', 'start').style('fill', theme.municipalSelectedStroke).style('stroke', rgba(theme.markerStroke, 0.94)).text(line))
      } else {
        parts.forEach((part, index) => labelLayer.append('text').attr('class', 'ared-reg-label').attr('x', center[0]).attr('y', center[1] + (index - (parts.length - 1) / 2) * 11).style('fill', isHighlighted ? (labelIsLight ? theme.markerStroke : theme.municipalSelectedStroke) : theme.municipalNeutralStroke).style('stroke', isHighlighted ? (labelIsLight ? rgba(theme.municipalSelectedStroke, 0.58) : rgba(theme.markerStroke, 0.9)) : rgba(theme.stateFill, 0.9)).text(part.trim()))
      }
    })
    if (showMunicipalityOutlines) selectedMunicipalityLayer.selectAll<SVGPathElement, { regional: string; feature: Feature }>('.ared-selected-mun-outline').data(selectedMunicipalityFeatures).join('path').attr('class', 'ared-selected-mun-outline').attr('d', (item) => path(item.feature as d3.GeoPermissibleObjects) ?? '').attr('fill', 'none').attr('stroke', (item) => theme.regionalPalette[item.regional] ?? theme.municipalSelectedStroke).attr('stroke-width', 2.8).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke')
    svg.on('click', () => { if (activeRegional) resetZoom() })
    if (normalize(focusedMunicipality) === 'sao paulo') focusCapital.current()
    else if (focusedRegional) focusRegional.current(focusedRegional)
    onReady()
    return () => { resetMap.current = null; focusRegional.current = null; focusCapital.current = null; focusMunicipality.current = null; container.replaceChildren() }
  }, [containerSize, resetKey, mapStatusKey, colorByStatus, selectedRegionalKey, selectedMunicipalityKey, onReady])

  return <div className="ared-map" ref={containerRef} />
}
