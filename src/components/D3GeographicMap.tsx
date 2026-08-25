import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { MUN_BY_REGIONAL, REGIONAIS, SAO_PAULO_FALLBACK_LOCATIONS, SAO_PAULO_UNIT_LOCATIONS, SP_BORDER, type MapFeatureCollection } from '../data/aredMapData'
import type { EtecPoint } from '../data/mockData'

type MapProps = { etecs: EtecPoint[]; selected: string; visible: string[]; resetKey: number; onSelect: (name: string) => void; onGeographicSelect: (label: string, etecs: string[]) => void; onGeographicClear: () => void }
type Feature = MapFeatureCollection['features'][number]
type UnitPoint = { etec: EtecPoint; x: number; y: number; originX: number; originY: number }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const rgba = (hex: string, alpha: number) => { const color = Number.parseInt(hex.slice(1), 16); return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})` }

function unitsForMunicipality(etecs: EtecPoint[], municipality: string) {
  return etecs.filter((etec) => normalize(etec.municipality) === normalize(municipality))
}

function radialize(points: UnitPoint[], anchor: [number, number]) {
  if (points.length < 2) return points
  const radius = Math.min(18, 8 + points.length * 1.8)
  return points.map((point, index) => ({ ...point, x: anchor[0] + Math.cos(-Math.PI / 2 + Math.PI * 2 * index / points.length) * radius, y: anchor[1] + Math.sin(-Math.PI / 2 + Math.PI * 2 * index / points.length) * radius }))
}

export default function D3GeographicMap({ etecs, selected, visible, resetKey, onSelect, onGeographicSelect, onGeographicClear }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onSelect, onGeographicSelect, onGeographicClear })
  const resetMap = useRef<null | (() => void)>(null)
  const markerState = useRef({ selected, visible })
  const etecsRef = useRef(etecs)

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

  useEffect(() => {
    // Filter changes rebuild the map; geographic drill-down keeps its current view.
    const activeEtecs = etecsRef.current.filter((etec) => markerState.current.visible.includes(etec.name))
    const container = containerRef.current
    if (!container) return undefined
    const width = Math.max(container.clientWidth, 320)
    const height = Math.round(width * 0.65)
    const projection = d3.geoMercator().fitExtent([[50, 20], [width - 50, height - 20]], REGIONAIS as d3.ExtendedFeatureCollection)
    const path = d3.geoPath(projection)
    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', 'Mapa geográfico das Etecs no Estado de São Paulo')
    const tooltip = d3.select(container).append('div').attr('class', 'ared-map-tooltip')
    const back = d3.select(container).append('button').attr('class', 'ared-map-back').attr('type', 'button').text('Voltar ao estado').style('display', 'none')
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#ede8de')
    const spBorder = svg.append('path').datum(SP_BORDER as d3.ExtendedFeature).attr('class', 'ared-sp-border').attr('d', path).attr('fill', '#e4ddd2').attr('stroke', '#c8bfb0').attr('stroke-width', 1.5)
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

    const renderUnits = (regional: string, data: MapFeatureCollection, municipalPath: d3.GeoPath, municipalProjection: d3.GeoProjection, color: string, focus: (municipality: string) => void) => {
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
          if (Math.hypot(point.x - point.originX, point.y - point.originY) > 5) municipalityLayer.append('line').attr('class', 'ared-unit-leader').attr('x1', point.originX).attr('y1', point.originY).attr('x2', point.x).attr('y2', point.y).attr('stroke', color).attr('stroke-opacity', 0.32)
          const marker = municipalityLayer.append('g').datum(point).attr('class', 'ared-unit-marker').attr('transform', `translate(${point.x},${point.y})`).attr('tabindex', markerState.current.visible.includes(point.etec.name) ? 0 : -1).attr('role', 'button').attr('aria-label', `Selecionar ${point.etec.name}`).attr('opacity', 0)
          marker.append('circle').attr('class', 'ared-unit-dot').attr('r', point.etec.name === markerState.current.selected ? 6.5 : 5.2).attr('fill', color)
          marker.append('text').attr('class', 'ared-unit-label').attr('y', 0.4).text(index + 1)
          marker.append('title').text(`${point.etec.name}, ${municipality}`)
          marker.on('mousemove', (event) => showTip(event, point.etec.label, municipality, [point.etec], 'Clique para filtrar a unidade', true)).on('mouseleave', hideTip).on('click', (event) => {
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
        municipalityLayer.selectAll('.ared-mun-path').classed('selected', false).transition().duration(200).attr('opacity', 1)
        municipalityLayer.selectAll<SVGGElement, UnitPoint>('.ared-unit-marker').transition().duration(200).attr('opacity', (item) => markerState.current.visible.includes(item.etec.name) ? 1 : 0.18)
        callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
      }
      municipalityLayer.selectAll('*').remove()
      municipalityLayer.attr('transform', null).attr('opacity', 0)
      const paths = municipalityLayer.selectAll<SVGPathElement, Feature>('path').data(data.features).join('path').attr('class', 'ared-mun-path').attr('d', (item) => municipalPath(item as d3.GeoPermissibleObjects) ?? '').attr('fill', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? rgba(color, 0.48) : 'rgba(180,172,158,0.18)').attr('stroke', (item) => unitsForMunicipality(activeEtecs, String(item.properties.name ?? '')).length ? '#fff' : 'rgba(255,255,255,0.45)').attr('opacity', 0)
      paths.on('mousemove', (event, item) => { const municipality = String(item.properties.name ?? ''); const units = unitsForMunicipality(activeEtecs, municipality); showTip(event, municipality, regional, units, units.length ? 'Clique para filtrar o município' : 'Sem Etecs neste município') }).on('mouseleave', hideTip).on('click', (event, item) => {
        event.stopPropagation()
        const municipality = String(item.properties.name ?? ''); const units = unitsForMunicipality(activeEtecs, municipality)
        if (!units.length) return
        if (activeMunicipality === municipality) { clearMunicipality(); return }
        activeMunicipality = municipality
        focus(municipality)
        paths.classed('selected', (entry) => String(entry.properties.name) === municipality).transition().duration(200).attr('opacity', (entry) => String(entry.properties.name) === municipality ? 1 : 0.22)
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
      renderUnits(regional, data, municipalPath, municipalProjection, color, focus)
      callbacks.current.onGeographicSelect(regional, regionalUnits(regional).map((unit) => unit.name))
    }

    REGIONAIS.features.forEach((feature) => {
      const regional = String(feature.properties.regional ?? ''); const color = String(feature.properties.cor ?? '#c4880a'); const intensity = Number(feature.properties.alerta ?? 0) / 12
      regionalLayer.append('path').datum(feature).attr('class', 'ared-reg-path').attr('data-regional', regional).attr('d', path(feature as d3.GeoPermissibleObjects) ?? '').attr('fill', rgba(color, 0.2 + intensity * 0.6)).attr('stroke', color).attr('stroke-width', 2).attr('stroke-linejoin', 'round').on('mousemove', (event) => showTip(event, regional, 'Núcleo regional', regionalUnits(regional), 'Clique para aproximar')).on('mouseleave', hideTip).on('click', (event) => { event.stopPropagation(); if (activeRegional === regional && !activeMunicipality) resetZoom(); else zoomToRegional(regional, color) })
      const center = path.centroid(feature as d3.ExtendedFeature); const parts = regional.split('/')
      parts.forEach((part, index) => labelLayer.append('text').attr('class', 'ared-reg-label').attr('x', center[0]).attr('y', center[1] + (parts.length === 2 ? index * 14 - 7 : 0)).text(part.trim()))
    })
    svg.on('click', () => { if (activeRegional) resetZoom() })
    return () => { resetMap.current = null; container.replaceChildren() }
  }, [resetKey])

  return <div className="ared-map" ref={containerRef} />
}
