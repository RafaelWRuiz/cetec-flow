import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { MUN_BY_REGIONAL, REGIONAIS, SAO_PAULO_FALLBACK_LOCATIONS, SAO_PAULO_UNIT_LOCATIONS, SP_BORDER, type MapFeatureCollection } from '../data/aredMapData'
import type { EtecPoint } from '../data/mockData'

type MapProps = { etecs: EtecPoint[]; selected: string; visible: string[]; focusedRegional: string; resetKey: number; onSelect: (name: string) => void; onGeographicSelect: (label: string, etecs: string[]) => void; onGeographicClear: () => void }
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
  'Grande São Paulo Noroeste': { offsetX: 132, offsetY: 48, referenceRegional: 'Grande São Paulo Leste', lines: ['Grande São Paulo Noroeste'] },
  'Grande São Paulo Leste': { offsetX: 76, offsetY: 68, lines: ['Grande São Paulo Leste'] },
  'Grande São Paulo Sul/Baixada Santista': { offsetX: 54, offsetY: 125, referenceRegional: 'Grande São Paulo Leste', anchorMunicipality: 'Praia Grande', lines: ['Grande São Paulo Sul/Baixada Santista'] },
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
  leaderStroke: string
  regionalStroke: string
  regionalHoverStroke: string
  regionalPalette: Record<string, string>
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
    leaderStroke: mixColor(cpsBlue, cpsBlueDark, 0.55),
    regionalStroke: rgba(cpsBlueDark, 0.48),
    regionalHoverStroke: rgba(cpsCyanLight, 0.94),
    regionalPalette,
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

