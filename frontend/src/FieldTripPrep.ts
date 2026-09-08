import { api } from './api'
import { fieldTileUrls } from './OfflineMap'
import { putCacheEntry } from './offline'

export type FieldTripProgress = {
  done: number
  total: number
  label: string
}

export type FieldTripResult = {
  fields: number
  tiles: number
  prepared_at: number
}

async function cacheTile(url: string) {
  const response = await fetch(url, { cache: 'reload' })
  if (!response.ok) throw new Error(`Tile ${response.status}`)
  if ('caches' in window) {
    const cache = await caches.open('osm-field-tiles')
    await cache.put(url, response.clone())
  }
}

export async function prepareFieldTrip(userId: number, onProgress?: (progress: FieldTripProgress) => void): Promise<FieldTripResult> {
  if (!navigator.onLine) throw new Error('Для подготовки поездки нужна сеть.')

  const fields = await api.fields(userId)
  const tileUrls = Array.from(new Set(fields.flatMap((field) => [
    ...fieldTileUrls(field.latitude, field.longitude, 12, 1),
    ...fieldTileUrls(field.latitude, field.longitude, 13, 1),
  ])))
  const total = 5 + fields.length * 2 + tileUrls.length
  let done = 0
  const step = (label: string) => {
    done += 1
    onProgress?.({ done, total, label })
  }

  await api.user(userId); step('Профиль сохранён')
  await api.feed(userId); step('Лента рядом сохранена')
  await api.neighbors(userId); step('Соседи сохранены')
  await api.alerts(userId); step('Предупреждения сохранены')
  await Promise.allSettled([api.incomingVisitRequests(userId), api.outgoingVisitRequests(userId)]); step('Запросы доступа сохранены')

  for (const field of fields) {
    await api.cropSeasons(field.id, userId).catch(() => undefined)
    step(`Севооборот: ${field.name}`)
    try {
      const weather = await api.checkFieldWeather(field.id, userId, 0, 72)
      await putCacheEntry(`weather:${userId}:${field.id}`, weather)
    } catch {
      // A field remains usable even if the weather provider is temporarily unavailable.
    }
    step(`Погода: ${field.name}`)
  }

  let cachedTiles = 0
  for (const url of tileUrls) {
    try {
      await cacheTile(url)
      cachedTiles += 1
    } catch {
      // Tile failures are non-fatal: keep the rest of the trip package.
    }
    step('Карта')
  }

  const result: FieldTripResult = { fields: fields.length, tiles: cachedTiles, prepared_at: Date.now() }
  await putCacheEntry(`field-trip:${userId}`, result)
  return result
}
