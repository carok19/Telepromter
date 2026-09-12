// F8.6 (PWA) — decide CUÁNDO es seguro aplicar una actualización del
// service worker. registerType: 'prompt' (vite.config.ts) hace que un
// service worker nuevo se instale pero se quede "esperando" hasta que
// alguien llame a updateServiceWorker() — nunca se activa ni recarga la
// página por su cuenta. La decisión de "seguro" en sí vive en
// pwaUpdateSafety.ts (sin dependencias de React/Vite, para poder probarla
// standalone); acá solo se juntan los datos reales (ruta, stores) y se le
// pregunta.
//
// Revisión activa de versión nueva: el chequeo automático del navegador
// solo pasa al cargar/registrar la página — un celular montado en el
// teleprompter, que casi nunca se recarga solo, podría no enterarse de una
// versión nueva durante días (esto ya pasó dos veces). Se vuelve a preguntar
// cada UPDATE_CHECK_INTERVAL_MS mientras la pestaña está visible, y también
// al volver a foco.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { computeIsSafeToApplyUpdate } from './pwaUpdateSafety'
import { usePlayerStore } from '../stores/playerStore'
import { useRemoteStore } from '../stores/remoteStore'
import { useScriptsStore } from '../stores/scriptsStore'

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export interface UsePwaUpdateResult {
  needRefresh: boolean
  isSafeToApply: boolean
  applyNow: () => void
}

export function usePwaUpdate(): UsePwaUpdateResult {
  const location = useLocation()
  const playerStatus = usePlayerStore((s) => s.status)
  const remoteSessionActive = useRemoteStore((s) => s.activeSessionId != null || s.activeSessionConnected)
  const editorSaving = useScriptsStore((s) => s.saveStatus === 'saving')

  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration
    },
  })

  useEffect(() => {
    function checkForUpdate() {
      registrationRef.current?.update().catch(() => {})
    }
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    function handleVisibility() {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const isSafeToApply = computeIsSafeToApplyUpdate({
    pathname: location.pathname,
    playerStatus,
    editorSaving,
    remoteSessionActive,
  })

  // Aplicar sola apenas sea seguro — sin esperar a que el usuario haga
  // nada. El banner (para el caso "no es seguro todavía") vive aparte, en
  // UpdateBanner.tsx.
  useEffect(() => {
    if (needRefresh && isSafeToApply) {
      updateServiceWorker(true)
    }
  }, [needRefresh, isSafeToApply, updateServiceWorker])

  return {
    needRefresh,
    isSafeToApply,
    applyNow: () => updateServiceWorker(true),
  }
}
