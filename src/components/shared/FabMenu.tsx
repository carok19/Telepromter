// Botón flotante de "crear" (Biblioteca, ambos niveles): redondo, azul,
// abajo a la derecha. Al tocarlo despliega dos opciones. A diferencia de
// los menús ⋯ de carpeta/guion (ver useDropdownMenu), este SIEMPRE vive en
// la misma esquina fija de la pantalla — no hace falta medir la posición
// de un botón ancla, así que no reutiliza ese hook, solo el mismo patrón
// de "cerrar con click afuera / Escape" a mano.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePlusIcon, FolderPlusIcon, PlusIcon } from './Icons'

interface FabMenuProps {
  onNewScript: () => void
  onNewFolder: () => void
}

export function FabMenu({ onNewScript, onNewFolder }: FabMenuProps) {
  const [open, setOpen] = useState(false)

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

  return createPortal(
    <div data-fab-menu className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-[#15171e] p-2 shadow-xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewScript()
            }}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5"
          >
            <FilePlusIcon className="h-4 w-4 text-blue-400" />
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
            <FolderPlusIcon className="h-4 w-4 text-blue-400" />
            Nueva carpeta
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar' : 'Crear'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:bg-blue-500 active:scale-95"
      >
        <PlusIcon className={`h-6 w-6 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
    </div>,
    document.body,
  )
}
