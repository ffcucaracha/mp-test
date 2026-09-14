import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const output = resolve('dist/sw.js')

const source = `// Capacitor migration service worker.
// Native builds do not use PWA caching. This file exists only so Android
// installations upgraded from older builds can replace and unregister the
// previously installed Workbox service worker.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.includes('precache') || name.startsWith('workbox-'))
        .map((name) => caches.delete(name)),
    )

    await self.registration.unregister()

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await Promise.all(windows.map((client) => client.navigate(client.url)))
  })())
})
`

await mkdir(dirname(output), { recursive: true })
await writeFile(output, source, 'utf8')
console.log('Capacitor build: PWA disabled; legacy service-worker cleanup installed.')
