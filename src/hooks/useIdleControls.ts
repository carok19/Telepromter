// Detecta inactividad para ocultar los controles del Teleprompter detrás
// del vidrio: sin mouse/touch/teclado durante `idleMs`, `idle` pasa a true.
// Cualquier actividad (mover el mouse, tocar, hacer click, escribir) lo
// vuelve a poner en false y reinicia el conteo.
//
// Este hook NO decide qué botón hace qué ni aplica ningún pointer-events —
// solo expone `idle`. Quien lo usa combina `idle` con sus propias
// excepciones (modal abierto, error visible, un control con foco) para
// decidir si los controles deben verse, y aplica su propio retraso antes
// de habilitar la interacción (evitar el "toque fantasma": revelar un
// botón y que el mismo toque que lo reveló también lo presione).
import { useEffect, useRef, useState } from 'react'

const DEFAULT_IDLE_MS = 3000

export interface UseIdleControlsResult {
  idle: boolean
}

export function useIdleControls(idleMs: number = DEFAULT_IDLE_MS): UseIdleControlsResult {
  const [idle, setIdle] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reportActivity() {
      setIdle(false)
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setIdle(true), idleMs)
    }

    reportActivity()

    window.addEventListener('mousemove', reportActivity)
    window.addEventListener('touchstart', reportActivity, { passive: true })
    window.addEventListener('keydown', reportActivity)
    window.addEventListener('click', reportActivity)

    return () => {
      window.removeEventListener('mousemove', reportActivity)
      window.removeEventListener('touchstart', reportActivity)
      window.removeEventListener('keydown', reportActivity)
      window.removeEventListener('click', reportActivity)
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current)
    }
  }, [idleMs])

  return { idle }
}
