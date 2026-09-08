import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.agroconnect.mvp',
  appName: 'AgroConnect MVP',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
}

export default config
