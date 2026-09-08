import { FormEvent, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import { enqueueMutation } from './offline'
import type { AgroField, AlertCreate, AlertItem, User } from './types'

function alertKind(item: AlertItem) {
  if (item.type === 'weather') return '❄️ Погода'
  if (item.type === 'disease') return '⚠️ Проблема'
  return '🐝 Пестициды'
}

function alertLocation(item: AlertItem) {
  if (item.type === 'pesticide') return `${item.field_name ? `Поле «${item.field_name}»` : 'Поле'} · ${item.distance_km ?? '?'} км от ${item.apiary_name ?? 'пасеки'}`
  return item.field_name ? `Поле «${item.field_name}»` : 'Локальное предупреждение'
}

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true
  return error instanceof Error && (error.message.includes('Нет связи') || error.message.includes('не ответил вовремя'))
}

export function AlertsPage({ currentUser }: { currentUser: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [ownerPreview, setOwnerPreview] = useState<User | null>(null)
  const [fieldId, setFieldId] = useState<number | null>(null)
  const [startsAt, setStartsAt] = useState('')
  const [details, setDetails] = useState('')
  const [radiusKm, setRadiusKm] = useState(currentUser.broadcast_radius_km)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedField = useMemo(() => fields.find((field) => field.id === fieldId) ?? null, [fieldId, fields])

  async function reloadAlerts() {
    try { setAlerts(await api.alerts(currentUser.id)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось загрузить предупреждения') }
  }

  useEffect(() => {
    Promise.all([api.fields(currentUser.id), api.alerts(currentUser.id)])
      .then(([fieldRows, alertRows]) => { setFields(fieldRows); setAlerts(alertRows); setFieldId((current) => current ?? fieldRows[0]?.id ?? null) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить события'))
  }, [currentUser.id])

  useEffect(() => {
    const synced = () => { if (navigator.onLine) void reloadAlerts() }
    window.addEventListener('agroconnect:sync-complete', synced)
    return () => window.removeEventListener('agroconnect:sync-complete', synced)
  }, [currentUser.id])

  function pesticidePayload(): AlertCreate | null {
    if (!selectedField) return null
    return {
      author_id: currentUser.id,
      field_id: selectedField.id,
      type: 'pesticide',
      latitude: selectedField.latitude,
      longitude: selectedField.longitude,
      radius_km: radiusKm,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      title: 'Планируется обработка пестицидами',
      details,
    }
  }

  async function queuePesticide(payload: AlertCreate) {
    await enqueueMutation('/api/alerts', 'POST', payload, `Срочно: обработка поля «${selectedField?.name ?? ''}»`, { kind: 'pesticide_alert', priority: 100 })
    setResult('Сохранено на устройстве. Пчеловоды ещё не уведомлены — предупреждение отправится с высоким приоритетом сразу после появления сети.')
    setDetails('')
  }

  async function createPesticideAlert(event: FormEvent) {
    event.preventDefault()
    const payload = pesticidePayload()
    if (!payload) return
    setSaving(true)
    setError('')
    setResult('')
    try {
      if (!navigator.onLine) { await queuePesticide(payload); return }
      const created = await api.createAlert(payload)
      setResult(`Предупреждение создано. Получателей: ${created.recipients}.`)
      setDetails('')
    } catch (err) {
      if (isNetworkError(err)) await queuePesticide(payload)
      else setError(err instanceof Error ? err.message : 'Не удалось создать предупреждение')
    } finally { setSaving(false) }
  }

  async function openAlert(item: AlertItem) {
    try {
      const updated = await api.openAlert(item.id, currentUser.id)
      setAlerts((current) => current.map((alert) => (alert.id === updated.id ? updated : alert)))
      window.dispatchEvent(new Event('agroconnect:alerts-changed'))
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось открыть предупреждение') }
  }

  async function showOwner(item: AlertItem) {
    try { setOwnerPreview(await api.alertOwner(item.id, currentUser.id)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось открыть владельца поля') }
  }

  return (
    <section className="alerts-page">
      <div className="section-heading"><div><h1>Предупреждения</h1><p>Погода, обработки полей рядом с пасекой и другие локальные события.</p></div></div>
      <form className="form-card alert-composer" onSubmit={createPesticideAlert}>
        <h2>Предупредить об обработке</h2>
        <p className="muted">Сообщение получат пасеки, попадающие одновременно в ваш радиус трансляции и их радиус интереса.</p>
        {fields.length === 0 ? <div className="empty-card">Сначала добавьте и синхронизируйте поле.</div> : <>
          <label className="form-field"><span>Поле</span><select value={fieldId ?? ''} onChange={(event) => setFieldId(Number(event.target.value))}>{fields.map((field) => <option key={field.id} value={field.id}>{field.name} · {field.crop}</option>)}</select></label>
          <div className="two-columns">
            <label className="form-field"><span>Дата и время обработки</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
            <label className="form-field"><span>Радиус трансляции</span><select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>{[25, 50, 100, 200].map((radius) => <option key={radius} value={radius}>{radius} км</option>)}</select></label>
          </div>
          <label className="form-field"><span>Комментарий</span><textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Например: обработка рапса, ориентировочно с 07:00 до 10:00" /></label>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : navigator.onLine ? 'Предупредить пасеки рядом' : 'Сохранить предупреждение офлайн'}</button>
        </>}
        {result && <div className="form-message">{result}</div>}
        {error && <div className="error-banner">{error}</div>}
      </form>

      <div className="alerts-list-section">
        <div className="section-heading compact-heading"><div><h2>Полученные предупреждения</h2><p>Последние загруженные предупреждения доступны и без сети.</p></div><button className="secondary-button compact-button" type="button" onClick={() => void reloadAlerts()}>Обновить</button></div>
        {alerts.length === 0 ? <div className="empty-card"><strong>Предупреждений пока нет</strong><p>Погодные риски и важные локальные события появятся здесь.</p></div> : <div className="alert-list">{alerts.map((item) => (
          <article className={`alert-card ${item.is_opened ? 'opened' : 'unread'}`} key={item.id}>
            <div className="alert-card-head"><div><span className="alert-kind">{alertKind(item)}</span><h3>{item.title}</h3><p>{alertLocation(item)}</p></div>{!item.is_opened && <span className="unread-dot" title="Не прочитано" />}</div>
            {item.starts_at && <p><strong>Когда:</strong> {new Date(item.starts_at).toLocaleString('ru-RU')}</p>}
            {item.details && <p>{item.details}</p>}
            <p className="muted">Автор: {item.author.name} · {item.author.farm_name || item.author.region}</p>
            <div className="alert-actions">{!item.is_opened && <button className="secondary-button compact-button" type="button" onClick={() => void openAlert(item)}>Отметить прочитанным</button>}{item.type !== 'weather' && <button className="primary-button compact-button" type="button" onClick={() => void showOwner(item)}>Связаться с владельцем поля</button>}</div>
          </article>
        ))}</div>}
      </div>

      {ownerPreview && <div className="owner-preview"><button type="button" className="owner-preview-close" onClick={() => setOwnerPreview(null)}>×</button><strong>{ownerPreview.name}</strong><span>{ownerPreview.farm_name || ownerPreview.region}</span><small>@{ownerPreview.username} · {ownerPreview.specialization}</small><p>{ownerPreview.bio}</p></div>}
    </section>
  )
}

export function AlertsBell({ user }: { user: User }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const load = () => { api.unreadAlerts(user.id).then((response) => setCount(response.count)).catch(() => setCount(0)) }
    load()
    window.addEventListener('agroconnect:alerts-changed', load)
    return () => window.removeEventListener('agroconnect:alerts-changed', load)
  }, [user.id])
  return <button className="alerts-bell" type="button" aria-label="Предупреждения" onClick={() => { window.location.hash = '#/alerts' }}><span>🔔</span>{count > 0 && <strong>{count > 9 ? '9+' : count}</strong>}</button>
}
