// Indicador de Señal: un triángulo que marca la altura de lectura, pegado
// al borde IZQUIERDO DE LA COLUMNA DE TEXTO (no de la pantalla — ver el
// comentario de `left` más abajo, y maxWidth/offsetX en las props).
// Reemplaza a las dos líneas horizontales de la Zona de lectura original —
// referencia funcional: un triángulo que se arrastra verticalmente en el
// borde, sin entrar a ningún modo.
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
  // Ancho de la columna de texto y su corrimiento horizontal — los mismos
  // valores que ya usa MarginGuides para posicionar las barras — para que
  // el triángulo siga al borde IZQUIERDO REAL del texto en vez de quedar
  // fijo contra el borde de la pantalla (ver el comentario de `left` más
  // abajo).
  maxWidth: number
  offsetX: number
  onChange: (center: number) => void
  // El Teleprompter lo usa para ocultar header/footer por completo mientras
  // dura el arrastre (misma idea que `adjusting` en SettingsSheet: solo
  // debe quedar el texto y lo que se está tocando).
  onDraggingChange?: (dragging: boolean) => void
}

// Mismo gap que tenía el triángulo contra el borde de la pantalla cuando
// vivía fijo en `left-[10px]` — se conserva como la separación mínima
// contra CUALQUIER borde (pantalla o texto), ver GAP_PX más abajo.
const SIGNAL_GAP_PX = 10

function stopPropagation(e: TouchEvent | MouseEvent) {
  e.stopPropagation()
}

export function SignalIndicator({ center, maxWidth, offsetX, onChange, onDraggingChange }: SignalIndicatorProps) {
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
    onDraggingChange?.(true)
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
    onDraggingChange?.(false)
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
        style={{
          top: `${center}%`,
          // El borde izquierdo real de la columna de texto es el mismo
          // cálculo que ya usa MarginGuides para sus barras: centrado al
          // 50% del contenedor, corrido por offsetX (px) y angosto por
          // maxWidth/2 (%). Colocar el triángulo a SIGNAL_GAP_PX de ESE
          // borde (en vez de un left-[10px] fijo contra la pantalla) es lo
          // que lo mantiene pegado al texto sin importar el margen ni el
          // ancho de pantalla — antes, con un margen angosto (texto
          // ocupando casi toda la pantalla en una tablet/escritorio ancho),
          // el triángulo se quedaba clavado en el borde de la pantalla,
          // lejísimos del texto real.
          // `max()` (no un simple calc): si el margen es mínimo (texto muy
          // ancho, borde izquierdo casi pegado a la pantalla, o incluso
          // "negativo" con offsetX), el resultado de restar el gap podría
          // quedar en 0 o negativo — max() lo sujeta a SIGNAL_GAP_PX contra
          // la pantalla misma, que es exactamente la separación mínima que
          // ya tenía antes.
          left: `max(${SIGNAL_GAP_PX}px, calc(50% + ${offsetX}px - ${maxWidth / 2}% - ${SIGNAL_GAP_PX}px))`,
        }}
        // Zona de agarre generosa — bastante más grande que la forma
        // visible, que se mantiene discreta a propósito (se refleja en el
        // vidrio).
        className="absolute -translate-y-1/2 touch-none py-9 pr-9"
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
              borderTop: '22px solid transparent',
              borderBottom: '22px solid transparent',
              borderLeft: '30px solid rgba(160,160,160,0.65)',
              filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.65)) drop-shadow(0 0 1.5px rgba(255,255,255,0.3))',
            }}
          />
        </div>
      </div>
    </div>
  )
}
