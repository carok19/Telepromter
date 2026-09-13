// Control remoto funcional (F8.3, sobre Supabase Realtime desde F8-Supabase;
// F8.4 parte A agrega velocidad y avanzar/retroceder): /remote/:sessionId.
// Envía comandos discretos al host y muestra el snapshot de reproducción
// que el host publica — nunca mueve nada por sí mismo, nunca asume que un
// comando llegó solo porque se tocó el botón.
import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import {
  ArrowLeftRightIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FastForwardIcon,
  FileTextIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RewindIcon,
  RotateCcwIcon,
  WifiIcon,
  WifiOffIcon,
} from '../components/shared/Icons'
import { CALIBRATION_RANGES, DEFAULT_CALIBRATION, type MirrorMode, type TextAlign } from '../engine/calibrationEngine'
import { DEFAULT_WPM } from '../engine/duration'
import {
  MAX_REMOTE_WPM,
  MIN_REMOTE_WPM,
  type CalibrationParam,
  type RemoteSession,
} from '../services/remoteSession'
import { useRemoteStore } from '../stores/remoteStore'
import { ACCENT_BG, ACCENT_BG_HOVER, ACCENT_SOFT_BG, ACCENT_TEXT, FONT_DISPLAY, ON_ACCENT, TEXT_MUTED } from '../styles/tokens'

// Sombra de foco suave con el tono del acento (antes azul), para el botón
// grande de Play/Pausa — mismo criterio que el FAB de la Biblioteca.
const PLAY_BUTTON_GLOW = 'shadow-[0_0_0_6px_rgba(242,169,59,0.15)]'

type ConnectionState = 'connecting' | 'connected' | 'not-found' | 'expired' | 'occupied' | 'ended' | 'error'

const MESSAGES: Record<ConnectionState, string> = {
  connecting: 'Conectando...',
  connected: 'Conectado',
  'not-found': 'Sesión no encontrada.',
  expired: 'Sesión expirada.',
  occupied: 'Esta sesión ya tiene un control remoto conectado.',
  ended: 'Sesión finalizada.',
  error: 'No se pudo conectar.',
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Sin iniciar',
  ready: 'Listo',
  playing: 'Reproduciendo',
  paused: 'Pausado',
  finished: 'Finalizado',
}

// MIN_REMOTE_WPM/MAX_REMOTE_WPM vienen de remoteSession.ts (defensa en
// profundidad: acá solo evita mandar valores obviamente inválidos, el host
// nunca confía en esto igual y vuelve a clampear con clampRemoteWpm).
const SPEED_STEP = 10

// F8.4 ajuste obligatorio: al mantener presionado, el primer envío es
// inmediato; recién después de HOLD_INITIAL_DELAY_MS arranca la repetición,
// cada HOLD_REPEAT_INTERVAL_MS — así un toque corto nunca dispara un
// segundo envío no querido, pero mantener presionado sí repite rápido.
const HOLD_INITIAL_DELAY_MS = 400
const HOLD_REPEAT_INTERVAL_MS = 150

// Cuánto tarda, tras soltar un botón de velocidad, en volver a mostrar el
// valor publicado por el host en vez del valor local optimista que se fue
// acumulando mientras se mantenía presionado.
const WPM_DISPLAY_REVERT_DELAY_MS = 1000

// B.2: cuánto tiempo queda visible el aviso puntual del host (p. ej. "el
// guion pedido ya no existe") antes de ocultarse solo.
const NOTICE_DISPLAY_MS = 4000

// B.2: a partir de qué progreso se considera que el guion actual está "a
// medias" (y por lo tanto hace falta confirmar antes de cambiar de guion) —
// un valor bajo a propósito, para no molestar con la confirmación si recién
// se apretó Play hace un instante.
const MIDWAY_PROGRESS_THRESHOLD = 0.02

// Hook genérico de "mantener presionado": primer disparo inmediato al
// presionar, luego repetición tras HOLD_INITIAL_DELAY_MS cada
// HOLD_REPEAT_INTERVAL_MS. onFire se guarda en un ref (no en el closure del
// setInterval) para que cada repetición use siempre la versión más
// reciente, sin necesidad de recrear el intervalo en cada render. Se
// detiene solo (nunca deja un intervalo corriendo sin el dedo encima) ante
// pointerup/pointercancel/pointerleave, cuando la pestaña se oculta
// (visibilitychange) y al desmontar.
function useHoldRepeat(onFire: () => void) {
  const timeoutRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const onFireRef = useRef(onFire)
  useEffect(() => {
    onFireRef.current = onFire
  })

  function stop() {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function start() {
    stop()
    onFireRef.current()
    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => onFireRef.current(), HOLD_REPEAT_INTERVAL_MS)
    }, HOLD_INITIAL_DELAY_MS)
  }

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      stop()
    }
  }, [])

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  }
}

