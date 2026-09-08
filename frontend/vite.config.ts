import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-field-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 180,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'AgroConnect MVP',
        short_name: 'AgroConnect',
        description: 'Мобильная сеть для фермеров',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: []
      }
    })
  ]
})
