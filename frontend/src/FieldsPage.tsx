import { FormEvent, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import { CropRotation } from './CropRotation'
import { FieldPolygonEditor } from './FieldPolygonEditor'
import { polygonAreaHa, polygonCentroid, polygonOpenRing } from './fieldGeometry'
import {
  addLocalFieldDraft,
  enqueueMutation,
  getLocalFieldDrafts,
  removeLocalFieldDraft,
  type LocalFieldDraft,
} from './offline'
import { OfflineMap } from './OfflineMap'
import { Stage4Panel } from './Stage4Panel'
import type { AgroField, FieldCreate, GeoJsonPolygon, User } from './types'
import { WeatherPanel } from './WeatherPanel'

const DEFAULT_CENTER = { latitude: 54.9924, longitude: 73.3686 }

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true
  return error instanceof Error && (error.message.includes('Нет связи') || error.message.includes('не ответил вовремя'))
}

function emptyField(center = DEFAULT_CENTER): FieldCreate {
  return {
    name: '',
    crop: '',
    area_ha: null,
    latitude: center.latitude,
    longitude: center.longitude,
    geometry: null,
  }
}

export function FieldsPage({ user }: { user: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [pendingFields, setPendingFields] = useState<LocalFieldDraft[]>([])
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [form, setForm] = useState<FieldCreate>(() => emptyField())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const polygonPoints = polygonOpenRing(form.geometry)
  const canSave = polygonPoints.length >= 3 && Boolean(form.name.trim()) && Boolean(form.crop.trim())

  const farmMapCenter = useMemo(() => {
    if (!fields.length) return mapCenter
    return {
      latitude: fields.reduce((sum, field) => sum + field.latitude, 0) / fields.length,
      longitude: fields.reduce((sum, field) => sum + field.longitude, 0) / fields.length,
    }
  }, [fields, mapCenter])

  async function reload() {
    setLoading(true)
    try {
      const [serverFields, localFields] = await Promise.all([api.fields(user.id), getLocalFieldDrafts(user.id)])
      setFields(serverFields)
      setPendingFields(localFields)
      if (serverFields.length > 0) {
        setMapCenter({ latitude: serverFields[0].latitude, longitude: serverFields[0].longitude })
      }
    } catch (error) {
      try { setPendingFields(await getLocalFieldDrafts(user.id)) } catch { /* keep current drafts */ }
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить поля')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [user.id])
  useEffect(() => {
    const synced = () => void reload()
    window.addEventListener('agroconnect:sync-complete', synced)
    return () => window.removeEventListener('agroconnect:sync-complete', synced)
  }, [user.id])

  function resetForm() {
    setForm(emptyField(mapCenter))
  }

  function changeGeometry(geometry: GeoJsonPolygon | null) {
    if (!geometry) {
      setForm((current) => ({ ...current, geometry: null, area_ha: null }))
      return
    }
    const points = polygonOpenRing(geometry)
    if (points.length < 3) {
      setForm((current) => ({ ...current, geometry, area_ha: null }))
      return
    }
    const centroid = polygonCentroid(geometry)
    const area = polygonAreaHa(geometry)
    setForm((current) => ({
      ...current,
      geometry,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      area_ha: area,
    }))
  }

  async function saveOfflineField() {
    if (!form.geometry || polygonOpenRing(form.geometry).length < 3) throw new Error('Нарисуйте границу поля минимум по трём точкам')
    const local = await addLocalFieldDraft(user.id, {
      name: form.name,
      crop: form.crop,
      latitude: form.latitude,
      longitude: form.longitude,
      area_ha: form.area_ha ?? null,
      geometry: form.geometry,
    })
    try {
      await enqueueMutation(
        `/api/users/${user.id}/fields`,
        'POST',
        form,
        `Новое поле: ${form.name}`,
        { kind: 'field_create', localRef: local.local_ref },
      )
    } catch (error) {
      await removeLocalFieldDraft(local.local_ref).catch(() => undefined)
      throw error
    }
    setPendingFields(await getLocalFieldDrafts(user.id))
    resetForm()
    setMessage(`Поле «${local.payload.name}» сохранено локально. После синхронизации оно получит серверный ID.`)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.geometry || polygonOpenRing(form.geometry).length < 3) {
      setMessage('Нарисуйте границу поля минимум по трём точкам')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if (!navigator.onLine) {
        await saveOfflineField()
        return
      }
      await api.createField(user.id, form)
      resetForm()
      setMessage('Поле добавлено')
      await reload()
    } catch (error) {
      if (isNetworkError(error)) {
        try { await saveOfflineField() }
        catch (queueError) { setMessage(queueError instanceof Error ? queueError.message : 'Не удалось сохранить поле офлайн') }
      } else {
        setMessage(error instanceof Error ? error.message : 'Не удалось добавить поле')
      }
    } finally {
      setSaving(false)
    }
  }

  function useGeolocation() {
    if (!navigator.geolocation) { setMessage('Геолокация не поддерживается'); return }
    setMessage('Определяем координаты…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        setMapCenter(center)
        setForm((current) => current.geometry ? current : { ...current, latitude: center.latitude, longitude: center.longitude })
        setMessage('Карта перемещена к вашей геопозиции')
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
      <div className="section-heading"><div><span className="eyebrow">Рабочий дневник</span><h1>Мои поля</h1><p>Границы полей хранятся как полигоны; по ним автоматически считаются центр и площадь.</p></div></div>

      {fields.length > 0 && (
        <section className="form-card farm-fields-map-card">
          <div className="field-card-heading">
            <div><h2>Карта моих полей</h2><p>{fields.length} полей · контуры хозяйства</p></div>
          </div>
          <OfflineMap
            latitude={farmMapCenter.latitude}
            longitude={farmMapCenter.longitude}
            zoom={11}
            polygons={fields.map((field) => ({ geometry: field.geometry, label: field.name }))}
          />
        </section>
      )}

      <form className="form-card field-form" onSubmit={submit}>
        <h2>Добавить поле</h2>
        <div className="two-columns">
          <FormField label="Название"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Культура"><input required value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></FormField>
        </div>
        <button type="button" className="secondary-button" onClick={useGeolocation}>⌖ Переместить карту к моей геопозиции</button>
        <FieldPolygonEditor
          centerLatitude={mapCenter.latitude}
          centerLongitude={mapCenter.longitude}
          geometry={form.geometry}
          onChange={changeGeometry}
        />
        <div className="field-geometry-summary">
          <span><strong>{polygonPoints.length}</strong> вершин</span>
          <span><strong>{form.area_ha ?? '—'}</strong> га</span>
          {polygonPoints.length >= 3 && <span>центр {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</span>}
        </div>
        <p className="muted">Площадь рассчитывается автоматически по нарисованному контуру. Отдельно вводить координаты и гектары не нужно.</p>
        <button className="primary-button" type="submit" disabled={saving || !canSave}>{saving ? 'Сохраняем…' : navigator.onLine ? 'Добавить поле' : 'Сохранить поле офлайн'}</button>
        {message && <p className="form-message">{message}</p>}
      </form>

      {pendingFields.length > 0 && (
        <div className="field-list">
          {pendingFields.map((draft) => (
            <article className="field-card pending-field-card" key={draft.local_ref}>
              <div className="field-card-heading">
                <div><h2>{draft.payload.name}</h2><p>{draft.payload.crop} · {draft.payload.area_ha ?? '—'} га</p></div>
                <span className="privacy-chip">Ждёт синхронизации</span>
              </div>
              <OfflineMap latitude={draft.payload.latitude} longitude={draft.payload.longitude} polygon={draft.payload.geometry} compact />
              <p className="muted">Контур сохранён локально. Погода, севооборот и приватность станут доступны после получения серверного ID.</p>
            </article>
          ))}
        </div>
      )}

      {loading ? <p>Загрузка полей…</p> : (
        <div className="field-list">
          {fields.map((field) => (
            <article className="field-card" key={field.id}>
              <div className="field-card-heading"><div><h2>{field.name}</h2><p>{field.crop} · {field.area_ha ?? '—'} га</p></div><span className="privacy-chip">{field.privacy_variant === 'B' ? 'Доступ по запросу' : 'Публично'}</span></div>
              <OfflineMap latitude={field.latitude} longitude={field.longitude} polygon={field.geometry} compact />
              <div className="coordinates">Центр: {field.latitude.toFixed(5)}, {field.longitude.toFixed(5)}</div>
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
