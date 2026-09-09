import { useMemo } from 'react'

import { polygonSvgPoints } from './fieldGeometry'
import type { GeoJsonPolygon } from './types'

export function latLonToTile(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom
  const x = Math.floor(((longitude + 180) / 360) * n)
  const latRad = (latitude * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

export function fieldTileUrls(latitude: number, longitude: number, zoom: number, radius = 1) {
  const center = latLonToTile(latitude, longitude, zoom)
  const urls: string[] = []
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      urls.push(`https://tile.openstreetmap.org/${zoom}/${center.x + dx}/${center.y + dy}.png`)
    }
  }
  return urls
}

type MapPolygon = {
  geometry: GeoJsonPolygon
  label?: string
}

type OfflineMapProps = {
  latitude: number
  longitude: number
  compact?: boolean
  zoom?: number
  polygon?: GeoJsonPolygon | null
  polygons?: MapPolygon[]
}

export function OfflineMap({ latitude, longitude, compact = false, zoom: zoomOverride, polygon, polygons = [] }: OfflineMapProps) {
  const zoom = zoomOverride ?? (compact ? 12 : 13)
  const radius = 1
  const gridSize = (radius * 2 + 1) * 256
  const tiles = useMemo(() => fieldTileUrls(latitude, longitude, zoom, radius).map((url) => ({ key: url, url })), [latitude, longitude, zoom])
  const allPolygons = useMemo(() => {
    const items = polygon ? [{ geometry: polygon }] : []
    return [...items, ...polygons]
  }, [polygon, polygons])

  return (
    <div className={`map-preview offline-map ${compact ? 'compact' : ''}`} aria-label={`Карта ${latitude}, ${longitude}`}>
      <div className="offline-map-grid">
        {tiles.map((tile) => <img key={tile.key} src={tile.url} alt="" loading="lazy" crossOrigin="anonymous" />)}
      </div>
      {allPolygons.length > 0 ? (
        <svg className="field-map-overlay" viewBox={`0 0 ${gridSize} ${gridSize}`} preserveAspectRatio="none" aria-hidden="true">
          {allPolygons.map((item, index) => (
            <g key={`${item.label ?? 'field'}-${index}`}>
              <polygon
                className="field-map-polygon"
                points={polygonSvgPoints(item.geometry, latitude, longitude, zoom, radius)}
              />
            </g>
          ))}
        </svg>
      ) : (
        <span className="offline-map-marker" aria-hidden="true">●</span>
      )}
      {!navigator.onLine && <span className="offline-map-badge">офлайн</span>}
      <small className="map-attribution">© OpenStreetMap</small>
    </div>
  )
}
