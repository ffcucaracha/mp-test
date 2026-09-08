import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import { prepareFieldTrip, type FieldTripProgress } from './FieldTripPrep'
import { getCacheEntry, getOutboxCount } from './offline'
import type { AgroField, AlertItem, FeedPost, FieldWeather, NeighborLink, User } from './types'
import './dashboard.css'

type DashboardState = {
  fields: AgroField[]
  alerts: AlertItem[]
  feed: FeedPost[]
  neighbors: NeighborLink[]
  pending: number
  weather: Array<{ field: AgroField; value: FieldWeather; cachedAt: number }>
}

const EMPTY: DashboardState = { fields: [], alerts: [], feed: [], neighbors: [], pending: 0, weather: [] }

function formatTemperature(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} °C`
}

function formatDistance(value: number | null) {
  if (value === null) return 'рядом'
  if (value < 1) return `${Math.round(value * 1000)} м`
  return `${value.toFixed(value < 10 ? 1 : 0)} км`
}

function ageLabel(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} ч назад` : `${Math.round(hours / 24)} дн назад`
}

export function DashboardPage({ currentUser }: { currentUser: User }) {
  const [state, setState] = useState<DashboardState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState<FieldTripProgress | null>(null)
  const [tripMessage, setTripMessage] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [fieldsResult, alertsResult, feedResult, neighborsResult, pendingResult] = await Promise.allSettled([
      api.fields(currentUser.id),
      api.alerts(currentUser.id),
      api.feed(currentUser.id),
      api.neighbors(currentUser.id),
      getOutboxCount(),
    ])

    const fields = fieldsResult.status === 'fulfilled' ? fieldsResult.value : []
    const weather = (await Promise.all(fields.map(async (field) => {
      const cached = await getCacheEntry<FieldWeather>(`weather:${currentUser.id}:${field.id}`).catch(() => null)
      return cached ? { field, value: cached.value, cachedAt: cached.cached_at } : null
    }))).filter((item): item is { field: AgroField; value: FieldWeather; cachedAt: number } => item !== null)

    setState({
      fields,
      alerts: alertsResult.status === 'fulfilled' ? alertsResult.value : [],
      feed: feedResult.status === 'fulfilled' ? feedResult.value : [],
      neighbors: neighborsResult.status === 'fulfilled' ? neighborsResult.value : [],
      pending: pendingResult.status === 'fulfilled' ? pendingResult.value : 0,
      weather,
    })

    if ([fieldsResult, alertsResult, feedResult, neighborsResult].every((result) => result.status === 'rejected')) {
      setError('Не удалось получить свежую сводку. Показываем то, что удалось найти локально.')
    }
    setLoading(false)
  }, [currentUser.id])

  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener('online', refresh)
    window.addEventListener('agroconnect:alerts-changed', refresh)
    window.addEventListener('agroconnect:sync-complete', refresh)
    window.addEventListener('agroconnect:outbox-changed', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('agroconnect:alerts-changed', refresh)
      window.removeEventListener('agroconnect:sync-complete', refresh)
      window.removeEventListener('agroconnect:outbox-changed', refresh)
    }
  }, [load])

  const unreadAlerts = useMemo(() => state.alerts.filter((alert) => !alert.is_opened), [state.alerts])
  const latestImportantAlert = unreadAlerts[0] ?? state.alerts[0] ?? null
  const nearbyProblem = useMemo(
    () => state.feed
      .filter((post) => post.author.id !== currentUser.id && post.status === 'problem')
      .sort((a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999))[0] ?? null,
    [currentUser.id, state.feed],
  )
  const weatherFocus = useMemo(() => {
    if (state.weather.length === 0) return null
    return [...state.weather].sort((a, b) => {
      if (a.value.frost_risk !== b.value.frost_risk) return a.value.frost_risk ? -1 : 1
      return a.value.min_temperature_c - b.value.min_temperature_c
    })[0]
  }, [state.weather])

  async function prepareTrip() {
    if (!navigator.onLine || preparing) return
    setPreparing(true)
    setTripMessage('')
    setProgress({ done: 0, total: 1, label: 'Готовим данные…' })
    try {
      const result = await prepareFieldTrip(currentUser.id, setProgress)
      setTripMessage(`Готово: ${result.fields} полей, ${result.tiles} тайлов карты. Погода, лента, севооборот и предупреждения сохранены.`)
      await load()
    } catch (err) {
      setTripMessage(err instanceof Error ? err.message : 'Не удалось подготовить данные к поездке.')
    } finally {
      setPreparing(false)
      setProgress(null)
    }
  }

  return (
    <section className="dashboard-page">
      <header className="dashboard-hero">
        <span className="dashboard-kicker">Сегодня в хозяйстве</span>
        <h1>{currentUser.farm_name || currentUser.name}</h1>
        <p>{navigator.onLine ? 'Свежая сводка по полям и событиям рядом' : 'Офлайн · показываем последние сохранённые данные'}</p>
      </header>

      {error && <div className="dashboard-notice">{error}</div>}

      <button className="field-trip-cta" type="button" onClick={() => void prepareTrip()} disabled={!navigator.onLine || preparing}>
        <span className="field-trip-cta-icon">🚜</span>
        <span>
          <strong>{preparing ? 'Готовим поездку…' : 'Поехал в поля'}</strong>
          <small>{navigator.onLine ? 'Скачать погоду, карты и рабочие данные для офлайна' : 'Данные для поездки можно подготовить заранее при наличии сети'}</small>
        </span>
      </button>

      {progress && (
        <div className="dashboard-progress" role="status">
          <strong>{progress.label}</strong>
          <progress max={progress.total} value={progress.done} />
        </div>
      )}
      {tripMessage && <div className="dashboard-trip-message">{tripMessage}</div>}

      <div className="dashboard-grid">
        <a className={`dashboard-card ${unreadAlerts.length > 0 ? 'dashboard-card-alert' : ''}`} href="#/alerts">
          <span className="dashboard-card-icon">⚠️</span>
          <div>
            <small>Сейчас важно</small>
            <strong>{unreadAlerts.length > 0 ? `${unreadAlerts.length} непрочитанных` : 'Критичных событий нет'}</strong>
            <p>{latestImportantAlert?.title ?? 'Новых предупреждений пока нет'}</p>
          </div>
        </a>

        <a className={`dashboard-card ${weatherFocus?.value.frost_risk ? 'dashboard-card-cold' : ''}`} href="#/fields">
          <span className="dashboard-card-icon">{weatherFocus?.value.frost_risk ? '❄️' : '🌤️'}</span>
          <div>
            <small>Погода</small>
            <strong>{weatherFocus ? formatTemperature(weatherFocus.value.min_temperature_c) : 'Нет прогноза'}</strong>
            <p>{weatherFocus ? `${weatherFocus.field.name} · ${weatherFocus.value.frost_risk ? 'риск заморозков' : `кэш ${ageLabel(weatherFocus.cachedAt)}`}` : 'Откройте поле онлайн, чтобы сохранить прогноз'}</p>
          </div>
        </a>

        <a className={`dashboard-card ${nearbyProblem ? 'dashboard-card-problem' : ''}`} href="#/feed">
          <span className="dashboard-card-icon">🥀</span>
          <div>
            <small>Что у соседей</small>
            <strong>{nearbyProblem ? `Проблема в ${formatDistance(nearbyProblem.distance_km)}` : 'Спокойно'}</strong>
            <p>{nearbyProblem ? `${nearbyProblem.field_name}: ${nearbyProblem.text || nearbyProblem.crop}` : 'В ленте рядом нет новых проблем'}</p>
          </div>
        </a>

        <a className="dashboard-card" href="#/fields">
          <span className="dashboard-card-icon">🌾</span>
          <div>
            <small>Хозяйство</small>
            <strong>{state.fields.length} полей · {state.neighbors.length} соседей</strong>
            <p>{state.pending > 0 ? `${state.pending} действий ждут синхронизации` : 'Все локальные изменения отправлены'}</p>
          </div>
        </a>
      </div>

      <section className="dashboard-actions">
        <h2>Быстрые действия</h2>
        <div className="dashboard-action-row">
          <a href="#/feed"><span>📷</span><strong>Записать событие</strong></a>
          <a href="#/fields"><span>⌖</span><strong>Мои поля</strong></a>
          <a href="#/alerts"><span>!</span><strong>Предупреждения</strong></a>
        </div>
      </section>

      {loading && <p className="dashboard-loading">Обновляем сводку…</p>}
    </section>
  )
}
