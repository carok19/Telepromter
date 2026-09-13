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
        // Zona de agarre generosa — bastante más grande que la forma
        // visible, que se mantiene discreta a propósito (se refleja en el
        // vidrio). `left-[10px]` (no 0): deja un margen fijo contra el
        // borde de la pantalla, para no quedar pegado al texto — el propio
        // margen del texto (maxWidth/offsetX) varía según la calibración,
        // así que un valor fijo es lo único que garantiza separación en
        // cualquier configuración razonable.
        className="absolute left-[10px] -translate-y-1/2 touch-none py-8 pr-8"
      >
        {/* Solo el triángulo (sin la barra que tenía antes) — se agranda
            mientras se arrastra, para que quede claro qué se está
            moviendo, y vuelve a su tamaño normal al soltar con una
            transición suave. transformOrigin en el borde izquierdo para
            que crezca HACIA el texto, no hacia afuera de la pantalla. */}
        <div
          aria-hidden="true"
          className="transition-transform duration-150 ease-out"
          style={{ transform: dragging ? 'scale(1.3)' : 'scale(1)', transformOrigin: 'left center' }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: '16px solid transparent',
              borderBottom: '16px solid transparent',
              borderLeft: '22px solid rgba(160,160,160,0.65)',
              filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.65)) drop-shadow(0 0 1.5px rgba(255,255,255,0.3))',
            }}
          />
        </div>
      </div>
    </div>
  )
}
