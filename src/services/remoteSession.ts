// Control remoto (F8) sobre Supabase Realtime + un puñado de funciones SQL.
// Reemplaza la implementación anterior sobre Firebase — misma forma
// pública (mismos nombres/firmas de función que ya consumen
// TeleprompterPage/RemoteControlPage/PairingModal a través de
// remoteStore.ts), backend distinto por completo.
//
// Arquitectura:
//   - La existencia/expiración/único-remoto de una sesión vive en la tabla
//     remote_sessions (ver supabase/remote_sessions.sql), pero NUNCA se
//     accede a ella directamente: todo pasa por 4 funciones SQL
//     (create_remote_session / get_remote_session / join_remote_session /
//     end_remote_session) llamadas con supabase.rpc(). La tabla tiene RLS
//     habilitado y SIN políticas — el acceso directo está bloqueado del
//     todo, a propósito.
//   - Los comandos (remoto→host) y el snapshot de reproducción
//     (host→remoto) viajan por Broadcast de Realtime, nunca por la tabla.
//   - "Remoto conectado" se deriva de Presence — quién está trackeado en el
//     canal ahora mismo — separado de "quién tiene el cupo" (remote_uid en
//     la tabla, que persiste aunque el remoto pierda la conexión un
//     instante).
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { TeleprompterStatus } from '../engine/teleprompterEngine'
import { getSupabaseClient } from './supabase'

export type RemoteSessionStatus = 'waiting' | 'paired' | 'ended'

export type RemoteCommandType = 'play' | 'pause' | 'toggle' | 'reset'

export interface RemoteCommand {
  type: RemoteCommandType
  // Único por cada envío (incluso si dos pulsaciones seguidas son del mismo
  // tipo) — así el host puede distinguir "comando nuevo" de una
  // notificación repetida del mismo mensaje.
  commandId: string
  issuedAt: number
  // Id del remoto que lo mandó. El host lo compara contra el remoto
  // actualmente registrado (por Presence) y descarta cualquier comando que
  // no coincida — así un tercero que de algún modo llegue a este canal no
  // puede inyectar comandos.
  senderId: string
}

// Snapshot de solo lectura para el remoto: nunca incluye posición en
// píxeles, geometría ni nada dependiente del tamaño de pantalla del host.
export interface RemotePlayback {
  engineStatus: TeleprompterStatus
  progress: number
  wpm: number
  pausedByMarker: boolean
  updatedAt: number
}

export interface RemoteSession {
  // Id del remoto emparejado, o null si todavía no se unió nadie. Viene de
  // Presence (¿alguien con rol "remote" está trackeado en el canal ahora
  // mismo?), no directamente de la tabla — así refleja conexión en vivo.
  remoteUid: string | null
  status: RemoteSessionStatus
  // Cosmético únicamente: nunca se sube el contenido del guion.
  scriptTitle: string
  command?: RemoteCommand | null
  playback?: RemotePlayback | null
}

// ---------------------------------------------------------------------
// Ids aleatorios del lado del cliente (remoto). El id de sesión y el
// host_token los genera el servidor (dentro de create_remote_session, con
// gen_random_uuid()) — acá solo hace falta generar el id del cliente remoto
// y el id de cada comando. Se usa crypto.getRandomValues() en vez de
// crypto.randomUUID() por compatibilidad más amplia (algunos navegadores/
// WebViews que abren el QR pueden no tener randomUUID); misma cantidad de
// aleatoriedad (128 bits).
// ---------------------------------------------------------------------
function generateRandomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const REMOTE_CLIENT_ID_STORAGE_KEY = 'robress:remoteClientId'

// Persistido en localStorage: si el remoto recarga la página, vuelve a
// unirse a SU MISMA sesión (join_remote_session lo reconoce por este id)
// en vez de encontrarla "ocupada" por sí mismo.
export function getRemoteClientId(): string {
  try {
    const stored = window.localStorage.getItem(REMOTE_CLIENT_ID_STORAGE_KEY)
    if (stored) return stored
  } catch {
    // localStorage puede no estar disponible (modo privado, permisos).
  }
  const id = generateRandomId()
  try {
    window.localStorage.setItem(REMOTE_CLIENT_ID_STORAGE_KEY, id)
  } catch {
    // Si no se pudo guardar, se sigue con un id en memoria: no se cae la
    // función, solo se pierde la persistencia entre recargas.
  }
  return id
}