export default function D3GeographicMap({ etecs, selected, visible, focusedRegional, resetKey, onSelect, onGeographicSelect, onGeographicClear }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onGeographicSelect, onGeographicClear })
  const resetMap = useRef<null | (() => void)>(null)
  const focusRegional = useRef<null | ((regional: string) => void)>(null)
  const markerState = useRef({ selected, visible })
  const etecsRef = useRef(etecs)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

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
    callbacks.current = { onSelect, onGeographicSelect, onGeographicClear }
  }, [onSelect, onGeographicClear, onGeographicSelect])

  useEffect(() => {
    markerState.current = { selected, visible }
  }, [selected, visible])

  useEffect(() => {
    etecsRef.current = etecs
  }, [etecs])

  useEffect(() => { resetMap.current?.() }, [resetKey])

  useEffect(() => { focusRegional.current?.(focusedRegional) }, [focusedRegional])

  useEffect(() => {
    // Filter changes rebuild the map; geographic drill-down keeps its current view.
    const activeEtecs = etecsRef.current.filter((etec) => markerState.current.visible.includes(etec.name))
    const container = containerRef.current
    if (!container) return undefined
    const width = Math.max(containerSize.width || container.clientWidth, 320)
    const height = Math.max(containerSize.height || container.clientHeight, 220)
    const theme = buildMapTheme(container)
    // Reserve space for the external Grande Sao Paulo labels and their guide lines.
    const stateBottomPadding = Math.max(65, Math.round(height * 0.25))
    const projection = d3.geoMercator().fitExtent([[50, 20], [width - 50, height - stateBottomPadding]], REGIONAIS as d3.ExtendedFeatureCollection)
    const path = d3.geoPath(projection)
    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', 'Mapa geográfico das Etecs no Estado de São Paulo')
    const tooltip = d3.select(container).append('div').attr('class', 'ared-map-tooltip')
    const back = d3.select(container).append('button').attr('class', 'ared-map-back').attr('type', 'button').text('Voltar ao estado').style('display', 'none')
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', theme.background)
    const spBorder = svg.append('path').datum(SP_BORDER as d3.ExtendedFeature).attr('class', 'ared-sp-border').attr('d', path).attr('fill', theme.stateFill).attr('stroke', theme.stateStroke).attr('stroke-width', 1.25)
    const regionalLayer = svg.append('g')
    const municipalityLayer = svg.append('g').attr('opacity', 0)
    const labelLayer = svg.append('g')
    let activeRegional = ''
    let activeMunicipality = ''
    const regionalUnits = (regional: string) => (MUN_BY_REGIONAL[regional]?.features ?? []).flatMap((feature) => unitsForMunicipality(activeEtecs, String(feature.properties.name ?? '')))
    const hideTip = () => tooltip.style('display', 'none')
    const showTip = (event: MouseEvent, title: string, subtitle: string, units: EtecPoint[], action: string, isLocalOffer = false) => tooltip.style('display', 'block').style('left', `${event.offsetX + 14}px`).style('top', `${event.offsetY - 8}px`).html(`<div class="ared-tip-title">${title}</div><div class="ared-tip-sub">${subtitle}</div><div class="ared-tip-total"><span>${isLocalOffer ? (units.length === 1 ? 'Local de oferta' : 'Locais de oferta') : 'Etecs'}</span><b>${units.length}</b></div><div class="ared-tip-detail">${units.length ? 'Dados do snapshot disponíveis' : 'Sem dados no recorte'}</div><div class="ared-tip-action">${action}</div>`)

    const resetZoom = () => {
      activeRegional = ''
      activeMunicipality = ''
      hideTip()
      back.style('display', 'none')
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      regionalLayer.transition().duration(500).attr('opacity', 1)
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
        const units = unitsForMunicipality(activeEtecs, municipality)
        if (!units.length) return
        const centroid = municipalPath.centroid(feature as d3.ExtendedFeature) as [number, number]
        const points = radialize(units.map((etec, index) => {
          const known = normalize(municipality) === 'sao paulo' ? SAO_PAULO_UNIT_LOCATIONS.find((item) => normalize(etec.name).includes(item.match)) : undefined
          const fallback = SAO_PAULO_FALLBACK_LOCATIONS[index % SAO_PAULO_FALLBACK_LOCATIONS.length]
          const capitalPosition = normalize(municipality) === 'sao paulo' ? municipalProjection(known ? [known.lon, known.lat] : fallback) : null
          const x = capitalPosition?.[0] ?? centroid[0]
          const y = capitalPosition?.[1] ?? centroid[1]
          return { etec, x, y, originX: x, originY: y }
        }), centroid)
        points.forEach((point, index) => {
          if (Math.hypot(point.x - point.originX, point.y - point.originY) > 5) municipalityLayer.append('line').attr('class', 'ared-unit-leader').attr('x1', point.originX).attr('y1', point.originY).attr('x2', point.x).attr('y2', point.y).attr('stroke', theme.leaderStroke).attr('stroke-opacity', 0.28)
          const marker = municipalityLayer.append('g').datum(point).attr('class', 'ared-unit-marker').attr('transform', `translate(${point.x},${point.y})`).attr('tabindex', markerState.current.visible.includes(point.etec.name) ? 0 : -1).attr('role', 'button').attr('aria-label', `Selecionar ${point.etec.name}`).attr('opacity', 0)
          marker.append('circle').attr('class', 'ared-unit-dot').attr('r', point.etec.name === markerState.current.selected ? 6.5 : 5.2).attr('fill', theme.markerFill).attr('stroke', theme.markerStroke)
          marker.append('text').attr('class', 'ared-unit-label').attr('y', 0.4).text(index + 1)
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

    const zoomToRegional = (regional: string, color: string) => {
      activeRegional = regional
      activeMunicipality = ''
      hideTip()
      back.style('display', 'block')
      regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(400).attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.12)
      regionalLayer.transition().duration(500).attr('opacity', 0)
      labelLayer.transition().duration(300).attr('opacity', 0)
      spBorder.transition().duration(400).attr('opacity', 0)
      const data = MUN_BY_REGIONAL[regional]
      if (!data) return
      const municipalProjection = d3.geoMercator().fitExtent([[30, 30], [width - 30, height - 30]], data as d3.ExtendedFeatureCollection)
      const municipalPath = d3.geoPath(municipalProjection)
      const focus = (municipality: string) => {
        const feature = data.features.find((item) => String(item.properties.name) === municipality)
        if (!feature) return
        const bounds = municipalPath.bounds(feature as d3.ExtendedFeature)
        const dx = bounds[1][0] - bounds[0][0]; const dy = bounds[1][1] - bounds[0][1]
        const scale = Math.min(2.55, Math.max(1.35, Math.min((width * 0.44) / dx, (height * 0.44) / dy)))
        municipalityLayer.raise().transition().duration(620).ease(d3.easeCubicOut).attr('transform', `translate(${width / 2 - scale * ((bounds[0][0] + bounds[1][0]) / 2)},${height / 2 - scale * ((bounds[0][1] + bounds[1][1]) / 2)}) scale(${scale})`)
      }
      const clearMunicipality = () => {
        activeMunicipality = ''
        municipalityLayer.transition().duration(520).ease(d3.easeCubicOut).attr('transform', null)
        municipalityLayer.selectAll<SVGPathElement, Feature>('.ared-mun-path')
          .classed('selected', false)
          .attr('fill', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? municipalityBaseFill : theme.municipalNeutralFill)
          .attr('stroke', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? rgba(color, 0.45) : theme.municipalNeutralStroke)
          .transition().duration(200).attr('opacity', 1)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => markerState.current.visible.includes(item.etec.name) ? 1 : 0.18)
        callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
      }
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      const municipalityBaseFill = rgba(color, 0.56)
      const municipalityHoverFill = rgba(brightenColor(color, 0.45), 0.78)
      const paths = municipalityLayer.selectAll<SVGPathElement, Feature>('path').data(data.features).join('path').attr('class', 'ared-mun-path').attr('d', (item) => municipalPath(item as d3.GeoPermissibleObjects) ?? '').attr('fill', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? municipalityBaseFill : theme.municipalNeutralFill).attr('stroke', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? rgba(color, 0.45) : theme.municipalNeutralStroke).attr('opacity', 0)
      paths.on('mouseenter', function (_event, item) {
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality === municipality) return
        const hasUnits = unitsForMunicipality(activeEtecs, municipality).length > 0
        d3.select(this).attr('fill', hasUnits ? municipalityHoverFill : theme.municipalNeutralFill).attr('stroke', hasUnits ? color : theme.municipalNeutralStroke)
      }).on('mousemove', (event, item) => { const municipality = String(item.properties.name ?? ''); const units = unitsForMunicipality(activeEtecs, municipality); showTip(event, municipality, regional, units, units.length ? 'Clique para filtrar o município' : 'Sem Etecs neste município') }).on('mouseleave', function (_event, item) {
        const municipality = String(item.properties.name ?? '')
        if (activeMunicipality !== municipality) {
          const hasUnits = unitsForMunicipality(activeEtecs, municipality).length > 0
          d3.select(this).attr('fill', hasUnits ? municipalityBaseFill : theme.municipalNeutralFill).attr('stroke', hasUnits ? rgba(color, 0.45) : theme.municipalNeutralStroke)
        }
        hideTip()
      }).on('click', (event, item) => {
        event.stopPropagation()
        const municipality = String(item.properties.name ?? ''); const units = unitsForMunicipality(activeEtecs, municipality)
        if (!units.length) return
        if (activeMunicipality === municipality) { clearMunicipality(); return }
        activeMunicipality = municipality
        focus(municipality)
        paths.classed('selected', (entry) => String(entry.properties.name) === municipality)
          .attr('fill', (entry) => String(entry.properties.name) === municipality ? municipalityHoverFill : (unitsForMunicipality(activeEtecs, String(entry.properties.name ?? '')).length ? municipalityBaseFill : theme.municipalNeutralFill))
          .attr('stroke', (entry) => String(entry.properties.name) === municipality ? theme.municipalSelectedStroke : (unitsForMunicipality(activeEtecs, String(entry.properties.name ?? '')).length ? rgba(color, 0.45) : theme.municipalNeutralStroke))
          .transition().duration(200).attr('opacity', (entry) => String(entry.properties.name) === municipality ? 1 : 0.22)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (unit) => normalize(unit.etec.municipality) === normalize(municipality) && markerState.current.visible.includes(unit.etec.name) ? 1 : 0.18)
        callbacks.current.onGeographicSelect(municipality, units.map((unit) => unit.name))
      })
      municipalityLayer.transition().duration(100).attr('opacity', 1)
      paths.transition().duration(600).delay((_, index) => index * 6).attr('opacity', 1)
      if (data.features.length <= 25) data.features.forEach((item) => {
        if (!unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length) return
        const center = municipalPath.centroid(item as d3.ExtendedFeature)
        municipalityLayer.append('text').attr('class', 'ared-mun-label').attr('x', center[0]).attr('y', center[1]).text(String(item.properties.name ?? '')).attr('opacity', 0).transition().duration(600).delay(300).attr('opacity', 1)
      })
      renderUnits(data, municipalPath, municipalProjection, focus)
      callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
    }

    focusRegional.current = (regional) => {
      if (!regional) { resetZoom(); return }
      const feature = REGIONAIS.features.find((item) => String(item.properties.regional ?? '') === regional)
      if (!feature) return
      zoomToRegional(regional, theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D'))
    }

    REGIONAIS.features.forEach((feature) => {
      const regional = String(feature.properties.regional ?? '')
      const color = theme.regionalPalette[regional] ?? String(feature.properties.cor ?? '#005C6D')
      const fill = mixColor(color, theme.stateFill, 0.42)
      const hoverFill = rgba(brightenColor(color, 0.38), 0.98)
      const labelIsLight = hasDarkBackground(color)
      regionalLayer.append('path').datum(feature).attr('class', 'ared-reg-path').attr('data-regional', regional).attr('d', path(feature as d3.GeoPermissibleObjects) ?? '').attr('fill', fill).attr('stroke', theme.regionalStroke).attr('stroke-width', 1.1).attr('stroke-linejoin', 'round').on('mouseenter', function () {
        if (activeRegional) return
        regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(180).attr('opacity', (item) => String(item.properties.regional) === regional ? 1 : 0.62)
        d3.select(this).attr('fill', hoverFill).attr('stroke', theme.regionalHoverStroke).attr('stroke-width', 1.8)
      }).on('mousemove', (event) => showTip(event, regional, 'Núcleo regional', regionalUnits(regional), 'Clique para aproximar')).on('mouseleave', function () {
        if (!activeRegional) {
          regionalLayer.selectAll<SVGPathElement, Feature>('.ared-reg-path').transition().duration(180).attr('opacity', 1)
          d3.select(this).attr('fill', fill).attr('stroke', theme.regionalStroke).attr('stroke-width', 1.1)
        }
        hideTip()
      }).on('click', (event) => { event.stopPropagation(); if (activeRegional === regional && !activeMunicipality) resetZoom(); else zoomToRegional(regional, color) })
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
        parts.forEach((part, index) => labelLayer.append('text').attr('class', 'ared-reg-label').attr('x', center[0]).attr('y', center[1] + (parts.length === 2 ? index * 11 - 5.5 : 0)).style('fill', labelIsLight ? theme.markerStroke : theme.municipalSelectedStroke).style('stroke', labelIsLight ? rgba(theme.municipalSelectedStroke, 0.58) : rgba(theme.markerStroke, 0.9)).text(part.trim()))
      }
    })
    svg.on('click', () => { if (activeRegional) resetZoom() })
    if (focusedRegional) focusRegional.current(focusedRegional)
    return () => { resetMap.current = null; focusRegional.current = null; container.replaceChildren() }
  }, [containerSize, resetKey])

  return <div className="ared-map" ref={containerRef} />
}
