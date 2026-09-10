// Pantalla de conexión del control remoto (F8.2): /remote/:sessionId.
// En esta fase es SOLO una pantalla de estado — todavía no hay controles de
// reproducción (eso llega en F8.3+, reutilizando esta misma sesión).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { RemoteSession } from '../services/remoteSession'
import { useRemoteStore } from '../stores/remoteStore'

type ConnectionState = 'connecting' | 'connected' | 'not-found' | 'expired' | 'occupied' | 'ended' | 'error'

const MESSAGES: Record<ConnectionState, string> = {
  connecting: 'Conectando...',
  connected: 'Conectado al Teleprompter',
  'not-found': 'Sesión no encontrada.',
  expired: 'Sesión expirada.',
  occupied: 'Esta sesión ya tiene un control remoto conectado.',
  ended: 'Sesión finalizada.',
  error: 'No se pudo conectar. Revisá tu conexión.',
}

export function RemoteControlPage() {
  const { sessionId } = useParams()
  const configured = useRemoteStore((s) => s.configured)
  const ensureAuth = useRemoteStore((s) => s.ensureAuth)
  const joinSession = useRemoteStore((s) => s.joinSession)
  const subscribeSession = useRemoteStore((s) => s.subscribeSession)

  const [state, setState] = useState<ConnectionState>(() => (configured ? 'connecting' : 'error'))
  const [session, setSession] = useState<RemoteSession | null>(null)

  useEffect(() => {
    if (!sessionId || !configured) return

    let cancelled = false
    let unsubscribe: (() => void) | null = null

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
        return
      }
      setSession(result.session)
      setState('connected')
      unsubscribe = subscribeSession(sessionId!, (updated) => {
        if (cancelled) return
        setSession(updated)
        if (updated?.status === 'ended') setState('ended')
      })
    }

    join()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [sessionId, configured, ensureAuth, joinSession, subscribeSession])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0c10] p-6 text-center text-gray-100">
      <h1 className="text-xl font-semibold">Control remoto</h1>
      <p
        className={`text-lg font-medium ${
          state === 'connected' ? 'text-emerald-400' : state === 'connecting' ? 'text-gray-300' : 'text-amber-300'
        }`}
      >
        {MESSAGES[state]}
      </p>
      {state === 'connected' && session?.scriptTitle && <p className="text-sm text-gray-400">{session.scriptTitle}</p>}
      {state === 'connected' && (
        <p className="mt-4 text-xs text-gray-600">Los controles de reproducción estarán disponibles próximamente.</p>
      )}
    </div>
  )
}
