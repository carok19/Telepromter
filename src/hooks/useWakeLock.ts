// Hook sobre la Screen Wake Lock API: evita que la pantalla se apague
// mientras `enabled` es true (TeleprompterPage y GlassTestPage lo usan con
// enabled=true todo el tiempo que están montadas — "entrar/salir" de esas
// páginas es lo que arranca/libera el lock, no el estado de reproducción).
//
// El navegador libera el lock solo cuando la pestaña deja de estar visible
// (cambiar de app, bloquear pantalla) — hay que volver a pedirlo cuando
// vuelve a estar visible, este hook lo hace vía 'visibilitychange'.
//
// Si la API no existe (`supported: false`) o el pedido falla (batería
// baja, permiso denegado, etc. → `failed: true`), no se lanza ninguna
// excepción: la página que lo usa sigue funcionando exactamente igual,
// solo que la pantalla podría apagarse sola.
import { useEffect, useRef, useState } from 'react'

export interface UseWakeLockResult {
  supported: boolean
  active: boolean
  failed: boolean
}

export function useWakeLock(enabled: boolean): UseWakeLockResult {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [active, setActive] = useState(false)
  const [failed, setFailed] = useState(false)
  // sentinelRef SÍ debe ser un ref compartido: representa el lock realmente
  // otorgado, que solo puede haber uno a la vez para todo el componente.
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!enabled || !supported) return

    let cancelled = false
    // "requesting" es una variable LOCAL a esta ejecución del efecto (no un
    // ref) a propósito: en desarrollo, StrictMode monta el efecto, lo
    // limpia, y lo vuelve a montar. Si esta bandera fuera un ref
    // compartido, el request() todavía en vuelo del primer montaje (ya
    // cancelado) dejaría la bandera en `true` y bloquearía por error el
    // pedido real del segundo montaje (el que sigue vivo) hasta que la
    // promesa vieja resolviera — y para entonces esa resolución también se
    // descarta por estar cancelada, así que el resultado nunca se aplicaba
    // a ningún lado. Con una variable local, cada montaje tiene su propio
    // seguimiento de "tengo un pedido en curso", sin pisarse entre sí.
    let requesting = false

    async function requestLock() {
      // No duplicar pedidos: si ya hay uno en curso (en este mismo
      // montaje) o ya hay un sentinel activo, no hace falta pedir otro
      // (p. ej. dos eventos de visibilitychange seguidos, o el pedido
      // inicial todavía en vuelo).
      if (requesting || sentinelRef.current) return
      requesting = true
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        requesting = false
        if (cancelled) {
          // El efecto ya se limpió (se salió de la página, o StrictMode
          // desmontó/remontó en desarrollo) mientras la promesa viajaba:
          // soltar de inmediato en vez de dejarlo activo sin dueño.
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        setActive(true)
        setFailed(false)
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null
          setActive(false)
        })
      } catch (err) {
        requesting = false
        if (cancelled) return
        console.error('[wakeLock] No se pudo activar:', err)
        setActive(false)
        setFailed(true)
      }
    }

    requestLock()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') requestLock()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
      setActive(false)
    }
  }, [enabled, supported])

  return { supported, active, failed }
}
