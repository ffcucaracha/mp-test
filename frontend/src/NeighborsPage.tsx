import { useEffect, useMemo, useState } from 'react'

import { api } from './api'
import type { NeighborLink, User } from './types'

export function NeighborsPage({ currentUser, users }: { currentUser: User; users: User[] }) {
  const [neighbors, setNeighbors] = useState<NeighborLink[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setNeighbors(await api.neighbors(currentUser.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить соседей')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [currentUser.id])

  const neighborIds = useMemo(() => new Set(neighbors.map((item) => item.user.id)), [neighbors])
  const candidates = users.filter((user) => user.id !== currentUser.id)

  async function toggle(user: User) {
    setBusyId(user.id)
    setError('')
    try {
      if (neighborIds.has(user.id)) {
        await api.removeNeighbor(currentUser.id, user.id)
        if (selected?.id === user.id) setSelected(null)
      } else {
        await api.addNeighbor(currentUser.id, user.id)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить список соседей')
    } finally {
      setBusyId(null)
    }
  }

  async function openProfile(user: User) {
    if (!neighborIds.has(user.id)) return
    setBusyId(user.id)
    try {
      setSelected(await api.neighborProfile(currentUser.id, user.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть профиль')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="neighbors-page">
      <div className="section-heading">
        <div>
          <h1>Соседи</h1>
          <p>Явный список хозяйств, за которыми удобно следить независимо от расстояния.</p>
        </div>
        <span className="count-badge">{neighbors.length}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading ? <p>Загрузка соседей…</p> : (
        <div className="neighbor-list">
          {candidates.map((user) => {
            const isNeighbor = neighborIds.has(user.id)
            return (
              <article className="neighbor-card" key={user.id}>
                <div className="neighbor-main">
                  <div>
                    <strong>{user.name}</strong>
                    <small>@{user.username} · {user.region}</small>
                    <small>{user.specialization}{user.is_beekeeper ? ' · пасека' : ''}</small>
                  </div>
                </div>
                <div className="neighbor-actions">
                  {isNeighbor && (
                    <button className="secondary-button compact-button" type="button" onClick={() => openProfile(user)} disabled={busyId === user.id}>
                      Профиль
                    </button>
                  )}
                  <button className={isNeighbor ? 'secondary-button compact-button' : 'primary-button compact-button'} type="button" onClick={() => toggle(user)} disabled={busyId === user.id}>
                    {isNeighbor ? 'Убрать' : '+ Сосед'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {selected && (
        <section className="neighbor-profile-card">
          <div className="section-heading">
            <div><h2>{selected.name}</h2><p>@{selected.username}</p></div>
            <button className="secondary-button compact-button" onClick={() => setSelected(null)}>Закрыть</button>
          </div>
          <p><strong>{selected.farm_name || 'Хозяйство не указано'}</strong></p>
          <p>{selected.region} · {selected.specialization}</p>
          {selected.bio && <p className="muted">{selected.bio}</p>}
          <div className="field-facts">
            <span>Лента: {selected.news_radius_km} км</span>
            <span>Оповещения: {selected.broadcast_radius_km} км</span>
            {selected.is_beekeeper && <span>Пчеловод</span>}
          </div>
        </section>
      )}
    </section>
  )
}
