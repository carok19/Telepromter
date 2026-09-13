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
//   - Quién es "el remoto autorizado" (remoteUid) SIEMPRE sale de la tabla
//     (get_remote_session), nunca de Presence — Presence solo se usa como
//     disparador para volver a confirmar contra la tabla, y para saber si
//     ese remoto ya confirmado está conectado ahora mismo
//     (remoteConnected). Ver el bloque "Presence + autorización" más abajo.
//
// LÍMITE CONOCIDO (pendiente para F8.6, no se resuelve acá): los canales de
// Realtime son públicos — cualquiera que conozca el sessionId (va en la URL
// del QR, no es secreto) puede conectarse directo al canal y observar los
// mensajes de broadcast "command", incluido el senderId real que usa el
// remoto legítimo. Nada impide que ese tercero reenvíe un comando
// suplantando ese mismo senderId. Cerrar esto del todo requiere canales
// privados de Supabase (RLS sobre realtime.messages) + alguna forma de
// autenticar al remoto ante esa RLS (por ejemplo, Auth anónima) — se deja
// documentado como trabajo pendiente, no se implementa ahora.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { CALIBRATION_RANGES, type MirrorMode, type TextAlign } from '../engine/calibrationEngine'
import type { TeleprompterStatus } from '../engine/teleprompterEngine'
import { getSupabaseClient } from './supabase'

export type RemoteSessionStatus = 'waiting' | 'paired' | 'ended'

// Rango de velocidad válido — único lugar donde vive este número: tanto
// TeleprompterPage (footer + comando remoto entrante) como RemoteControlPage
// (botones ±/edición táctil) lo importan de acá en vez de repetirlo.
export const MIN_REMOTE_WPM = 40
export const MAX_REMOTE_WPM = 300

// Valida y clampea un wpm recibido en un comando 'setSpeed': el host NUNCA
// confía en el valor tal cual lo manda el remoto. Devuelve `null` si no es
// un número finito (el comando se descarta por completo, no se aplica nada);
// si es un número, lo clampea al rango válido en vez de descartarlo —
// alguien manteniendo presionado + más allá del límite no debe "perder" el
// comando, solo quedarse en el tope.
export function clampRemoteWpm(value: number | string | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(MAX_REMOTE_WPM, Math.max(MIN_REMOTE_WPM, value))
}

