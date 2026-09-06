import { FormEvent, useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'

import { api } from './api'
import './features.css'
import type { AgroField, FieldCreate, Post, User, UserUpdate } from './types'

const RADII = [25, 50, 100, 200]

export default function App() {
  return (
    <HashRouter>
      <AgroConnectApp />
    </HashRouter>
  )
}

function AgroConnectApp() {
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem('agroconnect.userId')
    return saved ? Number(saved) : null
  })
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.health(), api.users(), api.posts()])
      .then(([, usersData, postsData]) => {
        setServerOk(true)
        setUsers(usersData)
        setPosts(postsData)
      })
      .catch(() => setServerOk(false))
      .finally(() => setLoading(false))
  }, [])

  const currentUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  )

  function login(userId: number) {
    localStorage.setItem('agroconnect.userId', String(userId))
    setSelectedUserId(userId)
    window.location.hash = '#/feed'
  }

  function logout() {
    localStorage.removeItem('agroconnect.userId')
    setSelectedUserId(null)
    window.location.hash = '#/feed'
  }

  function replaceUser(updated: User) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)))
  }

  if (loading) return <div className="center-screen">Загрузка AgroConnect…</div>

  if (!currentUser) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-mark">AC</div>
          <h1>AgroConnect</h1>
          <p className="muted">Рабочая сеть для сельхозпроизводителей</p>
          <div className={`server-status ${serverOk ? 'ok' : 'error'}`}>
            <span className="status-dot" />
            {serverOk ? 'Сервер доступен' : 'Нет связи с сервером'}
          </div>
          <h2>Выберите тестового пользователя</h2>
          <div className="user-list">
            {users.map((user) => (
              <button key={user.id} className="user-option" onClick={() => login(user.id)}>
                <Avatar name={user.name} />
                <span>
                  <strong>{user.name}</strong>
                  <small>@{user.username} · {user.region}</small>
                </span>
                <span className="chevron">›</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>AgroConnect</strong>
          <small>{currentUser.farm_name || currentUser.region}</small>
        </div>
        <Avatar name={currentUser.name} small />
      </header>

      <main className="content stage-content">
        <Routes>
          <Route path="/feed" element={<FeedPage posts={posts} currentUser={currentUser} />} />
          <Route path="/fields" element={<FieldsPage user={currentUser} />} />
          <Route
            path="/profile"
            element={<ProfilePage user={currentUser} onSaved={replaceUser} onLogout={logout} />}
          />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </main>

      <nav className="bottom-nav bottom-nav-three">
        <NavLink to="/feed" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span>⌂</span>
          Лента
        </NavLink>
        <NavLink to="/fields" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span>⌖</span>
          Поля
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span>○</span>
          Профиль
        </NavLink>
      </nav>
    </div>
  )
}

function FeedPage({ posts, currentUser }: { posts: Post[]; currentUser: User }) {
  return (
    <section>
      <div className="composer teaser">
        <Avatar name={currentUser.name} />
        <div>
          <strong>Что происходит в хозяйстве?</strong>
          <p>Публикации с фото будут следующим продуктовым этапом.</p>
        </div>
      </div>
      <div className="feed">
        {posts.map((post) => (
          <article className="post" key={post.id}>
            <Avatar name={post.author.name} />
            <div className="post-body">
              <div className="post-meta">
                <strong>{post.author.name}</strong>
                <span>@{post.author.username} · {post.author.region}</span>
              </div>
              <p>{post.text}</p>
              <div className="post-actions">
                <span>🌾 0</span>
                <span>🥀 0</span>
                <span>💬 0</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProfilePage({ user, onSaved, onLogout }: { user: User; onSaved: (user: User) => void; onLogout: () => void }) {
  const [form, setForm] = useState<UserUpdate>(() => toUserUpdate(user))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => setForm(toUserUpdate(user)), [user])

  const completeness = useMemo(() => {
    const values = [form.name, form.region, form.specialization, form.farm_name, form.bio]
    return Math.round((values.filter((value) => value.trim().length > 0).length / values.length) * 100)
  }, [form])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const updated = await api.updateUser(user.id, form)
      onSaved(updated)
      setMessage('Профиль сохранён')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-stage">
      <div className="profile-summary-card">
        <div className="profile-head compact-profile-head">
          <Avatar name={user.name} large />
          <div>
            <h1>{user.name}</h1>
            <div className="username">@{user.username}</div>
          </div>
        </div>
        <div className="completion-row">
          <span>Полнота профиля</span>
          <strong>{completeness}%</strong>
        </div>
        <div className="completion-track"><span style={{ width: `${completeness}%` }} /></div>
      </div>

      <form className="form-card" onSubmit={submit}>
        <h2>Профиль хозяйства</h2>
        <FormField label="Имя">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FormField>
        <FormField label="Регион">
          <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        </FormField>
        <FormField label="Специализация">
          <input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
        </FormField>
        <FormField label="Хозяйство">
          <input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} />
        </FormField>
        <FormField label="О себе / хозяйстве">
          <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </FormField>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_beekeeper}
            onChange={(e) => setForm({ ...form, is_beekeeper: e.target.checked })}
          />
          <span><strong>У меня есть пасека</strong><small>Пчеловодство — дополнительный признак профиля, а не отдельная роль.</small></span>
        </label>

        <div className="two-columns">
          <FormField label="Получать новости в радиусе">
            <select value={form.news_radius_km} onChange={(e) => setForm({ ...form, news_radius_km: Number(e.target.value) })}>
              {RADII.map((radius) => <option key={radius} value={radius}>{radius} км</option>)}
            </select>
          </FormField>
          <FormField label="Транслировать предупреждения">
            <select value={form.broadcast_radius_km} onChange={(e) => setForm({ ...form, broadcast_radius_km: Number(e.target.value) })}>
              {RADII.map((radius) => <option key={radius} value={radius}>{radius} км</option>)}
            </select>
          </FormField>
        </div>

        {message && <div className="form-message">{message}</div>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить профиль'}</button>
        <button className="secondary-button full-width" type="button" onClick={onLogout}>Сменить тестового пользователя</button>
      </form>
    </section>
  )
}

function FieldsPage({ user }: { user: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [locating, setLocating] = useState(false)
  const [draft, setDraft] = useState<FieldCreate>({ name: '', crop: '', latitude: 54.9914, longitude: 73.3645, area_ha: null })

  useEffect(() => {
    setLoading(true)
    api.fields(user.id)
      .then(setFields)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить поля'))
      .finally(() => setLoading(false))
  }, [user.id])

  function detectLocation() {
    if (!navigator.geolocation) {
      setError('Геолокация не поддерживается устройством')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude }))
        setLocating(false)
      },
      () => {
        setError('Не удалось получить геопозицию. Координаты можно указать вручную.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function createField(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = await api.createField(user.id, draft)
      setFields((current) => [...current, created])
      setDraft({ name: '', crop: '', latitude: created.latitude, longitude: created.longitude, area_ha: null })
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать поле')
    }
  }

  return (
    <section className="fields-page">
      <div className="section-heading">
        <div><h1>Мои поля</h1><p>География — основа ленты и будущих предупреждений.</p></div>
        <button className="primary-button compact-button" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Закрыть' : '+ Поле'}</button>
      </div>

      {showForm && (
        <form className="form-card field-form" onSubmit={createField}>
          <h2>Новое поле</h2>
          <div className="two-columns">
            <FormField label="Название">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Северное поле" required />
            </FormField>
            <FormField label="Культура">
              <input value={draft.crop} onChange={(e) => setDraft({ ...draft, crop: e.target.value })} placeholder="Пшеница" required />
            </FormField>
          </div>
          <FormField label="Площадь, га (необязательно)">
            <input type="number" min="0.1" step="0.1" value={draft.area_ha ?? ''} onChange={(e) => setDraft({ ...draft, area_ha: e.target.value ? Number(e.target.value) : null })} />
          </FormField>
          <button type="button" className="location-button" onClick={detectLocation} disabled={locating}>{locating ? 'Определяем…' : '⌖ Использовать мою геопозицию'}</button>
          <div className="two-columns">
            <FormField label="Широта">
              <input type="number" step="0.000001" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })} required />
            </FormField>
            <FormField label="Долгота">
              <input type="number" step="0.000001" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })} required />
            </FormField>
          </div>
          <MapPreview latitude={draft.latitude} longitude={draft.longitude} />
          <button className="primary-button" type="submit">Сохранить поле</button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}
      {loading ? <p>Загрузка полей…</p> : fields.length === 0 ? (
        <div className="empty-card"><strong>Пока нет полей</strong><p>Добавьте первое поле и привяжите его к местности.</p></div>
      ) : (
        <div className="field-list">
          {fields.map((field) => <FieldCard key={field.id} field={field} />)}
        </div>
      )}
    </section>
  )
}

