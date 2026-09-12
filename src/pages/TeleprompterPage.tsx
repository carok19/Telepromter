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
import { db, type ScriptRecord } from '../db/db'
import { countWords, DEFAULT_WPM, estimateDurationSeconds } from '../engine/duration'
import { TeleprompterEngine } from '../engine/teleprompterEngine'
import { useFullscreen } from '../hooks/useFullscreen'
import { useIdleControls } from '../hooks/useIdleControls'
import { useWakeLock } from '../hooks/useWakeLock'
import {
  clampRemoteWpm,
  MAX_REMOTE_WPM,
  MIN_REMOTE_WPM,
  validateCalibrationCommand,
  type RemoteSession,
} from '../services/remoteSession'
import { usePlayerStore } from '../stores/playerStore'
import { useProfilesStore } from '../stores/profilesStore'
import { useRemoteStore } from '../stores/remoteStore'

// Recuerda el último perfil elegido para el teleprompter entre sesiones. Es
// una preferencia liviana de UI (un id), no datos del dominio — se guarda en
// localStorage a propósito, sin tocar el esquema de Dexie para esto.
const LAST_PROFILE_STORAGE_KEY = 'robress:teleprompterProfileId'

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

export function TeleprompterPage() {
  const { id } = useParams()

  if (!id) {
    return (
      <div className="p-8 text-sm text-gray-500">Selecciona un guion desde la biblioteca para reproducirlo.</div>
    )
  }

  // key={id} fuerza un montaje nuevo (refs, motor y store limpios) cada vez
  // que se abre un guion distinto, en vez de reutilizar la instancia previa.
  return <TeleprompterSession key={id} id={id} />
}

