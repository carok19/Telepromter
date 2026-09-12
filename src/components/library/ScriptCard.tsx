import { useState } from 'react'
import type { FolderRecord, ScriptRecord } from '../../db/db'
import { DEFAULT_WPM, countWords, estimateDurationSeconds, formatDuration } from '../../engine/duration'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'

interface ScriptCardProps {
  script: ScriptRecord
  folders: FolderRecord[]
  onOpen: () => void
  onOpenTeleprompter: () => void
  onDuplicate: () => void
  onDelete: () => void
  // folderId `null` = "Sin carpeta".
  onMoveToFolder: (folderId: number | null) => void
}

function extractPreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = doc.body.textContent?.trim() ?? ''
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

export function ScriptCard({
  script,
  folders,
  onOpen,
  onOpenTeleprompter,
  onDuplicate,
  onDelete,
  onMoveToFolder,
}: ScriptCardProps) {
  // "Mover a..." se expande DENTRO del mismo menú (una lista más, con
  // "‹ Volver" arriba) en vez de un submenú aparte — más simple de
  // implementar y de usar con pocas carpetas, que es el caso esperado acá.
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  // remeasureKey=showMoveMenu: el contenido del menú cambia de tamaño al
  // pasar de la lista principal a "Mover a..." sin cerrarse — hay que
  // volver a medir la posición (arriba/abajo) en ese momento, no solo al
  // abrir.
  const { open: menuOpen, setOpen: setMenuOpen, openUpward, anchorRef, menuRef } = useDropdownMenu<HTMLDivElement>(
    showMoveMenu,
  )

  function closeMenu() {
    setMenuOpen(false)
    setShowMoveMenu(false)
  }

  const wordCount = countWords(script.content)
  const duration = formatDuration(estimateDurationSeconds(wordCount, DEFAULT_WPM))
  const preview = extractPreview(script.content) || 'Guion vacío'
  const updated = new Date(script.updatedAt).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div
      onClick={onOpen}
      className="group relative cursor-pointer rounded-lg border border-white/10 bg-[#0f1117] p-4 transition-colors hover:border-blue-500/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium text-gray-100">{script.title || 'Sin título'}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{preview}</p>
          <p className="mt-2 text-xs text-gray-600">
            {updated} · {wordCount} palabras · ~{duration} min
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenTeleprompter()
            }}
            className="rounded px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10"
            aria-label="Abrir en el teleprompter"
          >
            ▶ Teleprompter
          </button>
          <div ref={anchorRef} className="relative">
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
            {menuOpen && !showMoveMenu && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 z-10 w-40 rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg ${
                  openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowMoveMenu(true)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  Mover a...
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
              </div>
            )}
            {menuOpen && showMoveMenu && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 z-10 max-h-56 w-44 overflow-y-auto rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg ${
                  openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
