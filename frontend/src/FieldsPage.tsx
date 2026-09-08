import { FormEvent, useEffect, useState } from 'react'

import { api } from './api'
import { CropRotation } from './CropRotation'
import {
  addLocalFieldDraft,
  enqueueMutation,
  getLocalFieldDrafts,
  removeLocalFieldDraft,
  type LocalFieldDraft,
} from './offline'
import { OfflineMap } from './OfflineMap'
import { Stage4Panel } from './Stage4Panel'
import type { AgroField, FieldCreate, User } from './types'
import { WeatherPanel } from './WeatherPanel'

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true
  return error instanceof Error && (error.message.includes('Нет связи') || error.message.includes('не ответил вовремя'))
}

export function FieldsPage({ user }: { user: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [pendingFields, setPendingFields] = useState<LocalFieldDraft[]>([])
  const [form, setForm] = useState<FieldCreate>({ name: '', crop: '', area_ha: 0, latitude: 54.9924, longitude: 73.3686 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function reload() {
    setLoading(true)
    try {
      const [serverFields, localFields] = await Promise.all([api.fields(user.id), getLocalFieldDrafts(user.id)])
      setFields(serverFields)
      setPendingFields(localFields)
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
    setForm((current) => ({ ...current, name: '', crop: '', area_ha: 0 }))
  }

  async function saveOfflineField() {
    const local = await addLocalFieldDraft(user.id, {
      name: form.name,
      crop: form.crop,
      latitude: form.latitude,
      longitude: form.longitude,
      area_ha: form.area_ha ?? null,
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
    setMessage(`Поле «${local.payload.name}» сохранено локально. Временный ID ${local.temp_id}; после синхронизации оно получит серверный ID.`)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
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
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : navigator.onLine ? 'Добавить поле' : 'Сохранить поле офлайн'}</button>
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
              <OfflineMap latitude={draft.payload.latitude} longitude={draft.payload.longitude} compact />
              <div className="coordinates">⌖ {draft.payload.latitude.toFixed(5)}, {draft.payload.longitude.toFixed(5)}</div>
              <p className="muted">Локальный ID: {draft.temp_id}. Погода, севооборот и приватность станут доступны после получения серверного ID.</p>
            </article>
          ))}
        </div>
      )}

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
