import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import { getCacheEntry, putCacheEntry } from './offline'
import type { AgroField, FieldWeather, User, WeatherHour } from './types'

const WEATHER_REFRESH_MS = 3 * 60 * 60 * 1000
const WEATHER_MAX_AGE_MS = 72 * 60 * 60 * 1000

function formatTemperature(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
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

function formatForecastDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`))
}

function formatAge(timestamp: number | null) {
  if (!timestamp) return ''
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  return `${Math.round(minutes / 60)} ч назад`
}

type DailyForecast = {
  date: string
  minTemperature: number
  maxTemperature: number
  precipitationProbability: number | null
  maxWindSpeed: number | null
}

function buildDailyForecast(hours: WeatherHour[]): DailyForecast[] {
  const grouped = new Map<string, WeatherHour[]>()
  for (const hour of hours) {
    const date = hour.time.slice(0, 10)
    grouped.set(date, [...(grouped.get(date) ?? []), hour])
  }

  return [...grouped.entries()].slice(0, 3).map(([date, items]) => {
    const temperatures = items.map((item) => item.temperature_c).filter(Number.isFinite)
    const precipitation = items
      .map((item) => item.precipitation_probability)
      .filter((value): value is number => value !== null && Number.isFinite(value))
    const wind = items
      .map((item) => item.wind_speed_kmh)
      .filter((value): value is number => value !== null && Number.isFinite(value))

    return {
      date,
      minTemperature: temperatures.length ? Math.min(...temperatures) : 0,
      maxTemperature: temperatures.length ? Math.max(...temperatures) : 0,
      precipitationProbability: precipitation.length ? Math.max(...precipitation) : null,
      maxWindSpeed: wind.length ? Math.max(...wind) : null,
    }
  })
}

export function WeatherPanel({ field, user }: { field: AgroField; user: User }) {
  const [weather, setWeather] = useState<FieldWeather | null>(null)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forecastOpen, setForecastOpen] = useState(false)
  const cacheKey = `weather:${user.id}:${field.id}`
  const dailyForecast = useMemo(() => buildDailyForecast(weather?.hours ?? []), [weather?.hours])

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
          <strong>{weather?.frost_risk ? '❄️ Риск заморозков' : '🌤 Сейчас на поле'}</strong>
          <small>{weather?.current_source === 'company_station' ? `МС компании ${weather.current_station_name} · ${weather.current_station_distance_km} км` : 'Open-Meteo · по координатам поля'}</small>
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
            <div><span>Температура</span><strong>{formatTemperature(weather.current_temperature_c ?? weather.hours?.[0]?.temperature_c)}</strong></div>
            <div><span>Осадки</span><strong>{weather.current_precipitation_mm === null || weather.current_precipitation_mm === undefined ? '—' : `${weather.current_precipitation_mm} мм`}</strong></div>
            <div><span>Ветер</span><strong>{weather.current_wind_speed_kmh === null || weather.current_wind_speed_kmh === undefined ? '—' : `${weather.current_wind_speed_kmh} км/ч`}</strong></div>
          </div>
          <button type="button" className="weather-forecast-button" onClick={() => setForecastOpen(true)}>Прогноз на 3 дня →</button>

          {weather.frost_risk ? (
            <div className="frost-warning">
              <strong>Температура может опуститься до {formatTemperature(weather.min_temperature_c)}</strong>
              <span>Первый риск: {formatDate(weather.frost_starts_at)}</span>
              <small>{weather.alert_created ? 'Предупреждение добавлено в уведомления.' : 'Такое предупреждение уже есть в уведомлениях.'}</small>
            </div>
          ) : (
            <p className="weather-ok">При пороге 0 °C заморозков в ближайшие 72 часа не ожидается.</p>
          )}

          {forecastOpen && (
            <div className="weather-modal-backdrop" role="presentation" onClick={() => setForecastOpen(false)}>
              <section className="weather-modal" role="dialog" aria-modal="true" aria-label={`Прогноз для ${field.name}`} onClick={(event) => event.stopPropagation()}>
                <div className="weather-panel-heading">
                  <div>
                    <strong>Прогноз на 3 дня</strong>
                    <small>{field.name} · данные сохранены для офлайн-просмотра</small>
                    {cachedAt && <small>{navigator.onLine ? 'Обновлено' : 'Офлайн-кэш'}: {formatAge(cachedAt)}</small>}
                  </div>
                  <button type="button" className="weather-refresh" onClick={() => setForecastOpen(false)} aria-label="Закрыть прогноз">×</button>
                </div>

                <div className="weather-days">
                  {dailyForecast.map((day) => (
                    <article className="weather-day" key={day.date}>
                      <time>{formatForecastDate(day.date)}</time>
                      <div className="weather-day-temperature">
                        <strong>{formatTemperature(day.maxTemperature)}</strong>
                        <span>{formatTemperature(day.minTemperature)}</span>
                      </div>
                      <div className="weather-day-details">
                        <span>☔ до {day.precipitationProbability ?? '—'}%</span>
                        <span>💨 до {day.maxWindSpeed === null ? '—' : `${Math.round(day.maxWindSpeed)} км/ч`}</span>
                      </div>
                    </article>
                  ))}
                </div>

                {dailyForecast.length === 0 && <p className="weather-loading">В сохранённых данных нет почасового прогноза.</p>}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  )
}
