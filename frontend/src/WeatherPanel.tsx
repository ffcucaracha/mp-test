import { useCallback, useEffect, useState } from 'react'

import { api } from './api'
import type { AgroField, FieldWeather, User } from './types'

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

export function WeatherPanel({ field, user }: { field: AgroField; user: User }) {
  const [weather, setWeather] = useState<FieldWeather | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.checkFieldWeather(field.id, user.id, 0, 72)
      setWeather(result)
      if (result.alert_created) window.dispatchEvent(new Event('agroconnect:alerts-changed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить прогноз')
    } finally {
      setLoading(false)
    }
  }, [field.id, user.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className={`weather-panel ${weather?.frost_risk ? 'has-risk' : ''}`}>
      <div className="weather-panel-heading">
        <div>
          <strong>{weather?.frost_risk ? '❄️ Риск заморозков' : '🌤 Погода на поле'}</strong>
          <small>Прогноз на 72 часа · данные {weather?.provider === 'open-meteo' ? 'Open-Meteo' : weather?.provider ?? 'погодного сервиса'}</small>
        </div>
        <button type="button" className="weather-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {error && <div className="weather-error">Прогноз временно недоступен: {error}</div>}
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
