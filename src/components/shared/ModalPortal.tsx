// Envoltorio compartido por PromptDialog, ConfirmDialog, FolderPickerDialog
// y PairingModal — antes cada uno se renderizaba como un simple
// `fixed inset-0` en el lugar del árbol donde el padre los montaba. Eso
// funcionaba mientras el padre fuera document.body o un ancestro "neutro",
// pero se rompía si alguno de esos ancestros creaba su propio stacking
// context (p. ej. un elemento con una transición de `opacity` o con
// `transform`, como el footer/SettingsSheet del Teleprompter): ahí el
// z-index del diálogo se compara solo contra sus hermanos DENTRO de ese
// contexto, no contra toda la página, y puede terminar renderizado por
// detrás de un panel hermano con menor z-index nominal. Mismo problema, ya
// resuelto antes, que los menús "⋮" (ver useDropdownMenu) — misma
// solución: portal directo a document.body, que escapa cualquier
// stacking context ancestro.
//
// También centraliza el ajuste por teclado en pantalla (ver
// useVisualViewportInsets): el contenedor no usa `inset-0` sino
// `top`/`height` calculados contra el área visible real, y el interior es
// scrolleable con el contenido centrado mediante `min-h-full` — así, si el
// teclado deja poco espacio, el diálogo se puede scrollear en vez de
// quedar centrado fuera de la vista o cortado.
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useVisualViewportInsets } from '../../hooks/useVisualViewportInsets'

interface ModalPortalProps {
  onBackdropClick?: () => void
  backdropClassName?: string
  children: ReactNode
}

export function ModalPortal({ onBackdropClick, backdropClassName = 'bg-black/60', children }: ModalPortalProps) {
  const { top, height } = useVisualViewportInsets()

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    onBackdropClick?.()
  }

  return createPortal(
    <div
      className={`fixed inset-x-0 z-[100] overflow-y-auto ${backdropClassName}`}
      style={{ top, height }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center p-4">{children}</div>
    </div>,
    document.body,
  )
}
