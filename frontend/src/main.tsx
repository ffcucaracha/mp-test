import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './stage15.css'
import './field-visibility.css'
import './feedback.css'
import './ux-polish.css'

async function cleanupNativePwaState() {
  if (!Capacitor.isNativePlatform()) return

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    } catch {
      // Best effort: the native application does not rely on a service worker.
    }
  }

  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => name.includes('precache') || name.startsWith('workbox-'))
          .map((name) => caches.delete(name)),
      )
    } catch {
      // Keep application startup working even if WebView cache APIs are unavailable.
    }
  }
}

void cleanupNativePwaState()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
