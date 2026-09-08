import { FormEvent, useEffect, useState } from 'react'

import { api } from './api'
import { enqueueMutation } from './offline'
import type { AgroField, CropSeason, User } from './types'

function optimisticSeason(fieldId: number, year: number, crop: string): CropSeason {
  return { id: -Date.now(), field_id: fieldId, year, crop, created_at: new Date().toISOString() }
}

export function CropRotation({ field, user }: { field: AgroField; user: User }) {
  const [seasons, setSeasons] = useState<CropSeason[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [crop, setCrop] = useState(field.crop)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setLoading(true)
    api.cropSeasons(field.id, user.id)
      .then(setSeasons)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить севооборот'))
      .finally(() => setLoading(false))
  }, [field.id, user.id])

  useEffect(() => {
    const synced = () => {
      if (!navigator.onLine) return
      api.cropSeasons(field.id, user.id).then(setSeasons).catch(() => undefined)
    }
    window.addEventListener('agroconnect:sync-complete', synced)
    return () => window.removeEventListener('agroconnect:sync-complete', synced)
  }, [field.id, user.id])

  function applyOptimistic() {
    const updated = optimisticSeason(field.id, year, crop)
    setSeasons((current) => [...current.filter((item) => item.year !== year), updated].sort((a, b) => b.year - a.year))
  }

  async function queueSeason() {
    await enqueueMutation(
      `/api/fields/${field.id}/crop-seasons`,
      'POST',
      { user_id: user.id, year, crop },
      `Севооборот: ${field.name}, ${year}`,
      { kind: 'crop_season', dedupeKey: `crop-season:${field.id}:${year}` },
    )
    applyOptimistic()
    setNotice('Сохранено на устройстве. Отправим при появлении сети.')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (field.id < 0) {
      setError('Сначала нужно синхронизировать новое поле.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (!navigator.onLine) {
        await queueSeason()
        return
      }
      const updated = await api.addCropSeason(field.id, user.id, year, crop)
      setSeasons((current) => [...current.filter((item) => item.year !== updated.year), updated].sort((a, b) => b.year - a.year))
    } catch (err) {
      if (!navigator.onLine || (err instanceof Error && err.message.includes('Нет связи'))) {
        await queueSeason()
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить сезон')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="crop-rotation">
      <div className="crop-rotation-title"><strong>Севооборот</strong><small>История культур по годам</small></div>
      {loading ? <small className="muted">Загрузка…</small> : seasons.length === 0 ? <small className="muted">История пока не заполнена.</small> : (
        <div className="crop-timeline">
          {seasons.map((season) => (
            <div className="crop-season" key={season.id}><span>{season.year}</span><strong>{season.crop}</strong>{season.id < 0 && <small>ждёт отправки</small>}</div>
          ))}
        </div>
      )}
      <form className="crop-season-form" onSubmit={submit}>
        <input aria-label="Год сезона" type="number" min="1990" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} required />
        <input aria-label="Культура сезона" value={crop} onChange={(event) => setCrop(event.target.value)} placeholder="Культура" required />
        <button className="secondary-button compact-button" type="submit" disabled={saving || field.id < 0}>{saving ? 'Сохраняем…' : navigator.onLine ? 'Добавить год' : 'Сохранить офлайн'}</button>
      </form>
      {notice && <small className="form-message">{notice}</small>}
      {error && <small className="form-error">{error}</small>}
    </div>
  )
}
