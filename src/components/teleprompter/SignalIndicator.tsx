// Indicador de Señal: un triángulo fijo al borde izquierdo que marca la
// altura de lectura. Reemplaza a las dos líneas horizontales de la Zona de
// lectura original — referencia funcional: un triángulo que se arrastra
// verticalmente en el borde, sin entrar a ningún modo.
//
// A pedido explícito, se arrastra DIRECTO mientras está activado, sin el
// patrón de "modo de ajuste con ✓/✕" que sí conserva MarginGuides: más
// fluido, al precio de aceptar que un toque muy preciso sobre el propio
// triángulo también lo mueve. Es un blanco chico y pegado al borde —
// ningún gesto de lectura ni el toque que despierta los controles ocultos
// cae justo ahí por accidente.
//
// Vive FUERA del wrapper con mirror/brillo/contraste (igual que
// MarginGuides): marca un punto de la pantalla FÍSICA, no del texto.
//
// Arrastrarlo no debe revelar los controles ocultos por inactividad ni
// disparar play/pausa:
// - `stopPropagation` en touchstart/mousemove/click evita que el gesto
//   llegue a los listeners de useIdleControls (atados a `window`, ver ese
//   hook) — sin esto, cualquier arrastre reactivaría el timer de
//   inactividad y el footer/header reaparecerían encima del texto.
// - `setPointerCapture` asegura que el resto del gesto se siga entregando
//   a este mismo elemento pase lo que pase debajo, así que nunca llega a
//   activar un botón (Play, por ejemplo) que quede en esa posición.
//
// Cada `onChange` durante el arrastre ya aplica el valor final (como
// cualquier slider) — no hay paso de "confirmar". Si el gesto se corta a
// mitad de camino (cambio de app, pointercancel), el último valor ya
// aplicado por el pointermove anterior queda tal cual: nunca a medias.
import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent } from 'react'
import { CALIBRATION_RANGES } from '../../engine/calibrationEngine'

interface SignalIndicatorProps {
  center: number
  onChange: (center: number) => void
}

function stopPropagation(e: TouchEvent | MouseEvent) {
  e.stopPropagation()
}

export function SignalIndicator({ center, onChange }: SignalIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  function percentFromClientY(clientY: number): number {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return center
    const raw = ((clientY - rect.top) / rect.height) * 100
    const { min, max } = CALIBRATION_RANGES.readingZoneCenter
    return Math.min(max, Math.max(min, raw))
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onChange(percentFromClientY(e.clientY))
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!dragging) return
    onChange(percentFromClientY(e.clientY))
  }

  function stopDragging(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    setDragging(false)
  }

  return (
    // `inset-0` (no solo `left-0`): un elemento absoluto sin ancho explícito
    // colapsa a ancho 0 cuando sus únicos hijos también son absolutos (no
    // aportan tamaño intrínseco al padre) — con ancho 0, `inset-x-0` en la
    // línea de vista previa heredaría ese mismo ancho 0 y quedaría invisible
    // aunque el DOM la tenga. `inset-0` le da al contenedor el alto Y el
    // ancho completos del viewport, para que la línea sí pueda atravesarlo
    // de lado a lado; el triángulo sigue pegado al borde izquierdo con su
    // propio `left-0`.
    <div ref={containerRef} className="absolute inset-0 z-10" data-testid="signal-indicator-track">
      {dragging && (
        <div
          aria-hidden="true"
          data-testid="signal-indicator-preview-line"
          className="absolute inset-x-0 h-px bg-white/15"
          style={{ top: `${center}%` }}
        />
      )}
      <div
        data-testid="signal-indicator"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onTouchStart={stopPropagation}
        onMouseMove={stopPropagation}
        onClick={stopPropagation}
        style={{ top: `${center}%` }}
        className="absolute left-0 -translate-y-1/2 touch-none py-4 pr-4"
      >
        <div
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            borderLeft: '9px solid rgba(150,150,150,0.75)',
            filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6)) drop-shadow(0 0 1px rgba(255,255,255,0.3))',
          }}
        />
      </div>
    </div>
  )
}
