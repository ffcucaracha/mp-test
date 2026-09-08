import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'

import { AlertsBell, AlertsPage } from './AlertsPage'
import { api } from './api'
import { DashboardPage } from './DashboardPage'
import './features.css'
import './stage89.css'
import './stage10.css'
import './stage11.css'
import './offline.css'
import { FeedPage } from './FeedPage'
import { FieldsPage } from './FieldsPage'
import { NeighborsPage } from './NeighborsPage'
import { OfflineStatus } from './OfflineStatus'
import { ProfilePage } from './ProfilePage'
import type { User } from './types'

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
    window.location.hash = '#/today'
  }

  function logout() {
    localStorage.removeItem('agroconnect.userId')
    setSelectedUserId(null)
    window.location.hash = '#/today'
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
          <Route path="/today" element={<DashboardPage currentUser={currentUser} />} />
          <Route path="/feed" element={<FeedPage currentUser={currentUser} />} />
          <Route path="/fields" element={<FieldsPage user={currentUser} />} />
          <Route path="/neighbors" element={<NeighborsPage currentUser={currentUser} users={users} />} />
          <Route path="/alerts" element={<AlertsPage currentUser={currentUser} />} />
          <Route path="/profile" element={<ProfilePage user={currentUser} onSaved={replaceUser} onLogout={logout} />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      <nav className="bottom-nav dashboard-nav">
        <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}><span>☀</span>Сегодня</NavLink>
        <NavLink to="/feed" className={({ isActive }) => (isActive ? 'active' : '')}><span>⌂</span>Лента</NavLink>
        <NavLink to="/fields" className={({ isActive }) => (isActive ? 'active' : '')}><span>⌖</span>Поля</NavLink>
        <NavLink to="/neighbors" className={({ isActive }) => (isActive ? 'active' : '')}><span>◎</span>Соседи</NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}><span>○</span>Профиль</NavLink>
      </nav>
    </div>
  )
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const initials = name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase()
  return <div className={`avatar ${small ? 'small' : ''}`}>{initials}</div>
}
