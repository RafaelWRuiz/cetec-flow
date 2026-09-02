import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { MUN_BY_REGIONAL, REGIONAIS, SAO_PAULO_FALLBACK_LOCATIONS, SAO_PAULO_UNIT_LOCATIONS, SP_BORDER, type MapFeatureCollection } from '../data/aredMapData'
import type { EtecPoint } from '../data/mockData'

type RegionalStatus = 'comfortable' | 'attention' | 'low' | 'unavailable'
type OfferLocationStatusCounts = { total: number; comfortable: number; attention: number; low: number; label?: 'Locais de oferta' | 'Turmas' }
type MapProps = { etecs: EtecPoint[]; selected: string; visible: string[]; selectedRegionals: string[]; selectedMunicipalities: string[]; focusedRegional: string; focusedMunicipality: string; resetKey: number; regionalStatuses: Record<string, RegionalStatus>; regionalLowDemandRates: Record<string, number>; municipalityLowDemandRates: Record<string, number>; regionalLocationStatusCounts: Record<string, OfferLocationStatusCounts>; municipalityLocationStatusCounts: Record<string, OfferLocationStatusCounts>; colorByStatus: boolean; mapStatusKey: string; onSelect: (name: string) => void; onGeographicSelect: (label: string, etecs: string[]) => void; onRegionalCitiesSelect: (regional: string) => void; onGeographicClear: () => void }
type Feature = MapFeatureCollection['features'][number]
type UnitPoint = { etec: EtecPoint; x: number; y: number; originX: number; originY: number }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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
const EXTERNAL_REGIONAL_LABELS: Record<string, { offsetX: number; offsetY: number; referenceRegional?: string; anchorMunicipality?: string; lines: string[] }> = {
  'Grande São Paulo Noroeste': { offsetX: 62, offsetY: 25, referenceRegional: 'Grande São Paulo Leste', lines: ['Grande São Paulo Noroeste'] },
  'Grande São Paulo Leste': { offsetX: 66, offsetY: 97, lines: ['Grande São Paulo Leste'] },
  'Grande São Paulo Sul/Baixada Santista': { offsetX: 26, offsetY: 133, referenceRegional: 'Grande São Paulo Leste', lines: ['Grande São Paulo Sul/Baixada Santista'] },
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
    statusPalette: { comfortable: cpsSuccess, attention: cpsAttention, low: cpsError },
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

export default function D3GeographicMap({ etecs, selected, visible, selectedRegionals, selectedMunicipalities, focusedRegional, focusedMunicipality, resetKey, regionalStatuses, regionalLowDemandRates, municipalityLowDemandRates, regionalLocationStatusCounts, municipalityLocationStatusCounts, colorByStatus, mapStatusKey, onSelect, onGeographicSelect, onRegionalCitiesSelect, onGeographicClear }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onGeographicSelect, onRegionalCitiesSelect, onGeographicClear })
  const resetMap = useRef<null | (() => void)>(null)
  const focusRegional = useRef<null | ((regional: string) => void)>(null)
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
    etecsRef.current = etecs
  }, [etecs])

  useEffect(() => { resetMap.current?.() }, [resetKey])

  useEffect(() => { focusRegional.current?.(focusedRegional) }, [focusedRegional])

  useEffect(() => { focusMunicipality.current?.(focusedMunicipality) }, [focusedMunicipality])

  useEffect(() => {
    // Filter changes rebuild the map; geographic drill-down keeps its current view.
    const activeEtecs = etecsRef.current.filter((etec) => markerState.current.visible.includes(etec.name))
    const container = containerRef.current
    if (!container) return undefined
    const width = Math.max(containerSize.width || container.clientWidth, 320)
    const height = Math.max(containerSize.height || container.clientHeight, 220)
    const theme = buildMapTheme(container)
    const heatColorFor = (rate: number | undefined) => rate === undefined ? theme.municipalNeutralStroke : mixColor(theme.stateFill, theme.statusPalette.low, Math.max(0.12, Math.min(1, rate)))
    // Keep a compact label zone so the state itself uses the available map height.
    const stateBottomPadding = Math.max(20, Math.round(height * 0.07))
    const projection = d3.geoMercator().fitExtent([[20, 8], [width - 20, height - stateBottomPadding]], REGIONAIS as d3.ExtendedFeatureCollection)
    const path = d3.geoPath(projection)
    const selectedMunicipalityFeatures = selectedMunicipalities.flatMap((municipality) => Object.entries(MUN_BY_REGIONAL).flatMap(([regional, data]) => {
      const feature = data.features.find((item) => normalize(String(item.properties.name ?? '')) === normalize(municipality))
      return feature ? [{ regional, feature }] : []
    }))
    const selectedMunicipalityRegions = new Set(selectedMunicipalityFeatures.map((item) => item.regional))
    const showMunicipalityOutlines = selectedMunicipalityFeatures.length > 1 && selectedMunicipalityRegions.size > 1
    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', 'Mapa geográfico das Etecs no Estado de São Paulo')
    const tooltip = d3.select(container).append('div').attr('class', 'ared-map-tooltip')
    const back = d3.select(container).append('button').attr('class', 'ared-map-back').attr('type', 'button').text('Voltar ao estado').style('display', 'none')
    const saoPauloUnitsPanel = d3.select(container).append('aside').attr('class', 'sao-paulo-units-panel').attr('aria-label', 'Unidades de São Paulo').style('display', 'none')
    const hideSaoPauloUnits = () => saoPauloUnitsPanel.style('display', 'none').selectAll('*').remove()
    const showSaoPauloUnits = (units: EtecPoint[]) => {
      if (!units.length) { hideSaoPauloUnits(); return }
      saoPauloUnitsPanel.style('display', 'grid').selectAll('*').remove()
      saoPauloUnitsPanel.append('strong').text('Unidades de São Paulo')
      const list = saoPauloUnitsPanel.append('div').attr('class', 'sao-paulo-units-list')
      list.selectAll<HTMLButtonElement, EtecPoint>('button').data(units).join('button').attr('type', 'button').attr('title', (unit) => unit.label.replace(/\s*\([^)]*\)\s*$/, '')).html((unit, index) => `<b>${index + 1}</b><span>${unit.label.replace(/\s*\([^)]*\)\s*$/, '')}</span>`).on('click', (_event, unit) => callbacks.current.onSelect(unit.name))
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
    const regionalUnits = (regional: string) => (MUN_BY_REGIONAL[regional]?.features ?? []).flatMap((feature) => unitsForMunicipality(activeEtecs, String(feature.properties.name ?? '')))
    const hideTip = () => tooltip.style('display', 'none')
    const showTip = (event: MouseEvent, title: string, subtitle: string, units: EtecPoint[], action: string, isLocalOffer = false, locationStatuses?: OfferLocationStatusCounts) => {
      const percentage = (value: number) => locationStatuses?.total ? `${Math.round(value / locationStatuses.total * 100)}%` : '0%'
      const statusDetails = locationStatuses ? `<div class="ared-tip-statuses"><div><span class="status-comfortable">Confortável</span><b>${locationStatuses.comfortable} (${percentage(locationStatuses.comfortable)})</b></div><div><span class="status-attention">Atenção</span><b>${locationStatuses.attention} (${percentage(locationStatuses.attention)})</b></div><div><span class="status-low">Baixa demanda</span><b>${locationStatuses.low} (${percentage(locationStatuses.low)})</b></div></div>` : ''
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

    const renderUnits = (data: MapFeatureCollection, municipalPath: d3.GeoPath, municipalProjection: d3.GeoProjection, focus: (municipality: string) => void) => {
      data.features.forEach((feature) => {
        const municipality = String(feature.properties.name ?? '')
        const isSaoPaulo = normalize(municipality) === 'sao paulo'
        const units = unitsForMunicipality(activeEtecs, municipality)
        if (!units.length) return
        const centroid = municipalPath.centroid(feature as d3.ExtendedFeature) as [number, number]
        const rawPoints = units.map((etec, index) => {
          const known = normalize(municipality) === 'sao paulo' ? SAO_PAULO_UNIT_LOCATIONS.find((item) => normalize(etec.name).includes(item.match)) : undefined
          const fallback = SAO_PAULO_FALLBACK_LOCATIONS[index % SAO_PAULO_FALLBACK_LOCATIONS.length]
          const capitalPosition = normalize(municipality) === 'sao paulo' ? municipalProjection(known ? [known.lon, known.lat] : fallback) : null
          const x = capitalPosition?.[0] ?? centroid[0]
          const y = capitalPosition?.[1] ?? centroid[1]
          return { etec, x, y, originX: x, originY: y }
        })
        const points = isSaoPaulo ? separateOverlappingPoints(rawPoints) : radialize(rawPoints, centroid)
        points.forEach((point, index) => {
          const marker = municipalityLayer.append('g').datum(point).attr('class', `ared-unit-marker${isSaoPaulo ? ' is-sao-paulo-unit' : ''}`).attr('transform', `translate(${point.x},${point.y})`).attr('tabindex', markerState.current.visible.includes(point.etec.name) ? 0 : -1).attr('role', 'button').attr('aria-label', `Selecionar ${point.etec.name}`).attr('opacity', 0)
          marker.append('circle').attr('class', 'ared-unit-dot').attr('r', isSaoPaulo ? (point.etec.name === markerState.current.selected ? 4.2 : 2.5) : (point.etec.name === markerState.current.selected ? 6.5 : 5.2)).attr('fill', theme.markerFill).attr('stroke', theme.markerStroke)
          if (!isSaoPaulo) marker.append('text').attr('class', 'ared-unit-label').attr('y', 0.4).text(index + 1)
          marker.append('title').text(`${point.etec.name}, ${municipality}`)
          marker.on('mouseenter', function () {
            d3.select(this).select<SVGCircleElement>('.ared-unit-dot').attr('fill', theme.markerHoverFill)
          }).on('mousemove', (event) => showTip(event, point.etec.label, municipality, [point.etec], 'Clique para filtrar a unidade', true)).on('mouseleave', function () {
            d3.select(this).select<SVGCircleElement>('.ared-unit-dot').attr('fill', theme.markerFill)
            hideTip()
          }).on('click', (event) => {
            event.stopPropagation()
            if (!markerState.current.visible.includes(point.etec.name)) return
            activeMunicipality = municipality
            focus(municipality)
            municipalityLayer.selectAll<SVGPathElement, Feature>('.ared-mun-path').classed('selected', (item) => String(item.properties.name) === municipality).transition().duration(200).attr('opacity', (item) => String(item.properties.name) === municipality ? 1 : 0.18)
            municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => item.etec.name === point.etec.name ? 1 : 0.18)
            callbacks.current.onSelect(point.etec.name)
          }).on('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') marker.dispatch('click') })
          marker.transition().duration(420).delay(250 + index * 45).attr('opacity', markerState.current.visible.includes(point.etec.name) ? 1 : 0.18)
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
      regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(400).attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.12)
      regionalLayer.transition().duration(500).attr('opacity', 0)
      selectedMunicipalityLayer.transition().duration(300).attr('opacity', 0)
      labelLayer.transition().duration(300).attr('opacity', 0)
      spBorder.transition().duration(400).attr('opacity', 0)
      const data = MUN_BY_REGIONAL[regional]
      if (!data) return
      const canRestoreMunicipality = Boolean(focusedMunicipality) && data.features.some((item) => String(item.properties.name ?? '') === focusedMunicipality)
      const municipalProjection = d3.geoMercator().fitExtent([[30, 30], [width - 30, height - 30]], data as d3.ExtendedFeatureCollection)
      const municipalPath = d3.geoPath(municipalProjection)
      const focus = (municipality: string) => {
        const feature = data.features.find((item) => String(item.properties.name) === municipality)
        if (!feature) return
        if (normalize(municipality) === 'sao paulo') showSaoPauloUnits(unitsForMunicipality(activeEtecs, municipality))
        else hideSaoPauloUnits()
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
          .attr('fill', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? municipalityBaseFill(String(item.properties.name ?? '')) : municipalityNeutralFill)
          .attr('stroke', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? rgba(municipalityColorFor(String(item.properties.name ?? '')), 0.45) : theme.municipalNeutralStroke)
          .transition().duration(200).attr('opacity', 1)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => markerState.current.visible.includes(item.etec.name) ? 1 : 0.18)
        if (notify) callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
      }
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      const municipalityColorFor = (municipality: string) => colorByStatus ? heatColorFor(municipalityLowDemandRates[normalize(municipality)]) : color
      const isSelectedMunicipality = (municipality: string) => !selectedMunicipalities.length || selectedMunicipalities.some((item) => normalize(item) === normalize(municipality))
      const municipalityBaseFill = (municipality: string) => isSelectedMunicipality(municipality) ? rgba(municipalityColorFor(municipality), 0.56) : theme.municipalNeutralFill
      const municipalityHoverFill = (municipality: string) => isSelectedMunicipality(municipality) ? rgba(brightenColor(municipalityColorFor(municipality), 0.45), 0.78) : mixColor(theme.municipalNeutralFill, theme.stateFill, 0.32)
      const municipalityNeutralFill = colorByStatus ? mixColor(theme.municipalNeutralFill, theme.municipalNeutralStroke, 0.38) : theme.municipalNeutralFill
      const paths = municipalityLayer.selectAll<SVGPathElement, Feature>('path').data(data.features).join('path').attr('class', 'ared-mun-path').attr('d', (item) => municipalPath(item as d3.GeoPermissibleObjects) ?? '').attr('fill', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? municipalityBaseFill(String(item.properties.name ?? '')) : municipalityNeutralFill).attr('stroke', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length && isSelectedMunicipality(String(item.properties.name ?? '')) ? rgba(municipalityColorFor(String(item.properties.name ?? '')), 0.45) : theme.municipalNeutralStroke).style('cursor', (item) => isSelectedMunicipality(String(item.properties.name ?? '')) ? 'pointer' : 'default').attr('opacity', 0)
      paths.on('mouseenter', function (_event, item) {
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality === municipality || !isSelectedMunicipality(municipality)) return
        const hasUnits = unitsForMunicipality(activeEtecs, municipality).length > 0
        d3.select(this).attr('fill', hasUnits ? municipalityHoverFill(municipality) : municipalityNeutralFill).attr('stroke', hasUnits ? municipalityColorFor(municipality) : theme.municipalNeutralStroke)
      }).on('mousemove', (event, item) => { const municipality = String(item.properties.name ?? ''); if (!municipalityTooltipsEnabled || !isSelectedMunicipality(municipality)) { hideTip(); return }; const units = unitsForMunicipality(activeEtecs, municipality); showTip(event, municipality, '', units, '', false, municipalityLocationStatusCounts[normalize(municipality)]) }).on('mouseleave', function (_event, item) {
        municipalityTooltipsEnabled = true
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality !== municipality) {
          const hasUnits = unitsForMunicipality(activeEtecs, municipality).length > 0
          d3.select(this).attr('fill', hasUnits ? municipalityBaseFill(municipality) : municipalityNeutralFill).attr('stroke', hasUnits ? rgba(municipalityColorFor(municipality), 0.45) : theme.municipalNeutralStroke)
        }
        hideTip()
      }).on('click', (event, item) => {
        event.stopPropagation()
        const municipality = String(item.properties.name ?? ''); const units = unitsForMunicipality(activeEtecs, municipality)
        if (!units.length || !isSelectedMunicipality(municipality)) return
        if (activeMunicipality === municipality) { clearMunicipality(); return }
        activeMunicipality = municipality
        focus(municipality)
        paths.classed('selected', (entry) => String(entry.properties.name) === municipality)
          .attr('fill', (entry) => String(entry.properties.name) === municipality ? municipalityHoverFill(municipality) : (unitsForMunicipality(activeEtecs, String(entry.properties.name ?? '')).length ? municipalityBaseFill(String(entry.properties.name ?? '')) : municipalityNeutralFill))
          .attr('stroke', (entry) => String(entry.properties.name) === municipality ? theme.municipalSelectedStroke : (unitsForMunicipality(activeEtecs, String(entry.properties.name ?? '')).length ? rgba(municipalityColorFor(String(entry.properties.name ?? '')), 0.45) : theme.municipalNeutralStroke))
          .transition().duration(200).attr('opacity', (entry) => String(entry.properties.name) === municipality ? 1 : 0.22)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (unit) => normalize(unit.etec.municipality) === normalize(municipality) && markerState.current.visible.includes(unit.etec.name) ? 1 : 0.18)
        callbacks.current.onGeographicSelect(municipality, units.map((unit) => unit.name))
      })
      if (canRestoreMunicipality) {
        municipalityLayer.attr('opacity', 1)
        paths.attr('opacity', 1)
      } else {
        municipalityLayer.transition().duration(100).attr('opacity', 1)
        paths.transition().duration(600).delay((_, index) => index * 6).attr('opacity', 1)
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
      if (data.features.length <= 25) data.features.forEach((item) => {
        const municipality = String(item.properties.name ?? '')
        if (!unitsForMunicipality(activeEtecs, municipality).length) return
        const center = municipalPath.centroid(item as d3.ExtendedFeature)
        const words = municipality.split(' ')
        const shouldWrap = municipality.length > 13 && words.length > 1
        const lines = shouldWrap ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [municipality]
        const [labelX, labelY] = positionMunicipalLabel(center, lines)
        const label = municipalityLayer.append('text').attr('class', 'ared-mun-label').attr('x', labelX).attr('y', labelY)
        label.selectAll('tspan').data(lines).join('tspan').attr('x', labelX).attr('dy', (_line, index) => lines.length === 1 ? '0' : index === 0 ? '-.45em' : '1.05em').text((line) => line)
        label.attr('opacity', 0).transition().duration(600).delay(300).attr('opacity', 1)
      })
      renderUnits(data, municipalPath, municipalProjection, focus)
      if (canRestoreMunicipality) focusMunicipality.current?.(focusedMunicipality)
      // A direct regional click applies the same context through its city filter.
      else if (selectCities) callbacks.current.onRegionalCitiesSelect(regional)
      // A city filter can open its regional without replacing that explicit filter.
      else if (!selectedMunicipalities.length) callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
    }

    focusRegional.current = (regional) => {
      if (!regional) { resetZoom(); return }
      const feature = REGIONAIS.features.find((item) => String(item.properties.regional ?? '') === regional)
      if (!feature) return
      zoomToRegional(regional, theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D'))
    }

    REGIONAIS.features.forEach((feature) => {
      const regional = String(feature.properties.regional ?? '')
      const status = regionalStatuses[regional] ?? 'unavailable'
      const lowDemandRate = regionalLowDemandRates[regional]
      const isHighlighted = selectedRegionals.length < 2 || selectedRegionals.includes(regional)
      const canShowRegionalTooltip = !selectedRegionals.length || selectedRegionals.includes(regional)
      const color = colorByStatus ? heatColorFor(lowDemandRate) : (theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D'))
      const fill = isHighlighted ? mixColor(color, theme.stateFill, showMunicipalityOutlines ? 0.8 : 0.42) : theme.municipalNeutralFill
      const hoverFill = isHighlighted ? rgba(brightenColor(color, 0.38), 0.98) : mixColor(theme.municipalNeutralFill, theme.stateFill, 0.32)
      const labelIsLight = hasDarkBackground(color)
      const stroke = isHighlighted ? theme.regionalStroke : theme.municipalNeutralStroke
      regionalLayer.append('path').datum(feature).attr('class', 'ared-reg-path').attr('data-regional', regional).attr('d', path(feature as d3.GeoPermissibleObjects) ?? '').attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 1.1).attr('stroke-linejoin', 'round').style('cursor', canShowRegionalTooltip ? 'pointer' : 'default').on('mouseenter', function () {
        if (activeRegional || !canShowRegionalTooltip) return
        regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(180).attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.62)
        d3.select(this).attr('fill', hoverFill).attr('stroke', theme.regionalHoverStroke).attr('stroke-width', 1.8)
      }).on('mousemove', (event) => { if (activeRegional || !regionalTooltipsEnabled || !canShowRegionalTooltip) { hideTip(); return }; showTip(event, regional, colorByStatus ? (lowDemandRate === undefined ? 'Sem vagas no recorte' : `Baixa demanda: ${Math.round(lowDemandRate * 100)}% das ofertas`) : '', regionalUnits(regional), '', false, regionalLocationStatusCounts[regional]) }).on('mouseleave', function () {
        regionalTooltipsEnabled = true
        if (!activeRegional) {
          regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(180).attr('opacity', 1)
          d3.select(this).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 1.1)
        }
        hideTip()
      }).on('click', (event) => { event.stopPropagation(); if (!canShowRegionalTooltip) return; if (activeRegional === regional && !activeMunicipality) resetZoom(); else zoomToRegional(regional, color, true) })
      const center = path.centroid(feature as d3.ExtendedFeature); const parts = regional.split('/')
      const externalLabel = EXTERNAL_REGIONAL_LABELS[regional]
      if (externalLabel) {
        const referenceFeature = externalLabel.referenceRegional ? REGIONAIS.features.find((item) => String(item.properties.regional) === externalLabel.referenceRegional) : feature
        const referenceCenter = referenceFeature ? path.centroid(referenceFeature as d3.ExtendedFeature) : center
        const labelX = referenceCenter[0] + externalLabel.offsetX
        const labelY = referenceCenter[1] + externalLabel.offsetY
        const anchorFeature = externalLabel.anchorMunicipality ? MUN_BY_REGIONAL[regional]?.features.find((item) => normalize(String(item.properties.name ?? '')) === normalize(externalLabel.anchorMunicipality ?? '')) : undefined
        const anchorCenter = anchorFeature ? path.centroid(anchorFeature as d3.ExtendedFeature) : center
        const guideEndX = labelX - 8
        const guideColor = rgba(theme.municipalSelectedStroke, 0.66)
        labelLayer.append('line').attr('class', 'ared-reg-label-guide').attr('x1', anchorCenter[0]).attr('y1', anchorCenter[1]).attr('x2', guideEndX).attr('y2', labelY).attr('stroke', guideColor).attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('stroke-linecap', 'round').attr('pointer-events', 'none')
        labelLayer.append('circle').attr('class', 'ared-reg-label-anchor').attr('cx', anchorCenter[0]).attr('cy', anchorCenter[1]).attr('r', 3).attr('fill', theme.municipalSelectedStroke).attr('stroke', theme.markerStroke).attr('stroke-width', 1.2).attr('pointer-events', 'none')
        externalLabel.lines.forEach((line, index) => labelLayer.append('text').attr('class', 'ared-reg-label ared-reg-label-external').attr('x', labelX).attr('y', labelY + (index - (externalLabel.lines.length - 1) / 2) * 11).attr('text-anchor', 'start').style('fill', theme.municipalSelectedStroke).style('stroke', rgba(theme.markerStroke, 0.94)).text(line))
      } else {
        parts.forEach((part, index) => labelLayer.append('text').attr('class', 'ared-reg-label').attr('x', center[0]).attr('y', center[1] + (index - (parts.length - 1) / 2) * 11).style('fill', isHighlighted ? (labelIsLight ? theme.markerStroke : theme.municipalSelectedStroke) : theme.municipalNeutralStroke).style('stroke', isHighlighted ? (labelIsLight ? rgba(theme.municipalSelectedStroke, 0.58) : rgba(theme.markerStroke, 0.9)) : rgba(theme.stateFill, 0.9)).text(part.trim()))
      }
    })
    if (showMunicipalityOutlines) selectedMunicipalityLayer.selectAll<SVGPathElement, { regional: string; feature: Feature }>('.ared-selected-mun-outline').data(selectedMunicipalityFeatures).join('path').attr('class', 'ared-selected-mun-outline').attr('d', (item) => path(item.feature as d3.GeoPermissibleObjects) ?? '').attr('fill', 'none').attr('stroke', (item) => theme.regionalPalette[item.regional] ?? theme.municipalSelectedStroke).attr('stroke-width', 2.8).attr('stroke-linejoin', 'round').attr('vector-effect', 'non-scaling-stroke')
    svg.on('click', () => { if (activeRegional) resetZoom() })
    if (focusedRegional) focusRegional.current(focusedRegional)
    return () => { resetMap.current = null; focusRegional.current = null; focusMunicipality.current = null; container.replaceChildren() }
  }, [containerSize, resetKey, mapStatusKey, colorByStatus, selectedRegionalKey, selectedMunicipalityKey])

  return <div className="ared-map" ref={containerRef} />
}