// Feature A: cuánto se throttlea el envío de 'seekToProgress' MIENTRAS se
// arrastra el dedo (no el envío final al soltar, que siempre se manda sin
// esperar). 150ms — igual de frecuente que HOLD_REPEAT_INTERVAL_MS — es
// suficiente para que el host se sienta "seguido" en vivo sin saturar el
// canal en un arrastre continuo.
const SEEK_DRAG_THROTTLE_MS = 150

// Barra de progreso arrastrable. Zona táctil alta (h-11, ~44px) sobre una
// barra visual fina, siguiendo la convención táctil ya usada en los demás
// controles del remoto. setPointerCapture en pointerdown es la pieza clave:
// garantiza que move/up/cancel sigan llegando a ESTE elemento aunque el
// dedo se mueva fuera de sus límites — así "soltar fuera de la barra"
// siempre dispara el mismo commit() (con el valor ya clampeado 0-1 según la
// posición final), nunca deja el gesto sin resolver. pointercancel (el
// sistema interrumpe el gesto — cambio de app, gesto multitáctil, etc.) y
// lostpointercapture (se perdió la captura sin pasar por up/cancel) van al
// mismo cancel(): ninguno de los dos manda comando, así que nunca queda un
// seek a medio aplicar ni el valor optimista congelado en pantalla.
// Arrastrar mientras se reproduce no pausa nada: engine.seek() (el host)
// solo cambia `status` de 'finished' a 'paused' si hace falta, nunca toca
// un 'playing' en curso.
//
// `barRef` se recibe como parámetro (creado con useRef en el componente,
// igual que useFullscreen(rootRef) en TeleprompterPage) en vez de crearse y
// devolverse desde acá: devolver un ref dentro del objeto de retorno hace
// que oxlint marque como "acceso a ref durante el render" cualquier lectura
// de las demás propiedades del objeto en el JSX (falso positivo, pero real
// en esta versión del linter) — así el JSX referencia el ref local
// directamente (`ref={barRef}`), como ya hacen rootRef/viewportRef/contentRef.
function useDraggableProgress(
  barRef: RefObject<HTMLDivElement | null>,
  sessionId: string | undefined,
  send: (sessionId: string, value: number) => void,
) {
  const draggingRef = useRef(false)
  const progressRef = useRef(0)
  const lastSentAtRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)

  function progressFromClientX(clientX: number): number {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return progressRef.current
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!sessionId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const value = progressFromClientX(e.clientX)
    draggingRef.current = true
    progressRef.current = value
    lastSentAtRef.current = Date.now()
    setDragging(true)
    setDragProgress(value)
    send(sessionId, value)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const value = progressFromClientX(e.clientX)
    progressRef.current = value
    setDragProgress(value)
    if (!sessionId) return
    const now = Date.now()
    if (now - lastSentAtRef.current >= SEEK_DRAG_THROTTLE_MS) {
      lastSentAtRef.current = now
      send(sessionId, value)
    }
  }

  // Envío final GARANTIZADO al soltar, sin esperar el throttle — así el
  // punto exacto donde se soltó el dedo siempre llega, aunque el último
  // pointermove haya caído dentro de la ventana de throttle y no se haya
  // mandado.
  function commit() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (sessionId) send(sessionId, progressRef.current)
  }

  // Gesto abortado (pointercancel/lostpointercapture/pestaña oculta): NO se
  // manda nada — el host se queda donde ya estaba, y el valor optimista
  // deja de mostrarse (dragging vuelve a false, la barra vuelve a reflejar
  // el progreso real publicado por el host).
  function cancel() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
  }

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') cancel()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      cancel() // por si se desmonta el componente a mitad de un arrastre
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    dragging,
    dragProgress,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: commit,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  }
}

const MIRROR_OPTIONS: Array<[MirrorMode, string]> = [
  ['none', 'Normal'],
  ['horizontal', 'Horizontal'],
  ['vertical', 'Vertical'],
]

// Espejo horizontal/vertical se muestra con un icono (antes eran los
// símbolos ↔/↕ como texto) — 'none' ("Normal") no tiene icono, se queda con
// la etiqueta de texto.
const MIRROR_ICONS: Partial<Record<MirrorMode, ComponentType<{ className?: string }>>> = {
  horizontal: ArrowLeftRightIcon,
  vertical: ArrowUpDownIcon,
}

const TEXT_ALIGN_OPTIONS: Array<[TextAlign, string]> = [
  ['script', 'Guion'],
  ['left', 'Izq.'],
  ['center', 'Centro'],
  ['right', 'Der.'],
]