function FieldCard({ field }: { field: AgroField }) {
  return (
    <article className="field-card">
      <MapPreview latitude={field.latitude} longitude={field.longitude} compact />
      <div className="field-card-body">
        <div className="field-title-row"><h2>{field.name}</h2><span className="crop-pill">{field.crop}</span></div>
        <div className="field-facts">
          {field.area_ha && <span>{field.area_ha} га</span>}
          <span>{field.latitude.toFixed(4)}, {field.longitude.toFixed(4)}</span>
        </div>
      </div>
    </article>
  )
}

function MapPreview({ latitude, longitude, compact = false }: { latitude: number; longitude: number; compact?: boolean }) {
  const delta = compact ? 0.03 : 0.02
  const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`
  return <iframe className={`map-preview ${compact ? 'compact' : ''}`} src={src} title={`Карта ${latitude}, ${longitude}`} loading="lazy" />
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}

function toUserUpdate(user: User): UserUpdate {
  return {
    name: user.name,
    region: user.region,
    specialization: user.specialization,
    farm_name: user.farm_name,
    bio: user.bio,
    is_beekeeper: user.is_beekeeper,
    news_radius_km: user.news_radius_km,
    broadcast_radius_km: user.broadcast_radius_km,
  }
}

function Avatar({ name, small = false, large = false }: { name: string; small?: boolean; large?: boolean }) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2)
  const className = ['avatar', small ? 'small' : '', large ? 'large' : ''].filter(Boolean).join(' ')
  return <div className={className}>{initials}</div>
}
