// Hoja de Ajustes del Teleprompter: sube desde abajo al tocar el botón de
// engranaje del footer (referencia funcional: "Configuración rápida" del
// video de referencia). Reemplaza al cajón lateral anterior — mismo panel
// unificado y secciones plegables adentro, distinto contenedor.
//
// El texto del guion queda visible DETRÁS, difuminado (backdrop-filter) y
// oscurecido, SOLO mientras la hoja está en reposo (abierta, sin arrastrar
// nada) — el difuminado existe para que la hoja se lea bien encima del
// texto; mientras se arrastra un control no hay hoja que leer, así que
// tampoco tiene sentido difuminar nada (ver `adjusting` más abajo).
//
// LO MÁS IMPORTANTE: mientras se arrastra cualquier slider del panel, la
// hoja entera DESAPARECE (no queda semitransparente encimada con el texto:
// eso resultó ilegible) — solo quedan visibles el texto limpio, el propio
// control que se está tocando (para no perder el dedo) y un recuadro
// flotante arriba con "Nombre del control · valor". Al soltar, la hoja
// reaparece con una transición suave.
//
// Cómo se logra que UN SOLO descendiente (el control activo) siga visible
// dentro de una hoja que por lo demás desapareció: `visibility` (a
// diferencia de `opacity`, que se compone multiplicativamente y no se puede
// "deshacer" en un hijo) SÍ se puede sobrescribir por elemento — un
// descendiente con `visibility: visible` DENTRO de un ancestro con
// `visibility: hidden` se seguí viendo y respondiendo a punteros
// (confirmado con una prueba mínima antes de implementar esto). Por eso:
// - la hoja entera pasa a `visibility: hidden` mientras `adjusting` es true;
// - el <input type="range"> activo recibe `style.visibility = 'visible'`
//   de forma imperativa (por ref, ver `activeInputRef`) — no por props, para
//   no tener que tocar los ~15 sliders de CalibrationSettingsPanel;
// - se restaura (`visibility = ''`) apenas termina el arrastre.
// `opacity` NUNCA se toca mientras `adjusting` es true (haría invisible
// también al control activo, sin excepción posible) — la transición suave
// de reaparición (`revealOpacity`) se dispara recién DESPUÉS de restaurar
// `visibility`, cuando ya no hace falta ninguna excepción: en ese momento
// toda la hoja (control activo incluido) puede volver a aparecer junta.
//
// El recuadro de valor lee el texto del propio Slider (su <label> ya
// muestra "Nombre" y "valorUnidad" en dos <span>) en vez de duplicar esa
// información en otro lado — se actualiza en cada evento 'input' nativo
// mientras dura el arrastre.
//
// Igual que el cajón anterior: montada mientras `open` es true y durante
// los `CLOSE_TRANSITION_MS` de la transición de cierre, para poder animar
// el deslizamiento con CSS — un elemento trasladado fuera de pantalla vía
// `transform` sigue contando para el overflow "scrolleable" del contenedor
// aunque `overflow-hidden` lo recorte visualmente.
//
// `interactive` es el mismo `controlsInteractive` (protección de toque
// fantasma) que ya gatea el resto de los controles del footer.
//
// `reduceEffects`: medido con un script de Playwright (frames por rAF con
// el motor reproduciendo) — el `backdrop-filter: blur()` de este fondo
// agrega jitter real al desplazamiento mientras el texto se mueve detrás.
// Con el motor reproduciendo, se cae al oscurecido simple (sin blur): la
// fluidez del scroll importa más que el efecto. En pausa/listo se mantiene
// el blur.
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

const CLOSE_TRANSITION_MS = 200
const REVEAL_TRANSITION_MS = 220
// Arrastrar el asa hacia abajo más de esto cierra la hoja al soltar.
const DRAG_TO_CLOSE_THRESHOLD_PX = 90

interface SettingsSheetProps {
  open: boolean
  interactive: boolean
  onClose: () => void
  children: ReactNode
  reduceEffects?: boolean
}

function isRangeInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'range'
}

// El <label> del Slider compartido (ver components/shared/Slider.tsx) es
// <label><span class="flex ..."><span>Nombre</span><span>valorUnidad</span></span><input/></label>.
function readSliderLabel(input: HTMLInputElement): string | null {
  const labelEl = input.closest('label')
  const spans = labelEl?.querySelectorAll('span > span')
  if (!spans || spans.length < 2) return null
  const name = spans[0].textContent?.trim()
  const value = spans[1].textContent?.trim()
  return name && value ? `${name} · ${value}` : (name ?? null)
}

