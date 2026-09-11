// Control remoto funcional (F8.3, sobre Supabase Realtime desde F8-Supabase;
// F8.4 parte A agrega velocidad y avanzar/retroceder): /remote/:sessionId.
// Envía comandos discretos al host y muestra el snapshot de reproducción
// que el host publica — nunca mueve nada por sí mismo, nunca asume que un
// comando llegó solo porque se tocó el botón.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '../components/shared/Logo'
import { DEFAULT_WPM } from '../engine/duration'
import { MAX_REMOTE_WPM, MIN_REMOTE_WPM, type RemoteSession } from '../services/remoteSession'
import { useRemoteStore } from '../stores/remoteStore'

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

export function RemoteControlPage() {
  const { sessionId } = useParams()
  const configured = useRemoteStore((s) => s.configured)
  const ensureAuth = useRemoteStore((s) => s.ensureAuth)
  const joinSession = useRemoteStore((s) => s.joinSession)
  const subscribeSession = useRemoteStore((s) => s.subscribeSession)
  const subscribeConnectivity = useRemoteStore((s) => s.subscribeConnectivity)
  const sendCommand = useRemoteStore((s) => s.sendCommand)

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

  const playback = session?.playback ?? null
  const engineStatus = playback?.engineStatus ?? 'ready'
  const isPlaying = engineStatus === 'playing'
  const progressPct = Math.round((playback?.progress ?? 0) * 100)
  const controlsDisabled = state !== 'connected' || !online
  const shownWpm = displayWpm ?? playback?.wpm ?? DEFAULT_WPM

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[#0b0c10] p-6 text-center text-gray-100">
      <div className="mt-4">
        <Logo />
      </div>
      <h1 className="text-lg font-semibold text-gray-100">Control remoto</h1>

      {state === 'connected' && !online && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Conexión perdida. Intentando reconectar…
        </p>
      )}

      <p
        className={`text-base font-medium ${
          state === 'connected' && online
            ? 'text-emerald-400'
            : state === 'connecting'
              ? 'text-gray-300'
              : 'text-amber-300'
        }`}
      >
        {state === 'connected'
          ? online
            ? 'Conectado ✓'
            : 'Conectado (sin conexión)'
          : state === 'error' && errorDetail
            ? `${MESSAGES[state]} ${errorDetail}`
            : MESSAGES[state]}
      </p>

      {state === 'connected' && (
        <div className="flex w-full max-w-xs flex-col items-center gap-6">
          {session?.scriptTitle && <p className="text-sm text-gray-400">{session.scriptTitle}</p>}

          <p className="text-2xl font-semibold text-gray-100">{STATUS_LABELS[engineStatus] ?? engineStatus}</p>

          <div className="w-full">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{progressPct}%</p>
          </div>

          <div className="flex w-full items-center justify-center gap-3">
            <button
              type="button"
              disabled={controlsDisabled}
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 text-xl text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              {...seekBackHold}
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={controlsDisabled}
              className="flex h-20 flex-1 items-center justify-center rounded-lg bg-blue-600 text-3xl font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 text-xl text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              {...seekForwardHold}
            >
              ⏩
            </button>
          </div>

          <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
            <button
              type="button"
              disabled={controlsDisabled}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 text-xl text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              onPointerUp={() => handleSpeedButtonRelease(speedDownHold)}
              onPointerCancel={() => handleSpeedButtonRelease(speedDownHold)}
              onPointerLeave={() => handleSpeedButtonRelease(speedDownHold)}
              onPointerDown={speedDownHold.onPointerDown}
            >
              −
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
                className="flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-lg font-semibold text-gray-100">{shownWpm} ppm</span>
                <span className="text-[10px] text-gray-500">toca para escribir</span>
              </button>
            )}

            <button
              type="button"
              disabled={controlsDisabled}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 text-xl text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              onPointerUp={() => handleSpeedButtonRelease(speedUpHold)}
              onPointerCancel={() => handleSpeedButtonRelease(speedUpHold)}
              onPointerLeave={() => handleSpeedButtonRelease(speedUpHold)}
              onPointerDown={speedUpHold.onPointerDown}
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={controlsDisabled}
            className="w-full rounded-lg border border-white/10 py-4 text-lg text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↻ Reiniciar
          </button>
        </div>
      )}
    </div>
  )
}
