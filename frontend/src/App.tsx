import { FormEvent, useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'

import { AlertsBell, AlertsPage } from './AlertsPage'
import { api } from './api'
import { ApiarySection } from './ApiarySection'
import { CropRotation } from './CropRotation'
import './features.css'
import './stage89.css'
import './stage10.css'
import './stage11.css'
import './offline.css'
import { FeedPage } from './FeedPage'
import { GamificationCard } from './GamificationCard'
import { NeighborsPage } from './NeighborsPage'
import { OfflineMap } from './OfflineMap'
import { OfflineStatus } from './OfflineStatus'
import { Stage4Panel } from './Stage4Panel'
import type { AgroField, FieldCreate, User, UserUpdate } from './types'
import { WeatherPanel } from './WeatherPanel'

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
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem('agroconnect.userId')
    return saved ? Number(saved) : null
  })
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    api.users()
      .then((usersData) => {
        if (!cancelled) setUsers(usersData)
      })
      .catch(() => {
        if (!cancelled) setUsers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    if (!navigator.onLine) {
      setServerOk(false)
    } else {
      api.health().then(() => setServerOk(true)).catch(() => setServerOk(false))
    }

    const online = () => api.health().then(() => setServerOk(true)).catch(() => setServerOk(false))
    const offline = () => setServerOk(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      cancelled = true
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
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
            {serverOk ? 'Сервер доступен' : navigator.onLine ? 'Нет связи с сервером' : 'Нет интернета'}
          </div>
          <h2>Выберите тестового пользователя</h2>
          {users.length === 0 && !navigator.onLine && (
            <p className="muted">Первый вход требует интернет. После первого успешного запуска профиль и рабочие данные доступны из локального кэша.</p>
          )}
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
        <div className="topbar-actions">
          <AlertsBell user={currentUser} />
          <Avatar name={currentUser.name} small />
        </div>
      </header>

      <OfflineStatus />

      <main className="content stage-content">
        <Routes>
          <Route path="/feed" element={<FeedPage currentUser={currentUser} />} />
          <Route path="/fields" element={<FieldsPage user={currentUser} />} />
          <Route path="/neighbors" element={<NeighborsPage currentUser={currentUser} users={users} />} />
          <Route path="/alerts" element={<AlertsPage currentUser={currentUser} />} />
          <Route path="/profile" element={<ProfilePage user={currentUser} onSaved={replaceUser} onLogout={logout} />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </main>

      <nav className="bottom-nav bottom-nav-three">
        <NavLink to="/feed" className={({ isActive }) => (isActive ? 'active' : '')}><span>⌂</span>Лента</NavLink>
        <NavLink to="/fields" className={({ isActive }) => (isActive ? 'active' : '')}><span>⌖</span>Поля</NavLink>
        <NavLink to="/neighbors" className={({ isActive }) => (isActive ? 'active' : '')}><span>◎</span>Соседи</NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}><span>○</span>Профиль</NavLink>
      </nav>
    </div>
  )
}

function ProfilePage({ user, onSaved, onLogout }: { user: User; onSaved: (user: User) => void; onLogout: () => void }) {
  const [form, setForm] = useState<UserUpdate>(() => toUserUpdate(user))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [neighborCount, setNeighborCount] = useState(0)

  useEffect(() => setForm(toUserUpdate(user)), [user])
  useEffect(() => {
    api.neighbors(user.id).then((items) => setNeighborCount(items.length)).catch(() => setNeighborCount(0))
  }, [user.id])

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
          <div><h1>{user.name}</h1><div className="username">@{user.username}</div></div>
        </div>
        <div className="profile-stat-row"><span>Соседи</span><strong>{neighborCount}</strong></div>
        <div className="completion-row"><span>Полнота профиля</span><strong>{completeness}%</strong></div>
        <div className="completion-track"><span style={{ width: `${completeness}%` }} /></div>
      </div>

      <GamificationCard user={user} />

      <form className="form-card" onSubmit={submit}>
        <h2>Профиль хозяйства</h2>
        <FormField label="Имя"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></FormField>
        <FormField label="Регион"><input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></FormField>
        <FormField label="Специализация"><input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></FormField>
        <FormField label="Хозяйство"><input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} /></FormField>
        <FormField label="О себе / хозяйстве"><textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></FormField>

        <label className="checkbox-row">
          <input type="checkbox" checked={form.is_beekeeper} onChange={(e) => setForm({ ...form, is_beekeeper: e.target.checked })} />
          <span><strong>У меня есть пасека</strong><small>Пчеловодство — дополнительный признак профиля, а не отдельная роль.</small></span>
        </label>

        <FormField label="Радиус новостей, км">
          <select value={form.news_radius_km} onChange={(e) => setForm({ ...form, news_radius_km: Number(e.target.value) })}>
            {RADII.map((radius) => <option key={radius}>{radius}</option>)}
          </select>
        </FormField>
        <FormField label="Радиус предупреждений, км">
          <select value={form.broadcast_radius_km} onChange={(e) => setForm({ ...form, broadcast_radius_km: Number(e.target.value) })}>
            {RADII.map((radius) => <option key={radius}>{radius}</option>)}
          </select>
        </FormField>

        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить профиль'}</button>
        {message && <p className="form-message">{message}</p>}
      </form>

      {user.is_beekeeper && <ApiarySection user={user} />}

      <button type="button" className="secondary-button logout-button" onClick={onLogout}>Сменить пользователя</button>
    </section>
  )
}

