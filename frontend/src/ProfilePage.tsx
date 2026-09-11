import { FormEvent, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import { ApiarySection } from './ApiarySection'
import { FeedbackSection } from './FeedbackSection'
import { GamificationCard } from './GamificationCard'
import type { User, UserUpdate } from './types'

const RADII = [25, 50, 100, 200]

export function ProfilePage({ user, onSaved, onLogout }: { user: User; onSaved: (user: User) => void; onLogout: () => void }) {
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

      <FeedbackSection userId={user.id} />

      <button type="button" className="secondary-button logout-button" onClick={onLogout}>Сменить пользователя</button>
    </section>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase()
  return <div className={`avatar ${large ? 'large' : ''}`}>{initials}</div>
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