export function SettingsSheet({ open, interactive, onClose, children, reduceEffects = false }: SettingsSheetProps) {
  const canInteract = open && interactive

  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => setMounted(false), CLOSE_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open])

  // Ver el comentario largo de arriba: `adjusting` oculta la hoja entera
  // (vía `visibility`, nunca `opacity`) mientras dura el arrastre de
  // cualquier slider; `activeControlLabel` alimenta el recuadro flotante.
  const [adjusting, setAdjusting] = useState(false)
  const [activeControlLabel, setActiveControlLabel] = useState<string | null>(null)
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  // Controla la reaparición suave: se fuerza a 0 en el instante en que
  // termina el arrastre y, un par de frames después (para que el navegador
  // llegue a pintar ese 0 antes de animar), sube a 1 con transición.
  const [revealOpacity, setRevealOpacity] = useState(1)

  if (open && !mounted) {
    setMounted(true)
    // Reabrir siempre arranca desde cero: sin esto, un cierre justo en medio
    // de la transición de reaparición (revealOpacity todavía animando hacia
    // 1) dejaría ese valor viejo pisado para la próxima apertura — el
    // componente nunca se desmonta de verdad solo por devolver `null`.
    setRevealOpacity(1)
  }

  function handleContentPointerDownCapture(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isRangeInput(e.target)) return
    activeInputRef.current = e.target
    e.target.style.visibility = 'visible'
    // Por las dudas: la hoja pasa a `pointer-events: none` mientras se
    // arrastra (ver más abajo), y aunque un arrastre nativo ya iniciado no
    // debería depender de esto para seguir recibiendo eventos, esta línea
    // lo deja escrito explícitamente en vez de confiar en el comportamiento
    // implícito del navegador.
    e.target.style.pointerEvents = 'auto'
    setAdjusting(true)
    setActiveControlLabel(readSliderLabel(e.target))
  }
  function handleContentInput(e: FormEvent<HTMLDivElement>) {
    if (e.target === activeInputRef.current && activeInputRef.current) {
      setActiveControlLabel(readSliderLabel(activeInputRef.current))
    }
  }
  function handleContentPointerEnd() {
    if (!adjusting) return
    if (activeInputRef.current) {
      activeInputRef.current.style.visibility = ''
      activeInputRef.current.style.pointerEvents = ''
    }
    activeInputRef.current = null
    setAdjusting(false)
    setActiveControlLabel(null)
    // Ver el comentario de arriba: forzar 0 ahora, animar a 1 recién
    // después de que el navegador pinte ese 0, para que la transición se
    // note en vez de "saltar" directo al valor final.
    setRevealOpacity(0)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRevealOpacity(1))
    })
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
      {/* Fondo: difuminado + oscurecido en reposo; desaparece del todo (sin
          blur NI oscurecido, y sin capturar toques) mientras se arrastra un
          slider — no hay hoja que leer encima del texto en ese momento. */}
      <div
        aria-hidden="true"
        data-testid="settings-sheet-backdrop"
        onClick={canInteract && !adjusting ? onClose : undefined}
        className="absolute inset-0 z-[25]"
        style={{
          opacity: open && !adjusting ? 1 : 0,
          backgroundColor: reduceEffects ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.55)',
          backdropFilter: reduceEffects ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: reduceEffects ? 'none' : 'blur(8px)',
          pointerEvents: canInteract && !adjusting ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
        }}
      />
      {/* Recuadro flotante con "Nombre del control · valor" — la única
          referencia visible de qué se está ajustando mientras la hoja está
          oculta. Vive FUERA de la hoja (no se ve afectado por su
          `visibility`). */}
      {activeControlLabel && (
        <div
          aria-hidden="true"
          data-testid="settings-sheet-adjusting-badge"
          className="absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-[#0b0c10] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-gray-100 shadow-lg"
        >
          {activeControlLabel}
        </div>
      )}
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
          visibility: adjusting ? 'hidden' : 'visible',
          opacity: revealOpacity,
          backgroundColor: '#0b0c10',
          pointerEvents: canInteract && !adjusting ? 'auto' : 'none',
          transition: draggingHandle || adjusting ? 'none' : `transform 200ms ease-out, opacity ${REVEAL_TRANSITION_MS}ms ease-out`,
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
          onInputCapture={handleContentInput}
          className="flex flex-col gap-4 overflow-y-auto px-4 py-4"
        >
          {children}
        </div>
      </div>
    </>
  )
}
