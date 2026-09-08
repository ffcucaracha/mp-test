const DB_NAME = 'agroconnect-offline'
const DB_VERSION = 1
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type CacheEntry<T> = {
  key: string
  value: T
  cached_at: number
}

export type OutboxItem = {
  id?: number
  path: string
  method: string
  body: unknown
  label: string
  created_at: number
  attempts: number
  last_error?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const request = work(transaction.objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function putCacheEntry<T>(key: string, value: T): Promise<void> {
  await tx(CACHE_STORE, 'readwrite', (store) => store.put({ key, value, cached_at: Date.now() }))
}

export async function getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const result = await tx<CacheEntry<T> | undefined>(CACHE_STORE, 'readonly', (store) => store.get(key))
  return result ?? null
}

export async function enqueueMutation(path: string, method: string, body: unknown, label: string): Promise<number> {
  const id = await tx<IDBValidKey>(OUTBOX_STORE, 'readwrite', (store) => store.add({
    path,
    method,
    body,
    label,
    created_at: Date.now(),
    attempts: 0,
  }))
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
  return Number(id)
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const items = await tx<OutboxItem[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll())
  return items.sort((a, b) => a.created_at - b.created_at)
}

export async function getOutboxCount(): Promise<number> {
  return tx<number>(OUTBOX_STORE, 'readonly', (store) => store.count())
}

async function deleteOutboxItem(id: number): Promise<void> {
  await tx(OUTBOX_STORE, 'readwrite', (store) => store.delete(id))
}

async function updateOutboxItem(item: OutboxItem): Promise<void> {
  await tx(OUTBOX_STORE, 'readwrite', (store) => store.put(item))
}

export async function syncOutbox(): Promise<{ synced: number; pending: number }> {
  if (!navigator.onLine) return { synced: 0, pending: await getOutboxCount() }

  let synced = 0
  const items = await getOutbox()
  for (const item of items) {
    if (!item.id) continue
    try {
      const response = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      })
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          item.attempts += 1
          item.last_error = `HTTP ${response.status}`
          await updateOutboxItem(item)
          continue
        }
        break
      }
      await deleteOutboxItem(item.id)
      synced += 1
    } catch (error) {
      item.attempts += 1
      item.last_error = error instanceof Error ? error.message : 'network error'
      await updateOutboxItem(item)
      break
    }
  }

  const pending = await getOutboxCount()
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
  if (synced > 0) window.dispatchEvent(new CustomEvent('agroconnect:sync-complete', { detail: { synced } }))
  return { synced, pending }
}