function FieldsPage({ user }: { user: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [form, setForm] = useState<FieldCreate>({ name: '', crop: '', area_ha: 0, latitude: 54.9924, longitude: 73.3686 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function reload() {
    setLoading(true)
    try { setFields(await api.fields(user.id)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось загрузить поля') }
    finally { setLoading(false) }
  }

  useEffect(() => { void reload() }, [user.id])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.createField(user.id, form)
      setForm({ ...form, name: '', crop: '', area_ha: 0 })
      setMessage('Поле добавлено')
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось добавить поле')
    } finally { setSaving(false) }
  }

  function useGeolocation() {
    if (!navigator.geolocation) { setMessage('Геолокация не поддерживается'); return }
    setMessage('Определяем координаты…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude }))
        setMessage('Координаты определены')
      },
      () => setMessage('Не удалось определить геопозицию'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function replaceField(updated: AgroField) {
    setFields((current) => current.map((field) => (field.id === updated.id ? updated : field)))
  }

  return (
    <section className="fields-stage">
      <div className="section-heading"><div><span className="eyebrow">Рабочий дневник</span><h1>Мои поля</h1><p>Координаты, культура, севооборот и погода доступны с последнего успешного обновления.</p></div></div>

      <form className="form-card field-form" onSubmit={submit}>
        <h2>Добавить поле</h2>
        <div className="two-columns">
          <FormField label="Название"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Культура"><input required value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></FormField>
        </div>
        <FormField label="Площадь, га"><input type="number" min="0" step="0.1" value={form.area_ha ?? ''} onChange={(e) => setForm({ ...form, area_ha: e.target.value === '' ? null : Number(e.target.value) })} /></FormField>
        <div className="coordinate-row">
          <FormField label="Широта"><input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} /></FormField>
          <FormField label="Долгота"><input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} /></FormField>
        </div>
        <button type="button" className="secondary-button" onClick={useGeolocation}>⌖ Моя геопозиция</button>
        <OfflineMap latitude={form.latitude} longitude={form.longitude} />
        <button className="primary-button" type="submit" disabled={saving || !navigator.onLine}>{saving ? 'Сохраняем…' : navigator.onLine ? 'Добавить поле' : 'Добавление поля требует сети'}</button>
        {message && <p className="form-message">{message}</p>}
      </form>

      {loading ? <p>Загрузка полей…</p> : (
        <div className="field-list">
          {fields.map((field) => (
            <article className="field-card" key={field.id}>
              <div className="field-card-heading"><div><h2>{field.name}</h2><p>{field.crop} · {field.area_ha} га</p></div><span className="privacy-chip">{field.privacy_variant === 'B' ? 'Доступ по запросу' : 'Публично'}</span></div>
              <OfflineMap latitude={field.latitude} longitude={field.longitude} compact />
              <div className="coordinates">⌖ {field.latitude.toFixed(5)}, {field.longitude.toFixed(5)}</div>
              <WeatherPanel field={field} user={user} />
              <CropRotation field={field} user={user} />
            </article>
          ))}
        </div>
      )}

      <Stage4Panel user={user} fields={fields} onFieldChanged={replaceField} />
    </section>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}

function Avatar({ name, small = false, large = false }: { name: string; small?: boolean; large?: boolean }) {
  const initials = name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase()
  return <div className={`avatar ${small ? 'small' : ''} ${large ? 'large' : ''}`}>{initials}</div>
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
