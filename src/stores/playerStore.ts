// Store (Zustand) del estado de reproducción del TeleprompterEngine. Es un
// espejo reactivo delgado: toda la lógica temporal (rAF, cálculo de
// posición/velocidad, detección de marcadores) vive en TeleprompterEngine.
// El store solo guarda el último snapshot recibido vía subscribe() y expone
// acciones que delegan directamente en el motor.
import { create } from 'zustand'
import { DEFAULT_WPM } from '../engine/duration'
import type { TeleprompterEngine, TeleprompterSnapshot } from '../engine/teleprompterEngine'

interface PlayerState extends TeleprompterSnapshot {
  engine: TeleprompterEngine | null
  attachEngine: (engine: TeleprompterEngine) => () => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  reset: () => void
  setSpeed: (wpm: number) => void
}

const IDLE_SNAPSHOT: TeleprompterSnapshot = {
  status: 'idle',
  progress: 0,
  positionPx: 0,
  totalPx: 0,
  wpm: DEFAULT_WPM,
  pausedByMarker: false,
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...IDLE_SNAPSHOT,
  engine: null,

  attachEngine: (engine) => {
    set({ engine })
    const unsubscribe = engine.subscribe((snapshot) => set(snapshot))
    return () => {
      unsubscribe()
      set({ ...IDLE_SNAPSHOT, engine: null })
    }
  },

  play: () => get().engine?.play(),
  pause: () => get().engine?.pause(),
  togglePlay: () => get().engine?.togglePlay(),
  reset: () => get().engine?.reset(),
  setSpeed: (wpm) => get().engine?.setSpeed(wpm),
}))
