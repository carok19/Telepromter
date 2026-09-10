// Store (Zustand) de la infraestructura de control remoto (F8). Mismo
// patrón que el resto de los stores del proyecto: es una capa delgada que
// delega toda la lógica real en los servicios (`firebase.ts`,
// `remoteSession.ts`) y solo guarda el último resultado conocido.
//
// F8.2 lo usa desde TeleprompterPage (host), RemoteJoinPage y
// RemoteControlPage (remoto) para el flujo de emparejamiento. F8.3 agrega
// el envío/recepción de comandos discretos y el snapshot de reproducción,
// reutilizando este mismo store.
import { create } from 'zustand'
import { isRemoteControlConfigured, signInAnonymouslyIfNeeded } from '../services/firebase'
import {
  createSession as createSessionRemote,
  endSession as endSessionRemote,
  joinSessionAsRemote,
  publishPlayback as publishPlaybackRemote,
  sendCommand as sendCommandRemote,
  subscribeToConnectivity,
  subscribeToSession,
  type JoinSessionResult,
  type RemoteCommandType,
  type RemotePlayback,
  type RemoteSession,
} from '../services/remoteSession'

interface RemoteState {
  configured: boolean
  uid: string | null
  authLoading: boolean
  authError: string | null
  ensureAuth: () => Promise<string | null>
  createSession: (scriptTitle: string) => Promise<string | null>
  endSession: (sessionId: string) => Promise<void>
  subscribeSession: (sessionId: string, callback: (session: RemoteSession | null) => void) => () => void
  joinSession: (sessionId: string) => Promise<JoinSessionResult>
  sendCommand: (sessionId: string, type: RemoteCommandType) => Promise<void>
  publishPlayback: (sessionId: string, playback: RemotePlayback) => Promise<void>
  subscribeConnectivity: (callback: (connected: boolean) => void) => () => void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  configured: isRemoteControlConfigured(),
  uid: null,
  authLoading: false,
  authError: null,

  ensureAuth: async () => {
    const existing = get().uid
    if (existing) return existing
    if (!isRemoteControlConfigured()) {
      set({ authError: 'Firebase no está configurado (faltan variables de entorno).' })
      return null
    }
    set({ authLoading: true, authError: null })
    const uid = await signInAnonymouslyIfNeeded()
    set({
      uid,
      authLoading: false,
      authError: uid ? null : 'No se pudo autenticar de forma anónima.',
    })
    return uid
  },

  createSession: async (scriptTitle) => {
    const uid = await get().ensureAuth()
    if (!uid) return null
    return createSessionRemote(uid, scriptTitle)
  },

  endSession: async (sessionId) => {
    await endSessionRemote(sessionId)
  },

  subscribeSession: (sessionId, callback) => subscribeToSession(sessionId, callback),

  joinSession: async (sessionId) => {
    const uid = await get().ensureAuth()
    if (!uid) return { outcome: 'error', session: null }
    return joinSessionAsRemote(sessionId, uid)
  },

  sendCommand: (sessionId, type) => sendCommandRemote(sessionId, type),

  publishPlayback: (sessionId, playback) => publishPlaybackRemote(sessionId, playback),

  subscribeConnectivity: (callback) => subscribeToConnectivity(callback),
}))