// ---------------------------------------------------------------------
// Un canal de Realtime por sesión, compartido entre todo lo que necesite
// hablar de esa sesión dentro de la misma pestaña (comandos, playback,
// presencia, estado de conexión) — evita abrir un socket nuevo por cada
// operación. Vive mientras dura la suscripción de subscribeToSession(); si
// se llama a sendCommand/publishPlayback antes de eso, se crea sobre la
// marcha.
// ---------------------------------------------------------------------
interface PresencePayload {
  role: 'host' | 'remote'
  clientId?: string
}

interface ChannelEntry {
  channel: RealtimeChannel
  lastStatus: string
  statusListeners: Set<(status: string) => void>
  commandListeners: Set<(command: RemoteCommand) => void>
  playbackListeners: Set<(playback: RemotePlayback) => void>
  endedListeners: Set<() => void>
  presenceListeners: Set<(remoteUid: string | null) => void>
}

const channelRegistry = new Map<string, ChannelEntry>()

function channelName(sessionId: string): string {
  return `session:${sessionId}`
}

function derivePresenceRemoteUid(channel: RealtimeChannel): string | null {
  const state = channel.presenceState<PresencePayload>()
  for (const key in state) {
    const remoteEntry = state[key].find((p) => p.role === 'remote')
    if (remoteEntry) return remoteEntry.clientId ?? key
  }
  return null
}

function ensureChannel(client: NonNullable<ReturnType<typeof getSupabaseClient>>, sessionId: string): ChannelEntry {
  const existing = channelRegistry.get(sessionId)
  if (existing) return existing

  const statusListeners = new Set<(status: string) => void>()
  const commandListeners = new Set<(command: RemoteCommand) => void>()
  const playbackListeners = new Set<(playback: RemotePlayback) => void>()
  const endedListeners = new Set<() => void>()
  const presenceListeners = new Set<(remoteUid: string | null) => void>()

  const channel = client.channel(channelName(sessionId), {
    config: {
      broadcast: { self: false },
      presence: { enabled: true },
    },
  })

  const entry: ChannelEntry = {
    channel,
    lastStatus: 'CONNECTING',
    statusListeners,
    commandListeners,
    playbackListeners,
    endedListeners,
    presenceListeners,
  }
  channelRegistry.set(sessionId, entry)

  channel
    .on<RemoteCommand>('broadcast', { event: 'command' }, ({ payload }) => {
      commandListeners.forEach((fn) => fn(payload))
    })
    .on<RemotePlayback>('broadcast', { event: 'playback' }, ({ payload }) => {
      playbackListeners.forEach((fn) => fn(payload))
    })
    .on('broadcast', { event: 'ended' }, () => {
      endedListeners.forEach((fn) => fn())
    })
    .on('presence', { event: 'sync' }, () => {
      const remoteUid = derivePresenceRemoteUid(channel)
      presenceListeners.forEach((fn) => fn(remoteUid))
    })
    .subscribe((status) => {
      entry.lastStatus = status
      statusListeners.forEach((fn) => fn(status))
    })

  return entry
}

function waitForSubscribed(entry: ChannelEntry): Promise<void> {
  if (entry.lastStatus === 'SUBSCRIBED') return Promise.resolve()
  return new Promise((resolve) => {
    const fn = (status: string) => {
      if (status === 'SUBSCRIBED') {
        entry.statusListeners.delete(fn)
        resolve()
      }
    }
    entry.statusListeners.add(fn)
  })
}

function releaseChannel(client: NonNullable<ReturnType<typeof getSupabaseClient>>, sessionId: string) {
  const entry = channelRegistry.get(sessionId)
  if (!entry) return
  channelRegistry.delete(sessionId)
  client.removeChannel(entry.channel)
}

