// Modo márgenes: dos barras verticales a los lados del texto, arrastrables
// para angostar/ensanchar la columna. Escriben en `maxWidth` (el mismo
// valor que ya usa el slider "Margen") — no existe un margen izquierdo/
// derecho independiente en el modelo de calibración, así que arrastrar
// cualquiera de las dos barras ensancha/angosta desde los dos lados a la
// vez, igual que ya hacía el slider.
//
// Viven FUERA del wrapper con mirror/brillo/contraste, igual que
// SignalIndicator: son un control, no contenido. El mirror no cambia en
// qué posición quedan de todos modos — una franja simétrica alrededor del
// centro ocupa el mismo ancho reflejada o no — pero `offsetX` sí las mueve,
// porque ese desplazamiento es real (el bloque de texto entero se corre).
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CALIBRATION_RANGES } from '../../engine/calibrationEngine'

interface MarginGuidesProps {
  maxWidth: number
  offsetX: number
  onChange: (maxWidth: number) => void
}

export function MarginGuides({ maxWidth, offsetX, onChange }: MarginGuidesProps) {
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
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    updateFromClientX(e.clientX)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    updateFromClientX(e.clientX)
  }

  function stopDragging() {
    setDragging(false)
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
          style={{ left: `calc(50% + ${offsetX}px ${side === 'left' ? '-' : '+'} ${halfWidth}%)` }}
          className="absolute inset-y-0 -translate-x-1/2 touch-none px-5"
        >
          <div className="h-full w-px bg-white/30" />
        </div>
      ))}
    </div>
  )
}
