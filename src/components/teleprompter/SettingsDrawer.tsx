// Cajón de Ajustes del Teleprompter: se desliza desde el borde izquierdo al
// tocar la pestaña (SettingsTab) y se cierra tocándola de nuevo o tocando
// afuera (el fondo semitransparente). Reemplaza a LiveSettingsPanel, que
// vivía inline dentro del footer en vez de como un panel propio anclado al
// borde.
//
// Siempre montado (para poder animar el deslizamiento con CSS en vez de
// aparecer de golpe); cuando está cerrado queda fuera de pantalla
// (translate-x) y sin pointer-events, así que no interfiere con nada del
// resto de la pantalla aunque técnicamente siga en el DOM.
//
// `interactive` es el mismo `controlsInteractive` (protección de toque
// fantasma) que ya gatea el resto de los controles del footer: el mismo
// toque que abre el cajón no debe alcanzar a tocar, sin querer, un botón o
// slider que recién aparece debajo del dedo.
import type { ReactNode } from 'react'

interface SettingsDrawerProps {
  open: boolean
  interactive: boolean
  onClose: () => void
  children: ReactNode
}

export function SettingsDrawer({ open, interactive, onClose, children }: SettingsDrawerProps) {
  const canInteract = open && interactive

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
        className={`absolute inset-y-0 left-0 z-30 flex w-[min(85vw,360px)] flex-col overflow-y-auto border-r border-white/10 bg-[#0b0c10]/95 backdrop-blur-sm transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
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
