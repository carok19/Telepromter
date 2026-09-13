// Zona de lectura: dos líneas horizontales que marcan la franja de pantalla
// donde el usuario mira. Viven FUERA del wrapper con mirror/brillo/
// contraste (igual que header/footer) porque marcan un punto de la
// pantalla FÍSICA — mirror invierte el TEXTO, no dónde está mirando el
// lector, así que estas líneas nunca deben invertirse ni oscurecerse con
// brillo/contraste.
//
// `interactive` distingue el modo pasivo (solo referencia visual, prendido
// con el toggle rápido del footer) del modo de ajuste (arrastrable, entrado
// a propósito desde "Ajustar zona de lectura" — nunca con un toque suelto:
// fuera de ese modo, `interactive` es false y las líneas no responden a
// ningún puntero).
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CALIBRATION_RANGES, getReadingZoneLines, type ReadingZone } from '../../engine/calibrationEngine'

interface ReadingZoneGuidesProps {
  zone: ReadingZone
  onChange: (zone: ReadingZone) => void
  interactive: boolean
}

// Separación mínima entre las dos líneas mientras se arrastran — evita que
// se crucen o colapsen a un alto de cero.
const MIN_GAP_PERCENT = 4

type Handle = 'top' | 'bottom'

export function ReadingZoneGuides({ zone, onChange, interactive }: ReadingZoneGuidesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Handle | null>(null)
  const { topPercent, bottomPercent } = getReadingZoneLines(zone)

  function percentFromClientY(clientY: number): number {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return 0
    return Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
  }

  function commit(nextTop: number, nextBottom: number) {
    const center = (nextTop + nextBottom) / 2
    const height = nextBottom - nextTop
    const { min: centerMin, max: centerMax } = CALIBRATION_RANGES.readingZoneCenter
    const { min: heightMin, max: heightMax } = CALIBRATION_RANGES.readingZoneHeight
    onChange({
      ...zone,
      center: Math.min(centerMax, Math.max(centerMin, center)),
      height: Math.min(heightMax, Math.max(heightMin, height)),
    })
  }

  function handlePointerDown(which: Handle) {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive) return
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(which)
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const p = percentFromClientY(e.clientY)
    if (dragging === 'top') commit(Math.min(p, bottomPercent - MIN_GAP_PERCENT), bottomPercent)
    else commit(topPercent, Math.max(p, topPercent + MIN_GAP_PERCENT))
  }

  function stopDragging() {
    setDragging(null)
  }

  return (
    <div ref={containerRef} className="absolute inset-0 z-10" data-testid="reading-zone-guides">
      {(['top', 'bottom'] as const).map((which) => (
        <div
          key={which}
          data-testid={`reading-zone-guide-${which}`}
          onPointerDown={handlePointerDown(which)}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
          style={{ top: `${which === 'top' ? topPercent : bottomPercent}%` }}
          className={`absolute inset-x-0 -translate-y-1/2 ${
            interactive ? 'touch-none py-5' : 'pointer-events-none'
          }`}
        >
          <div className="h-px w-full bg-white/30" />
        </div>
      ))}
    </div>
  )
}
