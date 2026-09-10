// Operaciones sobre Realtime Database para el control remoto (F8).
// Estructura: /sessions/{sessionId} — ver database.rules.json para las
// reglas de seguridad asociadas a esta forma exacta de documento.
//
// F8.2 implementa el emparejamiento (creación de sesión + unión de un único
// remoto). F8.3 agrega comandos discretos de reproducción (play/pause/
// toggle/reset) y el snapshot de estado host→remoto, reutilizando esta
// misma sesión sin cambiar su forma base. Velocidad/seek llegan en F8.4.
import { get, onDisconnect, onValue, ref, runTransaction, set } from 'firebase/database'
import type { TeleprompterStatus } from '../engine/teleprompterEngine'
import { getFirebaseDatabase } from './firebase'

export type RemoteSessionStatus = 'waiting' | 'paired' | 'ended'

export type RemoteCommandType = 'play' | 'pause' | 'toggle' | 'reset'

export interface RemoteCommand {
  type: RemoteCommandType
  // Único por cada envío (incluso si dos pulsaciones seguidas son del mismo
  // tipo) — así el host puede distinguir "comando nuevo" de "mismo nodo
  // reenviado", ver processCommand más abajo.
  commandId: string
  issuedAt: number
}

// Snapshot de solo lectura para el remoto: nunca incluye posición en
// píxeles, geometría ni nada dependiente del tamaño de pantalla del host.
export interface RemotePlayback {
  engineStatus: TeleprompterStatus
  // Normalizado 0 (inicio) a 1 (final) — nunca positionPx/totalPx.
  progress: number
  wpm: number
  pausedByMarker: boolean
  updatedAt: number
}

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
  // Escrito solo por el remoto emparejado (ver database.rules.json).
  command?: RemoteCommand | null
  // Escrito solo por el host (ver database.rules.json).
  playback?: RemotePlayback | null
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

// Llamada por el REMOTO. Escribe un comando discreto — nunca posición de
// scroll ni nada por el estilo. Cada llamada genera un commandId nuevo
// (incluso para el mismo `type` dos veces seguidas), así el host siempre
// puede distinguir dos pulsaciones de una sola escritura reenviada.
export async function sendCommand(sessionId: string, type: RemoteCommandType): Promise<void> {
  const db = getFirebaseDatabase()
  if (!db) return
  const command: RemoteCommand = {
    type,
    commandId: crypto.randomUUID(),
    issuedAt: Date.now(),
  }
  await set(ref(db, `${sessionPath(sessionId)}/command`), command)
}

// Llamada por el HOST. TeleprompterPage arma este objeto a partir del
// snapshot que ya expone playerStore/TeleprompterEngine, con su propio
// throttle (ver comentario en TeleprompterPage) — esta función solo hace la
// escritura, no decide cuándo llamarla.
export async function publishPlayback(sessionId: string, playback: RemotePlayback): Promise<void> {
  const db = getFirebaseDatabase()
  if (!db) return
  await set(ref(db, `${sessionPath(sessionId)}/playback`), playback)
}

// `.info/connected` es un path especial de RTDB que refleja si ESTE cliente
// tiene conexión activa con el servidor — se usa en RemoteControlPage para
// mostrar "Conexión perdida" sin desmontar la página ni cerrar la sesión.
export function subscribeToConnectivity(callback: (connected: boolean) => void): () => void {
  const db = getFirebaseDatabase()
  if (!db) {
    callback(false)
    return () => {}
  }
  return onValue(ref(db, '.info/connected'), (snapshot) => {
    callback(snapshot.val() === true)
  })
}
