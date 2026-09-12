import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { FolderRecord, ScriptRecord } from '../../db/db'
import { DEFAULT_WPM, countWords, estimateDurationSeconds, formatDuration } from '../../engine/duration'
import { extractTextPreview } from '../../engine/textPreview'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'
import { FileTextIcon } from '../shared/Icons'

interface ScriptCardProps {
  // Cuando `isDraft` es true, el llamador ya reemplazó title/content acá
  // por los del borrador pendiente (tabla `drafts`) — la última versión
  // tipeada, no la última guardada — así la tarjeta siempre muestra lo más
  // reciente, se haya confirmado con "Guardar" o no.
  script: ScriptRecord
  isDraft: boolean
  folders: FolderRecord[]
  onEdit: () => void
  onOpenTeleprompter: () => void
  onDuplicate: () => void
  onDelete: () => void
  // folderId `null` = "Sin carpeta".
  onMoveToFolder: (folderId: number | null) => void
}

export function ScriptCard({
  script,
  isDraft,
  folders,
  onEdit,
  onOpenTeleprompter,
  onDuplicate,
  onDelete,
  onMoveToFolder,
}: ScriptCardProps) {
  // "Mover a carpeta" se expande DENTRO del mismo menú (una lista más, con
  // "‹ Volver" arriba) en vez de un submenú aparte — más simple de
  // implementar y de usar con pocas carpetas, que es el caso esperado acá.
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  // remeasureKey=showMoveMenu: el contenido del menú cambia de tamaño al
  // pasar de la lista principal a "Mover a carpeta" sin cerrarse — hay que
  // volver a medir la posición (arriba/abajo) en ese momento, no solo al
  // abrir.
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    position,
    anchorRef,
    menuRef,
  } = useDropdownMenu<HTMLDivElement>('right', showMoveMenu)

  function closeMenu() {
    setMenuOpen(false)
    setShowMoveMenu(false)
  }

  const wordCount = countWords(script.content)
  const duration = formatDuration(estimateDurationSeconds(wordCount, DEFAULT_WPM))
  const preview = extractTextPreview(script.content) || 'Guion vacío'
  const updated = new Date(script.updatedAt).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    // Rediseño (Parte 2): tocar la tarjeta abre el TELEPROMPTER directo
    // (antes abría el editor) — editar pasó al menú ⋯. Ya no hay un botón
    // "▶ Teleprompter" aparte: era redundante con este mismo click, y a
    // 360px competía por espacio con el título.
    <div
      onClick={onOpenTeleprompter}
      className="group relative cursor-pointer rounded-lg border border-white/10 bg-[#0f1117] p-4 transition-colors hover:border-blue-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        {/* min-w-0 es lo que permite que title/preview trunquen en vez de
            empujar el ancho de la tarjeta — sin esto, a 360px con un
            título largo, la tarjeta entera se desbordaría. */}
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <FileTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium text-gray-100">{script.title || 'Sin título'}</h2>
            <p className="mt-1 text-xs text-gray-600">
              {isDraft && <span className="mr-1 font-semibold text-amber-400">[BORRADOR]</span>}
              {wordCount} palabras · ~{duration} min · {updated}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{preview}</p>
          </div>
        </div>
        <div ref={anchorRef} className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-200"
            aria-label="Más acciones"
          >
            ⋮
          </button>
          {menuOpen &&
            !showMoveMenu &&
            createPortal(
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: position.top ?? undefined,
                  bottom: position.bottom ?? undefined,
                  left: position.left,
                }}
                className="z-50 w-44 rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => {
                    closeMenu()
                    onEdit()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoveMenu(true)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  Mover a carpeta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu()
                    onDuplicate()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu()
                    onDelete()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
                >
                  Eliminar
                </button>
              </div>,
              document.body,
            )}
          {menuOpen &&
            showMoveMenu &&
            createPortal(
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: position.top ?? undefined,
                  bottom: position.bottom ?? undefined,
                  left: position.left,
                }}
                className="z-50 max-h-56 w-44 overflow-y-auto rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => setShowMoveMenu(false)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-white/5"
                >
                  ‹ Volver
                </button>
                <button
                  type="button"
                  disabled={script.folderId == null}
                  onClick={() => {
                    closeMenu()
                    onMoveToFolder(null)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-gray-600 disabled:hover:bg-transparent"
                >
                  Sin carpeta
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    disabled={script.folderId === folder.id}
                    onClick={() => {
                      closeMenu()
                      onMoveToFolder(folder.id!)
                    }}
                    className="block w-full truncate px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-gray-600 disabled:hover:bg-transparent"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>
      </div>
    </div>
  )
}