// Feature A (barra de progreso arrastrable) — valida 'seekToProgress' con el
// mismo principio que clampRemoteWpm: el host nunca confía en el valor tal
// cual. El remoto ya manda progreso normalizado (0-1), nunca píxeles (cada
// host puede tener una geometría distinta), así que acá solo hace falta
// descartar valores no numéricos y clampear al rango válido.
export function clampSeekProgress(value: number | string | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

// B.2 — valida el id de guion que pide un comando 'loadScript'. Solo
// descarta lo obviamente inválido (no numérico); la existencia REAL del
// guion y si sigue guardado (no un borrador) no puede comprobarse acá —
// este archivo se mantiene sin dependencias de Dexie/IndexedDB a
// propósito, para poder probar sus validadores standalone con jiti — esa
// parte la hace el host con una consulta async antes de navegar (ver
// TeleprompterPage.tsx), y avisa con publishNotice() si ya no existe.
export function parseScriptIdCommand(value: number | string | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

// F8.4 parte A agrega 'seekForward'/'seekBack' (avanzar/retroceder una
// cantidad fija de segundos de lectura, interpretada por el HOST con su
// propia velocidad — nunca en píxeles) y 'setSpeed' (cambiar la velocidad
// a un wpm objetivo, que el host vuelve a clampear/validar antes de
// aplicar; ver el `value` de RemoteCommand). F8.4 parte B agrega
// 'setCalibration' (tamaño de letra/margen/interlineado/alineación/espejo
// en vivo — ver `param`/`value` y validateCalibrationCommand()). Feature A
// (barra de progreso arrastrable) agrega 'seekToProgress': igual que
// seekForward/seekBack, viaja como progreso normalizado (0-1), nunca
// píxeles — ver clampSeekProgress(). B.2 agrega 'loadScript': `value` es
// el id (número) del guion que el remoto pide abrir — ver
// parseScriptIdCommand() para la validación sintáctica; si ese guion
// existe de verdad y sigue guardado (no un borrador) se comprueba aparte,
// del lado del host, con una consulta a Dexie (ver TeleprompterPage.tsx).
export type RemoteCommandType =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'reset'
  | 'seekForward'
  | 'seekBack'
  | 'setSpeed'
  | 'setCalibration'
  | 'seekToProgress'
  | 'loadScript'

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
  // 'setSpeed' (wpm objetivo, número) y 'setCalibration' (según `param`,
  // número o el valor exacto de un enum como texto) lo usan. El host NUNCA
  // confía en este valor tal cual: lo descarta si no pasa la validación
  // correspondiente (clampRemoteWpm / validateCalibrationCommand) antes de
  // aplicarlo.
  value?: number | string
  // Solo lo usa 'setCalibration' — cuál de los ajustes en vivo cambiar.
  // Ver CALIBRATION_PARAMS/validateCalibrationCommand: cualquier otro
  // string se descarta, nunca se aplica "lo que se pueda".
  param?: CalibrationParam
}

// ---------------------------------------------------------------------
// F8.4 parte B: ajustes de calibración en vivo desde el remoto.
// ---------------------------------------------------------------------
// readingZoneEnabled/Center: el indicador de Señal vive en
// CalibrationSettings como un objeto anidado (`readingZone: {enabled,
// center}`), pero el protocolo remoto (como el resto de estos params) es
// plano — quien aplica el comando (TeleprompterPage) sabe mapear estos dos
// a `readingZone.*`. readingZoneEnabled viaja como número (0|1), no
// boolean: `RemoteCommand.value` solo admite `number | string`, igual que
// el resto de los params de acá.
const CALIBRATION_PARAMS = [
  'fontSize',
  'maxWidth',
  'lineHeight',
  'mirror',
  'textAlign',
  'readingZoneEnabled',
  'readingZoneCenter',
] as const
export type CalibrationParam = (typeof CALIBRATION_PARAMS)[number]

const MIRROR_VALUES: readonly MirrorMode[] = ['none', 'horizontal', 'vertical']
const TEXT_ALIGN_VALUES: readonly TextAlign[] = ['script', 'left', 'center', 'right']

// Snapshot de solo lectura publicado por el host para que el remoto vea el
// valor REAL vigente (no lo que el usuario del remoto cree haber tocado) —
// mismo espíritu que RemotePlayback, pero para calibración.
export interface RemoteCalibration {
  fontSize: number
  maxWidth: number
  lineHeight: number
  textAlign: TextAlign
  mirror: MirrorMode
  readingZoneEnabled: boolean
  readingZoneCenter: number
  updatedAt: number
}

// Lista blanca de `param` + validación por tipo — cualquier otra cosa
// (param desconocido, número no finito donde se espera número, string
// fuera del enum exacto) hace que el comando se descarte COMPLETO, nunca
// se aplica una versión parcial o "corregida" de un valor inválido salvo
// el clamp de rango para los numéricos (mantenerse en el límite en vez de
// perder el comando si alguien mantiene presionado más allá del tope, tal
// como ya hace clampRemoteWpm).
export function validateCalibrationCommand(
  param: string | undefined,
  value: number | string | undefined,
): { param: CalibrationParam; value: number | MirrorMode | TextAlign } | null {
  if (!CALIBRATION_PARAMS.includes(param as CalibrationParam)) return null
  const validParam = param as CalibrationParam

  if (validParam === 'mirror') {
    return MIRROR_VALUES.includes(value as MirrorMode) ? { param: validParam, value: value as MirrorMode } : null
  }
  if (validParam === 'textAlign') {
    return TEXT_ALIGN_VALUES.includes(value as TextAlign)
      ? { param: validParam, value: value as TextAlign }
      : null
  }
  // readingZoneEnabled es el único booleano del protocolo — viaja como 0|1
  // (no boolean: ver el comentario de CALIBRATION_PARAMS) y se valida
  // exigiendo exactamente uno de esos dos números, nunca "cualquier
  // truthy/falsy".
  if (validParam === 'readingZoneEnabled') {
    return value === 0 || value === 1 ? { param: validParam, value } : null
  }
  // Numérico: fontSize | maxWidth | lineHeight | readingZoneCenter.
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const range = CALIBRATION_RANGES[validParam]
  return { param: validParam, value: Math.min(range.max, Math.max(range.min, value)) }
}

// Snapshot de solo lectura para el remoto: nunca incluye posición en
// píxeles, geometría ni nada dependiente del tamaño de pantalla del host.
export interface RemotePlayback {
  engineStatus: TeleprompterStatus
  progress: number
  wpm: number
  pausedByMarker: boolean
  updatedAt: number
  // B.1: cuando el host cambia de guion sin cortar el emparejamiento (la
  // sesión sobrevive el cambio — ver TeleprompterPage.tsx), el título fijado
  // en create_remote_session (columna script_title) queda desactualizado.
  // No hace falta una función SQL para corregirlo — es puramente cosmético
  // — así que se republica acá, junto al snapshot de reproducción, y
  // subscribeToSession lo aplica sobre `scriptTitle` del lado del remoto.
  // Opcional: mientras el guion nuevo todavía no terminó de cargar, se
  // publica sin este campo (undefined), y subscribeToSession lo ignora en
  // vez de borrar el título vigente.
  scriptTitle?: string
  // B.2: id real del guion que se está mostrando ahora — a diferencia de
  // scriptTitle (cosmético, puede repetirse entre guiones), esto es lo
  // que el remoto usa para marcar cuál está resaltado en la lista y
  // calcular "Siguiente guion" dentro de la misma carpeta. Mismo criterio
  // que scriptTitle: ausente mientras el guion nuevo todavía no cargó.
  scriptId?: number
}

// ---------------------------------------------------------------------
// B.2/B.3 — HOST → REMOTE: lista de guiones para elegir, agrupada por
// carpeta, y avisos puntuales (p. ej. "ese guion ya no existe").
// ---------------------------------------------------------------------
export interface RemoteScriptListItem {
  id: number
  // Ya truncado y nunca vacío ("Sin título" en vez de "") antes de
  // publicarse — ver TeleprompterPage.tsx. Solo guiones GUARDADOS llegan
  // acá (nunca un borrador: el remoto no debería poder abrir algo que ni
  // siquiera aparece en Mis guiones del host).
  title: string
}

export interface RemoteScriptFolder {
  // `null` = el bucket "Sin carpeta" (no una fila real en la tabla de
  // carpetas) — mismo criterio que ya usa LibraryPage.
  id: number | null
  name: string
  scripts: RemoteScriptListItem[]
}

export type RemoteScriptList = RemoteScriptFolder[]

// Aviso puntual del host al remoto que no necesita persistir en ningún
// campo de estado de reproducción/calibración — por ahora solo lo usa
// 'loadScript' cuando el guion pedido ya no existe. `at` (no un booleano)
// para que el remoto pueda detectar "llegó uno nuevo" incluso si el
// mensaje es idéntico al anterior.
export interface RemoteNotice {
  message: string
  at: number
}

export interface RemoteSession {
  // Id del remoto emparejado, o null si todavía no se unió nadie. SIEMPRE
  // viene de la tabla (get_remote_session), nunca de Presence directamente
  // — Presence es público (cualquiera que conozca el sessionId puede
  // conectarse al canal y hacer track() sin haber pasado por
  // join_remote_session), así que no es una fuente confiable de "quién es
  // el remoto autorizado". Ver ensureChannel()/scheduleRemoteUidRefresh()
  // más abajo para cómo se mantiene actualizado.
  remoteUid: string | null
  // true solo si, ADEMÁS de lo anterior, hay un cliente trackeado en
  // Presence con clientId === remoteUid ahora mismo. Un track() con un
  // clientId distinto (por ejemplo alguien que entra al canal sin llamar a
  // join_remote_session) nunca enciende esto.
  remoteConnected: boolean
  status: RemoteSessionStatus
  // Cosmético únicamente: nunca se sube el contenido del guion.
  scriptTitle: string
  command?: RemoteCommand | null
  playback?: RemotePlayback | null
  calibration?: RemoteCalibration | null
  // B.3: última lista de guiones publicada por el host, agrupada por
  // carpeta. B.2: último aviso puntual (p. ej. "el guion pedido ya no
  // existe").
  scriptList?: RemoteScriptList | null
  notice?: RemoteNotice | null
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

interface RemoteAuthState {
  remoteUid: string | null
  remoteConnected: boolean
}

interface ChannelEntry {
  channel: RealtimeChannel
  lastStatus: string
  statusListeners: Set<(status: string) => void>
  commandListeners: Set<(command: RemoteCommand) => void>
  playbackListeners: Set<(playback: RemotePlayback) => void>
  calibrationListeners: Set<(calibration: RemoteCalibration) => void>
  scriptListListeners: Set<(list: RemoteScriptList) => void>
  noticeListeners: Set<(notice: RemoteNotice) => void>
  endedListeners: Set<() => void>
  // Emite cada vez que cambia remoteUid (confirmado por la tabla) o
  // remoteConnected (Presence coincidiendo con ese remoteUid).
  remoteStateListeners: Set<(state: RemoteAuthState) => void>
  // remoteUid confirmado por la tabla — NUNCA se pisa con un valor que
  // venga solo de Presence. Ver scheduleRemoteUidRefresh().
  confirmedRemoteUid: string | null
  lastRefreshRequestedAt: number
  refreshSeq: number
}

const channelRegistry = new Map<string, ChannelEntry>()

// Punto 1 del pedido de corrección: si llega un comando con un senderId
// que no coincide, se vuelve a confirmar contra la tabla por si el remoto
// real recién se unió y todavía no llegó el sync de Presence — pero como
// máximo cada REMOTE_UID_REFRESH_THROTTLE_MS, para no convertir un aluvión
// de comandos falsos en un aluvión de llamadas a get_remote_session.
const REMOTE_UID_REFRESH_THROTTLE_MS = 2000

function channelName(sessionId: string): string {
  return `session:${sessionId}`
}

// true solo si hay un cliente trackeado en Presence con clientId
// EXACTAMENTE igual al remoteUid ya confirmado por la tabla (punto 2 del
// pedido de corrección) — un track() con cualquier otro clientId no cuenta,
// aunque tenga role:"remote".
function isRemotePresent(channel: RealtimeChannel, confirmedRemoteUid: string | null): boolean {
  if (!confirmedRemoteUid) return false
  const state = channel.presenceState<PresencePayload>()
  for (const key in state) {
    if (state[key].some((p) => p.role === 'remote' && p.clientId === confirmedRemoteUid)) return true
  }
  return false
}

function emitRemoteState(entry: ChannelEntry): void {
  const state: RemoteAuthState = {
    remoteUid: entry.confirmedRemoteUid,
    remoteConnected: isRemotePresent(entry.channel, entry.confirmedRemoteUid),
  }
  entry.remoteStateListeners.forEach((fn) => fn(state))
}

// Vuelve a confirmar remoteUid contra la tabla (get_remote_session) — nunca
// contra Presence. Se llama desde el sync de Presence (para detectar que un
// remoto real se unió) y desde requestRemoteUidRefresh() (cuando el host
// ve un senderId que no reconoce). Ignora respuestas fuera de orden
// (refreshSeq) y, si la llamada falla, deja el último valor confirmado tal
// cual — nunca lo borra por un error de red pasajero.
function scheduleRemoteUidRefresh(sessionId: string, entry: ChannelEntry): void {
  const now = Date.now()
  if (now - entry.lastRefreshRequestedAt < REMOTE_UID_REFRESH_THROTTLE_MS) return
  entry.lastRefreshRequestedAt = now
  const seq = ++entry.refreshSeq
  getSession(sessionId).then((fresh) => {
    if (seq !== entry.refreshSeq) return // llegó una solicitud más nueva mientras esta viajaba
    if (fresh === null) return // fallo de red/servidor: se mantiene el último remoteUid confirmado
    entry.confirmedRemoteUid = fresh.remoteUid
    emitRemoteState(entry)
  })
}

// Punto 1 del pedido de corrección: expuesta para que TeleprompterPage la
// llame cuando un comando llega con un senderId que no reconoce.
export function requestRemoteUidRefresh(sessionId: string): void {
  if (!getSupabaseClient()) return
  const entry = channelRegistry.get(sessionId)
  if (!entry) return
  scheduleRemoteUidRefresh(sessionId, entry)
}

function ensureChannel(client: NonNullable<ReturnType<typeof getSupabaseClient>>, sessionId: string): ChannelEntry {
  const existing = channelRegistry.get(sessionId)
  if (existing) return existing

  const statusListeners = new Set<(status: string) => void>()
  const commandListeners = new Set<(command: RemoteCommand) => void>()
  const playbackListeners = new Set<(playback: RemotePlayback) => void>()
  const calibrationListeners = new Set<(calibration: RemoteCalibration) => void>()
  const scriptListListeners = new Set<(list: RemoteScriptList) => void>()
  const noticeListeners = new Set<(notice: RemoteNotice) => void>()
  const endedListeners = new Set<() => void>()
  const remoteStateListeners = new Set<(state: RemoteAuthState) => void>()

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
    calibrationListeners,
    scriptListListeners,
    noticeListeners,
    endedListeners,
    remoteStateListeners,
    confirmedRemoteUid: null,
    lastRefreshRequestedAt: 0,
    refreshSeq: 0,
  }
  channelRegistry.set(sessionId, entry)

  channel
    .on<RemoteCommand>('broadcast', { event: 'command' }, ({ payload }) => {
      commandListeners.forEach((fn) => fn(payload))
    })
    .on<RemotePlayback>('broadcast', { event: 'playback' }, ({ payload }) => {
      playbackListeners.forEach((fn) => fn(payload))
    })
    .on<RemoteCalibration>('broadcast', { event: 'calibration' }, ({ payload }) => {
      calibrationListeners.forEach((fn) => fn(payload))
    })
    .on<RemoteScriptList>('broadcast', { event: 'scriptList' }, ({ payload }) => {
      scriptListListeners.forEach((fn) => fn(payload))
    })
    .on<RemoteNotice>('broadcast', { event: 'notice' }, ({ payload }) => {
      noticeListeners.forEach((fn) => fn(payload))
    })
    .on('broadcast', { event: 'ended' }, () => {
      endedListeners.forEach((fn) => fn())
    })
    .on('presence', { event: 'sync' }, () => {
      // Recalcula remoteConnected con lo que ya se sabía confirmado, y de
      // paso pide reconfirmar contra la tabla (sujeto al throttle) por si
      // este sync es justo el de un remoto nuevo uniéndose.
      emitRemoteState(entry)
      scheduleRemoteUidRefresh(sessionId, entry)
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

// F8.6 (PWA): antes de intentar CONECTAR (crear una sesión como host, o
// unirse como remoto) — nunca para comandos ya en curso, eso no se toca —
// se falla rápido y claro en vez de dejar un spinner colgado:
// 1) si el navegador ya sabe que no hay red (`navigator.onLine === false`),
//    ni se intenta la llamada;
// 2) si la red está "arriba pero degradada" (no rechaza, tampoco responde),
//    CONNECTION_TIMEOUT_MS pone un límite — sin esto, `await client.rpc()`
//    podría quedarse esperando indefinidamente.
const CONNECTION_TIMEOUT_MS = 9000
const OFFLINE_ERROR = 'Sin conexión a internet. El control remoto necesita internet para emparejar los dispositivos.'
const TIMEOUT_ERROR = 'No se pudo conectar (tiempo de espera agotado). Revisá tu conexión e intentá de nuevo.'

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function withConnectionTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), CONNECTION_TIMEOUT_MS)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
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
    // Se recalcula aparte contra Presence apenas se conoce (ver
    // subscribeToSession) — acá arranca en false porque una lectura de la
    // tabla no sabe nada de quién está conectado ahora mismo.
    remoteConnected: false,
    status: row.ended_at ? 'ended' : remoteUid ? 'paired' : 'waiting',
    scriptTitle: row.script_title,
    command: null,
    playback: null,
    calibration: null,
    scriptList: null,
    notice: null,
  }
}

