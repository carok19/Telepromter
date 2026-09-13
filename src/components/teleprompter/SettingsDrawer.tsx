// Cajón de Ajustes del Teleprompter: se desliza desde el borde DERECHO al
// tocar la pestaña (SettingsTab) y se cierra tocándola de nuevo o tocando
// afuera (el fondo semitransparente). El borde izquierdo queda libre para
// el indicador de Señal (ver SignalIndicator). Reemplaza a LiveSettingsPanel,
// que vivía inline dentro del footer en vez de como un panel propio anclado
// al borde.
//
// Montado mientras `open` es true Y durante los 200ms de la transición de
// cierre (para poder animar el deslizamiento con CSS en vez de aparecer de
// golpe); una vez terminada esa transición se desmonta del todo. No basta
// con dejarlo siempre montado y solo trasladado fuera de pantalla
// (`translate-x-full`) con `pointer-events: none`: un elemento trasladado
// vía `transform` sigue contando para el `scrollWidth` del contenedor con
// `overflow-hidden` que lo envuelve (el transform no recorta el área de
// overflow "scrolleable", solo la pinta fuera de vista) — confirmado con la
// auditoría de desbordamiento a 360px, que marcaba el cajón cerrado como
// 306px de desborde horizontal aunque nunca se viera ni fuera clickeable.
// Desmontarlo del todo cuando no hace falta más (cerrado y ya terminó de
// animarse) es la única forma de que deje de contarse.
//
// `interactive` es el mismo `controlsInteractive` (protección de toque
// fantasma) que ya gatea el resto de los controles del footer: el mismo
// toque que abre el cajón no debe alcanzar a tocar, sin querer, un botón o
// slider que recién aparece debajo del dedo.
import { useEffect, useState, type ReactNode } from 'react'

// Debe coincidir con `duration-200` de las clases de transición de abajo.
const CLOSE_TRANSITION_MS = 200

interface SettingsDrawerProps {
  open: boolean
  interactive: boolean
  onClose: () => void
  children: ReactNode
}

export function SettingsDrawer({ open, interactive, onClose, children }: SettingsDrawerProps) {
  const canInteract = open && interactive
  // Sincronizado sin esperar un efecto cuando `open` pasa a true (patrón de
  // React soportado: ajustar estado durante el render) — si no, faltaría un
  // frame para montar antes de que la clase de transición pueda animar
  // desde la posición fuera de pantalla.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => setMounted(false), CLOSE_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open])

  if (!mounted) return null

  return (
    <>
      <div
        aria-hidden="true"
        onClick={canInteract ? onClose : undefined}
        className={`absolute inset-0 z-[25] bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ pointerEvents: canInteract ? 'auto' : 'none' }}
      />
      <div
        data-testid="settings-drawer"
        className={`absolute inset-y-0 right-0 z-30 flex w-[min(85vw,360px)] flex-col overflow-y-auto border-l border-white/10 bg-[#0b0c10]/95 backdrop-blur-sm transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ pointerEvents: canInteract ? 'auto' : 'none' }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#0b0c10]/95 px-4 py-3 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-gray-100">Ajustes en vivo</h2>
          <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-100">
            Cerrar
          </button>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
      </div>
    </>
  )
}
