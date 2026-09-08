import { Capacitor, registerPlugin } from '@capacitor/core'

const DB_NAME = 'agroconnect-offline'
const DB_VERSION = 2
const CACHE_STORE = 'cache'
const OUTBOX_STORE = 'outbox'
const LOCAL_FIELDS_STORE = 'local-fields'
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type CacheEntry<T> = {
  key: string
  value: T
  cached_at: number
}

export type OutboxKind = 'post' | 'reaction' | 'comment' | 'crop_season' | 'field_create' | 'pesticide_alert' | 'generic'

export type OutboxItem = {
  id?: number
  client_id: string
  path: string
  method: string
  body: unknown
  label: string
  kind: OutboxKind
  priority: number
  dedupe_key?: string
  local_ref?: string
  created_at: number
  attempts: number
  last_error?: string
}

export type EnqueueOptions = {
  kind?: OutboxKind
  priority?: number
  dedupeKey?: string
  localRef?: string
}

export type LocalFieldDraft = {
  local_ref: string
  temp_id: number
  user_id: number
  payload: {
    name: string
    crop: string
    latitude: number
    longitude: number
    area_ha: number | null
    rotation?: string
    privacy_variant?: 'A' | 'B'
  }
  created_at: number
}

type NativeOutboxPlugin = {
  upsert(options: { itemJson: string }): Promise<void>
  remove(options: { clientId: string }): Promise<void>
  consumeCompleted(): Promise<{ clientIds: string[] }>
}