// F8.4 parte B: mismo patrón "optimista" que la velocidad (Parte A) para
// tamaño de letra / margen / interlineado — un valor local que va
// acumulando el paso mientras se mantiene presionado (sin esperar la
// confirmación del host en cada toque) y que revierte al valor publicado
// por el host ~1s después de soltar. `precision` evita que acumular pasos
// de 0.1 en interlineado arrastre errores de punto flotante.
function useOptimisticCalibrationStepper(
  param: CalibrationParam,
  step: number,
  precision: number,
  range: { min: number; max: number },
  hostValue: number,
  send: (param: CalibrationParam, value: number) => void,
) {
  const pendingRef = useRef<number | null>(null)
  const [display, setDisplay] = useState<number | null>(null)
  const revertTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current != null) window.clearTimeout(revertTimeoutRef.current)
    }
  }, [])

  function scheduleRevert() {
    if (revertTimeoutRef.current != null) window.clearTimeout(revertTimeoutRef.current)
    revertTimeoutRef.current = window.setTimeout(() => {
      pendingRef.current = null
      setDisplay(null)
      revertTimeoutRef.current = null
    }, WPM_DISPLAY_REVERT_DELAY_MS)
  }

  function fireDelta(delta: number) {
    if (revertTimeoutRef.current != null) {
      window.clearTimeout(revertTimeoutRef.current)
      revertTimeoutRef.current = null
    }
    const base = pendingRef.current ?? hostValue
    const factor = 10 ** precision
    const next = Math.round(Math.min(range.max, Math.max(range.min, base + delta)) * factor) / factor
    pendingRef.current = next
    setDisplay(next)
    send(param, next)
  }

  const incHold = useHoldRepeat(() => fireDelta(step))
  const decHold = useHoldRepeat(() => fireDelta(-step))

  function release(hold: { onPointerUp: () => void }) {
    hold.onPointerUp()
    scheduleRevert()
  }

  return { shown: display ?? hostValue, incHold, decHold, release }
}

interface CalibrationStepperRowProps {
  label: string
  unit: string
  disabled: boolean
  stepper: ReturnType<typeof useOptimisticCalibrationStepper>
}

