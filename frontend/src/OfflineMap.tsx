import { useMemo } from 'react'

function latLonToTile(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom
  const x = Math.floor(((longitude + 180) / 360) * n)
  const latRad = (latitude * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

export function OfflineMap({ latitude, longitude, compact = false }: { latitude: number; longitude: number; compact?: boolean }) {
  const zoom = compact ? 12 : 13
  const tiles = useMemo(() => {
    const center = latLonToTile(latitude, longitude, zoom)
    return [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({
      key: `${zoom}-${center.x + dx}-${center.y + dy}`,
      url: `https://tile.openstreetmap.org/${zoom}/${center.x + dx}/${center.y + dy}.png`,
    })))
  }, [latitude, longitude, zoom])

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