// ---------------------------------------------------------------------
// Sesión: creación, lectura, unión y cierre — todo vía RPC (nunca la
// tabla directamente). host_token solo se guarda en memoria acá, nunca se
// devuelve al remoto ni viaja en el QR.
// ---------------------------------------------------------------------
const hostTokens = new Map<string, string>()

interface SessionRow {
  id: string
  script_title: string
  created_at: string
  expires_at: string
  remote_client_id: string | null
  ended_at: string | null
}

function rowToSession(row: SessionRow, remoteUidOverride?: string | null): RemoteSession {
  const remoteUid = remoteUidOverride !== undefined ? remoteUidOverride : row.remote_client_id
  return {
    remoteUid,
    status: row.ended_at ? 'ended' : remoteUid ? 'paired' : 'waiting',
    scriptTitle: row.script_title,
    command: null,
    playback: null,
  }
}

export async function createSession(scriptTitle: string): Promise<{ sessionId: string | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { sessionId: null, error: 'El control remoto no está disponible en este momento.' }

  const { data, error } = await client.rpc('create_remote_session', { p_title: scriptTitle })
  if (error) {
    console.error('[remote] create_remote_session falló:', error)
    return { sessionId: null, error: error.message }
  }
  const row = Array.isArray(data) ? (data[0] as { id: string; host_token: string } | undefined) : undefined
  if (!row) {
    return { sessionId: null, error: 'El servidor no devolvió una sesión válida.' }
  }

  hostTokens.set(row.id, row.host_token)

  // Anunciar presencia de host de inmediato, para que en cuanto el remoto
  // se una, el sync de Presence ya tenga con quién cruzar datos.
  const entry = ensureChannel(client, row.id)
  waitForSubscribed(entry).then(() => {
    entry.channel.track({ role: 'host' } satisfies PresencePayload)
  })

  return { sessionId: row.id, error: null }
}

export async function endSession(sessionId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const hostToken = hostTokens.get(sessionId)
  if (hostToken) {
    const { error } = await client.rpc('end_remote_session', { p_id: sessionId, p_host_token: hostToken })
    if (error) console.error('[remote] end_remote_session falló:', error)
    hostTokens.delete(sessionId)
  }
  // Avisar en vivo al remoto conectado ahora mismo, sin esperar a que
  // vuelva a consultar la sesión.
  const entry = channelRegistry.get(sessionId)
  if (entry) {
    await waitForSubscribed(entry)
    await entry.channel.send({ type: 'broadcast', event: 'ended', payload: {} })
  }
}

export async function getSession(sessionId: string): Promise<RemoteSession | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data, error } = await client.rpc('get_remote_session', { p_id: sessionId })
  if (error) {
    console.error('[remote] get_remote_session falló:', error)
    return null
  }
  const row = Array.isArray(data) ? (data[0] as SessionRow | undefined) : undefined
  if (!row) return null
  return rowToSession(row)
}

export function subscribeToSession(
  sessionId: string,
  callback: (session: RemoteSession | null) => void,
): () => void {
  const client = getSupabaseClient()
  if (!client) {
    callback(null)
    return () => {}
  }

  let current: RemoteSession | null = null
  let closed = false

  function emit() {
    if (!closed) callback(current)
  }

  const entry = ensureChannel(client, sessionId)

  const onCommand = (command: RemoteCommand) => {
    if (!current) return
    current = { ...current, command }
    emit()
  }
  const onPlayback = (playback: RemotePlayback) => {
    if (!current) return
    current = { ...current, playback }
    emit()
  }
  const onEnded = () => {
    if (!current) return
    current = { ...current, status: 'ended' }
    emit()
  }
  const onPresence = (remoteUid: string | null) => {
    if (!current) return
    current = {
      ...current,
      remoteUid,
      status: current.status === 'ended' ? 'ended' : remoteUid ? 'paired' : 'waiting',
    }
    emit()
  }

  entry.commandListeners.add(onCommand)
  entry.playbackListeners.add(onPlayback)
  entry.endedListeners.add(onEnded)
  entry.presenceListeners.add(onPresence)

  // Estado inicial desde la base (título, si ya hay un remoto registrado,
  // si ya terminó) — a partir de acá, todo lo que cambia en vivo llega por
  // Presence/Broadcast, nunca releyendo la tabla.
  getSession(sessionId).then((initial) => {
    if (closed) return
    current = initial
    emit()
  })

  return () => {
    closed = true
    entry.commandListeners.delete(onCommand)
    entry.playbackListeners.delete(onPlayback)
    entry.endedListeners.delete(onEnded)
    entry.presenceListeners.delete(onPresence)
    releaseChannel(client, sessionId)
  }
}

