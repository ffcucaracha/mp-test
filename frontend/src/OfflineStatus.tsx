import { useCallback, useEffect, useState } from 'react'

import { OfflineDraftsPanel } from './OfflineDraftsPanel'
import { getOutboxCount, syncOutbox } from './offline'
import './offline-tools.css'

export function DraftsButton() {
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState(false)

  const refreshCount = useCallback(async () => {
    try { setPending(await getOutboxCount()) } catch { setPending(0) }
  }, [])

  useEffect(() => {
    void refreshCount()
    const handleChange = () => void refreshCount()
    window.addEventListener('agroconnect:outbox-changed', handleChange)
    window.addEventListener('agroconnect:sync-complete', handleChange)
    return () => {
      window.removeEventListener('agroconnect:outbox-changed', handleChange)
      window.removeEventListener('agroconnect:sync-complete', handleChange)
    }
  }, [refreshCount])

  return (
    <>
      <button type="button" className="topbar-icon-button drafts-topbar-button" aria-label={pending > 0 ? `Черновики, ожидают отправки: ${pending}` : 'Черновики'} onClick={() => setOpen(true)}>
        <span aria-hidden="true">📝</span>
        {pending > 0 && <span className="topbar-badge">{pending > 99 ? '99+' : pending}</span>}
      </button>
      <OfflineDraftsPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  const refreshCount = useCallback(async () => {
    try { setPending(await getOutboxCount()) } catch { setPending(0) }
  }, [])

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return
    setSyncing(true)
    setMessage('')
    try {
      const result = await syncOutbox()
      setPending(result.pending)
      if (result.synced > 0) setMessage(`Отправлено: ${result.synced}`)
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  useEffect(() => {
    void refreshCount()
    const handleOnline = () => { setOnline(true); void sync() }
    const handleOffline = () => setOnline(false)
    const handleOutbox = () => void refreshCount()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('agroconnect:outbox-changed', handleOutbox)
    const timer = window.setInterval(() => { if (navigator.onLine) void sync() }, 60_000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('agroconnect:outbox-changed', handleOutbox)
      window.clearInterval(timer)
    }
  }, [refreshCount, sync])

  if (online && pending === 0 && !message) return null

  return (
    <div className={`offline-status ${online ? 'online' : 'offline'}`} role="status">
      <div>
        <strong>{online ? 'Связь доступна' : 'Нет интернета'}</strong>
        <span>{pending > 0 ? `${pending} ${pending === 1 ? 'действие ждёт' : 'действий ждут'} отправки` : 'Можно продолжать работать с сохранёнными данными'}</span>
        {message && <small>{message}</small>}
      </div>
      {online && pending > 0 && <button type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? 'Синхронизация…' : 'Отправить сейчас'}</button>}
    </div>
  )
}
