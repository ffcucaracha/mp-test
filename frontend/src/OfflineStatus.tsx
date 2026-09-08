import { useCallback, useEffect, useState } from 'react'

import { prepareFieldTrip, type FieldTripProgress } from './FieldTripPrep'
import { OfflineDraftsPanel } from './OfflineDraftsPanel'
import { getOutboxCount, syncOutbox } from './offline'
import './offline-tools.css'

export function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [tripProgress, setTripProgress] = useState<FieldTripProgress | null>(null)

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

  async function prepareTrip() {
    const rawUserId = localStorage.getItem('agroconnect.userId')
    const userId = rawUserId ? Number(rawUserId) : 0
    if (!userId || !navigator.onLine || preparing) return
    setPreparing(true)
    setMessage('')
    setTripProgress({ done: 0, total: 1, label: 'Готовим данные…' })
    try {
      const result = await prepareFieldTrip(userId, setTripProgress)
      setMessage(`К поездке готово: ${result.fields} полей, ${result.tiles} тайлов карты. Погода, севооборот, лента и предупреждения сохранены.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось подготовить данные к поездке.')
    } finally {
      setPreparing(false)
      setTripProgress(null)
    }
  }

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

  return (
    <>
      <div className="offline-tool-row">
        <button type="button" className="field-trip-button" onClick={() => void prepareTrip()} disabled={!online || preparing}>
          {preparing ? 'Готовим поездку…' : '🚜 Поехал в поля'}
        </button>
        <button type="button" className="drafts-button" onClick={() => setDraftsOpen(true)}>
          Черновики{pending > 0 ? ` · ${pending}` : ''}
        </button>
      </div>

      {tripProgress && (
        <div className="field-trip-progress" role="status">
          <span>{tripProgress.label}</span>
          <progress max={tripProgress.total} value={tripProgress.done} />
        </div>
      )}

      {(!online || pending > 0 || message) && (
        <div className={`offline-status ${online ? 'online' : 'offline'}`} role="status">
          <div>
            <strong>{online ? 'Связь доступна' : 'Нет интернета'}</strong>
            <span>{pending > 0 ? `${pending} ${pending === 1 ? 'действие ждёт' : 'действий ждут'} отправки` : 'Можно продолжать работать с сохранёнными данными'}</span>
            {message && <small>{message}</small>}
          </div>
          {online && pending > 0 && (
            <button type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? 'Синхронизация…' : 'Отправить сейчас'}</button>
          )}
        </div>
      )}

      <OfflineDraftsPanel open={draftsOpen} onClose={() => setDraftsOpen(false)} />
    </>
  )
}
