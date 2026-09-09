import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// vite-plugin-pwa se instala en Fase 0 pero se configura recién en Fase 5
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