function TeleprompterSession({ id }: { id: string }) {
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

  const remoteConfigured = useRemoteStore((s) => s.configured)
  const createRemoteSession = useRemoteStore((s) => s.createSession)
  const endRemoteSession = useRemoteStore((s) => s.endSession)
  const subscribeRemoteSession = useRemoteStore((s) => s.subscribeSession)
  const publishRemotePlayback = useRemoteStore((s) => s.publishPlayback)
  const publishCalibration = useRemoteStore((s) => s.publishCalibration)
  const refreshRemoteUid = useRemoteStore((s) => s.refreshRemoteUid)
  const [remoteSessionId, setRemoteSessionId] = useState<string | null>(null)
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null)
  const [showPairingModal, setShowPairingModal] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const lastCommandIdRef = useRef<string | null>(null)
  const lastPublishRef = useRef<{ status: string; pausedByMarker: boolean; wpm: number; publishedAt: number } | null>(
    null,
  )

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
  // si no ("Predeterminado" con ajustes en vivo), pide un nombre y crea uno
  // nuevo — mismo patrón que ya usa Glass Test (handleSaveChanges/
  // handleSaveAsNew), sin reimplementarlo distinto acá.
  async function handleSaveLiveSettingsToProfile() {
    const settingsToSave = liveSettings ?? DEFAULT_CALIBRATION
    if (selectedProfileId != null) {
      await updateProfile(selectedProfileId, settingsToSave)
      return
    }
    const name = window.prompt('Nombre del perfil (ej. Teléfono, Tablet, Teleprompter principal):', 'Nuevo perfil')
    if (!name) return
    const id = await createProfile(name, settingsToSave)
    handleSelectProfile(String(id))
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

  // Suscripción en vivo a la sesión de control remoto (F8.2), si existe una
  // creada por este host. No tiene relación con la reproducción: solo se
  // usa para reflejar "esperando remoto" / "remoto conectado" en la UI.
  useEffect(() => {
    if (!remoteSessionId) return
    return subscribeRemoteSession(remoteSessionId, setRemoteSession)
  }, [remoteSessionId, subscribeRemoteSession])

  // Si el host abandona esta sesión de Teleprompter con un control remoto
  // activo, se cierra: el remoto debe verlo como "Sesión finalizada" en vez
  // de quedar "conectado" a un host que ya no está en esta pantalla.
  useEffect(() => {
    return () => {
      if (remoteSessionId) endRemoteSession(remoteSessionId)
    }
  }, [remoteSessionId, endRemoteSession])

  async function handleRemoteControlClick() {
    if (remoteSessionId) {
      setShowPairingModal(true)
      return
    }
    const result = await createRemoteSession(script?.title || 'Sin título')
    if (result.sessionId) {
      setRemoteSessionId(result.sessionId)
      setShowPairingModal(true)
      setRemoteError(null)
    } else {
      setRemoteError(result.error ?? 'No se pudo crear la sesión de control remoto.')
    }
  }

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
    } else if (command.type === 'setCalibration') {
      const validated = validateCalibrationCommand(command.param, command.value)
      if (validated) {
        applyLiveSettings({ ...(liveSettings ?? DEFAULT_CALIBRATION), [validated.param]: validated.value })
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
  useEffect(() => {
    if (!remoteSessionId || !remoteSession?.remoteUid) return
    const now = Date.now()
    const prev = lastPublishRef.current
    const changed = !prev || prev.status !== status || prev.pausedByMarker !== pausedByMarker || prev.wpm !== wpm
    const progressDue = !prev || now - prev.publishedAt >= PLAYBACK_PUBLISH_INTERVAL_MS
    if (!changed && !progressDue) return
    lastPublishRef.current = { status, pausedByMarker, wpm, publishedAt: now }
    publishRemotePlayback(remoteSessionId, {
      engineStatus: status,
      progress,
      wpm,
      pausedByMarker,
      updatedAt: now,
    })
  }, [remoteSessionId, remoteSession?.remoteUid, status, progress, wpm, pausedByMarker, publishRemotePlayback])

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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
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

  // liveSettings null ("Predeterminado", nunca tocado): no se aplica ningún
  // estilo de calibración — el teleprompter se ve exactamente como antes de
  // toda esta integración (mismas clases de siempre en el contenido). Con
  // liveSettings (perfil elegido, o cualquier ajuste en vivo aunque no haya
  // perfil): se reutilizan tal cual las funciones de calibrationEngine (la
  // misma lógica ya validada en Glass Test), sin reimplementar nada del
  // cálculo de mirror/color/filtro aquí.
  const stageStyle = liveSettings ? buildCalibrationStyle(liveSettings) : undefined
  const ghostStyle = liveSettings ? buildGhostLayerStyle(liveSettings) : null
  const viewportBackground = liveSettings ? getEffectiveColors(liveSettings).background : undefined
  const ghostHtml = ghostStyle ? stripPauseMarkersForGhost(script.content) : null
  // 'script' (default): no se agrega la clase ni la hoja de estilos — el
  // contenido conserva la alineación que el editor le puso a cada bloque,
  // exactamente como siempre. Cualquier otro valor SÍ fuerza la alineación
  // en todo el contenido (ver getTextAlignOverrideCss en calibrationEngine.ts
  // — un `text-align` en el wrapper no alcanza contra el estilo inline por
  // bloque que deja el editor).
  const textAlignOverrideCss = liveSettings ? getTextAlignOverrideCss(liveSettings.textAlign) : null

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
        <header className="flex items-center gap-4 border-b border-white/10 bg-[#0b0c10]/90 px-6 py-3 backdrop-blur-sm">
          <button type="button" onClick={handleBack} className="text-sm text-gray-400 hover:text-gray-100">
            ← Volver
          </button>
          <h1 className="flex-1 truncate text-lg font-medium text-gray-100">{script.title || 'Sin título'}</h1>
          {!wakeLockSupported && (
            <span className="text-xs text-gray-500">La pantalla podría apagarse sola en este navegador.</span>
          )}
          {wakeLockSupported && wakeLockFailed && (
            <span className="text-xs text-gray-500">
              No se pudo mantener la pantalla encendida (¿ahorro de batería?).
            </span>
          )}
          {fsSupported && (
            <button type="button" onClick={toggleFullscreen} className="text-xs text-gray-400 hover:text-gray-100">
              {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </button>
          )}
          <span className="text-xs text-gray-500">{Math.round(progress * 100)}%</span>
        </header>

        {pausedByMarker && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-center text-sm text-amber-300">
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
        {/* Este wrapper solo existe para aplicar mirror/offset/filtro/ancho
            del perfil (buildCalibrationStyle) sin tocar el elemento que el
            motor transforma. Sin liveSettings, stageStyle es `undefined` y
            este div queda sin ningún estilo — cero diferencia visual con el
            comportamiento de antes de esta integración. */}
        <div style={stageStyle}>
          <div
            ref={contentRef}
            // position: relative (siempre, con o sin liveSettings) para que
            // los marcadores de pausa y la capa Ghost midan su posición
            // contra ESTE elemento — el mismo que mueve el motor — y no
            // terminen usando por accidente al nuevo wrapper de arriba como
            // referencia de posicionamiento (offsetParent), lo que
            // rompería el cálculo de checkpoints del motor. No cambia nada
            // visible: no se fija ningún top/left.
            className={`${
              liveSettings
                ? 'py-16 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-4xl [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4'
                : 'mx-auto max-w-3xl px-6 py-16 text-3xl leading-relaxed text-gray-100 will-change-transform [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-4xl [&_h2]:font-semibold [&_p]:mb-4 [&_div]:mb-4'
            } ${liveSettings && liveSettings.textAlign !== 'script' ? TEXT_ALIGN_OVERRIDE_CLASS : ''}`}
            style={{ position: 'relative' }}
          >
            {/* El contenido real (el que cuenta para el alto desplazable)
                se renderiza una sola vez y nunca cambia mientras se
                reproduce: el motor mueve `contentRef` con transform,
                nunca a través de un re-render de React. */}
            <div dangerouslySetInnerHTML={{ __html: script.content }} />
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
        <footer
          onFocus={handleFooterFocus}
          onBlur={handleFooterBlur}
          className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#0b0c10]/90 px-6 py-3 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
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
              onClick={handleRemoteControlClick}
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
            {remoteError && <span className="text-xs text-red-400">{remoteError}</span>}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-500">
            Velocidad (PPM)
            <input
              type="number"
              min={MIN_REMOTE_WPM}
              max={MAX_REMOTE_WPM}
              value={wpm}
              onChange={(e) => setSpeed(Number(e.target.value) || DEFAULT_WPM)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-16 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-gray-200"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-500">
            Perfil
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
            <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <span className="text-xs text-gray-500">{statusLabel}</span>
        </footer>
      </div>

      {showPairingModal && remoteSessionId && (
        <PairingModal
          sessionId={remoteSessionId}
          session={remoteSession}
          joinUrl={`${window.location.origin}/remote/${remoteSessionId}`}
          onClose={() => setShowPairingModal(false)}
        />
      )}
    </div>
  )
}
