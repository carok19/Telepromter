// Barras verticales a los lados del texto, arrastrables para angostar/
// ensanchar la columna. Escriben en `maxWidth` (el mismo valor que ya usa
// el slider "Margen") — no existe un margen izquierdo/derecho
// independiente en el modelo de calibración, así que arrastrar cualquiera
// de las dos barras ensancha/angosta desde los dos lados a la vez, igual
// que ya hacía el slider.
//
// Se arrastran DIRECTO y se aplican en vivo, sin confirmar (✓/✕) — mismo
// criterio que SignalIndicator: más fluido, y el propio botón "Margen" del
// footer ya es la forma de mostrarlas/ocultarlas (ver TeleprompterPage).
//
// Cada barra tiene una línea fina (para no competir visualmente ni
// reflejarse fuerte en el vidrio) y una agarradera gruesa a media altura —
// lo que se toca es la agarradera, no la línea; la zona de toque (`px-6`)
// es bastante más generosa que ambas.
//
// Viven FUERA del wrapper con mirror/brillo/contraste, igual que
// SignalIndicator: son un control, no contenido. El mirror no cambia en
// qué posición quedan de todos modos — una franja simétrica alrededor del
// centro ocupa el mismo ancho reflejada o no — pero `offsetX` sí las mueve,
// porque ese desplazamiento es real (el bloque de texto entero se corre).
//
// Arrastrarlas no debe revelar los controles ocultos por inactividad ni
// disparar play/pausa — mismo motivo y misma técnica que SignalIndicator
// (`stopPropagation` en touchstart/mousemove/click, `setPointerCapture`).
// `onDraggingChange` avisa a TeleprompterPage para que oculte header y
// footer por completo mientras dura el arrastre (igual que con la Señal).
import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent } from 'react'
import { CALIBRATION_RANGES } from '../../engine/calibrationEngine'

interface MarginGuidesProps {
  maxWidth: number
  offsetX: number
  onChange: (maxWidth: number) => void
  onDraggingChange?: (dragging: boolean) => void
}

function stopPropagation(e: TouchEvent | MouseEvent) {
  e.stopPropagation()
}

export function MarginGuides({ maxWidth, offsetX, onChange, onDraggingChange }: MarginGuidesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  function updateFromClientX(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const xPercent = ((clientX - rect.left) / rect.width) * 100
    const offsetXPercent = (offsetX / rect.width) * 100
    const distanceFromCenter = Math.abs(xPercent - (50 + offsetXPercent))
    const { min, max } = CALIBRATION_RANGES.maxWidth
    onChange(Math.min(max, Math.max(min, distanceFromCenter * 2)))
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onDraggingChange?.(true)
    updateFromClientX(e.clientX)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!dragging) return
    updateFromClientX(e.clientX)
  }

  function stopDragging(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    setDragging(false)
    onDraggingChange?.(false)
  }

  const halfWidth = maxWidth / 2

  return (
    <div ref={containerRef} className="absolute inset-0 z-10" data-testid="margin-guides">
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          data-testid={`margin-guide-${side}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
          onTouchStart={stopPropagation}
          onMouseMove={stopPropagation}
          onClick={stopPropagation}
          style={{ left: `calc(50% + ${offsetX}px ${side === 'left' ? '-' : '+'} ${halfWidth}%)` }}
          className="absolute inset-y-0 -translate-x-1/2 touch-none px-6"
        >
          {/* `relative` acá (no en el padre): la línea y la agarradera se
              centran contra ESTE ancho fijo, sin depender de que el padding
              simétrico del padre las deje centradas "de casualidad". */}
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/25" />
            <div className="absolute top-1/2 left-1/2 h-20 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45" />
          </div>
        </div>
      ))}
    </div>
  )
}
