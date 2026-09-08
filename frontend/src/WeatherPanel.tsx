import { useCallback, useEffect, useState } from 'react'

import { api } from './api'
import { getCacheEntry, putCacheEntry } from './offline'
import type { AgroField, FieldWeather, User } from './types'

const WEATHER_REFRESH_MS = 3 * 60 * 60 * 1000
const WEATHER_MAX_AGE_MS = 72 * 60 * 60 * 1000

function formatTemperature(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} °C`
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAge(timestamp: number | null) {
  if (!timestamp) return ''
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  return `${Math.round(minutes / 60)} ч назад`
}

export function WeatherPanel({ field, user }: { field: AgroField; user: User }) {
  const [weather, setWeather] = useState<FieldWeather | null>(null)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cacheKey = `weather:${user.id}:${field.id}`

  const load = useCallback(async (force = false) => {
    setError('')
    const cached = await getCacheEntry<FieldWeather>(cacheKey).catch(() => null)
    const cacheAge = cached ? Date.now() - cached.cached_at : Number.POSITIVE_INFINITY

    if (cached && cacheAge <= WEATHER_MAX_AGE_MS) {
      setWeather(cached.value)
      setCachedAt(cached.cached_at)
      if (!force && (!navigator.onLine || cacheAge < WEATHER_REFRESH_MS)) return
    }

    if (!navigator.onLine) {
      if (!cached || cacheAge > WEATHER_MAX_AGE_MS) setError('Нет сети и сохранённый прогноз уже устарел.')
      return
    }

    setLoading(true)
    try {
      const result = await api.checkFieldWeather(field.id, user.id, 0, 72)
      setWeather(result)
      setCachedAt(Date.now())
      await putCacheEntry(cacheKey, result).catch(() => undefined)
      if (result.alert_created) window.dispatchEvent(new Event('agroconnect:alerts-changed'))
    } catch (err) {
      if (!cached) setError(err instanceof Error ? err.message : 'Не удалось получить прогноз')
      else setError('Не удалось обновить прогноз. Показываем последние сохранённые данные.')
    } finally {
      setLoading(false)
    }
  }, [cacheKey, field.id, user.id])

  useEffect(() => {
    void load(false)
    const handleOnline = () => void load(false)
    window.addEventListener('online', handleOnline)
    const timer = window.setInterval(() => { if (navigator.onLine) void load(false) }, WEATHER_REFRESH_MS)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.clearInterval(timer)
    }
  }, [load])

  return (
    <section className={`weather-panel ${weather?.frost_risk ? 'has-risk' : ''}`}>
      <div className="weather-panel-heading">
        <div>
          <strong>{weather?.frost_risk ? '❄️ Риск заморозков' : '🌤 Погода на поле'}</strong>
          <small>Прогноз на 72 часа · данные {weather?.provider === 'open-meteo' ? 'Open-Meteo' : weather?.provider ?? 'погодного сервиса'}</small>
          {cachedAt && <small>{navigator.onLine ? 'Обновлено' : 'Офлайн-кэш'}: {formatAge(cachedAt)}</small>}
        </div>
        <button type="button" className="weather-refresh" onClick={() => void load(true)} disabled={loading || !navigator.onLine} title={!navigator.onLine ? 'Обновление будет доступно после появления сети' : 'Обновить прогноз'}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {error && <div className="weather-error">{error}</div>}
      {!weather && !error && <p className="weather-loading">Проверяем прогноз и риск заморозков…</p>}

      {weather && (
        <>
          <div className="weather-stats">
            <div><span>Минимум</span><strong>{formatTemperature(weather.min_temperature_c)}</strong></div>
            <div><span>Осадки</span><strong>{weather.max_precipitation_probability ?? '—'}{weather.max_precipitation_probability !== null ? '%' : ''}</strong></div>
            <div><span>Ветер</span><strong>{weather.max_wind_speed_kmh !== null ? `${weather.max_wind_speed_kmh} км/ч` : '—'}</strong></div>
          </div>

          {weather.frost_risk ? (
            <div className="frost-warning">
              <strong>Температура может опуститься до {formatTemperature(weather.min_temperature_c)}</strong>
              <span>Первый риск: {formatDate(weather.frost_starts_at)}</span>
              <small>{weather.alert_created ? 'Предупреждение добавлено в уведомления.' : 'Такое предупреждение уже есть в уведомлениях.'}</small>
            </div>
          ) : (
            <p className="weather-ok">При пороге 0 °C заморозков в ближайшие 72 часа не ожидается.</p>
          )}
        </>
      )}
    </section>
  )
}
