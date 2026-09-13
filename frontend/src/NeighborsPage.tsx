import { useEffect, useMemo, useState } from 'react'

import { api } from './api'
import type { NeighborLink, User } from './types'

export function NeighborsPage({ currentUser, users }: { currentUser: User; users: User[] }) {
  const [neighbors, setNeighbors] = useState<NeighborLink[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [query, setQuery] = useState('')
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
  const neighborUsers = useMemo(() => neighbors.map((item) => item.user), [neighbors])
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    if (normalized.length < 2) return []
    return users
      .filter((user) => user.id !== currentUser.id && !neighborIds.has(user.id))
      .filter((user) => `${user.name} ${user.username}`.toLocaleLowerCase('ru-RU').includes(normalized))
      .slice(0, 8)
  }, [currentUser.id, neighborIds, query, users])

  async function toggle(user: User) {
    setBusyId(user.id)
    setError('')
    try {
      if (neighborIds.has(user.id)) {
        await api.removeNeighbor(currentUser.id, user.id)
        if (selected?.id === user.id) setSelected(null)
      } else {
        await api.addNeighbor(currentUser.id, user.id)
        setQuery('')
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
      <div className="section-heading neighbors-heading">
        <div>
          <h1>Соседи</h1>
          <p>Хозяйства, за которыми вы хотите следить независимо от расстояния.</p>
        </div>
        <span className="count-badge">{neighbors.length}</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="neighbor-search-card">
        <div>
          <h2>Добавить соседа</h2>
          <p className="muted">Найдите хозяйство по имени или username.</p>
        </div>
        <input
          className="neighbor-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например, Марина или @marina_agro"
          aria-label="Найти соседа по имени"
        />
        {query.trim().length > 0 && query.trim().length < 2 && <small className="muted">Введите хотя бы 2 символа.</small>}
        {query.trim().length >= 2 && searchResults.length === 0 && <div className="neighbor-empty">Ничего не найдено.</div>}
        {searchResults.length > 0 && (
          <div className="neighbor-search-results">
            {searchResults.map((user) => (
              <article className="neighbor-card searchable" key={user.id}>
                <div className="neighbor-main">
                  <strong>{user.name}</strong>
                  <small>@{user.username} · {user.region}</small>
                  <small>{user.specialization}{user.is_beekeeper ? ' · пасека' : ''}</small>
                </div>
                <button className="primary-button compact-button" type="button" onClick={() => void toggle(user)} disabled={busyId === user.id}>
                  {busyId === user.id ? 'Добавляем…' : '+ Сосед'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="neighbors-current-section">
        <h2>Мои соседи</h2>
        {loading ? <p>Загрузка соседей…</p> : neighborUsers.length === 0 ? (
          <div className="neighbor-empty">Список пока пуст.</div>
        ) : (
          <div className="neighbor-list">
            {neighborUsers.map((user) => (
              <article className="neighbor-card" key={user.id}>
                <div className="neighbor-main">
                  <strong>{user.name}</strong>
                  <small>@{user.username} · {user.region}</small>
                  <small>{user.specialization}{user.is_beekeeper ? ' · пасека' : ''}</small>
                </div>
                <div className="neighbor-actions">
                  <button className="secondary-button compact-button" type="button" onClick={() => void openProfile(user)} disabled={busyId === user.id}>
                    Профиль
                  </button>
                  <button className="secondary-button compact-button" type="button" onClick={() => void toggle(user)} disabled={busyId === user.id}>
                    Убрать
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
