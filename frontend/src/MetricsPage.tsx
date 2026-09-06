import { useEffect, useState } from 'react'

import { api } from './api'
import type { InternalMetrics } from './types'

export function MetricsPage() {
  const [metrics, setMetrics] = useState<InternalMetrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.metrics().then(setMetrics).catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить метрики'))
  }, [])

  if (error) return <div className="error-banner">{error}</div>
  if (!metrics) return <p>Загрузка метрик…</p>

  const events = Object.entries(metrics.events).sort((a, b) => b[1] - a[1])

  return (
    <section className="metrics-page">
      <div className="section-heading">
        <div><h1>Метрики MVP</h1><p>Внутренний экран для проверки продуктовых гипотез и подготовки итогов хакатона.</p></div>
      </div>

      <h2>Активация</h2>
      <div className="metric-grid">
        <Metric label="Пользователи" value={metrics.activation.users} />
        <Metric label="Заполненные профили" value={metrics.activation.profiles_completed} />
        <Metric label="Поля" value={metrics.activation.fields} />
        <Metric label="Поля с географией" value={metrics.activation.fields_with_location} />
      </div>

      <h2>Социальное ядро</h2>
      <div className="metric-grid">
        <Metric label="Публикации" value={metrics.social.posts} />
        <Metric label="Реакции" value={metrics.social.reactions} />
        <Metric label="Комментарии" value={metrics.social.comments} />
        <Metric label="Связи «сосед»" value={metrics.social.neighbors} />
      </div>

      <h2>Приватность A/B</h2>
      <div className="privacy-metrics">
        {(['A', 'B'] as const).map((variant) => (
          <article className="metric-panel" key={variant}>
            <strong>Вариант {variant}</strong>
            <span>{metrics.privacy_experiment[variant].fields} полей</span>
            <small>Просмотров открытых: {metrics.privacy_experiment[variant].events.public_field_viewed ?? 0}</small>
            <small>Просмотров скрытых: {metrics.privacy_experiment[variant].events.private_field_viewed ?? 0}</small>
            <small>Запросов в гости: {metrics.privacy_experiment[variant].events.visit_request_sent ?? 0}</small>
            <small>Одобрено: {metrics.privacy_experiment[variant].events.visit_request_approved ?? 0}</small>
          </article>
        ))}
      </div>

      <h2>События</h2>
      <div className="event-table">
        {events.length === 0 ? <p className="muted">Событий пока нет.</p> : events.map(([name, count]) => (
          <div className="event-row" key={name}><code>{name}</code><strong>{count}</strong></div>
        ))}
      </div>

      <h2>Последние действия</h2>
      <div className="event-table">
        {metrics.recent_events.slice(0, 12).map((event, index) => (
          <div className="event-row event-row-wide" key={`${event.created_at}-${event.event_name}-${index}`}>
            <div><code>{event.event_name}</code><small>{event.user_id ? `user ${event.user_id}` : 'anonymous'}{event.experiment_variant ? ` · ${event.experiment_variant}` : ''}</small></div>
            <small>{new Date(event.created_at).toLocaleString('ru-RU')}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric-card"><strong>{value}</strong><span>{label}</span></article>
}
