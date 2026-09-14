import { Capacitor, registerPlugin } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './stage15.css'
import './field-visibility.css'
import './feedback.css'
import './ux-polish.css'

type NativeInstallPlugin = {
  getInstallInfo(): Promise<{ firstInstallTime: number; lastUpdateTime: number }>
}

const NativeInstall = registerPlugin<NativeInstallPlugin>('NativeInstall')
const NATIVE_INSTALL_KEY = 'agroconnect.nativeFirstInstallTime'
const USER_ID_KEY = 'agroconnect.userId'

async function resetUserAfterNativeReinstall() {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { firstInstallTime } = await NativeInstall.getInstallInfo()
    const currentInstall = String(firstInstallTime)
    const savedInstall = localStorage.getItem(NATIVE_INSTALL_KEY)

    if (savedInstall !== currentInstall) {
      localStorage.removeItem(USER_ID_KEY)
      localStorage.setItem(NATIVE_INSTALL_KEY, currentInstall)
    }
  } catch {
    // If native install metadata is unavailable, keep the existing session behavior.
  }
}

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

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

async function prepareNativeApp() {
  await resetUserAfterNativeReinstall()
  await cleanupNativePwaState()
}

void prepareNativeApp().finally(renderApp)