export type JoinSessionOutcome = 'joined' | 'not-found' | 'ended' | 'expired' | 'occupied' | 'error'

export interface JoinSessionResult {
  outcome: JoinSessionOutcome
  session: RemoteSession | null
  errorMessage?: string
}

// Intenta unirse como el remoto de una sesión. join_remote_session hace un
// UPDATE atómico del lado del servidor (WHERE remote_client_id IS NULL OR
// remote_client_id = p_client_id) — Postgres garantiza que si dos remotos
// lo intentan casi al mismo tiempo, solo uno gana, sin condición de
// carrera posible.
export async function joinSessionAsRemote(sessionId: string): Promise<JoinSessionResult> {
  const client = getSupabaseClient()
  if (!client) {
    return { outcome: 'error', session: null, errorMessage: 'El control remoto no está disponible en este momento.' }
  }

  const clientId = getRemoteClientId()
  const { data, error } = await client.rpc('join_remote_session', { p_id: sessionId, p_client_id: clientId })
  if (error) {
    console.error('[remote] join_remote_session falló:', error)
    return { outcome: 'error', session: null, errorMessage: error.message }
  }
  const row = Array.isArray(data) ? (data[0] as SessionRow | undefined) : undefined
  if (!row) return { outcome: 'not-found', session: null }
  if (row.ended_at) return { outcome: 'ended', session: null }
  if (new Date(row.expires_at).getTime() < Date.now()) return { outcome: 'expired', session: null }
  if (row.remote_client_id !== clientId) return { outcome: 'occupied', session: null }

  const entry = ensureChannel(client, sessionId)
  waitForSubscribed(entry).then(() => {
    entry.channel.track({ role: 'remote', clientId } satisfies PresencePayload)
  })

  return { outcome: 'joined', session: rowToSession(row, clientId) }
}

// ---------------------------------------------------------------------
// Comandos (remoto→host) y playback (host→remoto) — siempre Broadcast,
// nunca la tabla.
// ---------------------------------------------------------------------
export async function sendCommand(sessionId: string, type: RemoteCommandType): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  const command: RemoteCommand = {
    type,
    commandId: generateRandomId(),
    issuedAt: Date.now(),
    senderId: getRemoteClientId(),
  }
  await entry.channel.send({ type: 'broadcast', event: 'command', payload: command })
}

export async function publishPlayback(sessionId: string, playback: RemotePlayback): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  await entry.channel.send({ type: 'broadcast', event: 'playback', payload: playback })
}

// `SUBSCRIBED` en el estado del canal es el equivalente, por sesión, a lo
// que era `.info/connected` en Firebase (que era global). Se usa en
// RemoteControlPage para mostrar "Conexión perdida" sin tratarlo como si
// el host hubiera cerrado la sesión.
export function subscribeToConnectivity(sessionId: string, callback: (connected: boolean) => void): () => void {
  const client = getSupabaseClient()
  if (!client) {
    callback(false)
    return () => {}
  }
  const entry = ensureChannel(client, sessionId)
  const fn = (status: string) => callback(status === 'SUBSCRIBED')
  entry.statusListeners.add(fn)
  fn(entry.lastStatus)
  return () => entry.statusListeners.delete(fn)
}