const NativeOutbox = registerPlugin<NativeOutboxPlugin>('NativeOutbox')

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(LOCAL_FIELDS_STORE)) db.createObjectStore(LOCAL_FIELDS_STORE, { keyPath: 'local_ref' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = run(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function mirrorNative(item: OutboxItem) {
  if (!Capacitor.isNativePlatform()) return
  try {
    await NativeOutbox.upsert({ itemJson: JSON.stringify({ ...item, url: `${API_URL}${item.path}` }) })
  } catch {
    // The native bridge is injected only into Android builds. Web/PWA keeps working without it.
  }
}

async function removeNative(clientId: string) {
  if (!Capacitor.isNativePlatform()) return
  try { await NativeOutbox.remove({ clientId }) } catch { /* best effort */ }
}

export async function putCacheEntry<T>(key: string, value: T): Promise<void> {
  await tx(CACHE_STORE, 'readwrite', (store) => store.put({ key, value, cached_at: Date.now() }) as IDBRequest<IDBValidKey>)
}

export async function getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const result = await tx<CacheEntry<T> | undefined>(CACHE_STORE, 'readonly', (store) => store.get(key))
  return result ?? null
}

export async function enqueueMutation(
  path: string,
  method: string,
  body: unknown,
  label: string,
  options: EnqueueOptions = {},
): Promise<number> {
  const existing = options.dedupeKey
    ? (await getOutbox()).find((item) => item.dedupe_key === options.dedupeKey)
    : undefined

  if (existing?.id) {
    const updated: OutboxItem = {
      ...existing,
      body,
      label,
      kind: options.kind ?? existing.kind,
      priority: options.priority ?? existing.priority,
      local_ref: options.localRef ?? existing.local_ref,
      attempts: 0,
      last_error: undefined,
    }
    await putOutboxItem(updated)
    await mirrorNative(updated)
    window.dispatchEvent(new Event('agroconnect:outbox-changed'))
    return existing.id
  }

  const item: OutboxItem = {
    client_id: randomId(),
    path,
    method,
    body,
    label,
    kind: options.kind ?? 'generic',
    priority: options.priority ?? 0,
    dedupe_key: options.dedupeKey,
    local_ref: options.localRef,
    created_at: Date.now(),
    attempts: 0,
  }
  const id = Number(await tx(OUTBOX_STORE, 'readwrite', (store) => store.add(item) as IDBRequest<IDBValidKey>))
  const stored = { ...item, id }
  await mirrorNative(stored)
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
  return id
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const items = await tx<OutboxItem[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll())
  return items.sort((a, b) => (b.priority - a.priority) || (a.created_at - b.created_at))
}

export async function getOutboxCount(): Promise<number> {
  return tx<number>(OUTBOX_STORE, 'readonly', (store) => store.count())
}

export async function removeOutboxItem(id: number): Promise<void> {
  const item = (await getOutbox()).find((row) => row.id === id)
  await tx(OUTBOX_STORE, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
  if (item) {
    await removeNative(item.client_id)
    if (item.kind === 'field_create' && item.local_ref) await removeLocalFieldDraft(item.local_ref)
  }
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
}

export async function updateOutboxBody(id: number, body: unknown, label?: string): Promise<void> {
  const item = (await getOutbox()).find((row) => row.id === id)
  if (!item) throw new Error('Черновик не найден')
  const updated: OutboxItem = { ...item, body, label: label ?? item.label, attempts: 0, last_error: undefined }
  await putOutboxItem(updated)
  await mirrorNative(updated)
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
}

async function putOutboxItem(item: OutboxItem): Promise<void> {
  await tx(OUTBOX_STORE, 'readwrite', (store) => store.put(item) as IDBRequest<IDBValidKey>)
}

async function deleteOutboxItem(id: number): Promise<void> {
  await tx(OUTBOX_STORE, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

export async function addLocalFieldDraft(userId: number, payload: LocalFieldDraft['payload']): Promise<LocalFieldDraft> {
  const localRef = randomId()
  const draft: LocalFieldDraft = {
    local_ref: localRef,
    temp_id: -Date.now(),
    user_id: userId,
    payload,
    created_at: Date.now(),
  }
  await tx(LOCAL_FIELDS_STORE, 'readwrite', (store) => store.put(draft) as IDBRequest<IDBValidKey>)
  return draft
}

export async function getLocalFieldDrafts(userId: number): Promise<LocalFieldDraft[]> {
  const rows = await tx<LocalFieldDraft[]>(LOCAL_FIELDS_STORE, 'readonly', (store) => store.getAll())
  return rows.filter((row) => row.user_id === userId).sort((a, b) => a.created_at - b.created_at)
}

export async function removeLocalFieldDraft(localRef: string): Promise<void> {
  await tx(LOCAL_FIELDS_STORE, 'readwrite', (store) => store.delete(localRef) as IDBRequest<undefined>)
}

async function reconcileNativeCompletions() {
  if (!Capacitor.isNativePlatform()) return 0
  let clientIds: string[] = []
  try { clientIds = (await NativeOutbox.consumeCompleted()).clientIds ?? [] } catch { return 0 }
  if (clientIds.length === 0) return 0
  const items = await getOutbox()
  let reconciled = 0
  for (const item of items) {
    if (!item.id || !clientIds.includes(item.client_id)) continue
    await deleteOutboxItem(item.id)
    if (item.kind === 'field_create' && item.local_ref) await removeLocalFieldDraft(item.local_ref)
    reconciled += 1
  }
  if (reconciled > 0) window.dispatchEvent(new Event('agroconnect:outbox-changed'))
  return reconciled
}

export async function syncOutbox(): Promise<{ synced: number; pending: number }> {
  const reconciled = await reconcileNativeCompletions()
  if (!navigator.onLine) return { synced: reconciled, pending: await getOutboxCount() }

  const items = await getOutbox()
  let synced = reconciled
  for (const item of items) {
    if (!item.id) continue
    try {
      const response = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers: { 'Content-Type': 'application/json', 'X-AgroConnect-Operation': item.client_id },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      })
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 408 || response.status === 429
        const updated = { ...item, attempts: item.attempts + 1, last_error: `${response.status} ${response.statusText}` }
        await putOutboxItem(updated)
        await mirrorNative(updated)
        if (retryable) break
        continue
      }
      await deleteOutboxItem(item.id)
      await removeNative(item.client_id)
      if (item.kind === 'field_create' && item.local_ref) await removeLocalFieldDraft(item.local_ref)
      synced += 1
    } catch (error) {
      const updated = {
        ...item,
        attempts: item.attempts + 1,
        last_error: error instanceof Error ? error.message : 'Ошибка сети',
      }
      await putOutboxItem(updated)
      await mirrorNative(updated)
      break
    }
  }

  const pending = await getOutboxCount()
  window.dispatchEvent(new Event('agroconnect:outbox-changed'))
  if (synced > 0) window.dispatchEvent(new Event('agroconnect:sync-complete'))
  return { synced, pending }
}
