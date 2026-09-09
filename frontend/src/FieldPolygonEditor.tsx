import { useMemo, type MouseEvent, type TouchEvent } from 'react'

import { closePolygon, mapPixelToLonLat, polygonOpenRing, polygonSvgPoints } from './fieldGeometry'
import { fieldTileUrls } from './OfflineMap'
import type { GeoJsonPolygon } from './types'

type Props = {
  centerLatitude: number
  centerLongitude: number
  geometry: GeoJsonPolygon | null
  onChange: (geometry: GeoJsonPolygon | null) => void
  zoom?: number
}

const RADIUS = 1
const GRID_SIZE = 768

export function FieldPolygonEditor({ centerLatitude, centerLongitude, geometry, onChange, zoom = 14 }: Props) {
  const points = useMemo(() => polygonOpenRing(geometry), [geometry])
  const tiles = useMemo(
    () => fieldTileUrls(centerLatitude, centerLongitude, zoom, RADIUS),
    [centerLatitude, centerLongitude, zoom],
  )

  const addPointAt = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width * GRID_SIZE
    const y = (clientY - rect.top) / rect.height * GRID_SIZE
    const nextPoint = mapPixelToLonLat(x, y, centerLatitude, centerLongitude, zoom, RADIUS)
    const nextPoints = [...points, nextPoint]
    if (nextPoints.length < 3) {
      const temporary: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [[...nextPoints.map(([lon, lat]) => [lon, lat]), [...nextPoints[0]]]],
      }
      onChange(temporary)
      return
    }
    onChange(closePolygon(nextPoints))
  }

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    addPointAt(event.clientX, event.clientY, event.currentTarget)
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0]
    if (!touch) return
    event.preventDefault()
    addPointAt(touch.clientX, touch.clientY, event.currentTarget)
  }

  const undo = () => {
    const next = points.slice(0, -1)
    if (!next.length) {
      onChange(null)
      return
    }
    const temporary: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[...next.map(([lon, lat]) => [lon, lat]), [...next[0]]]],
    }
    onChange(temporary)
  }

  const displayGeometry = points.length >= 2
    ? ({ type: 'Polygon', coordinates: [[...points.map(([lon, lat]) => [lon, lat]), [...points[0]]]] } as GeoJsonPolygon)
    : null

  return (
    <div className="field-polygon-editor-wrap">
      <p className="field-map-help">Нажимайте по границе поля. Для контура нужно минимум 3 точки.</p>
      <div
        className="map-preview offline-map field-polygon-editor"
        onClick={onClick}
        onTouchEnd={onTouchEnd}
        role="application"
        aria-label="Карта для рисования границы поля"
      >
        <div className="offline-map-grid">
          {tiles.map((url) => <img key={url} src={url} alt="" crossOrigin="anonymous" />)}
        </div>
        <svg className="field-map-overlay field-map-overlay-edit" viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
          {displayGeometry && (
            <polygon
              className={`field-map-polygon ${points.length < 3 ? 'draft' : ''}`}
              points={polygonSvgPoints(displayGeometry, centerLatitude, centerLongitude, zoom, RADIUS)}
            />
          )}
          {points.map(([longitude, latitude], index) => {
            const geometryForPoint: GeoJsonPolygon = {
              type: 'Polygon',
              coordinates: [[[longitude, latitude], [longitude, latitude], [longitude, latitude], [longitude, latitude]]],
            }
            const [rawX, rawY] = polygonSvgPoints(geometryForPoint, centerLatitude, centerLongitude, zoom, RADIUS).split(' ')[0].split(',').map(Number)
            return <circle key={`${longitude}-${latitude}-${index}`} className="field-map-vertex" cx={rawX} cy={rawY} r="9" />
          })}
        </svg>
        <small className="map-attribution">© OpenStreetMap</small>
      </div>
      <div className="field-polygon-actions">
        <span>{points.length} точек</span>
        <button className="ghost-button" type="button" onClick={(event) => { event.stopPropagation(); undo() }} disabled={!points.length}>Отменить точку</button>
        <button className="ghost-button danger-text" type="button" onClick={(event) => { event.stopPropagation(); onChange(null) }} disabled={!points.length}>Очистить</button>
      </div>
    </div>
  )
}
