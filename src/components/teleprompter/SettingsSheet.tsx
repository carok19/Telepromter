// Hoja de Ajustes del Teleprompter: sube desde abajo al tocar el botón de
// engranaje del footer (referencia funcional: "Configuración rápida" del
// video de referencia). Reemplaza al cajón lateral anterior — mismo panel
// unificado y secciones plegables adentro, distinto contenedor.
//
// El texto del guion queda visible DETRÁS, difuminado (backdrop-filter) y
// oscurecido — el fondo semitransparente de antes no alcanzaba para "leerse
// bien sin tapar del todo lo de abajo".
//
// LO MÁS IMPORTANTE: mientras se arrastra cualquier slider del panel, la
// hoja se vuelve casi transparente y el difuminado del fondo desaparece —
// así se ve en vivo el efecto sobre el texto real. `adjusting` se detecta
// por DELEGACIÓN (un solo par de handlers acá, en vez de repetir la lógica
// en cada uno de los ~15 sliders de CalibrationSettingsPanel): en captura,
// si el `pointerdown` originario es un <input type="range">, se activa; en
// burbuja, cualquier pointerup/cancel lo desactiva. Cambiar solo `opacity`/
// `backdrop-filter` (nunca reposicionar ni desmontar nada) es lo que
// garantiza que el dedo no pierda el control que está tocando.
//
// Igual que el cajón anterior: montada mientras `open` es true y durante
// los `CLOSE_TRANSITION_MS` de la transición de cierre, para poder animar
// el deslizamiento con CSS — un elemento trasladado fuera de pantalla vía
// `transform` sigue contando para el overflow "scrolleable" del contenedor
// aunque `overflow-hidden` lo recorte visualmente (ver el comentario más
// detallado que tenía SettingsDrawer, el componente que este reemplaza).
//
// `interactive` es el mismo `controlsInteractive` (protección de toque
// fantasma) que ya gatea el resto de los controles del footer.
//
// `reduceEffects`: medido con un script de Playwright (frames por rAF con
// el motor reproduciendo) — el `backdrop-filter: blur()` de este fondo
// agrega jitter real al desplazamiento mientras el texto se mueve detrás
// (frames sueltos por encima de 33ms que no aparecen sin el panel abierto).
// Con el motor reproduciendo, se cae al oscurecido simple (sin blur): la
// fluidez del scroll importa más que el efecto. En pausa/listo, sin costo
// de composición por frame (nada se mueve detrás), se mantiene el blur.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

const CLOSE_TRANSITION_MS = 200
// Arrastrar el asa hacia abajo más de esto cierra la hoja al soltar.
const DRAG_TO_CLOSE_THRESHOLD_PX = 90

interface SettingsSheetProps {
  open: boolean
  interactive: boolean
  onClose: () => void
  children: ReactNode
  reduceEffects?: boolean
}

function isRangeInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.type === 'range'
}

export function SettingsSheet({ open, interactive, onClose, children, reduceEffects = false }: SettingsSheetProps) {
  const canInteract = open && interactive

  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => setMounted(false), CLOSE_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open])

  // "Casi transparente" mientras se arrastra un slider — ver comentario de
  // arriba sobre por qué esto vive acá (delegación) y no en cada Slider.
  const [adjusting, setAdjusting] = useState(false)
  function handleContentPointerDownCapture(e: ReactPointerEvent<HTMLDivElement>) {
    if (isRangeInput(e.target)) setAdjusting(true)
  }
  function handleContentPointerEnd() {
    setAdjusting(false)
  }

  // Arrastrar el asa hacia abajo para cerrar. Sin transición mientras se
  // arrastra (debe seguir al dedo 1:1); al soltar, o se completa el cierre
  // (onClose, que dispara la transición normal vía `open`) o se anima de
  // vuelta a 0 con la transición de siempre.
  const [dragOffset, setDragOffset] = useState(0)
  const [draggingHandle, setDraggingHandle] = useState(false)
  const dragStartYRef = useRef(0)

  function handleHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraggingHandle(true)
    dragStartYRef.current = e.clientY
  }
  function handleHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingHandle) return
    setDragOffset(Math.max(0, e.clientY - dragStartYRef.current))
  }
  function handleHandlePointerUp() {
    if (!draggingHandle) return
    setDraggingHandle(false)
    if (dragOffset > DRAG_TO_CLOSE_THRESHOLD_PX) onClose()
    setDragOffset(0)
  }

  if (!mounted) return null

  return (
    <>
      {/* Fondo: difuminado + oscurecido en reposo, se aclara del todo
          mientras se arrastra un slider (ver `adjusting`) para que el texto
          real quede visible sin nada encima. */}
      <div
        aria-hidden="true"
        onClick={canInteract ? onClose : undefined}
        className="absolute inset-0 z-[25]"
        style={{
          opacity: open ? 1 : 0,
          backgroundColor: adjusting ? 'transparent' : reduceEffects ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.55)',
          backdropFilter: adjusting || reduceEffects ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: adjusting || reduceEffects ? 'none' : 'blur(8px)',
          pointerEvents: canInteract ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out, background-color 200ms ease-out, backdrop-filter 200ms ease-out',
        }}
      />
      <div
        data-testid="settings-sheet"
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10"
        style={{
          transform:
            dragOffset > 0
              ? `translateY(${dragOffset}px)`
              : open
                ? 'translateY(0)'
                : 'translateY(100%)',
          opacity: adjusting ? 0.15 : 1,
          backgroundColor: '#0b0c10',
          pointerEvents: canInteract ? 'auto' : 'none',
          transition: draggingHandle
            ? 'none'
            : 'transform 200ms ease-out, opacity 200ms ease-out',
        }}
      >
        {/* Asa: además de indicar visualmente que la hoja se puede arrastrar,
            es la zona de arrastre para cerrarla bajándola con el dedo. */}
        <div
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
          className="flex shrink-0 touch-none justify-center py-2"
        >
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3">
          <h2 className="text-sm font-semibold text-gray-100">Configuración rápida</h2>
          <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-100">
            Cerrar
          </button>
        </div>
        <div
          onPointerDownCapture={handleContentPointerDownCapture}
          onPointerUp={handleContentPointerEnd}
          onPointerCancel={handleContentPointerEnd}
          className="flex flex-col gap-4 overflow-y-auto px-4 py-4"
        >
          {children}
        </div>
      </div>
    </>
  )
}
