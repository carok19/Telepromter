// Operaciones sobre Realtime Database para el control remoto (F8).
// Estructura: /sessions/{sessionId} — ver database.rules.json para las
// reglas de seguridad asociadas a esta forma exacta de documento.
//
// F8.2 implementa el emparejamiento (creación de sesión + unión de un único
// remoto). Los comandos de reproducción (play/pause/seek/velocidad) llegan
// en F8.3+ reutilizando esta misma sesión, sin cambiar su forma base.
import { get, onDisconnect, onValue, ref, runTransaction, set } from 'firebase/database'
import { getFirebaseDatabase } from './firebase'

export type RemoteSessionStatus = 'waiting' | 'paired' | 'ended'

export interface RemoteSession {
  hostUid: string
  remoteUid: string | null
  // Distingue "hay un remoto emparejado" (remoteUid) de "ese remoto tiene
  // la pestaña abierta ahora mismo" (remoteConnected). Perder la conexión
  // NO libera el cupo de remoto — eso es intencional (ver "UN SOLO REMOTE"
  // en el pedido de F8.2); la reconexión/expiración avanzada queda para F8.5.
  remoteConnected: boolean
  createdAt: number
  expiresAt: number
  status: RemoteSessionStatus
  // Cosmético únicamente: nunca se sube el contenido del guion.
  scriptTitle: string
}

// Provisorio: dura lo que dura una sesión típica de lectura frente al
// vidrio. F8.5 revisará este valor y agregará limpieza real del lado del
// host para sesiones abandonadas.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000

// crypto.randomUUID() da un identificador aleatorio no adivinable — a
// diferencia de un contador o un código corto, no sirve como clave de
// sesión real por fuerza bruta.
export function generateSessionId(): string {
  return crypto.randomUUID()
}

function sessionPath(sessionId: string): string {
  return `sessions/${sessionId}`
}

export async function createSession(hostUid: string, scriptTitle: string): Promise<string | null> {
  const db = getFirebaseDatabase()
  if (!db) return null
  const sessionId = generateSessionId()
  const now = Date.now()
  const session: RemoteSession = {
    hostUid,
    remoteUid: null,
    remoteConnected: false,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    status: 'waiting',
    scriptTitle,
  }
  await set(ref(db, sessionPath(sessionId)), session)
  // Si el host pierde la conexión sin cerrar la sesión explícitamente
  // (cerrar la pestaña, perder la red), el servidor la marca como
  // finalizada por su cuenta — el remoto lo detecta vía subscribeToSession.
  onDisconnect(ref(db, `${sessionPath(sessionId)}/status`)).set('ended')
  return sessionId
}

// El host la llama al abandonar el Teleprompter (o explícitamente si en una
// fase futura se agrega un botón para eso). Idempotente: llamarla dos veces,
// o sobre una sesión que ya terminó, no falla.
export async function endSession(sessionId: string): Promise<void> {
  const db = getFirebaseDatabase()
  if (!db) return
  await set(ref(db, `${sessionPath(sessionId)}/status`), 'ended')
}

export async function getSession(sessionId: string): Promise<RemoteSession | null> {
  const db = getFirebaseDatabase()
  if (!db) return null
  const snapshot = await get(ref(db, sessionPath(sessionId)))
  return snapshot.exists() ? (snapshot.val() as RemoteSession) : null
}

export function subscribeToSession(
  sessionId: string,
  callback: (session: RemoteSession | null) => void,
): () => void {
  const db = getFirebaseDatabase()
  if (!db) {
    callback(null)
    return () => {}
  }
  const sessionRef = ref(db, sessionPath(sessionId))
  return onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as RemoteSession) : null)
  })
}

export type JoinSessionOutcome = 'joined' | 'not-found' | 'ended' | 'expired' | 'occupied' | 'error'

export interface JoinSessionResult {
  outcome: JoinSessionOutcome
  session: RemoteSession | null
}

// Intenta unirse como el remoto de una sesión.
//
// Un cliente "frío" (la primera vez que este dispositivo toca este path —
// que es SIEMPRE el caso para un remoto recién abierto) no tiene el valor
// cacheado localmente, y runTransaction invoca su función una única vez con
// `current = null` en ese caso, sin llegar a corroborar con el servidor si
// la función aborta ahí mismo — por eso se hace primero una lectura
// explícita (`get`): sirve tanto para devolver el motivo correcto de
// rechazo (no encontrada/expirada) como de valor base dentro de la
// transacción cuando esta arranca con `current === null`. La seguridad ante
// dos remotos uniéndose casi al mismo tiempo la sigue dando la propia
// transacción (comparar-y-escribir del lado del servidor, verificado con
// dos clientes reales contra el emulador), no esta lectura previa.
export async function joinSessionAsRemote(sessionId: string, remoteUid: string): Promise<JoinSessionResult> {
  const db = getFirebaseDatabase()
  if (!db) return { outcome: 'error', session: null }
  const sessionRef = ref(db, sessionPath(sessionId))
  try {
    const preCheck = await get(sessionRef)
    if (!preCheck.exists()) return { outcome: 'not-found', session: null }
    const existing = preCheck.val() as RemoteSession

    const { snapshot } = await runTransaction(sessionRef, (current: RemoteSession | null) => {
      const base = current ?? existing
      if (base.status === 'ended') return undefined
      if (base.expiresAt < Date.now()) return undefined
      if (base.remoteUid && base.remoteUid !== remoteUid) return undefined // ya ocupada por otro remoto
      // Disponible, o soy el mismo remoto reconectándose: reclamar/confirmar.
      return { ...base, remoteUid, remoteConnected: true, status: 'paired' as const }
    })

    const latest = snapshot.exists() ? (snapshot.val() as RemoteSession) : existing
    if (latest.status === 'ended') return { outcome: 'ended', session: latest }
    if (latest.expiresAt < Date.now()) return { outcome: 'expired', session: latest }
    if (latest.remoteUid !== remoteUid) return { outcome: 'occupied', session: latest }

    // Unión confirmada: si este remoto pierde la conexión, el host debe
    // poder notarlo sin que eso libere el cupo (ver comentario del campo
    // remoteConnected más arriba).
    onDisconnect(ref(db, `${sessionPath(sessionId)}/remoteConnected`)).set(false)
    return { outcome: 'joined', session: latest }
  } catch (err) {
    console.error('[remote] joinSessionAsRemote falló:', err)
    return { outcome: 'error', session: null }
  }
}
