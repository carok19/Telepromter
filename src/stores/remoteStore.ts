// Store (Zustand) de la infraestructura de control remoto (F8). Mismo
// patrón que el resto de los stores del proyecto: es una capa delgada que
// delega toda la lógica real en los servicios (`firebase.ts`,
// `remoteSession.ts`) y solo guarda el último resultado conocido.
//
// En F8.1 no lo usa ninguna pantalla todavía — existe para que F8.2 (QR,
// pantalla de emparejamiento) lo reutilice sin tener que llamar a Firebase
// directamente desde componentes.
import { create } from 'zustand'
import { isRemoteControlConfigured, signInAnonymouslyIfNeeded } from '../services/firebase'
import {
  createTestSession as createTestSessionRemote,
  readSession as readSessionRemote,
  subscribeToSession,
  updateTestSession as updateTestSessionRemote,
  type RemoteTestSession,
} from '../services/remoteSession'

interface RemoteState {
  configured: boolean
  uid: string | null
  authLoading: boolean
  authError: string | null
  testSessionId: string | null
  testSession: RemoteTestSession | null
  initAuth: () => Promise<void>
  createTestSession: () => Promise<string | null>
  readTestSession: (sessionId: string) => Promise<RemoteTestSession | null>
  updateTestSession: (sessionId: string, patch: Partial<RemoteTestSession>) => Promise<void>
  subscribeTestSession: (sessionId: string) => () => void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  configured: isRemoteControlConfigured(),
  uid: null,
  authLoading: false,
  authError: null,
  testSessionId: null,
  testSession: null,

  initAuth: async () => {
    if (!isRemoteControlConfigured()) {
      set({ authError: 'Firebase no está configurado (faltan variables de entorno).' })
      return
    }
    set({ authLoading: true, authError: null })
    const uid = await signInAnonymouslyIfNeeded()
    set({
      uid,
      authLoading: false,
      authError: uid ? null : 'No se pudo autenticar de forma anónima.',
    })
  },

  createTestSession: async () => {
    const uid = get().uid
    if (!uid) return null
    const sessionId = await createTestSessionRemote(uid)
    set({ testSessionId: sessionId })
    return sessionId
  },

  readTestSession: async (sessionId) => {
    const session = await readSessionRemote(sessionId)
    set({ testSession: session })
    return session
  },

  updateTestSession: async (sessionId, patch) => {
    await updateTestSessionRemote(sessionId, patch)
  },

  subscribeTestSession: (sessionId) => {
    return subscribeToSession(sessionId, (session) => set({ testSession: session }))
  },
}))