function CalibrationStepperRow({ label, unit, disabled, stepper }: CalibrationStepperRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2">
      <span className="flex-1 truncate text-left text-xs text-gray-400">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Disminuir ${label.toLowerCase()}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        onPointerDown={stepper.decHold.onPointerDown}
        onPointerUp={() => stepper.release(stepper.decHold)}
        onPointerCancel={() => stepper.release(stepper.decHold)}
        onPointerLeave={() => stepper.release(stepper.decHold)}
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <span className="w-16 shrink-0 text-center text-sm font-semibold tabular-nums text-gray-100">
        {stepper.shown}
        {unit}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Aumentar ${label.toLowerCase()}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        onPointerDown={stepper.incHold.onPointerDown}
        onPointerUp={() => stepper.release(stepper.incHold)}
        onPointerCancel={() => stepper.release(stepper.incHold)}
        onPointerLeave={() => stepper.release(stepper.incHold)}
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

export function RemoteControlPage() {
  const { sessionId } = useParams()
  const configured = useRemoteStore((s) => s.configured)
  const ensureAuth = useRemoteStore((s) => s.ensureAuth)
  const joinSession = useRemoteStore((s) => s.joinSession)
  const subscribeSession = useRemoteStore((s) => s.subscribeSession)
  const subscribeConnectivity = useRemoteStore((s) => s.subscribeConnectivity)
  const sendCommand = useRemoteStore((s) => s.sendCommand)
  const sendCalibrationCommandAction = useRemoteStore((s) => s.sendCalibrationCommand)
  const setActiveRemoteSession = useRemoteStore((s) => s.setActiveSession)

  const [state, setState] = useState<ConnectionState>(() => (configured ? 'connecting' : 'error'))
  const [session, setSession] = useState<RemoteSession | null>(null)
  const [online, setOnline] = useState(true)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const sendingRef = useRef(false)

  // Velocidad: mientras se mantiene presionado ±, se muestra un valor local
  // "optimista" que va acumulando el paso en vez de esperar la confirmación
  // del host en cada toque (se sentiría con demora). pendingWpmRef es la
  // fuente de verdad DURANTE el gesto (un ref, no state, para que
  // useHoldRepeat/fireSpeedChange siempre lean el valor más reciente sin
  // problemas de closures obsoletos); displayWpm es solo lo que se muestra
  // en pantalla, y null significa "mostrar lo que publique el host".
  const pendingWpmRef = useRef<number | null>(null)
  const [displayWpm, setDisplayWpm] = useState<number | null>(null)
  const revertTimeoutRef = useRef<number | null>(null)
  const [editingSpeed, setEditingSpeed] = useState(false)
  const [speedInputValue, setSpeedInputValue] = useState('')

  // B.2/B.3: panel de lista de guiones (se abre/cierra, no tapa los
  // controles porque es parte del flujo normal de la página, no un overlay
  // — ver el JSX más abajo), el guion pendiente de confirmación cuando el
  // actual está a medias, y el aviso puntual del host (p. ej. "el guion
  // pedido ya no existe").
  const [scriptListOpen, setScriptListOpen] = useState(false)
  const [pendingScriptId, setPendingScriptId] = useState<number | null>(null)
  const [visibleNotice, setVisibleNotice] = useState<RemoteSession['notice']>(null)

  // Rediseño visual: "Ajustes de pantalla" pasa a ser un panel plegable
  // (arranca cerrado) en vez de estar siempre expandido — solo cambia si se
  // ve o no, ninguno de los steppers/handlers de adentro se toca.
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!sessionId || !configured) return

    let cancelled = false
    let unsubscribeSession: (() => void) | null = null

    async function join() {
      const uid = await ensureAuth()
      if (cancelled) return
      if (!uid) {
        setState('error')
        return
      }
      const result = await joinSession(sessionId!)
      if (cancelled) return
      if (result.outcome !== 'joined') {
        setState(result.outcome)
        setErrorDetail(result.errorMessage ?? null)
        return
      }
      setSession(result.session)
      setState('connected')
      unsubscribeSession = subscribeSession(sessionId!, (updated) => {
        if (cancelled) return
        setSession(updated)
        if (updated?.status === 'ended') setState('ended')
      })
    }

    join()
    return () => {
      cancelled = true
      unsubscribeSession?.()
    }
  }, [sessionId, configured, ensureAuth, joinSession, subscribeSession])

  // Conectividad de ESTE cliente con el canal de la sesión — independiente
  // del estado de la sesión en sí. Permite avisar "Conexión perdida" sin
  // desmontar la página ni tratarlo como si el host hubiera cerrado sesión.
  useEffect(() => {
    if (!configured || !sessionId) return
    return subscribeConnectivity(sessionId, setOnline)
  }, [configured, sessionId, subscribeConnectivity])

  // Limpiar el timer de "volver a mostrar el valor del host" al desmontar
  // — evita un setState en un componente ya desmontado.
  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current != null) window.clearTimeout(revertTimeoutRef.current)
    }
  }, [])

  // B.2: muestra el aviso puntual que publique el host (p. ej. "el guion
  // pedido ya no existe") unos segundos y luego lo oculta solo. Clave en
  // `notice.at` (no en el objeto entero) para que dos avisos con el MISMO
  // texto seguidos igual reinicien el temporizador y vuelvan a mostrarse.
  useEffect(() => {
    if (!session?.notice) return
    setVisibleNotice(session.notice)
    const timeout = window.setTimeout(() => setVisibleNotice(null), NOTICE_DISPLAY_MS)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.notice?.at])

  // F8.6 (PWA): refleja esta sesión en remoteStore para que
  // usePwaUpdate.ts (montado fuera de esta pantalla) sepa que este
  // dispositivo está actuando de remoto y no recargue la app en medio de
  // un emparejamiento.
  useEffect(() => {
    setActiveRemoteSession(sessionId ?? null, state === 'connected')
    return () => setActiveRemoteSession(null, false)
  }, [sessionId, state, setActiveRemoteSession])

  async function handlePlayPause() {
    if (!sessionId || sendingRef.current) return
    sendingRef.current = true
    try {
      await sendCommand(sessionId, session?.playback?.engineStatus === 'playing' ? 'pause' : 'play')
    } finally {
      sendingRef.current = false
    }
  }

  async function handleReset() {
    if (!sessionId || sendingRef.current) return
    sendingRef.current = true
    try {
      await sendCommand(sessionId, 'reset')
    } finally {
      sendingRef.current = false
    }
  }

  function scheduleWpmRevert() {
    if (revertTimeoutRef.current != null) window.clearTimeout(revertTimeoutRef.current)
    revertTimeoutRef.current = window.setTimeout(() => {
      pendingWpmRef.current = null
      setDisplayWpm(null)
      revertTimeoutRef.current = null
    }, WPM_DISPLAY_REVERT_DELAY_MS)
  }

  // Envía el wpm ABSOLUTO ya calculado (no un "delta"): el host vuelve a
  // clampear/validar igual, pero así cada mensaje es autocontenido y no
  // depende de que el host haya procesado el anterior en orden.
  function fireSpeedChange(step: number) {
    if (!sessionId) return
    // Un nuevo toque cancela cualquier reversión pendiente de un gesto
    // anterior — si no, podría "revertir" el valor de en medio del gesto
    // actual.
    if (revertTimeoutRef.current != null) {
      window.clearTimeout(revertTimeoutRef.current)
      revertTimeoutRef.current = null
    }
    const base = pendingWpmRef.current ?? session?.playback?.wpm ?? DEFAULT_WPM
    const next = Math.min(MAX_REMOTE_WPM, Math.max(MIN_REMOTE_WPM, base + step))
    pendingWpmRef.current = next
    setDisplayWpm(next)
    void sendCommand(sessionId, 'setSpeed', next)
  }

  const speedUpHold = useHoldRepeat(() => fireSpeedChange(SPEED_STEP))
  const speedDownHold = useHoldRepeat(() => fireSpeedChange(-SPEED_STEP))
  const seekBackHold = useHoldRepeat(() => {
    if (sessionId) void sendCommand(sessionId, 'seekBack')
  })
  const seekForwardHold = useHoldRepeat(() => {
    if (sessionId) void sendCommand(sessionId, 'seekForward')
  })

  // Feature A: arrastrar la barra de progreso. send() ignora la promesa de
  // sendCommand a propósito (mismo patrón que el resto de los comandos de
  // este archivo) — un fallo de red puntual durante el arrastre no debe
  // interrumpir el gesto ni mostrar un error, el próximo tick de movimiento
  // (o el commit final) ya vuelve a intentarlo.
  const seekBarRef = useRef<HTMLDivElement>(null)
  const seekDrag = useDraggableProgress(seekBarRef, sessionId, (id, value) => {
    void sendCommand(id, 'seekToProgress', value)
  })

  function handleSpeedButtonRelease(hold: { onPointerUp: () => void }) {
    hold.onPointerUp()
    scheduleWpmRevert()
  }

  function openSpeedEditor() {
    setSpeedInputValue(String(displayWpm ?? session?.playback?.wpm ?? DEFAULT_WPM))
    setEditingSpeed(true)
  }

  function commitSpeedEditor() {
    setEditingSpeed(false)
    const parsed = Number(speedInputValue)
    // Valor no numérico: se descarta sin enviar nada (queda como estaba).
    if (!Number.isFinite(parsed)) return
    if (!sessionId) return
    const clamped = Math.min(MAX_REMOTE_WPM, Math.max(MIN_REMOTE_WPM, Math.round(parsed)))
    pendingWpmRef.current = clamped
    setDisplayWpm(clamped)
    void sendCommand(sessionId, 'setSpeed', clamped)
    scheduleWpmRevert()
  }

  // F8.4 parte B: `session.calibration` es lo que el HOST publicó como
  // efectivamente aplicado (nunca lo que este remoto pidió) — antes de
  // recibir el primer snapshot (recién conectado) se muestran los mismos
  // valores por defecto que tendría "Predeterminado" en el teleprompter.
  const calibration = session?.calibration ?? null

  function sendCalibration(param: CalibrationParam, value: number | MirrorMode | TextAlign) {
    if (!sessionId) return
    void sendCalibrationCommandAction(sessionId, param, value)
  }

  const fontSizeStepper = useOptimisticCalibrationStepper(
    'fontSize',
    4,
    0,
    { min: CALIBRATION_RANGES.fontSize.min, max: CALIBRATION_RANGES.fontSize.max },
    calibration?.fontSize ?? DEFAULT_CALIBRATION.fontSize,
    sendCalibration,
  )
  const marginStepper = useOptimisticCalibrationStepper(
    'maxWidth',
    CALIBRATION_RANGES.maxWidth.step,
    0,
    { min: CALIBRATION_RANGES.maxWidth.min, max: CALIBRATION_RANGES.maxWidth.max },
    calibration?.maxWidth ?? DEFAULT_CALIBRATION.maxWidth,
    sendCalibration,
  )
  const lineHeightStepper = useOptimisticCalibrationStepper(
    'lineHeight',
    CALIBRATION_RANGES.lineHeight.step,
    1,
    { min: CALIBRATION_RANGES.lineHeight.min, max: CALIBRATION_RANGES.lineHeight.max },
    calibration?.lineHeight ?? DEFAULT_CALIBRATION.lineHeight,
    sendCalibration,
  )
  const readingZoneCenterStepper = useOptimisticCalibrationStepper(
    'readingZoneCenter',
    CALIBRATION_RANGES.readingZoneCenter.step,
    0,
    { min: CALIBRATION_RANGES.readingZoneCenter.min, max: CALIBRATION_RANGES.readingZoneCenter.max },
    calibration?.readingZoneCenter ?? DEFAULT_CALIBRATION.readingZone.center,
    sendCalibration,
  )
  const readingZoneHeightStepper = useOptimisticCalibrationStepper(
    'readingZoneHeight',
    CALIBRATION_RANGES.readingZoneHeight.step,
    0,
    { min: CALIBRATION_RANGES.readingZoneHeight.min, max: CALIBRATION_RANGES.readingZoneHeight.max },
    calibration?.readingZoneHeight ?? DEFAULT_CALIBRATION.readingZone.height,
    sendCalibration,
  )
  // readingZoneEnabled viaja como 0|1 (ver el comentario de
  // CALIBRATION_PARAMS en remoteSession.ts) — acá se lee/escribe como
  // boolean, la conversión queda contenida en este único punto.
  const readingZoneEnabled = calibration?.readingZoneEnabled ?? DEFAULT_CALIBRATION.readingZone.enabled
  function toggleReadingZoneEnabled() {
    sendCalibration('readingZoneEnabled', readingZoneEnabled ? 0 : 1)
  }

  const playback = session?.playback ?? null
  const engineStatus = playback?.engineStatus ?? 'ready'
  const isPlaying = engineStatus === 'playing'
  const controlsDisabled = state !== 'connected' || !online
  const shownWpm = displayWpm ?? playback?.wpm ?? DEFAULT_WPM
  // Mientras se arrastra, la barra y el porcentaje reflejan el valor
  // optimista local (a dónde va a caer si se suelta ahora); en cuanto se
  // suelta o se cancela, vuelve a reflejar lo que publique el host.
  const shownProgress = seekDrag.dragging ? seekDrag.dragProgress : (playback?.progress ?? 0)
  const progressPct = Math.round(shownProgress * 100)

  // B.3: lista agrupada por carpeta que publica el host — ya viene filtrada
  // a solo guardados y con títulos truncados/"Sin título" resueltos desde
  // ahí (ver TeleprompterPage.tsx), este componente solo la muestra.
  const scriptList = session?.scriptList ?? null
  const currentScriptId = playback?.scriptId ?? null

  // B.2: "el guion actual está a medias" = ya avanzó (más que
  // MIDWAY_PROGRESS_THRESHOLD) y no está simplemente terminado — en ese
  // caso se pide confirmación con UI propia (ConfirmDialog) ANTES de mandar
  // loadScript; si no, el cambio es directo. Pedir el mismo guion que ya
  // está mostrándose no hace nada (ni confirma ni manda comando).
  function requestLoadScript(targetId: number) {
    if (!sessionId || targetId === currentScriptId) return
    setScriptListOpen(false)
    const isMidway =
      playback != null && playback.engineStatus !== 'finished' && playback.progress > MIDWAY_PROGRESS_THRESHOLD
    if (isMidway) {
      setPendingScriptId(targetId)
    } else {
      void sendCommand(sessionId, 'loadScript', targetId)
    }
  }

  function confirmPendingLoadScript() {
    if (sessionId && pendingScriptId != null) void sendCommand(sessionId, 'loadScript', pendingScriptId)
    setPendingScriptId(null)
  }

  // Rediseño visual: mismo texto/condición que antes (MESSAGES, online,
  // errorDetail) — solo se extrae acá para poder mostrarlo tanto en la
  // cabecera compacta como, si hiciera falta, en el panel de espera de más
  // abajo, sin repetir la lógica dos veces.
  const isReallyOnline = state === 'connected' && online
  const statusLabel =
    state === 'connected'
      ? online
        ? 'Conectado'
        : 'Conectado (sin conexión)'
      : state === 'error' && errorDetail
        ? `${MESSAGES[state]} ${errorDetail}`
        : MESSAGES[state]
  const statusColorClass = isReallyOnline ? 'text-emerald-400' : state === 'connecting' ? 'text-gray-300' : 'text-amber-300'
  const statusDotClass = isReallyOnline ? 'bg-emerald-400' : state === 'connecting' ? 'bg-gray-400' : 'bg-amber-400'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col gap-3 bg-[#0b0c10] px-4 py-4 text-gray-100">
      {/* 1. CABECERA — compacta, con el estado de conexión REAL (misma
          lógica de siempre: state/online/errorDetail), nunca un valor
          ficticio. El ícono de la derecha es puramente indicativo (refleja
          `online`), no agrega ninguna acción nueva. */}
      <header className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#12151c] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" width={36} height={36} className="rounded-lg" />
          <div className="flex flex-col">
            <span className={`text-sm font-semibold leading-tight text-gray-100 ${FONT_DISPLAY}`}>
              Robress
              <br />
              Teleprompter
            </span>
            <span className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${statusColorClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
              {statusLabel}
            </span>
          </div>
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f1117] ${
            isReallyOnline ? 'text-emerald-400' : 'text-gray-500'
          }`}
        >
          {isReallyOnline ? <WifiIcon className="h-4 w-4" /> : <WifiOffIcon className="h-4 w-4" />}
        </span>
      </header>

      {state === 'connected' && !online && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
          Conexión perdida. Intentando reconectar…
        </p>
      )}

      {/* B.2: aviso puntual del host (p. ej. "el guion pedido ya no existe")
          — se oculta solo tras NOTICE_DISPLAY_MS, nunca rompe la sesión ni
          bloquea nada más. */}
      {visibleNotice && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
          {visibleNotice.message}
        </p>
      )}

      {state !== 'connected' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#12151c] px-6 py-16 text-center">
          <span className={`text-sm font-medium ${statusColorClass}`}>{statusLabel}</span>
        </div>
      )}

      {state === 'connected' && (
        <div className="flex flex-1 flex-col gap-3">
          {/* 2. SELECCIÓN DE GUION */}
          <section className="rounded-xl border border-white/10 bg-[#12151c] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Guion actual</p>
            <button
              type="button"
              disabled={controlsDisabled || !scriptList}
              onClick={() => setScriptListOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileTextIcon className={`h-4 w-4 shrink-0 ${TEXT_MUTED}`} />
              <span className={`flex-1 truncate text-sm text-gray-100 ${FONT_DISPLAY}`}>{session?.scriptTitle || 'Sin guion'}</span>
              {scriptListOpen ? (
                <ChevronUpIcon className="h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
              )}
            </button>

            {/* Se abre y se cierra EN EL FLUJO NORMAL del panel (no un
                overlay): al abrirse empuja el resto de los controles hacia
                abajo en vez de taparlos, y siguen alcanzables con scroll. */}
            {scriptListOpen && scriptList && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1117] p-2">
                {scriptList.every((folder) => folder.scripts.length === 0) ? (
                  <p className="p-3 text-center text-sm text-gray-500">No hay guiones guardados.</p>
                ) : (
                  scriptList.map(
                    (folder) =>
                      folder.scripts.length > 0 && (
                        <div key={folder.id ?? 'sin-carpeta'} className="mb-3 last:mb-0">
                          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {folder.name}
                          </p>
                          <div className="flex flex-col gap-1">
                            {folder.scripts.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => requestLoadScript(s.id)}
                                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                  s.id === currentScriptId
                                    ? `${ACCENT_SOFT_BG} font-semibold ${ACCENT_TEXT}`
                                    : 'text-gray-300 hover:bg-white/5'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    s.id === currentScriptId ? 'bg-accent' : 'bg-transparent'
                                  }`}
                                />
                                <span className={`truncate ${FONT_DISPLAY}`}>{s.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                  )
                )}
              </div>
            )}
          </section>

          {/* 3. ESTADO Y PROGRESO */}
          <section className="rounded-xl border border-white/10 bg-[#12151c] p-4 text-center">
            <p className={`truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500 ${FONT_DISPLAY}`}>
              {session?.scriptTitle || '—'}
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-100">{STATUS_LABELS[engineStatus] ?? engineStatus}</p>

            <div className="mt-4">
              {/* Zona táctil alta (~44px, h-11) sobre una barra visual fina —
                  más fácil de agarrar con el dedo que la barra misma. Sin
                  transition-[width] mientras se arrastra: seguiría al dedo
                  con demora en vez de calcarlo exactamente. touch-none evita
                  que el navegador intercepte el gesto como scroll/zoom. */}
              <div
                ref={seekBarRef}
                className="relative flex h-11 w-full touch-none items-center"
                onPointerDown={controlsDisabled ? undefined : seekDrag.onPointerDown}
                onPointerMove={controlsDisabled ? undefined : seekDrag.onPointerMove}
                onPointerUp={seekDrag.onPointerUp}
                onPointerCancel={seekDrag.onPointerCancel}
                onLostPointerCapture={seekDrag.onLostPointerCapture}
              >
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full ${ACCENT_BG} ${seekDrag.dragging ? '' : 'transition-[width]'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {seekDrag.dragging && (
                  <div
                    className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs font-semibold text-gray-100"
                    style={{ left: `${progressPct}%` }}
                  >
                    {progressPct}%
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs tabular-nums text-gray-500">{progressPct}%</p>
            </div>
          </section>

          {/* 4. CONTROLES DE REPRODUCCIÓN — la zona más importante: Play/
              Pausa domina, avanzar/retroceder quedan inmediatamente
              disponibles a los lados. Mismos handlers/comandos de siempre
              (seekBackHold/handlePlayPause/seekForwardHold), solo cambia el
              ícono y el tamaño. */}
          <section className="rounded-xl border border-white/10 bg-[#12151c] p-4">
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={controlsDisabled}
                aria-label="Retroceder"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f1117] text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                {...seekBackHold}
              >
                <RewindIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handlePlayPause}
                disabled={controlsDisabled}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full ${ACCENT_BG} ${ON_ACCENT} ${PLAY_BUTTON_GLOW} transition-transform ${ACCENT_BG_HOVER} active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none`}
              >
                {isPlaying ? <PauseIcon className="h-8 w-8" /> : <PlayIcon className="ml-1 h-8 w-8" />}
              </button>
              <button
                type="button"
                disabled={controlsDisabled}
                aria-label="Avanzar"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f1117] text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                {...seekForwardHold}
              >
                <FastForwardIcon className="h-5 w-5" />
              </button>
            </div>
          </section>

          {/* 5. TEMPO */}
          <section className="rounded-xl border border-white/10 bg-[#12151c] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tempo</p>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={controlsDisabled}
                aria-label="Disminuir tempo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f1117] text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                onPointerUp={() => handleSpeedButtonRelease(speedDownHold)}
                onPointerCancel={() => handleSpeedButtonRelease(speedDownHold)}
                onPointerLeave={() => handleSpeedButtonRelease(speedDownHold)}
                onPointerDown={speedDownHold.onPointerDown}
              >
                <MinusIcon className="h-4 w-4" />
              </button>

              {editingSpeed ? (
                <input
                  type="number"
                  min={MIN_REMOTE_WPM}
                  max={MAX_REMOTE_WPM}
                  autoFocus
                  value={speedInputValue}
                  onChange={(e) => setSpeedInputValue(e.target.value)}
                  onBlur={commitSpeedEditor}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  className="w-20 rounded border border-white/10 bg-[#0f1117] px-2 py-1 text-center text-lg text-gray-100"
                />
              ) : (
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={openSpeedEditor}
                  className="flex flex-1 flex-col items-center disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-lg font-semibold tabular-nums text-gray-100">
                    {shownWpm} <span className="text-xs font-normal text-gray-500">BPM</span>
                  </span>
                  <span className="text-[10px] text-gray-500">Toca para escribir</span>
                </button>
              )}

              <button
                type="button"
                disabled={controlsDisabled}
                aria-label="Aumentar tempo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0f1117] text-gray-200 transition-transform hover:bg-white/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                onPointerUp={() => handleSpeedButtonRelease(speedUpHold)}
                onPointerCancel={() => handleSpeedButtonRelease(speedUpHold)}
                onPointerLeave={() => handleSpeedButtonRelease(speedUpHold)}
                onPointerDown={speedUpHold.onPointerDown}
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
          </section>

          {/* 6. AJUSTES DE PANTALLA — plegable: no ocupa toda la pantalla
              permanentemente. F8.4 parte B: ajustes de calibración en vivo.
              Los tres steppers usan el mismo patrón "optimista + revertir al
              soltar" que el tempo; alineación y espejo son botones de un
              solo toque (el host los confirma casi de inmediato, sin
              throttle). Ninguno de esos handlers cambia acá, solo el
              plegado/desplegado del panel que los contiene. */}
          <section className="rounded-xl border border-white/10 bg-[#12151c] p-3">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Ajustes de pantalla
                </span>
                {!settingsOpen && (
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Tamaño de letra, margen, interlineado, alineación y espejo
                  </span>
                )}
              </span>
              {settingsOpen ? (
                <ChevronUpIcon className="h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
              )}
            </button>

            {settingsOpen && (
              <div className="mt-3 flex flex-col gap-2">
                <CalibrationStepperRow
                  label="Tamaño de letra"
                  unit=" px"
                  disabled={controlsDisabled}
                  stepper={fontSizeStepper}
                />
                <CalibrationStepperRow label="Margen" unit="%" disabled={controlsDisabled} stepper={marginStepper} />
                <CalibrationStepperRow
                  label="Interlineado"
                  unit="×"
                  disabled={controlsDisabled}
                  stepper={lineHeightStepper}
                />

                <div>
                  <p className="mb-1 text-xs text-gray-400">Alineación</p>
                  <div className="flex gap-1 rounded-lg border border-white/10 bg-[#0f1117] p-1">
                    {TEXT_ALIGN_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={controlsDisabled}
                        onClick={() => sendCalibration('textAlign', value)}
                        className={`flex-1 rounded px-1 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          calibration?.textAlign === value
                            ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}`
                            : 'text-gray-400 hover:text-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-gray-400">Espejo</p>
                  <div className="flex gap-1 rounded-lg border border-white/10 bg-[#0f1117] p-1">
                    {MIRROR_OPTIONS.map(([value, label]) => {
                      const MirrorIcon = MIRROR_ICONS[value]
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={controlsDisabled}
                          aria-label={label}
                          onClick={() => sendCalibration('mirror', value)}
                          className={`flex flex-1 items-center justify-center rounded px-1 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            calibration?.mirror === value
                              ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}`
                              : 'text-gray-400 hover:text-gray-100'
                          }`}
                        >
                          {MirrorIcon ? <MirrorIcon className="h-4 w-4" /> : label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-gray-400">Zona de lectura</p>
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={toggleReadingZoneEnabled}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        readingZoneEnabled ? `${ACCENT_SOFT_BG} ${ACCENT_TEXT}` : 'text-gray-400 hover:text-gray-100'
                      }`}
                    >
                      {readingZoneEnabled ? 'Activada' : 'Desactivada'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <CalibrationStepperRow
                      label="Posición"
                      unit="%"
                      disabled={controlsDisabled}
                      stepper={readingZoneCenterStepper}
                    />
                    <CalibrationStepperRow
                      label="Alto de la franja"
                      unit="%"
                      disabled={controlsDisabled}
                      stepper={readingZoneHeightStepper}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 7. REINICIAR — mismo handleReset de siempre, deliberadamente
              menos protagonista que Play/Pausa (texto más chico, sin
              relleno azul). */}
          <button
            type="button"
            onClick={handleReset}
            disabled={controlsDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#12151c] py-3 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcwIcon className="h-4 w-4" />
            Reiniciar
          </button>
        </div>
      )}

      {/* B.2: confirmación con UI propia (nunca window.confirm) antes de
          cambiar de guion si el actual está a medias. */}
      {pendingScriptId != null && (
        <ConfirmDialog
          title="¿Cambiar de guion?"
          message="El guion actual está a medias. Si cambias ahora, la próxima vez que lo vuelvas a abrir empieza de nuevo desde el principio."
          actions={[
            { label: 'Cambiar de guion', onClick: confirmPendingLoadScript, variant: 'primary' },
            { label: 'Seguir con este', onClick: () => setPendingScriptId(null), variant: 'neutral' },
          ]}
          onClose={() => setPendingScriptId(null)}
        />
      )}
    </div>
  )
}
