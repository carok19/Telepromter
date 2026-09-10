// Operaciones mínimas sobre Realtime Database para la infraestructura de
// control remoto (F8). Estructura preparada: /sessions/{sessionId}.
//
// En F8.1 esto solo se usa para una sesión de PRUEBA (crear/leer/escribir/
// suscribirse), sin comandos reales de reproducción ni contenido de
// guiones — eso llega recién en F8.2+, reutilizando estas mismas funciones.
// No se sube ningún dato del usuario (ni título, ni guion, ni progreso).
import { get, onValue, ref, set } from 'firebase/database'
import { getFirebaseDatabase } from './firebase'

export interface RemoteTestSession {
  hostUid: string
  createdAt: number
  note: string
}

// crypto.randomUUID() (ya usado implícitamente por el navegador para otras
// APIs) da un identificador aleatorio no adivinable — a diferencia de un
// contador o un código corto, no sirve como clave de sesión real por fuerza
// bruta. Ver F8.6 para las reglas de seguridad definitivas.
export function generateSessionId(): string {
  return crypto.randomUUID()
}

function sessionPath(sessionId: string): string {
  return `sessions/${sessionId}`
}

export async function createTestSession(hostUid: string): Promise<string | null> {
  const db = getFirebaseDatabase()
  if (!db) return null
  const sessionId = generateSessionId()
  const session: RemoteTestSession = {
    hostUid,
    createdAt: Date.now(),
    note: 'F8.1 test session',
  }
  await set(ref(db, sessionPath(sessionId)), session)
  return sessionId
}

export async function readSession(sessionId: string): Promise<RemoteTestSession | null> {
  const db = getFirebaseDatabase()
  if (!db) return null
  const snapshot = await get(ref(db, sessionPath(sessionId)))
  return snapshot.exists() ? (snapshot.val() as RemoteTestSession) : null
}

export async function updateTestSession(sessionId: string, patch: Partial<RemoteTestSession>): Promise<void> {
  const db = getFirebaseDatabase()
  if (!db) return
  const current = await readSession(sessionId)
  await set(ref(db, sessionPath(sessionId)), { ...current, ...patch })
}

// Suscribe a los cambios de una sesión. Si Firebase no está configurado,
// notifica `null` una sola vez y devuelve un unsubscribe vacío.
export function subscribeToSession(
  sessionId: string,
  callback: (session: RemoteTestSession | null) => void,
): () => void {
  const db = getFirebaseDatabase()
  if (!db) {
    callback(null)
    return () => {}
  }
  const sessionRef = ref(db, sessionPath(sessionId))
  return onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as RemoteTestSession) : null)
  })
}
