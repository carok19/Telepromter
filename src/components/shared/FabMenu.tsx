// Botón flotante de "crear" (Biblioteca, ambos niveles): redondo, azul,
// abajo a la derecha. Al tocarlo despliega dos opciones. A diferencia de
// los menús ⋯ de carpeta/guion (ver useDropdownMenu), este SIEMPRE vive en
// la misma esquina fija de la pantalla — no hace falta medir la posición
// de un botón ancla, así que no reutiliza ese hook, solo el mismo patrón
// de "cerrar con click afuera / Escape" a mano.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePlusIcon, FolderPlusIcon, PlusIcon } from './Icons'
import { ACCENT_BG, ACCENT_BG_HOVER, ON_ACCENT, RADIUS_MENU, SURFACE_RAISED } from '../../styles/tokens'

// Sombra suave con el tono del acento (no gris genérico): mismo warm
// amber que el resto de la marca, apenas insinuado detrás del FAB — un
// levantamiento sutil, no un halo/glow.
const FAB_SHADOW = 'shadow-[0_4px_14px_rgba(242,169,59,0.3)]'

interface FabMenuProps {
  onNewScript: () => void
  // Sin onNewFolder (Nivel 2, dentro de una carpeta): el FAB es un solo
  // botón que crea el guion directo, sin desplegar nada — no hay "Nueva
  // carpeta" acá porque las carpetas no anidan (crear una desde dentro de
  // otra no tendría ningún efecto de agrupación) y ese caso ya tiene su
  // lugar natural en el Nivel 1, donde se ve toda la cuadrícula.
  onNewFolder?: () => void
}

export function FabMenu({ onNewScript, onNewFolder }: FabMenuProps) {
  const [open, setOpen] = useState(false)

  // El efecto va SIEMPRE antes que cualquier return condicional (reglas de
  // hooks) — cuando no hay onNewFolder, `open` nunca pasa a true (el botón
  // de abajo no despliega nada), así que este efecto simplemente no hace
  // nada en ese caso, sin necesidad de saltearlo.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (!(e.target as HTMLElement | null)?.closest('[data-fab-menu]')) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!onNewFolder) {
    return createPortal(
      <button
        type="button"
        onClick={onNewScript}
        aria-label="Nuevo guion"
        className={`fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full ${ACCENT_BG} ${ON_ACCENT} ${FAB_SHADOW} transition-transform ${ACCENT_BG_HOVER} active:scale-95`}
      >
        <PlusIcon className="h-6 w-6" />
      </button>,
      document.body,
    )
  }

  return createPortal(
    <div data-fab-menu className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className={`flex flex-col gap-1 ${RADIUS_MENU} ${SURFACE_RAISED} p-2 shadow-xl`}>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewScript()
            }}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5"
          >
            <FilePlusIcon className="h-4 w-4 text-gray-400" />
            Nuevo guion
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewFolder()
            }}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5"
          >
            <FolderPlusIcon className="h-4 w-4 text-gray-400" />
            Nueva carpeta
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar' : 'Crear'}
        className={`flex h-14 w-14 items-center justify-center rounded-full ${ACCENT_BG} ${ON_ACCENT} ${FAB_SHADOW} transition-transform ${ACCENT_BG_HOVER} active:scale-95`}
      >
        <PlusIcon className={`h-6 w-6 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
    </div>,
    document.body,
  )
}
