import { FormEvent, useEffect, useState } from 'react'

import { api } from './api'
import type { AgroField, CropSeason, User } from './types'

export function CropRotation({ field, user }: { field: AgroField; user: User }) {
  const [seasons, setSeasons] = useState<CropSeason[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [crop, setCrop] = useState(field.crop)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.cropSeasons(field.id, user.id)
      .then(setSeasons)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить севооборот'))
      .finally(() => setLoading(false))
  }, [field.id, user.id])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await api.addCropSeason(field.id, user.id, year, crop)
      setSeasons((current) => {
        const next = current.filter((item) => item.year !== updated.year)
        return [...next, updated].sort((a, b) => b.year - a.year)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить сезон')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="crop-rotation">
      <div className="crop-rotation-title">
        <strong>Севооборот</strong>
        <small>История культур по годам</small>
      </div>

      {loading ? <small className="muted">Загрузка…</small> : seasons.length === 0 ? (
        <small className="muted">История пока не заполнена.</small>
      ) : (
        <div className="crop-timeline">
          {seasons.map((season) => (
            <div className="crop-season" key={season.id}>
              <span>{season.year}</span>
              <strong>{season.crop}</strong>
            </div>
          ))}
        </div>
      )}

      <form className="crop-season-form" onSubmit={submit}>
        <input
          aria-label="Год сезона"
          type="number"
          min="1990"
          max="2100"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          required
        />
        <input
          aria-label="Культура сезона"
          value={crop}
          onChange={(event) => setCrop(event.target.value)}
          placeholder="Культура"
          required
        />
        <button className="secondary-button compact-button" type="submit" disabled={saving}>
          {saving ? 'Сохраняем…' : 'Добавить год'}
        </button>
      </form>
      {error && <small className="form-error">{error}</small>}
    </div>
  )
}
