import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { FolderRecord, ScriptRecord } from '../../db/db'
import { DEFAULT_WPM, countWords, estimateDurationSeconds, formatDuration } from '../../engine/duration'
import { formatRelativeDateShort } from '../../engine/relativeDate'
import { extractTextPreview } from '../../engine/textPreview'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'
import { MoreVerticalIcon } from '../shared/Icons'
import {
  ACCENT_SOFT_BG,
  ACCENT_TEXT,
  SURFACE_BORDER,
  FONT_DISPLAY,
  RADIUS_CARD,
  RADIUS_MENU,
  SURFACE,
  SURFACE_HOVER,
  SURFACE_RAISED,
  TEXT_FAINT,
  TEXT_MUTED,
} from '../../styles/tokens'

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
  const updated = formatRelativeDateShort(script.updatedAt)

  return (
    // Rediseño (Parte 2): tocar la tarjeta abre el TELEPROMPTER directo
    // (antes abría el editor) — editar pasó al menú ⋯. Ya no hay un botón
    // "▶ Teleprompter" aparte: era redundante con este mismo click, y a
    // 360px competía por espacio con el título.
    <div
      onClick={onOpenTeleprompter}
      className={`group relative cursor-pointer ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} p-3.5 transition-colors ${SURFACE_HOVER}`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* min-w-0 es lo que permite que title/preview trunquen en vez de
            empujar el ancho de la tarjeta — sin esto, a 360px con un
            título largo, la tarjeta entera se desbordaría. */}
        <div className="min-w-0 flex-1">
          <h2 className={`truncate text-[17px] font-semibold tracking-[-0.4px] text-white ${FONT_DISPLAY}`}>
            {script.title || 'Sin título'}
          </h2>
          <p className={`mt-1 text-[13px] ${TEXT_MUTED}`}>
            {isDraft && <span className="mr-1 font-semibold text-amber-400">[BORRADOR]</span>}
            {updated} · {duration} · {wordCount} palabras
          </p>
          <p className={`mt-2 line-clamp-2 text-sm leading-[1.35] ${TEXT_FAINT}`}>{preview}</p>
        </div>
        <div ref={anchorRef} className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${ACCENT_SOFT_BG} ${ACCENT_TEXT} transition-colors hover:bg-accent/25`}
            aria-label="Más acciones"
          >
            <MoreVerticalIcon className="h-4 w-4" />
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
                className={`z-50 w-44 ${RADIUS_MENU} ${SURFACE_RAISED} py-1 shadow-xl`}
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
                {/* Un guion que nunca se guardó ni una vez no tiene
                    title/content reales todavía (están vacíos — lo que se
                    ve en la tarjeta es el borrador) — "Duplicar" copiaría
                    eso, un guion en blanco silencioso. Se ofrece solo para
                    guiones ya guardados al menos una vez (con o sin una
                    edición pendiente encima). */}
                {script.status !== 'draft' && (
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
                )}
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
                className={`z-50 max-h-56 w-44 overflow-y-auto ${RADIUS_MENU} ${SURFACE_RAISED} py-1 shadow-xl`}
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
