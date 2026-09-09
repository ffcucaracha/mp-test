import type { GeoJsonPolygon } from './types'

const TILE_SIZE = 256
const EARTH_RADIUS_M = 6_371_000

export type LonLat = [number, number]
export type PixelPoint = [number, number]

export function closePolygon(points: LonLat[]): GeoJsonPolygon | null {
  if (points.length < 3) return null
  const ring = points.map(([lon, lat]) => [lon, lat])
  const [firstLon, firstLat] = ring[0]
  const [lastLon, lastLat] = ring[ring.length - 1]
  if (firstLon !== lastLon || firstLat !== lastLat) ring.push([firstLon, firstLat])
  return { type: 'Polygon', coordinates: [ring] }
}

export function polygonOpenRing(geometry: GeoJsonPolygon | null | undefined): LonLat[] {
  const ring = geometry?.coordinates?.[0]
  if (!ring || ring.length < 2) return []
  const open = ring.slice(0, -1)
  return open.map((point) => [Number(point[0]), Number(point[1])])
}

export function polygonCentroid(geometry: GeoJsonPolygon): { latitude: number; longitude: number } {
  const points = polygonOpenRing(geometry)
  if (!points.length) return { latitude: 0, longitude: 0 }
  return {
    longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  }
}

export function polygonAreaHa(geometry: GeoJsonPolygon): number {
  const points = polygonOpenRing(geometry)
  if (points.length < 3) return 0
  const meanLatRad = (points.reduce((sum, point) => sum + point[1], 0) / points.length) * Math.PI / 180
  const projected = points.map(([lon, lat]) => [
    EARTH_RADIUS_M * lon * Math.PI / 180 * Math.cos(meanLatRad),
    EARTH_RADIUS_M * lat * Math.PI / 180,
  ] as PixelPoint)
  let twiceArea = 0
  projected.forEach(([x1, y1], index) => {
    const [x2, y2] = projected[(index + 1) % projected.length]
    twiceArea += x1 * y2 - x2 * y1
  })
  return Math.round(Math.abs(twiceArea) / 2 / 10_000 * 100) / 100
}

export function lonLatToWorldPixel(longitude: number, latitude: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom
  const x = ((longitude + 180) / 360) * scale
  const latRad = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale
  return [x, y]
}

export function worldPixelToLonLat(x: number, y: number, zoom: number): LonLat {
  const scale = TILE_SIZE * 2 ** zoom
  const longitude = x / scale * 360 - 180
  const n = Math.PI - 2 * Math.PI * y / scale
  const latitude = 180 / Math.PI * Math.atan(Math.sinh(n))
  return [longitude, latitude]
}

export function mapOriginWorldPixel(latitude: number, longitude: number, zoom: number, radius = 1): PixelPoint {
  const [centerX, centerY] = lonLatToWorldPixel(longitude, latitude, zoom)
  const centerTileX = Math.floor(centerX / TILE_SIZE)
  const centerTileY = Math.floor(centerY / TILE_SIZE)
  return [(centerTileX - radius) * TILE_SIZE, (centerTileY - radius) * TILE_SIZE]
}

export function polygonSvgPoints(geometry: GeoJsonPolygon, centerLatitude: number, centerLongitude: number, zoom: number, radius = 1): string {
  const [originX, originY] = mapOriginWorldPixel(centerLatitude, centerLongitude, zoom, radius)
  return polygonOpenRing(geometry).map(([longitude, latitude]) => {
    const [worldX, worldY] = lonLatToWorldPixel(longitude, latitude, zoom)
    return `${worldX - originX},${worldY - originY}`
  }).join(' ')
}

export function mapPixelToLonLat(x: number, y: number, centerLatitude: number, centerLongitude: number, zoom: number, radius = 1): LonLat {
  const [originX, originY] = mapOriginWorldPixel(centerLatitude, centerLongitude, zoom, radius)
  return worldPixelToLonLat(originX + x, originY + y, zoom)
}
