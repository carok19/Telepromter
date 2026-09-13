import { liveQuery } from 'dexie'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildCalibrationStyle,
  buildGhostLayerStyle,
  DEFAULT_CALIBRATION,
  getEffectiveColors,
  getTextAlignOverrideCss,
  TEXT_ALIGN_OVERRIDE_CLASS,
  type CalibrationSettings,
} from '../engine/calibrationEngine'
import { LiveSettingsPanel } from '../components/teleprompter/LiveSettingsPanel'
import { PairingModal } from '../components/remote/PairingModal'
import { PromptDialog } from '../components/shared/PromptDialog'
import { db, type FolderRecord, type ScriptRecord } from '../db/db'
import { sanitizeContentHtml } from '../engine/contentSanitizer'
import { countWords, DEFAULT_WPM, estimateDurationSeconds } from '../engine/duration'
import { TeleprompterEngine } from '../engine/teleprompterEngine'
import { useFullscreen } from '../hooks/useFullscreen'
import { useIdleControls } from '../hooks/useIdleControls'
import { useWakeLock } from '../hooks/useWakeLock'
import {
  clampRemoteWpm,
  clampSeekProgress,
  MAX_REMOTE_WPM,
  MIN_REMOTE_WPM,
  parseScriptIdCommand,
  validateCalibrationCommand,
  type RemoteScriptFolder,
  type RemoteScriptList,
  type RemoteSession,
} from '../services/remoteSession'
import { usePlayerStore } from '../stores/playerStore'
import { useProfilesStore } from '../stores/profilesStore'
import { useRemoteStore } from '../stores/remoteStore'
import { ACCENT_BG, ACCENT_BG_HOVER, FONT_DISPLAY, ON_ACCENT } from '../styles/tokens'

// Recuerda el último perfil elegido para el teleprompter entre sesiones. Es
// una preferencia liviana de UI (un id), no datos del dominio — se guarda en
// localStorage a propósito, sin tocar el esquema de Dexie para esto.
const LAST_PROFILE_STORAGE_KEY = 'robress:teleprompterProfileId'

// Identidad visual de Robress (tipografía Fredoka/Inter, ver index.css):
// deliberadamente NO llega hasta el texto del guion en pantalla. Depende de
// la calibración del usuario, no de la marca — se fija la tipografía de
// sistema de siempre para que cambiar la fuente de la app nunca mueva un
// solo píxel de lo que el usuario ya calibró detrás del vidrio.
const LEGACY_SYSTEM_FONT = "system-ui, 'Segoe UI', Roboto, sans-serif"

// F8.3: cota máxima de cuánto se demora en publicar el progreso al backend
// de control remoto mientras se reproduce (los cambios de estado discretos
// se publican de inmediato igual, ver el efecto de publishRemotePlayback
// más abajo). Es una capa de throttle propia, independiente de
// EMIT_THROTTLE_MS del motor.
const PLAYBACK_PUBLISH_INTERVAL_MS = 1500

// F8.4 parte A: SEEK_SECONDS es cuánto salta cada pulsación de avanzar/
// retroceder, interpretado con la velocidad ACTUAL del host (nunca con una
// suposición del remoto, que no conoce esa velocidad con certeza en el
// instante exacto del click). El rango de velocidad válido vive en
// remoteSession.ts (MIN_REMOTE_WPM/MAX_REMOTE_WPM/clampRemoteWpm) — mismo
// número para el input del footer, el comando remoto entrante y los
// botones del control remoto.
const SEEK_SECONDS = 5

// El Ghost es un hijo del mismo elemento que el motor transforma (así se
// mueve en sincronía con el scroll sin que el motor tenga que saber nada de
// calibración). Pero eso significa que su copia del HTML también contendría
// marcadores de pausa reales, y `findPauseCheckpoints` los contaría dos
// veces (una por copia). Se remueven los marcadores solo de esta copia de
// exhibición — no afecta al contenido real ni al conteo de palabras, que ya
// se calculan sobre `script.content` sin pasar por aquí.
function stripPauseMarkersForGhost(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.tp-marker-pause').forEach((el) => el.remove())
  return doc.body.innerHTML
}

// B.3: largo máximo de un título en la lista que ve el remoto — ahí el
// espacio es mucho más chico que en Mis guiones, y un título larguísimo
// rompería el layout de la lista agrupada.
const REMOTE_TITLE_MAX_LENGTH = 60

function truncateRemoteTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return 'Sin título'
  return trimmed.length > REMOTE_TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, REMOTE_TITLE_MAX_LENGTH).trimEnd()}…`
    : trimmed
}

// B.1: el ciclo de vida de la sesión de control remoto (crearla, unirse a
// una ya existente, la suscripción en vivo, el modal de emparejamiento, el
// error de conexión) vive ACÁ — el único nivel de este archivo que NO se
// remonta al cambiar de guion. TeleprompterSession, más abajo, sigue
// remontándose por completo con key={id} (motor, refs, pantalla completa,
// calibración: todo eso debe reiniciarse con cada guion nuevo, como
// siempre) — pero ya no arrastra consigo el emparejamiento.
//
// El id de la sesión en sí (hostSessionId) vive en remoteStore, no en un
// useState de acá: cambiar de guion desde Mis guiones pasa por la ruta
// /guiones (hermana de /teleprompter — ver router.tsx), lo que desmonta
// TAMBIÉN a este componente. Un useState local se perdería en ese viaje
// igual que le pasaba a TeleprompterSession antes de esta fase; el store
// (un singleton de JS ajeno al árbol de React) es lo único que sobrevive.
// Quién decide cuándo esa sesión quedó abandonada de verdad (a diferencia
// de un simple paso por Mis guiones para abrir otro guion): ver
// RootShell.tsx, que envuelve todas las rutas y por eso puede notar la
// diferencia entre las dos situaciones.
export function TeleprompterPage() {
  const { id } = useParams()

  const remoteConfigured = useRemoteStore((s) => s.configured)
  const createRemoteSession = useRemoteStore((s) => s.createSession)
  const subscribeRemoteSession = useRemoteStore((s) => s.subscribeSession)
  const setActiveRemoteSession = useRemoteStore((s) => s.setActiveSession)
  const hostSessionId = useRemoteStore((s) => s.hostSessionId)
  const setHostSessionId = useRemoteStore((s) => s.setHostSessionId)

  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null)
  const [showPairingModal, setShowPairingModal] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const publishScriptList = useRemoteStore((s) => s.publishScriptList)

  // Suscripción en vivo a la sesión (F8.2). Si hostSessionId ya venía
  // seteado desde ANTES de este montaje (se sobrevivió un cambio de guion),
  // esto reconecta a la MISMA sesión de inmediato — no crea una nueva.
  useEffect(() => {
    if (!hostSessionId) return
    return subscribeRemoteSession(hostSessionId, setRemoteSession)
  }, [hostSessionId, subscribeRemoteSession])

  // B.3: guiones y carpetas para la lista que ve el remoto. Con liveQuery
  // (en vez de leer una vez, o reutilizar useScriptsStore) esto se
  // actualiza solo — sin esperar a que este componente se remonte — si el
  // usuario crea, borra o mueve un guion durante la misma sesión de control
  // remoto, desde esta pestaña o desde otra (Dexie propaga los cambios
  // entre pestañas del mismo origen). Ya filtra a solo guardados
  // (status !== 'draft') acá mismo, igual que useScriptsStore.
  const [scriptsForRemote, setScriptsForRemote] = useState<{ scripts: ScriptRecord[]; folders: FolderRecord[] }>({
    scripts: [],
    folders: [],
  })
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [allScripts, folders] = await Promise.all([
        db.scripts.orderBy('title').toArray(),
        db.folders.orderBy('name').toArray(),
      ])
      return { scripts: allScripts.filter((s) => s.status !== 'draft'), folders }
    }).subscribe({
      next: setScriptsForRemote,
      error: (err) => console.error('B.3: error leyendo guiones para la lista del remoto', err),
    })
    return () => subscription.unsubscribe()
  }, [])

  // Agrupada por carpeta ("Sin carpeta" primero, después las carpetas en el
  // mismo orden alfabético que ya usa Mis guiones) y con títulos truncados
  // — lo que pide B.3 tal cual.
  const remoteScriptList = useMemo<RemoteScriptList>(() => {
    const { scripts, folders } = scriptsForRemote
    const toItem = (s: ScriptRecord) => ({ id: s.id as number, title: truncateRemoteTitle(s.title) })
    const sinCarpeta: RemoteScriptFolder = {
      id: null,
      name: 'Sin carpeta',
      scripts: scripts.filter((s) => s.id != null && s.folderId == null).map(toItem),
    }
    const named: RemoteScriptFolder[] = folders
      .filter((f) => f.id != null)
      .map((f) => ({
        id: f.id as number,
        name: f.name,
        scripts: scripts.filter((s) => s.id != null && s.folderId === f.id).map(toItem),
      }))
    return [sinCarpeta, ...named]
  }, [scriptsForRemote])

  // Se publica de nuevo cada vez que cambia la lista Y cada vez que el
  // remoto se conecta (mismo criterio que la publicación de calibración más
  // abajo, en TeleprompterSession) — así un remoto recién conectado la ve
  // de inmediato, sin esperar a que algo más cambie.
  useEffect(() => {
    if (!hostSessionId || !remoteSession?.remoteConnected) return
    publishScriptList(hostSessionId, remoteScriptList)
  }, [hostSessionId, remoteSession?.remoteConnected, remoteScriptList, publishScriptList])

  // F8.6 (PWA): igual que antes, solo que ahora vive acá en vez de en
  // TeleprompterSession — sigue reflejando exactamente lo mismo
  // (¿hay una sesión de host activa, y está el remoto conectado ahora
  // mismo?), sin depender de si el guion en pantalla cambió.
  useEffect(() => {
    setActiveRemoteSession(hostSessionId, remoteSession?.remoteConnected ?? false)
    return () => setActiveRemoteSession(null, false)
  }, [hostSessionId, remoteSession?.remoteConnected, setActiveRemoteSession])

  // scriptTitle se recibe como argumento (no se guarda ningún estado de
  // "guion actual" acá) porque TeleprompterSession, más abajo, ya sabe el
  // título en el momento del click — evita duplicar la carga del guion
  // solo para esto.
  async function handleRemoteControlClick(scriptTitle: string) {
    if (hostSessionId) {
      setShowPairingModal(true)
      return
    }
    const result = await createRemoteSession(scriptTitle || 'Sin título')
    if (result.sessionId) {
      setHostSessionId(result.sessionId)
      setShowPairingModal(true)
      setRemoteError(null)
    } else {
      setRemoteError(result.error ?? 'No se pudo crear la sesión de control remoto.')
    }
  }

  if (!id) {
    return (
      <div className="p-8 text-sm text-gray-500">Selecciona un guion desde la biblioteca para reproducirlo.</div>
    )
  }

  return (
    <>
      {/* key={id} fuerza un montaje nuevo (refs, motor y store limpios) cada
          vez que se abre un guion distinto — igual que siempre — pero ya no
          se lleva puesto el emparejamiento, que vive arriba. */}
      <TeleprompterSession
        key={id}
        id={id}
        remoteConfigured={remoteConfigured}
        remoteSessionId={hostSessionId}
        remoteSession={remoteSession}
        showPairingModal={showPairingModal}
        remoteError={remoteError}
        onRemoteControlClick={handleRemoteControlClick}
      />
      {/* Vive fuera de TeleprompterSession a propósito: el modal no formaba
          parte del overlay con ocultado automático/toque fantasma (ver el
          JSX de antes de esta fase — se renderizaba como hijo directo de la
          raíz, no dentro del footer), así que moverlo acá no cambia nada
          visible y de paso evita que sobreviva o no según el guion. */}
      {showPairingModal && hostSessionId && (
        <PairingModal
          sessionId={hostSessionId}
          session={remoteSession}
          joinUrl={`${window.location.origin}/remote/${hostSessionId}`}
          onClose={() => setShowPairingModal(false)}
        />
      )}
    </>
  )
}

interface TeleprompterSessionProps {
  id: string
  // B.1: el ciclo de vida de la sesión de control remoto ahora vive en
  // TeleprompterPage (ver más arriba) — este componente solo recibe su
  // estado ya resuelto, exactamente como lo recibía de su propio useState
  // antes de esta fase. El procesamiento de comandos entrantes y la
  // publicación de playback/calibración se quedan ACÁ (dejando en
  // TeleprompterSession el motor, refs y calibración, como se pidió):
  // necesitan el motor y los ajustes de calibración, que siguen siendo
  // locales a este componente.
  remoteConfigured: boolean
  remoteSessionId: string | null
  remoteSession: RemoteSession | null
  showPairingModal: boolean
  remoteError: string | null
  onRemoteControlClick: (scriptTitle: string) => void
}

function TeleprompterSession({
  id,
  remoteConfigured,
  remoteSessionId,
  remoteSession,
  showPairingModal,
  remoteError,
  onRemoteControlClick,
}: TeleprompterSessionProps) {
  const navigate = useNavigate()
  const [script, setScript] = useState<ScriptRecord | null | undefined>(undefined)

  // Memoizado (no recalculado en cada render): countWords vuelve a parsear
  // el HTML con DOMParser, y este componente re-renderiza hasta ~8 veces
  // por segundo mientras se reproduce (EMIT_THROTTLE_MS del motor). Solo
  // cambia cuando cambia `script` (prácticamente solo al cargar), así que
  // recomputarlo en cada tick de progreso sería puro desperdicio. Lo usa el
  // manejador de comandos remotos de avanzar/retroceder para convertir
  // segundos a progreso normalizado con la misma fórmula que ya usa el motor.
  const wordCount = useMemo(() => (script ? countWords(script.content) : 0), [script])

  // F8.5: guiones reales se pegan desde Word/ChatGPT/WhatsApp, no se
  // escriben a mano — y ese pegado puede dejar `font-size` (u otro estilo)
  // puesto INLINE por bloque, que le gana para siempre a cualquier
  // calibración (perfil, panel en vivo, comando remoto). EditorCanvas ya
  // sanea esto al pegar (para lo NUEVO), pero un guion pegado ANTES de ese
  // arreglo sigue con el HTML contaminado guardado en Dexie tal cual — acá
  // se sanea también al momento de RENDERIZAR, sin reescribir nada en la
  // base: la próxima vez que se abra este guion se vuelve a sanear al
  // vuelo, así que no hace falta ninguna migración ni pedirle al usuario
  // que lo vuelva a pegar. Memoizado por el mismo motivo que wordCount:
  // volver a parsear el HTML en cada tick de progreso sería desperdicio.
  const sanitizedContent = useMemo(() => (script ? sanitizeContentHtml(script.content) : ''), [script])

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [engine] = useState(() => new TeleprompterEngine())

  // Activo todo el tiempo que esta pantalla está montada (entrar/salir del
  // Teleprompter, no el estado de reproducción) — leer detrás del vidrio
  // con la pantalla apagándose sola no sirve de nada.
  const { supported: wakeLockSupported, failed: wakeLockFailed } = useWakeLock(true)

  // "Pantalla limpia": pantalla completa sobre el contenedor raíz, y
  // header/footer que se ocultan tras unos segundos de inactividad.
  const { supported: fsSupported, isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)
  const { idle } = useIdleControls()
  const [footerHasFocus, setFooterHasFocus] = useState(false)

  const status = usePlayerStore((s) => s.status)
  const progress = usePlayerStore((s) => s.progress)
  const wpm = usePlayerStore((s) => s.wpm)
  const pausedByMarker = usePlayerStore((s) => s.pausedByMarker)
  const attachEngine = usePlayerStore((s) => s.attachEngine)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const resetPlayback = usePlayerStore((s) => s.reset)
  const setSpeed = usePlayerStore((s) => s.setSpeed)

  const profiles = useProfilesStore((s) => s.profiles)
  const loadProfiles = useProfilesStore((s) => s.loadProfiles)
  const createProfile = useProfilesStore((s) => s.createProfile)
  const updateProfile = useProfilesStore((s) => s.updateProfile)
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)

  const publishRemotePlayback = useRemoteStore((s) => s.publishPlayback)
  const publishCalibration = useRemoteStore((s) => s.publishCalibration)
  const publishNotice = useRemoteStore((s) => s.publishNotice)
  const refreshRemoteUid = useRemoteStore((s) => s.refreshRemoteUid)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [showSaveAsNewProfileDialog, setShowSaveAsNewProfileDialog] = useState(false)
  // B.1: se inicializa con el commandId YA VISTO (si `remoteSession` llega
  // con uno, porque este componente se está remontando tras un cambio de
  // guion con la sesión todavía viva) en vez de `null` — si no, el guard de
  // "comando ya procesado" de más abajo no reconocería ese último comando
  // como viejo, y se volvería a ejecutar una vez de más justo al abrir el
  // guion nuevo.
  const lastCommandIdRef = useRef<string | null>(remoteSession?.command?.commandId ?? null)
  const lastPublishRef = useRef<{
    status: string
    pausedByMarker: boolean
    wpm: number
    scriptTitle: string | undefined
    publishedAt: number
  } | null>(null)
  // Feature A (barra de progreso arrastrable): tras aplicar un
  // 'seekToProgress', el remoto necesita ver la nueva posición de inmediato
  // (no esperar hasta PLAYBACK_PUBLISH_INTERVAL_MS) para que soltar el dedo
  // se sienta como una respuesta directa. Un ref (no state) porque solo lo
  // lee el efecto de publicación en la próxima pasada, sin necesidad de
  // disparar un render propio.
  const forceImmediatePublishRef = useRef(false)

  // Nunca se ocultan mientras: hay un modal de emparejamiento abierto, hay
  // un error de control remoto visible, algún control del footer (p. ej.
  // el <select> de perfil con su desplegable abierto) tiene el foco, o el
  // panel de ajustes en vivo está abierto. El estado "pausado" NO fuerza
  // los controles visibles a propósito — se trata como cualquier otro
  // estado de reproducción.
  const controlsVisible = !idle || showPairingModal || remoteError != null || footerHasFocus || settingsPanelOpen

  // TOQUE FANTASMA: si el mismo toque que revela los controles (touchstart)
  // también generara su click sobre un botón recién aparecido (p. ej. Play),
  // se dispararía una acción no querida. Los controles se hacen visibles de
  // inmediato (opacity), pero pointer-events se habilita recién ~350ms
  // después — tiempo de sobra para que termine el gesto de touch que los
  // reveló, y prácticamente imperceptible para un click deliberado posterior.
  const [controlsInteractive, setControlsInteractive] = useState(false)
  useEffect(() => {
    if (!controlsVisible) {
      setControlsInteractive(false)
      return
    }
    const timer = setTimeout(() => setControlsInteractive(true), 350)
    return () => clearTimeout(timer)
  }, [controlsVisible])

  function handleFooterFocus() {
    setFooterHasFocus(true)
  }

  function handleFooterBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFooterHasFocus(false)
    }
  }

  // Si el elemento raíz sigue en pantalla completa al salir de esta pantalla
  // (botón "Volver" o desmontaje por cualquier otra vía), hay que salir
  // explícitamente: nada garantiza que el navegador lo haga solo al quitar
  // el elemento del DOM.
  function exitFullscreenIfActive() {
    if (document.fullscreenElement === rootRef.current) {
      document.exitFullscreen().catch(() => {})
    }
  }

  function handleBack() {
    exitFullscreenIfActive()
    navigate('/guiones')
  }

  useEffect(() => {
    return () => {
      exitFullscreenIfActive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cargar el guion.
  useEffect(() => {
    let cancelled = false
    db.scripts.get(Number(id)).then((record) => {
      if (!cancelled) setScript(record ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Cargar los perfiles de calibración guardados (mismo store/tabla que
  // Glass Test, sin duplicar nada) y restaurar el último perfil elegido si
  // todavía existe. Si no hay ninguno guardado, o el guardado ya no existe,
  // selectedProfileId se queda en null = "Predeterminado".
  useEffect(() => {
    loadProfiles().then(() => {
      const stored = window.localStorage.getItem(LAST_PROFILE_STORAGE_KEY)
      if (!stored) return
      const storedId = Number(stored)
      const exists = useProfilesStore.getState().profiles.some((p) => p.id === storedId)
      if (exists) setSelectedProfileId(storedId)
    })
  }, [loadProfiles])

  function handleSelectProfile(value: string) {
    const nextId = value ? Number(value) : null
    setSelectedProfileId(nextId)
    if (nextId != null) {
      window.localStorage.setItem(LAST_PROFILE_STORAGE_KEY, String(nextId))
    } else {
      window.localStorage.removeItem(LAST_PROFILE_STORAGE_KEY)
    }
  }

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null

  // F8.4 parte B: ajustes de calibración en VIVO (tamaño de letra, margen,
  // interlineado, alineación, espejo), editables desde el panel del host o
  // por comando remoto, sin necesidad de guardar nada. `null` = exactamente
  // "Predeterminado" tal como se comportaba esta pantalla siempre (sin
  // ningún estilo de calibración aplicado) — un perfil elegido, o CUALQUIER
  // ajuste en vivo, lo materializa a un objeto real. Cambiar de perfil
  // reemplaza liveSettings por completo: los ajustes en vivo no guardados
  // del perfil anterior se pierden, que es justamente lo que significa que
  // sean "temporales".
  const [liveSettings, setLiveSettings] = useState<CalibrationSettings | null>(null)
  // Progreso a restaurar en el useLayoutEffect de más abajo, apenas el DOM
  // reflowea con la geometría nueva. Es un ref (no un segundo useState)
  // porque no necesita disparar ningún render por sí solo — solo lo lee ese
  // mismo layout effect.
  const pendingProgressRef = useRef<number | null>(null)

  function applyLiveSettings(next: CalibrationSettings | null) {
    // Se guarda ANTES de que este cambio disare el render con los estilos
    // nuevos — en este punto el DOM todavía tiene la geometría VIEJA, así
    // que engine.getProgress() todavía es válido.
    pendingProgressRef.current = engine.getProgress()
    setLiveSettings(next)
  }

  // Un perfil elegido (o "Predeterminado") reinicia liveSettings por
  // completo. Se reacciona a selectedProfileId (no al objeto selectedProfile
  // derivado) para no dispararse por casualidad cuando `profiles` cambia de
  // referencia sin que el perfil ELEGIDO haya cambiado realmente (p. ej. al
  // guardar cambios, loadProfiles() recrea todos los objetos del array).
  useEffect(() => {
    applyLiveSettings(selectedProfile ? { ...DEFAULT_CALIBRATION, ...selectedProfile } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

  function handleLiveSettingsChange(patch: Partial<CalibrationSettings>) {
    applyLiveSettings({ ...(liveSettings ?? DEFAULT_CALIBRATION), ...patch })
  }

  // "Guardar en perfil": si hay un perfil elegido, sobreescribe sus valores;
  // si no ("Predeterminado" con ajustes en vivo), pide un nombre con
  // PromptDialog (ver su render más abajo) y crea uno nuevo — mismo patrón
  // que ya usa Glass Test, sin reimplementarlo distinto acá.
  async function handleSaveLiveSettingsToProfile() {
    if (selectedProfileId != null) {
      await updateProfile(selectedProfileId, liveSettings ?? DEFAULT_CALIBRATION)
      return
    }
    setShowSaveAsNewProfileDialog(true)
  }

  // F8.4 parte B: restaurar la posición de lectura DESPUÉS de que un ajuste
  // de calibración reflowea el contenido (cambia scrollHeight). El progreso
  // se guardó en applyLiveSettings ANTES de este mismo cambio; acá — en un
  // useLayoutEffect, que corre sincrónicamente después de que React ya
  // aplicó los estilos nuevos al DOM pero ANTES de que el navegador pinte —
  // se remide la geometría real (recalculateGeometry) y se restaura esa
  // posición como progreso NORMALIZADO (seekToProgress, nunca píxeles: el
  // total de píxeles cambió junto con la geometría). Un useEffect común
  // (asíncrono, después de pintar) dejaría ver un frame en la posición
  // vieja/incorrecta antes de corregirse — por eso useLayoutEffect y no
  // useEffect.
  useLayoutEffect(() => {
    engine.recalculateGeometry()
    if (pendingProgressRef.current != null) {
      engine.seekToProgress(pendingProgressRef.current)
      pendingProgressRef.current = null
    }
  }, [engine, liveSettings])

  // F8.3/F8.4 — REMOTE → HOST: ejecuta el comando que llega en
  // remoteSession.command. remoteSession.remoteUid sale SIEMPRE de la tabla
  // (get_remote_session, ver remoteSession.ts) — nunca de Presence
  // directamente, que es pública y cualquiera que conozca el sessionId
  // podría falsear. Se descarta cualquier comando cuyo senderId no
  // coincida; si no coincide, se pide reconfirmar remoteUid contra la
  // tabla (refreshRemoteUid, con su propio límite de una vez cada 2s) por
  // si el remoto real recién se unió y el comando llegó una fracción de
  // segundo antes de que remoteUid se actualizara — el comando queda sin
  // marcar como procesado, así que si la reconfirmación coincide, este
  // mismo efecto lo ejecuta en la próxima pasada. commandId identifica cada
  // envío (incluso dos pulsaciones seguidas del mismo tipo generan uno
  // distinto), y se guarda en memoria el último procesado para no ejecutar
  // el mismo dos veces si el listener se dispara de nuevo con el mismo
  // valor.
  //
  // F8.4 parte A agrega 'seekForward'/'seekBack'/'setSpeed', todos sujetos
  // al mismo guard de senderId de arriba (nada nuevo que autorizar aparte).
  // 'seekForward'/'seekBack' nunca reciben píxeles ni segundos del remoto:
  // el remoto solo pide "un salto", y ESTE host decide cuánto es en su
  // propia geometría, convirtiendo SEEK_SECONDS a progreso normalizado con
  // la velocidad y cantidad de palabras reales del guion (estimateDurationSeconds,
  // la misma fórmula que ya usa el motor internamente) y aplicándolo con
  // engine.seekToProgress — nunca con píxeles. 'setSpeed' sí trae un valor
  // (el wpm objetivo que ya calculó el remoto), pero clampRemoteWpm lo
  // vuelve a validar/clampear acá y descarta el comando por completo si no
  // es un número finito: nunca se confía en lo que manda el remoto sin
  // revalidar. 'setCalibration' (F8.4 parte B) sigue el mismo principio:
  // validateCalibrationCommand aplica una lista blanca de `param` y valida
  // el tipo exacto esperado para cada uno (número finito clampeado a su
  // rango real, o un valor exacto del enum de mirror/textAlign) — cualquier
  // otra cosa descarta el comando entero, nunca se aplica una versión
  // parcial.
  //
  // Límite conocido (pendiente para F8.6): los canales de Realtime son
  // públicos, así que un tercero que conozca el sessionId puede observar
  // el senderId real del remoto legítimo y reenviar un comando
  // suplantándolo. Cerrar esto requiere canales privados + autenticar al
  // remoto ante esa RLS — no se implementa en esta corrección.
  useEffect(() => {
    const command = remoteSession?.command
    if (!command || command.commandId === lastCommandIdRef.current) return
    if (command.senderId !== remoteSession?.remoteUid) {
      if (remoteSessionId) refreshRemoteUid(remoteSessionId)
      return
    }
    lastCommandIdRef.current = command.commandId
    if (command.type === 'play') play()
    else if (command.type === 'pause') pause()
    else if (command.type === 'toggle') togglePlay()
    else if (command.type === 'reset') resetPlayback()
    else if (command.type === 'seekForward' || command.type === 'seekBack') {
      const durationSeconds = estimateDurationSeconds(wordCount, wpm)
      if (durationSeconds > 0) {
        const sign = command.type === 'seekForward' ? 1 : -1
        const deltaProgress = (sign * SEEK_SECONDS) / durationSeconds
        engine.seekToProgress(progress + deltaProgress)
      }
    } else if (command.type === 'setSpeed') {
      const clamped = clampRemoteWpm(command.value)
      if (clamped != null) setSpeed(clamped)
    } else if (command.type === 'seekToProgress') {
      // Feature A: arrastrar la barra de progreso en el remoto. Mismo
      // principio que seekForward/seekBack — progreso normalizado (0-1),
      // nunca píxeles — pero acá el remoto ya calculó el valor final (según
      // dónde soltó el dedo en SU pantalla), así que solo hace falta
      // clampearlo/validarlo, no convertirlo desde segundos.
      // engine.seek() nunca pausa una reproducción en curso: si status ya
      // era 'playing', sigue reproduciendo desde la nueva posición sin
      // interrupción (solo pasa de 'finished' a 'paused' si hacía falta).
      const clamped = clampSeekProgress(command.value)
      if (clamped != null) {
        engine.seekToProgress(clamped)
        forceImmediatePublishRef.current = true
      }
    } else if (command.type === 'setCalibration') {
      const validated = validateCalibrationCommand(command.param, command.value)
      if (validated) {
        applyLiveSettings({ ...(liveSettings ?? DEFAULT_CALIBRATION), [validated.param]: validated.value })
      }
    } else if (command.type === 'loadScript') {
      // B.2: comando validado solo en su forma (parseScriptIdCommand exige
      // un número finito) — si el guion pedido ya no existe, o existe pero
      // es un borrador nunca guardado (no debería listarse nunca en el
      // remoto, pero por si el id llegó de un envío viejo/manipulado), se
      // avisa con publishNotice en vez de romper la sesión. navigate() acá
      // es seguro aunque este componente esté por desmontarse (cambia el
      // :id de la ruta, no la familia de rutas) — ver el comentario de
      // TeleprompterPage sobre por qué eso no corta el emparejamiento.
      const targetId = parseScriptIdCommand(command.value)
      if (targetId != null) {
        void (async () => {
          const target = await db.scripts.get(targetId)
          if (target && target.status !== 'draft') {
            navigate(`/teleprompter/${targetId}`)
          } else if (remoteSessionId) {
            await publishNotice(remoteSessionId, 'El guion pedido ya no existe.')
          }
        })()
      }
    }
    // applyLiveSettings se omite a propósito: es una función local (no
    // memoizada) cuya identidad cambia en cada render — listarla haría que
    // este efecto se re-ejecutara en cada render en vez de solo cuando
    // realmente cambia algo relevante. Ya lee `liveSettings` fresco porque
    // ese sí está en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    remoteSession?.command,
    remoteSession?.remoteUid,
    remoteSessionId,
    refreshRemoteUid,
    play,
    pause,
    togglePlay,
    resetPlayback,
    engine,
    wordCount,
    wpm,
    progress,
    setSpeed,
    liveSettings,
    navigate,
    publishNotice,
  ])

  // F8.3/F8.4 — HOST → REMOTE: publica un snapshot de reproducción
  // normalizado (nunca positionPx/totalPx) para que el remoto lo muestre.
  // Es una capa de throttle propia e independiente del throttle interno de
  // 120ms del motor (EMIT_THROTTLE_MS en teleprompterEngine.ts) — ese sigue
  // existiendo solo para no saturar los renders de React locales; este
  // efecto decide, aparte, cuándo vale la pena mandar un mensaje de
  // Broadcast. Los cambios de estado importantes (play/pause/reset/
  // finished/pausa por marcador/velocidad) se publican de inmediato;
  // mientras se reproduce y solo cambia el progreso, se publica como
  // máximo cada PLAYBACK_PUBLISH_INTERVAL_MS. wpm se trata como "cambio
  // importante" (no espera el intervalo) a propósito: el remoto muestra un
  // valor local optimista mientras mantiene presionado ±, y a los ~1s de
  // soltar vuelve a confiar en lo que publique el host — si esa
  // confirmación tardara hasta 1.5s en llegar, se vería "saltar" a un
  // número viejo antes de asentarse en el real. Solo corre una vez hay un
  // remoto emparejado — antes de eso nadie lo está escuchando.
  //
  // B.1: script?.title también cuenta como "cambio importante" — es lo que
  // hace que, al cambiar de guion con la sesión ya emparejada (sobrevive
  // gracias a TeleprompterPage), el remoto reciba el título nuevo de
  // inmediato en vez de seguir mostrando el del guion anterior. En el
  // primerísimo render tras el remontaje `script` todavía es `undefined`
  // (se carga async); esa primera publicación sale sin scriptTitle
  // (subscribeToSession la ignora, ver remoteSession.ts) y la segunda,
  // apenas el guion carga y el motor se adjunta (status pasa a 'ready'),
  // ya lo lleva.
  useEffect(() => {
    if (!remoteSessionId || !remoteSession?.remoteUid) return
    const now = Date.now()
    const prev = lastPublishRef.current
    const forceImmediate = forceImmediatePublishRef.current
    const changed =
      !prev ||
      prev.status !== status ||
      prev.pausedByMarker !== pausedByMarker ||
      prev.wpm !== wpm ||
      prev.scriptTitle !== script?.title ||
      forceImmediate
    const progressDue = !prev || now - prev.publishedAt >= PLAYBACK_PUBLISH_INTERVAL_MS
    if (!changed && !progressDue) return
    forceImmediatePublishRef.current = false
    lastPublishRef.current = { status, pausedByMarker, wpm, scriptTitle: script?.title, publishedAt: now }
    publishRemotePlayback(remoteSessionId, {
      engineStatus: status,
      progress,
      wpm,
      pausedByMarker,
      updatedAt: now,
      scriptTitle: script?.title,
      // B.2: id real del guion en pantalla — el remoto lo usa para marcar
      // cuál está resaltado en la lista y calcular "Siguiente guion".
      scriptId: Number(id),
    })
  }, [
    remoteSessionId,
    remoteSession?.remoteUid,
    status,
    progress,
    wpm,
    pausedByMarker,
    script?.title,
    publishRemotePlayback,
    id,
  ])

  // F8.4 parte B — HOST → REMOTE: publica el snapshot de calibración
  // vigente (lo que el host efectivamente tiene aplicado, nunca lo que un
  // remoto pidió) cada vez que cambia, y también apenas remoteConnected
  // pasa a true — así un remoto recién conectado ve el valor real de
  // inmediato, sin esperar a que alguien toque un ajuste. Sin throttle
  // propio a propósito: a diferencia del progreso de reproducción, esto no
  // cambia varias veces por segundo.
  useEffect(() => {
    if (!remoteSessionId || !remoteSession?.remoteConnected) return
    const settings = liveSettings ?? DEFAULT_CALIBRATION
    publishCalibration(remoteSessionId, {
      fontSize: settings.fontSize,
      maxWidth: settings.maxWidth,
      lineHeight: settings.lineHeight,
      textAlign: settings.textAlign,
      mirror: settings.mirror,
      updatedAt: Date.now(),
    })
  }, [remoteSessionId, remoteSession?.remoteConnected, liveSettings, publishCalibration])

  // Conectar el motor al store en cuanto existe esta sesión.
  useEffect(() => {
    const detachStore = attachEngine(engine)
    return () => {
      detachStore()
      engine.detach()
    }
  }, [attachEngine, engine])

  // Una vez que el guion cargó y el DOM del lienzo existe, medirlo y
  // preparar el motor (alto desplazable, velocidad, marcadores).
  useEffect(() => {
    if (!script || !viewportRef.current || !contentRef.current) return
    engine.attach(viewportRef.current, contentRef.current, wordCount)
  }, [script, engine, wordCount])

  // Recalcular geometría ante un cambio de tamaño de la ventana (p. ej. al
  // rotar el celular): el reflujo del texto puede mover dónde cae cada
  // marcador verticalmente.
  useEffect(() => {
    function handleResize() {
      engine.recalculateGeometry()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [engine])

  if (script === undefined) {
    return <div className="p-8 text-sm text-gray-500">Cargando guion...</div>
  }

  if (script === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-gray-500">No se encontró este guion.</p>
        <button
          type="button"
          onClick={() => navigate('/guiones')}
          className={`${FONT_DISPLAY} rounded-md ${ACCENT_BG} px-4 py-2 text-sm font-medium ${ON_ACCENT} ${ACCENT_BG_HOVER}`}
        >
          Volver a Mis guiones
        </button>
      </div>
    )
  }

  const playLabel = status === 'playing' ? 'Pausa' : status === 'finished' ? 'Reproducir de nuevo' : 'Play'
  const statusLabel =
    status === 'finished'
      ? 'Finalizado'
      : status === 'paused'
        ? 'Pausado'
        : status === 'playing'
          ? 'Reproduciendo'
          : 'Listo'

  // Corrección del bug "el panel miente": liveSettings null ("Predeterminado",
  // nunca tocado) solía renderizarse con clases Tailwind fijas (text-3xl=30px,
  // leading-relaxed=1.625, max-w-3xl=768px fijos) mientras el panel siempre
  // mostraba los números de DEFAULT_CALIBRATION (56px/1.4/90%) — dos
  // "valores por defecto" distintos que nunca se habían reconciliado. Tocar
  // CUALQUIER slider materializaba liveSettings a partir de DEFAULT_CALIBRATION,
  // y ahí el render saltaba de golpe de un default al otro (confirmado
  // midiendo el fontSize computado: 30px → 60px en vez de 56px → 60px).
  //
  // effectiveSettings unifica los dos: "Predeterminado" ahora ES
  // DEFAULT_CALIBRATION renderizado con buildCalibrationStyle, ni más ni
  // menos — no hay una rama aparte con números propios. El panel (más abajo,
  // via liveSettings ?? DEFAULT_CALIBRATION) y esta variable siempre
  // coinciden, así que el primer movimiento del slider parte del mismo
  // número que ya se estaba mostrando, sin salto.
  const effectiveSettings = liveSettings ?? DEFAULT_CALIBRATION
  const stageStyle = buildCalibrationStyle(effectiveSettings)
  const ghostStyle = buildGhostLayerStyle(effectiveSettings)
  const viewportBackground = getEffectiveColors(effectiveSettings).background
  // Mismo contenido SANEADO que el texto principal — si no, el ghost podría
  // seguir mostrando el tamaño contaminado de un guion pegado mientras el
  // texto real ya escala bien, una inconsistencia visual rara detrás del
  // vidrio.
  const ghostHtml = ghostStyle ? stripPauseMarkersForGhost(sanitizedContent) : null
  // 'script' (default, y el valor de DEFAULT_CALIBRATION.textAlign): no se
  // agrega la clase ni la hoja de estilos — el contenido conserva la
  // alineación que el editor le puso a cada bloque, exactamente como
  // siempre. Cualquier otro valor SÍ fuerza la alineación en todo el
  // contenido (ver getTextAlignOverrideCss en calibrationEngine.ts — un
  // `text-align` en el wrapper no alcanza contra el estilo inline por
  // bloque que deja el editor).
  const textAlignOverrideCss = getTextAlignOverrideCss(effectiveSettings.textAlign)

  return (
    // h-dvh (no h-screen): en celular, fuera de pantalla completa, la barra
    // de direcciones del navegador puede ocupar parte de h-screen (100vh
    // "clásico") y tapar el footer superpuesto. h-dvh usa el alto de
    // viewport dinámico, que ya descuenta esa barra. Esta ruta vive fuera de
    // Layout (ver router.tsx) precisamente para esta fase: nada de sidebar
    // ni chrome ajeno debe compartir la pantalla con el texto.
    // cursor-none mientras `idle` es true: sin esto, el cursor del mouse
    // quedaría visible sobre el texto en un equipo de escritorio aun con los
    // controles ocultos.
    <div
      ref={rootRef}
      className={`relative h-dvh w-full overflow-hidden bg-[#0b0c10] ${idle ? 'cursor-none' : ''}`}
    >
      {/* Overlay superior: header + aviso de pausa por marcador, ambos
          posicionados de forma absoluta (no en el flujo flex) para que
          ocultarlos nunca cambie el alto de viewportRef — el motor mide
          clientHeight una sola vez al montar y en resize/cambio de perfil,
          así que si el header reapareciera empujando el layout, totalPx y
          readingLinePx quedarían mal calculados sin que nada dispare un
          recalculateGeometry. Con overlays absolutos, el viewport ocupa
          siempre el 100% del contenedor raíz y esto no puede pasar. */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex flex-col transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ pointerEvents: controlsInteractive ? 'auto' : 'none' }}
      >
        {/* Ancho angosto (360px): Volver/título/% siempre entran en la
            primera fila (shrink-0 en los fijos, min-w-0+truncate en el
            título). Los avisos de wake lock (texto largo, poco frecuente —
            solo cuando falla o no está soportado) y "Pantalla completa"
            van con basis-full: si no entran en la primera fila, flex-wrap
            los manda a una segunda fila propia en vez de comprimir o
            desbordar la primera. Es un overlay absoluto (ver el comentario
            de arriba) — que crezca a dos filas no mueve nada del layout
            real del viewport. */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-[#0b0c10]/90 px-4 py-3 backdrop-blur-sm sm:px-6">
          <button type="button" onClick={handleBack} className="shrink-0 text-sm text-gray-400 hover:text-gray-100">
            ← Volver
          </button>
          <h1 className={`min-w-0 flex-1 truncate text-lg font-medium text-gray-100 ${FONT_DISPLAY}`}>{script.title || 'Sin título'}</h1>
          <span className="shrink-0 text-xs text-gray-500">{Math.round(progress * 100)}%</span>
          {fsSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="shrink-0 whitespace-nowrap text-xs text-gray-400 hover:text-gray-100"
            >
              {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </button>
          )}
          {!wakeLockSupported && (
            <span className="basis-full text-xs text-gray-500">La pantalla podría apagarse sola en este navegador.</span>
          )}
          {wakeLockSupported && wakeLockFailed && (
            <span className="basis-full text-xs text-gray-500">
              No se pudo mantener la pantalla encendida (¿ahorro de batería?).
            </span>
          )}
        </header>

        {pausedByMarker && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-300 sm:px-6">
            ⏸ Pausado automáticamente en un marcador de pausa. Presiona Play para continuar.
          </div>
        )}
      </div>

      {/* El color de fondo del perfil se aplica aquí (por encima de la
          clase bg-[#0b0c10] de siempre) para que el área completa detrás
          del vidrio coincida con lo calibrado en Glass Test. absolute
          inset-0: ocupa siempre el contenedor raíz entero, sin importar si
          los overlays de header/footer están visibles u ocultos. */}
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden bg-[#0b0c10]"
        style={{ backgroundColor: viewportBackground }}
      >
        {/* Ver getTextAlignOverrideCss en calibrationEngine.ts: solo existe
            cuando textAlign !== 'script', y solo afecta a los elementos con
            TEXT_ALIGN_OVERRIDE_CLASS (el wrapper del contenido, más abajo). */}
        {textAlignOverrideCss && <style>{textAlignOverrideCss}</style>}
        {/* Este wrapper aplica mirror/offset/filtro/ancho/tamaño de
            effectiveSettings (DEFAULT_CALIBRATION en "Predeterminado", o
            liveSettings si hay perfil/ajuste en vivo) sin tocar el elemento
            que el motor transforma — nunca queda sin estilo: eso era
            justamente la causa del bug (ver el comentario de
            effectiveSettings más arriba). */}
        <div style={{ ...stageStyle, fontFamily: LEGACY_SYSTEM_FONT }}>
          <div
            ref={contentRef}
            // position: relative (siempre) para que los marcadores de pausa
            // y la capa Ghost midan su posición contra ESTE elemento — el
            // mismo que mueve el motor — y no terminen usando por accidente
            // al wrapper de arriba como referencia de posicionamiento
            // (offsetParent), lo que rompería el cálculo de checkpoints del
            // motor. No cambia nada visible: no se fija ningún top/left.
            // F8.5: text-[1.3em] es RELATIVO — em en `font-size` es 1.3× el
            // font-size COMPUTADO del padre (el fontSize dinámico que
            // buildCalibrationStyle pone inline en el wrapper de arriba),
            // así que el título escala proporcional con cualquier ajuste
            // (host o remoto) y de paso se mantiene siempre más grande que
            // el cuerpo del texto. Ya no existe una rama "Predeterminado"
            // con clases fijas (text-3xl/max-w-3xl/leading-relaxed): esa
            // era precisamente la causa del desajuste entre lo que mostraba
            // el panel y lo que se veía en pantalla.
            className={`py-16 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-[1.3em] [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4 ${
              effectiveSettings.textAlign !== 'script' ? TEXT_ALIGN_OVERRIDE_CLASS : ''
            }`}
            style={{ position: 'relative' }}
          >
            {/* El contenido real (el que cuenta para el alto desplazable)
                se renderiza una sola vez y nunca cambia mientras se
                reproduce: el motor mueve `contentRef` con transform,
                nunca a través de un re-render de React. sanitizedContent
                (F8.5), no script.content directo: ver el comentario del
                useMemo más arriba — nunca reescribe Dexie, solo lo que se
                pinta. */}
            <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
            {ghostHtml && (
              <div aria-hidden="true" style={ghostStyle ?? undefined} dangerouslySetInnerHTML={{ __html: ghostHtml }} />
            )}
          </div>
        </div>
      </div>

      {/* Overlay inferior: mismo motivo que el de arriba (absoluto, no
          reflow). onFocus/onBlur (con bubbling) trackean si algún control
          del footer tiene el foco, para no ocultarlo mientras (p. ej. el
          <select> de perfil con su desplegable abierto en desktop). */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ pointerEvents: controlsInteractive ? 'auto' : 'none' }}
      >
        {/* F8.4 parte B: vive DENTRO del mismo overlay que el footer (no un
            overlay aparte) para heredar gratis su ocultado automático y su
            protección de toque fantasma — no hace falta duplicar ninguna
            de las dos acá. */}
        {settingsPanelOpen && (
          <LiveSettingsPanel
            settings={liveSettings ?? DEFAULT_CALIBRATION}
            onChange={handleLiveSettingsChange}
            onSave={handleSaveLiveSettingsToProfile}
            onClose={() => setSettingsPanelOpen(false)}
          />
        )}
        {showSaveAsNewProfileDialog && (
          <PromptDialog
            title="Guardar como nuevo perfil"
            label="Nombre del perfil"
            placeholder="Ej. Teléfono, Tablet, Teleprompter principal"
            confirmLabel="Guardar"
            onConfirm={async (name) => {
              const id = await createProfile(name, liveSettings ?? DEFAULT_CALIBRATION)
              handleSelectProfile(String(id))
              setShowSaveAsNewProfileDialog(false)
            }}
            onClose={() => setShowSaveAsNewProfileDialog(false)}
          />
        )}
        <footer
          onFocus={handleFooterFocus}
          onBlur={handleFooterBlur}
          className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#0b0c10]/90 px-4 py-3 backdrop-blur-sm sm:px-6"
        >
          {/* flex-wrap acá TAMBIÉN (no solo en el <footer>): los 4 botones
              son un solo hijo del footer desde el punto de vista del
              flex-wrap de arriba — si ESTE grupo no envuelve sus propios
              botones, el grupo entero se desborda igual (confirmado con
              "Control remoto" cortado a 360px), aunque el footer que lo
              contiene sí sepa envolver grupos completos. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className={`${FONT_DISPLAY} rounded-md ${ACCENT_BG} px-4 py-2 text-sm font-medium ${ON_ACCENT} ${ACCENT_BG_HOVER}`}
            >
              {playLabel}
            </button>
            <button
              type="button"
              onClick={resetPlayback}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Reiniciar
            </button>
            <button
              type="button"
              onClick={() => setSettingsPanelOpen((v) => !v)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Ajustes
            </button>
            <button
              type="button"
              onClick={() => onRemoteControlClick(script.title || 'Sin título')}
              disabled={!remoteConfigured}
              title={!remoteConfigured ? 'Control remoto no disponible en este momento.' : undefined}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!remoteSessionId
                ? 'Control remoto'
                : remoteSession?.status === 'ended'
                  ? 'Sesión cerrada'
                  : remoteSession?.remoteConnected
                    ? 'Remoto conectado'
                    : 'Esperando remoto…'}
            </button>
            {remoteError && <span className="basis-full text-xs text-red-400">{remoteError}</span>}
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
            <span>Velocidad (PPM)</span>
            <input
              type="number"
              min={MIN_REMOTE_WPM}
              max={MAX_REMOTE_WPM}
              value={wpm}
              onChange={(e) => setSpeed(Number(e.target.value) || DEFAULT_WPM)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-16 shrink-0 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
            />
          </label>

          <label className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
            <span>Perfil</span>
            <select
              value={selectedProfileId ?? ''}
              onChange={(e) => {
                handleSelectProfile(e.target.value)
                e.target.blur()
              }}
              className="rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
            >
              <option value="">Predeterminado</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${ACCENT_BG}`} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <span className="text-xs text-gray-500">{statusLabel}</span>
        </footer>
      </div>
    </div>
  )
}
