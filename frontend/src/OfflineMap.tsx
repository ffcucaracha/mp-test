import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'

import type { GeoJsonPolygon } from './types'

const TILE_SIZE = 256
const MIN_ZOOM = 5
const MAX_ZOOM = 18

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

type View = { latitude: number; longitude: number; zoom: number }
type Size = { width: number; height: number }

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude))
}

function worldPixel(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const lat = clampLatitude(latitude)
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function pixelToLatLon(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const wrappedX = ((x % scale) + scale) % scale
  const clampedY = Math.max(0, Math.min(scale, y))
  const longitude = (wrappedX / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * clampedY) / scale
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n))
  return { latitude, longitude }
}

function fitPolygons(polygons: MapPolygon[], size: Size, fallback: View): View {
  const points = polygons.flatMap((item) => item.geometry.coordinates[0] ?? [])
  if (points.length === 0 || size.width <= 0 || size.height <= 0) return fallback
  const padding = 48

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map(([longitude, latitude]) => worldPixel(latitude, longitude, zoom))
    const xs = projected.map((point) => point.x)
    const ys = projected.map((point) => point.y)
    const minX = Math.min(...xs); const maxX = Math.max(...xs)
    const minY = Math.min(...ys); const maxY = Math.max(...ys)
    if (maxX - minX <= Math.max(80, size.width - padding * 2) && maxY - minY <= Math.max(80, size.height - padding * 2)) {
      const center = pixelToLatLon((minX + maxX) / 2, (minY + maxY) / 2, zoom)
      return { ...center, zoom }
    }
  }
  return fallback
}

export function OfflineMap({ latitude, longitude, compact = false, zoom: zoomOverride, polygon, polygons = [] }: OfflineMapProps) {
  const initialZoom = zoomOverride ?? (compact ? 12 : 13)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; worldX: number; worldY: number } | null>(null)
  const [view, setView] = useState<View>({ latitude, longitude, zoom: initialZoom })
  const [size, setSize] = useState<Size>({ width: 640, height: compact ? 220 : 300 })
  const [dragging, setDragging] = useState(false)

  const allPolygons = useMemo<MapPolygon[]>(() => {
    const items: MapPolygon[] = polygon ? [{ geometry: polygon }] : []
    return [...items, ...polygons]
  }, [polygon, polygons])
  const polygonKey = useMemo(() => JSON.stringify(allPolygons.map((item) => item.geometry.coordinates)), [allPolygons])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const fallback = { latitude, longitude, zoom: initialZoom }
    setView(allPolygons.length > 0 ? fitPolygons(allPolygons, size, fallback) : fallback)
  }, [latitude, longitude, initialZoom, polygonKey, size.width, size.height])

  const centerWorld = worldPixel(view.latitude, view.longitude, view.zoom)
  const topLeftX = centerWorld.x - size.width / 2
  const topLeftY = centerWorld.y - size.height / 2

  const tiles = useMemo(() => {
    const n = 2 ** view.zoom
    const startX = Math.floor(topLeftX / TILE_SIZE) - 1
    const endX = Math.floor((topLeftX + size.width) / TILE_SIZE) + 1
    const startY = Math.max(0, Math.floor(topLeftY / TILE_SIZE) - 1)
    const endY = Math.min(n - 1, Math.floor((topLeftY + size.height) / TILE_SIZE) + 1)
    const items: Array<{ key: string; url: string; left: number; top: number }> = []
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      for (let rawX = startX; rawX <= endX; rawX += 1) {
        const tileX = ((rawX % n) + n) % n
        items.push({
          key: `${view.zoom}-${rawX}-${tileY}`,
          url: `https://tile.openstreetmap.org/${view.zoom}/${tileX}/${tileY}.png`,
          left: rawX * TILE_SIZE - topLeftX,
          top: tileY * TILE_SIZE - topLeftY,
        })
      }
    }
    return items
  }, [size.height, size.width, topLeftX, topLeftY, view.zoom])

  const polygonPoints = (geometry: GeoJsonPolygon) => (geometry.coordinates[0] ?? []).map(([lon, lat]) => {
    const projected = worldPixel(lat, lon, view.zoom)
    return `${projected.x - topLeftX},${projected.y - topLeftY}`
  }).join(' ')

  function zoomBy(delta: number) {
    setView((current) => ({ ...current, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom + delta)) }))
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const world = worldPixel(view.latitude, view.longitude, view.zoom)
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, worldX: world.x, worldY: world.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = pixelToLatLon(drag.worldX - (event.clientX - drag.clientX), drag.worldY - (event.clientY - drag.clientY), view.zoom)
    setView((current) => ({ ...current, ...next }))
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
  }

  function wheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1 : -1)
  }

  return (
    <div
      ref={rootRef}
      className={`map-preview offline-map interactive-map ${compact ? 'compact' : ''} ${dragging ? 'dragging' : ''}`}
      aria-label={`Карта ${latitude}, ${longitude}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onWheel={wheel}
      onDoubleClick={() => zoomBy(1)}
    >
      {tiles.map((tile) => <img className="offline-map-tile" key={tile.key} src={tile.url} alt="" draggable={false} loading="lazy" crossOrigin="anonymous" style={{ left: tile.left, top: tile.top }} />)}

      {allPolygons.length > 0 ? (
        <svg className="field-map-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          {allPolygons.map((item, index) => <polygon className="field-map-polygon" key={`${item.label ?? 'field'}-${index}`} points={polygonPoints(item.geometry)} />)}
        </svg>
      ) : <span className="offline-map-marker" aria-hidden="true">●</span>}

      <div className="map-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="map-control-button" aria-label="Приблизить карту" onClick={() => zoomBy(1)} disabled={view.zoom >= MAX_ZOOM}>+</button>
        <button type="button" className="map-control-button" aria-label="Отдалить карту" onClick={() => zoomBy(-1)} disabled={view.zoom <= MIN_ZOOM}>−</button>
      </div>
      {!navigator.onLine && <span className="offline-map-badge">офлайн</span>}
      <small className="map-attribution">© OpenStreetMap</small>
    </div>
  )
}
