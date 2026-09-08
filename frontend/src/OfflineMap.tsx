import { useMemo } from 'react'

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

export function OfflineMap({ latitude, longitude, compact = false }: { latitude: number; longitude: number; compact?: boolean }) {
  const zoom = compact ? 12 : 13
  const tiles = useMemo(() => fieldTileUrls(latitude, longitude, zoom, 1).map((url) => ({ key: url, url })), [latitude, longitude, zoom])

  return (
    <div className={`map-preview offline-map ${compact ? 'compact' : ''}`} aria-label={`Карта ${latitude}, ${longitude}`}>
      <div className="offline-map-grid">
        {tiles.map((tile) => <img key={tile.key} src={tile.url} alt="" loading="lazy" crossOrigin="anonymous" />)}
      </div>
      <span className="offline-map-marker" aria-hidden="true">●</span>
      {!navigator.onLine && <span className="offline-map-badge">офлайн</span>}
      <small className="map-attribution">© OpenStreetMap</small>
    </div>
  )
}
