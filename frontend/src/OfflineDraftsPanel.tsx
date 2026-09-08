import { useEffect, useMemo, useState } from 'react'

import { getOutbox, removeOutboxItem, updateOutboxBody, type OutboxItem } from './offline'

function editableKeys(item: OutboxItem) {
  if (!item.body || typeof item.body !== 'object' || Array.isArray(item.body)) return []
  return ['name', 'crop', 'year', 'text', 'details', 'starts_at', 'area_ha', 'radius_km'].filter((key) => key in (item.body as Record<string, unknown>))
}

export function OfflineDraftsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<OutboxItem[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [body, setBody] = useState<Record<string, unknown>>({})
  const [message, setMessage] = useState('')

  async function reload() {
    setItems(await getOutbox())
  }

  useEffect(() => {
    if (open) void reload()
    const changed = () => { if (open) void reload() }
    window.addEventListener('agroconnect:outbox-changed', changed)
    return () => window.removeEventListener('agroconnect:outbox-changed', changed)
  }, [open])

  const activeItem = useMemo(() => items.find((item) => item.id === editing) ?? null, [editing, items])

  function startEdit(item: OutboxItem) {
    if (!item.id || !item.body || typeof item.body !== 'object' || Array.isArray(item.body)) return
    setEditing(item.id)
    setBody({ ...(item.body as Record<string, unknown>) })
    setMessage('')
  }

  async function save() {
    if (!activeItem?.id) return
    await updateOutboxBody(activeItem.id, body)
    setEditing(null)
    setMessage('Черновик обновлён.')
    await reload()
  }

  async function remove(item: OutboxItem) {
    if (!item.id) return
    await removeOutboxItem(item.id)
    if (editing === item.id) setEditing(null)
    setMessage('Черновик удалён.')
    await reload()
  }

  if (!open) return null

  return (
    <div className="offline-drafts-backdrop" role="presentation" onClick={onClose}>
      <section className="offline-drafts-panel" role="dialog" aria-modal="true" aria-label="Неотправленные действия" onClick={(event) => event.stopPropagation()}>
        <div className="offline-drafts-head">
          <div><strong>Неотправленные действия</strong><span>{items.length} в очереди</span></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        {message && <p className="offline-drafts-message">{message}</p>}
        {items.length === 0 ? <div className="offline-drafts-empty">Очередь пуста.</div> : (
          <div className="offline-drafts-list">
            {items.map((item) => {
              const keys = editableKeys(item)
              const isEditing = item.id === editing
              return (
                <article className={`offline-draft-card ${item.priority > 0 ? 'priority' : ''}`} key={item.client_id}>
                  <div className="offline-draft-title">
                    <div><strong>{item.label}</strong><small>{new Date(item.created_at).toLocaleString('ru-RU')} · попыток: {item.attempts}</small></div>
                    {item.priority > 0 && <span>приоритет</span>}
                  </div>
                  {item.last_error && <p className="offline-draft-error">{item.last_error}</p>}
                  {isEditing ? (
                    <div className="offline-draft-editor">
                      {keys.map((key) => (
                        <label key={key}><span>{key}</span>
                          {key === 'text' || key === 'details' ? (
                            <textarea rows={3} value={String(body[key] ?? '')} onChange={(event) => setBody((current) => ({ ...current, [key]: event.target.value }))} />
                          ) : (
                            <input value={String(body[key] ?? '')} onChange={(event) => setBody((current) => ({ ...current, [key]: ['year', 'area_ha', 'radius_km'].includes(key) ? Number(event.target.value) : event.target.value }))} />
                          )}
                        </label>
                      ))}
                      <div className="offline-draft-actions"><button type="button" onClick={() => void save()}>Сохранить</button><button type="button" onClick={() => setEditing(null)}>Отмена</button></div>
                    </div>
                  ) : (
                    <div className="offline-draft-actions">
                      {keys.length > 0 && <button type="button" onClick={() => startEdit(item)}>Редактировать</button>}
                      <button type="button" className="danger" onClick={() => void remove(item)}>Удалить</button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
