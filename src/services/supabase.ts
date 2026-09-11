// Cliente de Supabase para el control remoto (F8). Reemplaza a
// src/services/firebase.ts — misma idea (inicialización perezosa,
// tolerante a fallos, nunca bloquea el resto de la app), backend distinto.
//
// Las credenciales de acá son las credenciales PÚBLICAS del proyecto (URL +
// publishable key): Supabase las diseña para ir en el bundle del cliente,
// igual que cualquier app que use Supabase — nunca son secretas. La
// seguridad real vive en las funciones SQL con SECURITY DEFINER y en RLS
// (ver supabase/remote_sessions.sql), no en ocultar estos dos valores. Acá
// nunca se usa ni se pide una clave "service_role" (esa sí es secreta).
//
// import.meta.env reemplaza estos valores si existen (por ejemplo,
// configurados en Vercel), pero el control remoto funciona igual sin
// ninguna variable de entorno configurada.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const FALLBACK_SUPABASE_URL = 'https://hntridtzjabrvnfxyiap.supabase.co'
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HMJ-J9KRmD9E4Lz-FrCciA_Ml2DNCUc'

let client: SupabaseClient | null = null
let initAttempted = false

function ensureInitialized(): boolean {
  if (initAttempted) return client !== null
  initAttempted = true
  const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return false
  try {
    client = createClient(url, key)
    return true
  } catch (err) {
    console.error('[remote] No se pudo inicializar Supabase:', err)
    client = null
    return false
  }
}

// true casi siempre (hay valores por defecto embebidos), pero se mantiene
// la función para que el resto del código no tenga que saber de dónde
// viene la configuración, y para degradar con gracia si createClient
// llegara a fallar (URL corrupta, etc.).
export function isRemoteControlConfigured(): boolean {
  return ensureInitialized()
}

export function getSupabaseClient(): SupabaseClient | null {
  return ensureInitialized() ? client : null
}
