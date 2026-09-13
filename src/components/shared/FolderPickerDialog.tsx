// Selector de carpeta al guardar (Parte 3): solo aparece la primera vez
// que se guarda un guion que no tiene carpeta asignada por contexto (ver
// EditorPage.tsx) — nunca en guardados posteriores ni cuando ya se creó
// dentro de una carpeta real. Tocar una fila guarda ahí mismo, de una —
// mismo criterio de un solo toque que ya usa "Mover a carpeta" en
// ScriptCard, en vez de un paso de selección + confirmación aparte.
import { useEffect } from 'react'
import type { FolderRecord } from '../../db/db'
import { FONT_DISPLAY, SURFACE_RAISED } from '../../styles/tokens'
import { ModalPortal } from './ModalPortal'

interface FolderPickerDialogProps {
  folders: FolderRecord[]
  onSelect: (folderId: number | null) => void
  onClose: () => void
}

export function FolderPickerDialog({ folders, onSelect, onClose }: FolderPickerDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <ModalPortal onBackdropClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
        className={`w-full max-w-sm rounded-lg border border-white/10 ${SURFACE_RAISED} p-5 shadow-xl`}
      >
        <h2 id="folder-picker-title" className={`${FONT_DISPLAY} text-base font-semibold text-gray-100`}>
          ¿En qué carpeta guardamos este guion?
        </h2>
        <p className="mt-1 text-sm text-gray-400">Después lo podés mover desde "Mover a carpeta".</p>

        <div className="mt-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-md px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-white/5"
          >
            Sin carpeta
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelect(folder.id!)}
              className="truncate rounded-md px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-white/5"
            >
              {folder.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
    </ModalPortal>
  )
}
