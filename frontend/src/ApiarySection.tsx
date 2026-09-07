import { FormEvent, useEffect, useState } from 'react'

import { api } from './api'
import type { Apiary, ApiaryCreate, User } from './types'

const APIARY_RADII = [10, 25, 50, 100, 200]

export function ApiarySection({ user }: { user: User }) {
  const [apiaries, setApiaries] = useState<Apiary[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [draft, setDraft] = useState<ApiaryCreate>({
    owner_id: user.id,
    name: 'Основная пасека',
    latitude: 54.9914,
    longitude: 73.3645,
    alert_radius_km: 50,
  })

  useEffect(() => {
    setDraft((current) => ({ ...current, owner_id: user.id }))
    api.apiaries(user.id)
      .then(setApiaries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить пасеки'))
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
        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }))
        setLocating(false)
      },
      () => {
        setError('Не удалось получить геопозицию. Координаты можно указать вручную.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const created = await api.createApiary(draft)
      setApiaries((current) => [...current, created])
      setDraft((current) => ({ ...current, name: 'Ещё одна пасека' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пасеку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="form-card apiary-section">
      <div className="section-heading compact-heading">
        <div>
          <h2>Пасеки</h2>
          <p>Координаты нужны, чтобы предупреждать об обработках полей рядом.</p>
        </div>
      </div>

      {apiaries.length > 0 && (
        <div className="apiary-list">
          {apiaries.map((apiary) => (
            <article className="apiary-card" key={apiary.id}>
              <strong>🐝 {apiary.name}</strong>
              <span>{apiary.latitude.toFixed(4)}, {apiary.longitude.toFixed(4)}</span>
              <small>Предупреждения в радиусе {apiary.alert_radius_km} км</small>
            </article>
          ))}
        </div>
      )}

      <form className="apiary-form" onSubmit={submit}>
        <h3>Добавить пасеку</h3>
        <label className="form-field">
          <span>Название</span>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label className="form-field">
          <span>Получать предупреждения об обработках в радиусе</span>
          <select
            value={draft.alert_radius_km}
            onChange={(event) => setDraft({ ...draft, alert_radius_km: Number(event.target.value) })}
          >
            {APIARY_RADII.map((radius) => <option key={radius} value={radius}>{radius} км</option>)}
          </select>
        </label>
        <button className="location-button" type="button" onClick={detectLocation} disabled={locating}>
          {locating ? 'Определяем…' : '⌖ Использовать мою геопозицию'}
        </button>
        <div className="two-columns">
          <label className="form-field">
            <span>Широта</span>
            <input type="number" step="0.000001" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: Number(event.target.value) })} required />
          </label>
          <label className="form-field">
            <span>Долгота</span>
            <input type="number" step="0.000001" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: Number(event.target.value) })} required />
          </label>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить пасеку'}</button>
      </form>
    </section>
  )
}
