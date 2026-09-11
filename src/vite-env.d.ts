/// <reference types="vite/client" />

// Variables de entorno del control remoto (F8), sobre Supabase. Ambas
// opcionales: `src/services/supabase.ts` ya trae valores públicos por
// defecto embebidos en el código si faltan.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
