// Store (Zustand) de la infraestructura de control remoto (F8). Mismo
// patrón que el resto de los stores del proyecto: es una capa delgada que
// delega toda la lógica real en el servicio (`remoteSession.ts`, que a su
// vez habla con Supabase) y no guarda estado propio más allá de si el
// backend está disponible.
//
// Ojo: las páginas (TeleprompterPage, RemoteControlPage, PairingModal) solo
// conocen esta interfaz — el backend por debajo pasó de Firebase a
// Supabase sin que ninguna de esas páginas necesitara cambiar su lógica
// (salvo los textos de error, ver RemoteControlPage.tsx).
import { create } from 'zustand'
import {
  createSession as createSessionRemote,
  endSession as endSessionRemote,
  getRemoteClientId,
  joinSessionAsRemote,
  publishPlayback as publishPlaybackRemote,
  requestRemoteUidRefresh,
  sendCommand as sendCommandRemote,
  subscribeToConnectivity,
  subscribeToSession,
  type JoinSessionResult,
  type RemoteCommandType,
  type RemotePlayback,
  type RemoteSession,
} from '../services/remoteSession'
import { isRemoteControlConfigured } from '../services/supabase'

interface RemoteState {
  configured: boolean
  // Ya no hay un paso de autenticación real (Supabase no lo necesita para
  // este diseño) — se mantiene el nombre porque RemoteControlPage ya lo
  // llama así, pero ahora solo asegura que exista un id local de cliente.
  ensureAuth: () => Promise<string | null>
  createSession: (scriptTitle: string) => Promise<{ sessionId: string | null; error: string | null }>
  endSession: (sessionId: string) => Promise<void>
  subscribeSession: (sessionId: string, callback: (session: RemoteSession | null) => void) => () => void
  joinSession: (sessionId: string) => Promise<JoinSessionResult>
  sendCommand: (sessionId: string, type: RemoteCommandType, value?: number) => Promise<void>
  publishPlayback: (sessionId: string, playback: RemotePlayback) => Promise<void>
  subscribeConnectivity: (sessionId: string, callback: (connected: boolean) => void) => () => void
  // Pide reconfirmar remoteUid contra la tabla (get_remote_session). La
  // usa el host cuando llega un comando con un senderId que no reconoce,
  // por si el remoto real recién se unió. Sin efecto si se llama más
  // seguido que cada 2s (throttle interno en remoteSession.ts).
  refreshRemoteUid: (sessionId: string) => void
}

export const useRemoteStore = create<RemoteState>(() => ({
  configured: isRemoteControlConfigured(),

  ensureAuth: async () => getRemoteClientId(),

  createSession: (scriptTitle) => createSessionRemote(scriptTitle),

  endSession: (sessionId) => endSessionRemote(sessionId),

  subscribeSession: (sessionId, callback) => subscribeToSession(sessionId, callback),

  joinSession: (sessionId) => joinSessionAsRemote(sessionId),

  sendCommand: (sessionId, type, value) => sendCommandRemote(sessionId, type, value),

  publishPlayback: (sessionId, playback) => publishPlaybackRemote(sessionId, playback),

  subscribeConnectivity: (sessionId, callback) => subscribeToConnectivity(sessionId, callback),

  refreshRemoteUid: (sessionId) => requestRemoteUidRefresh(sessionId),
}))
