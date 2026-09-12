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
import type { MirrorMode, TextAlign } from '../engine/calibrationEngine'
import {
  createSession as createSessionRemote,
  endSession as endSessionRemote,
  getRemoteClientId,
  joinSessionAsRemote,
  publishCalibration as publishCalibrationRemote,
  publishPlayback as publishPlaybackRemote,
  requestRemoteUidRefresh,
  sendCalibrationCommand as sendCalibrationCommandRemote,
  sendCommand as sendCommandRemote,
  subscribeToConnectivity,
  subscribeToSession,
  type CalibrationParam,
  type JoinSessionResult,
  type RemoteCalibration,
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
  // F8.4 parte B: comando dedicado (forma distinta a sendCommand — lleva
  // `param`) para pedir un cambio de calibración en vivo, y la publicación
  // del snapshot real que hace el host tras aplicarlo.
  sendCalibrationCommand: (
    sessionId: string,
    param: CalibrationParam,
    value: number | MirrorMode | TextAlign,
  ) => Promise<void>
  publishCalibration: (sessionId: string, calibration: RemoteCalibration) => Promise<void>
  subscribeConnectivity: (sessionId: string, callback: (connected: boolean) => void) => () => void
  // Pide reconfirmar remoteUid contra la tabla (get_remote_session). La
  // usa el host cuando llega un comando con un senderId que no reconoce,
  // por si el remoto real recién se unió. Sin efecto si se llama más
  // seguido que cada 2s (throttle interno en remoteSession.ts).
  refreshRemoteUid: (sessionId: string) => void
  // F8.6 (PWA): true mientras ESTE dispositivo tiene una sesión de control
  // remoto activa — como host (TeleprompterPage) o como remoto
  // (RemoteControlPage), nunca los dos a la vez en la misma pestaña.
  // usePwaUpdate.ts lo lee para no recargar la app en medio de un
  // emparejamiento: la recarga lo cortaría de cualquiera de los dos lados.
  activeSessionId: string | null
  activeSessionConnected: boolean
  setActiveSession: (sessionId: string | null, connected: boolean) => void
}

export const useRemoteStore = create<RemoteState>((set) => ({
  configured: isRemoteControlConfigured(),
  activeSessionId: null,
  activeSessionConnected: false,
  setActiveSession: (sessionId, connected) => set({ activeSessionId: sessionId, activeSessionConnected: connected }),

  ensureAuth: async () => getRemoteClientId(),

  createSession: (scriptTitle) => createSessionRemote(scriptTitle),

  endSession: (sessionId) => endSessionRemote(sessionId),

  subscribeSession: (sessionId, callback) => subscribeToSession(sessionId, callback),

  joinSession: (sessionId) => joinSessionAsRemote(sessionId),

  sendCommand: (sessionId, type, value) => sendCommandRemote(sessionId, type, value),

  publishPlayback: (sessionId, playback) => publishPlaybackRemote(sessionId, playback),

  sendCalibrationCommand: (sessionId, param, value) => sendCalibrationCommandRemote(sessionId, param, value),

  publishCalibration: (sessionId, calibration) => publishCalibrationRemote(sessionId, calibration),

  subscribeConnectivity: (sessionId, callback) => subscribeToConnectivity(sessionId, callback),

  refreshRemoteUid: (sessionId) => requestRemoteUidRefresh(sessionId),
}))
