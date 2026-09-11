// Control remoto funcional (F8.3, sobre Supabase Realtime desde F8-Supabase):
// /remote/:sessionId. Envía comandos discretos (play/pause/reset) al host y
// muestra el snapshot de reproducción que el host publica — nunca mueve
// nada por sí mismo, nunca asume que un comando llegó solo porque se tocó
// el botón.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '../components/shared/Logo'
import type { RemoteSession } from '../services/remoteSession'
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

  const playback = session?.playback ?? null
  const engineStatus = playback?.engineStatus ?? 'ready'
  const isPlaying = engineStatus === 'playing'
  const progressPct = Math.round((playback?.progress ?? 0) * 100)
  const controlsDisabled = state !== 'connected' || !online

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

          <button
            type="button"
            onClick={handlePlayPause}
            disabled={controlsDisabled}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-6 text-3xl font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

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
