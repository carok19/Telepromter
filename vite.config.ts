import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (no 'autoUpdate'): un service worker nuevo se instala pero
      // se queda "esperando" hasta que ALGUIEN llame a updateServiceWorker()
      // — nunca se activa ni recarga por su cuenta. Quién y cuándo decide
      // eso vive en src/hooks/usePwaUpdate.ts (F8.6): espera a que no haya
      // una lectura en curso, ni el editor con un guardado pendiente, ni
      // una sesión de control remoto activa, antes de aplicarlo solo.
      registerType: 'prompt',
      manifest: {
        name: 'Robress Teleprompter',
        short_name: 'Robress',
        description:
          'Teleprompter con control remoto y calibración para leer detrás de un vidrio reflectivo.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0c10',
        theme_color: '#0b0c10',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precachea todo el shell del build (JS/CSS/HTML/íconos/manifest):
        // como es una SPA de ruteo 100% cliente y todos los datos viven en
        // IndexedDB (guiones, perfiles de calibración), esto alcanza para
        // que TODAS las rutas funcionen sin conexión, sin necesitar
        // ninguna estrategia de runtime caching para navegación.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // A PROPÓSITO no hay ningún `runtimeCaching` acá: Supabase (las
        // llamadas RPC de control remoto y el websocket de Realtime) NUNCA
        // debe pasar por el service worker, ni cachearse. Sin una regla de
        // runtimeCaching que lo intercepte, esas peticiones simplemente
        // siguen de largo — el SW ni se entera. El websocket de Realtime,
        // aparte, ni siquiera es interceptable por un service worker (solo
        // intercepta eventos `fetch`). No agregar una regla de
        // runtimeCaching para *.supabase.co sin volver a leer este
        // comentario primero.
      },
    }),
  ],
})
