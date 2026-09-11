// Hook sobre la Fullscreen API nativa: pide/sale de pantalla completa para
// un elemento dado (el contenedor raíz de TeleprompterPage). `toggle` solo
// debe llamarse desde el manejador de un evento de usuario real (click/tap)
// — el navegador rechaza requestFullscreen() si no viene de un gesto
// directo, así que este hook nunca lo llama por su cuenta.
//
// `isFullscreen` se sincroniza con el evento 'fullscreenchange' en vez de
// asumirse a partir de la promesa de requestFullscreen/exitFullscreen: así
// también refleja correctamente si el usuario sale con Esc o con el propio
// control del navegador, no solo con este botón.
import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface UseFullscreenResult {
  supported: boolean
  isFullscreen: boolean
  toggle: () => void
}

export function useFullscreen(targetRef: RefObject<HTMLElement | null>): UseFullscreenResult {
  const supported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function'

  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(document.fullscreenElement === targetRef.current)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [targetRef])

  const toggle = useCallback(() => {
    if (!supported) return
    if (document.fullscreenElement === targetRef.current) {
      document.exitFullscreen().catch((err) => {
        console.error('[fullscreen] No se pudo salir de pantalla completa:', err)
      })
    } else if (targetRef.current) {
      targetRef.current.requestFullscreen().catch((err) => {
        console.error('[fullscreen] No se pudo activar pantalla completa:', err)
      })
    }
  }, [supported, targetRef])

  return { supported, isFullscreen, toggle }
}
