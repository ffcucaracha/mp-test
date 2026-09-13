import { useEffect, useState } from 'react'

import { api } from './api'
import type { GamificationMetrics, User } from './types'

function weeksLabel(value: number) {
  if (value % 10 === 1 && value % 100 !== 11) return `${value} неделя`
  if ([2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100)) return `${value} недели`
  return `${value} недель`
}

export function GamificationCard({ user }: { user: User }) {
  const [metrics, setMetrics] = useState<GamificationMetrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    api.gamification(user.id)
      .then(setMetrics)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить показатели'))
  }, [user])

  return (
    <section className="gamification-card">
      <div className="gamification-heading">
        <h2>Активность хозяйства</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!metrics && !error ? <p className="muted">Считаем показатели…</p> : metrics && (
        <div className="gamification-grid">
          <div className="gamification-metric"><strong>{metrics.profile_completeness}%</strong><span>Профиль</span></div>
          <div className="gamification-metric"><strong>{metrics.neighbors}</strong><span>Соседи</span></div>
          <div className="gamification-metric"><strong>{weeksLabel(metrics.weekly_activity_streak)}</strong><span>Серия активности</span></div>
          <div className="gamification-metric"><strong>{metrics.reputation > 0 ? '+' : ''}{metrics.reputation}</strong><span>Репутация</span></div>
        </div>
      )}
    </section>
  )
}
