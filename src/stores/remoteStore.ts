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
  publishNotice as publishNoticeRemote,
  publishPlayback as publishPlaybackRemote,
  publishScriptList as publishScriptListRemote,
  requestRemoteUidRefresh,
  resumeHostSession as resumeHostSessionRemote,
  sendCalibrationCommand as sendCalibrationCommandRemote,
  sendCommand as sendCommandRemote,
  subscribeToConnectivity,
  subscribeToSession,
  type CalibrationParam,
  type JoinSessionResult,
  type RemoteCalibration,
  type RemoteCommandType,
  type RemotePlayback,
  type RemoteScriptList,
  type RemoteSession,
  type ResumeHostSessionResult,
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
  // B.4: intenta retomar la sesión de host guardada en localStorage (si
  // hay alguna) sin crear una nueva — ver el comentario de
  // resumeHostSession en remoteSession.ts.
  resumeHostSession: () => Promise<ResumeHostSessionResult>
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
  // B.3: lista de guiones agrupada por carpeta, y B.2: aviso puntual
  // (p. ej. "el guion pedido ya no existe") — ver remoteSession.ts.
  publishScriptList: (sessionId: string, list: RemoteScriptList) => Promise<void>
  publishNotice: (sessionId: string, message: string) => Promise<void>
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

  // B.1: id de la sesión de control remoto que este dispositivo tiene como
  // HOST ahora mismo, si hay alguna — vive en el store (no en el estado
  // local de TeleprompterPage) precisamente para sobrevivir el
  // desmontaje/remontaje de esa página al cambiar de guion desde Mis
  // guiones (que pasa por la ruta /guiones, hermana de /teleprompter — ver
  // router.tsx — y por lo tanto desmonta TeleprompterPage por completo). Un
  // useState local se perdería en ese viaje igual que antes; este store, un
  // singleton de JS ajeno al árbol de React, es lo que realmente permite
  // que TeleprompterPage vuelva a encontrar la MISMA sesión al reabrir un
  // guion distinto en vez de crear una nueva y cortar el emparejamiento.
  // Quién la cierra de verdad (al salir del teleprompter/la biblioteca por
  // completo, no solo al pasar de una a la otra): ver RootShell.tsx.
  hostSessionId: string | null
  setHostSessionId: (sessionId: string | null) => void
}

export const useRemoteStore = create<RemoteState>((set) => ({
  configured: isRemoteControlConfigured(),
  activeSessionId: null,
  activeSessionConnected: false,
  setActiveSession: (sessionId, connected) => set({ activeSessionId: sessionId, activeSessionConnected: connected }),

  hostSessionId: null,
  setHostSessionId: (sessionId) => set({ hostSessionId: sessionId }),

  ensureAuth: async () => getRemoteClientId(),

  createSession: (scriptTitle) => createSessionRemote(scriptTitle),

  endSession: (sessionId) => endSessionRemote(sessionId),

  resumeHostSession: () => resumeHostSessionRemote(),

  subscribeSession: (sessionId, callback) => subscribeToSession(sessionId, callback),

  joinSession: (sessionId) => joinSessionAsRemote(sessionId),

  sendCommand: (sessionId, type, value) => sendCommandRemote(sessionId, type, value),

  publishPlayback: (sessionId, playback) => publishPlaybackRemote(sessionId, playback),

  sendCalibrationCommand: (sessionId, param, value) => sendCalibrationCommandRemote(sessionId, param, value),

  publishCalibration: (sessionId, calibration) => publishCalibrationRemote(sessionId, calibration),

  publishScriptList: (sessionId, list) => publishScriptListRemote(sessionId, list),

  publishNotice: (sessionId, message) => publishNoticeRemote(sessionId, message),

  subscribeConnectivity: (sessionId, callback) => subscribeToConnectivity(sessionId, callback),

  refreshRemoteUid: (sessionId) => requestRemoteUidRefresh(sessionId),
}))