export async function createSession(scriptTitle: string): Promise<{ sessionId: string | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { sessionId: null, error: 'El control remoto no está disponible en este momento.' }
  if (isOffline()) return { sessionId: null, error: OFFLINE_ERROR }

  let result: Awaited<ReturnType<typeof client.rpc>>
  try {
    result = await withConnectionTimeout(client.rpc('create_remote_session', { p_title: scriptTitle }))
  } catch (err) {
    if (err instanceof Error && err.message === 'TIMEOUT') return { sessionId: null, error: TIMEOUT_ERROR }
    throw err
  }
  const { data, error } = result
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
    // B.1: scriptTitle solo viaja cuando el host ya sabe el título real del
    // guion nuevo (ver el comentario en RemotePlayback) — si todavía no
    // cargó, no se pisa el título vigente con undefined.
    current = { ...current, playback, ...(playback.scriptTitle != null ? { scriptTitle: playback.scriptTitle } : {}) }
    emit()
  }
  const onCalibration = (calibration: RemoteCalibration) => {
    if (!current) return
    current = { ...current, calibration }
    emit()
  }
  const onScriptList = (scriptList: RemoteScriptList) => {
    if (!current) return
    current = { ...current, scriptList }
    emit()
  }
  const onNotice = (notice: RemoteNotice) => {
    if (!current) return
    current = { ...current, notice }
    emit()
  }
  const onEnded = () => {
    if (!current) return
    current = { ...current, status: 'ended' }
    emit()
  }
  // remoteUid acá SIEMPRE viene confirmado por la tabla (ver
  // scheduleRemoteUidRefresh) — Presence solo aporta remoteConnected.
  const onRemoteState = ({ remoteUid, remoteConnected }: RemoteAuthState) => {
    if (!current) return
    current = {
      ...current,
      remoteUid,
      remoteConnected,
      status: current.status === 'ended' ? 'ended' : remoteUid ? 'paired' : 'waiting',
    }
    emit()
  }

  entry.commandListeners.add(onCommand)
  entry.playbackListeners.add(onPlayback)
  entry.calibrationListeners.add(onCalibration)
  entry.scriptListListeners.add(onScriptList)
  entry.noticeListeners.add(onNotice)
  entry.endedListeners.add(onEnded)
  entry.remoteStateListeners.add(onRemoteState)

  // Estado inicial desde la base (título, si ya hay un remoto registrado,
  // si ya terminó) — a partir de acá, los cambios de remoteUid siguen
  // saliendo de la tabla (vía scheduleRemoteUidRefresh, disparado por
  // Presence), nunca de Presence directamente.
  getSession(sessionId).then((initial) => {
    if (closed) return
    current = initial
    entry.confirmedRemoteUid = initial?.remoteUid ?? null
    if (current) current.remoteConnected = isRemotePresent(entry.channel, entry.confirmedRemoteUid)
    emit()
  })

  return () => {
    closed = true
    entry.commandListeners.delete(onCommand)
    entry.playbackListeners.delete(onPlayback)
    entry.calibrationListeners.delete(onCalibration)
    entry.scriptListListeners.delete(onScriptList)
    entry.noticeListeners.delete(onNotice)
    entry.endedListeners.delete(onEnded)
    entry.remoteStateListeners.delete(onRemoteState)
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
  if (isOffline()) {
    return { outcome: 'error', session: null, errorMessage: OFFLINE_ERROR }
  }

  const clientId = getRemoteClientId()
  let result: Awaited<ReturnType<typeof client.rpc>>
  try {
    result = await withConnectionTimeout(client.rpc('join_remote_session', { p_id: sessionId, p_client_id: clientId }))
  } catch (err) {
    if (err instanceof Error && err.message === 'TIMEOUT') {
      return { outcome: 'error', session: null, errorMessage: TIMEOUT_ERROR }
    }
    throw err
  }
  const { data, error } = result
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
export async function sendCommand(sessionId: string, type: RemoteCommandType, value?: number): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  const command: RemoteCommand = {
    type,
    commandId: generateRandomId(),
    issuedAt: Date.now(),
    senderId: getRemoteClientId(),
    ...(value !== undefined ? { value } : {}),
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

// F8.4 parte B — REMOTE → HOST: pide cambiar un ajuste de calibración en
// vivo. Construye el RemoteCommand directamente (en vez de reutilizar
// sendCommand) porque su forma es distinta (param + value, no solo type +
// value) — el host lo valida entero con validateCalibrationCommand antes
// de aplicar nada.
export async function sendCalibrationCommand(
  sessionId: string,
  param: CalibrationParam,
  value: number | MirrorMode | TextAlign,
): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  const command: RemoteCommand = {
    type: 'setCalibration',
    commandId: generateRandomId(),
    issuedAt: Date.now(),
    senderId: getRemoteClientId(),
    param,
    value,
  }
  await entry.channel.send({ type: 'broadcast', event: 'command', payload: command })
}

// F8.4 parte B — HOST → REMOTE: publica el snapshot de calibración vigente
// (nunca lo que el remoto pidió, sino lo que el host efectivamente
// aplicó) para que el panel del remoto refleje el valor real.
export async function publishCalibration(sessionId: string, calibration: RemoteCalibration): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  await entry.channel.send({ type: 'broadcast', event: 'calibration', payload: calibration })
}

// B.3 — HOST → REMOTE: la lista de guiones para elegir, agrupada por
// carpeta. Se publica al conectarse el remoto y cada vez que cambia
// (crear/borrar/mover un guion, o renombrar una carpeta) — ver el efecto
// dedicado en TeleprompterPage.tsx que arma esta lista a partir de
// scriptsStore.
export async function publishScriptList(sessionId: string, list: RemoteScriptList): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  await entry.channel.send({ type: 'broadcast', event: 'scriptList', payload: list })
}

// B.2 — HOST → REMOTE: aviso puntual (p. ej. "ese guion ya no existe" si
// 'loadScript' pidió un id que se borró justo antes de que el comando
// llegara) — nunca rompe la sesión, solo informa.
export async function publishNotice(sessionId: string, message: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const entry = ensureChannel(client, sessionId)
  await waitForSubscribed(entry)
  const notice: RemoteNotice = { message, at: Date.now() }
  await entry.channel.send({ type: 'broadcast', event: 'notice', payload: notice })
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
