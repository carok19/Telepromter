// Carpetas (Mis guiones): fila horizontal de "chips" con scroll lateral —
// a propósito NO un sidebar ni un panel que ocupe media pantalla en
// celular (ver Fase 0: ese fue justo el bug del menú lateral). Una sola
// fila que se desliza de lado es segura en cualquier ancho de pantalla sin
// ninguna lógica de "oculto por defecto en celular".
import { useEffect, useState } from 'react'
import type { FolderRecord } from '../../db/db'

export type FolderFilter = 'all' | 'none' | number

interface FolderChipProps {
  label: string
  count: number
  active: boolean
  onSelect: () => void
  onRename?: () => void
  onDelete?: () => void
}

function FolderChip({ label, count, active, onSelect, onRename, onDelete }: FolderChipProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const canManage = onRename != null || onDelete != null

  useEffect(() => {
    if (!menuOpen) return
    function closeMenu() {
      setMenuOpen(false)
    }
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [menuOpen])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
          active
            ? 'border-blue-500/50 bg-blue-600/20 text-blue-400'
            : 'border-white/10 bg-[#0f1117] text-gray-300 hover:border-white/20'
        }`}
      >
        <span className="max-w-40 truncate">{label}</span>
        <span className={`text-xs ${active ? 'text-blue-400/70' : 'text-gray-500'}`}>{count}</span>
        {canManage && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }
            }}
            className="ml-0.5 rounded px-1 text-gray-500 hover:bg-white/10 hover:text-gray-200"
            aria-label={`Más acciones para la carpeta ${label}`}
          >
            ⋮
          </span>
        )}
      </button>
      {menuOpen && canManage && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-9 z-10 w-36 rounded-md border border-white/10 bg-[#15171e] py-1 shadow-lg"
        >
          {onRename && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onRename()
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
            >
              Renombrar
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onDelete()
              }}
              className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface FolderTabsProps {
  folders: FolderRecord[]
  countAll: number
  countNone: number
  countByFolder: Map<number, number>
  selected: FolderFilter
  onSelect: (filter: FolderFilter) => void
  onCreateFolder: () => void
  onRenameFolder: (folder: FolderRecord) => void
  onDeleteFolder: (folder: FolderRecord) => void
}

export function FolderTabs({
  folders,
  countAll,
  countNone,
  countByFolder,
  selected,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderTabsProps) {
  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
      <FolderChip label="Todos" count={countAll} active={selected === 'all'} onSelect={() => onSelect('all')} />
      <FolderChip
        label="Sin carpeta"
        count={countNone}
        active={selected === 'none'}
        onSelect={() => onSelect('none')}
      />
      {folders.map((folder) => (
        <FolderChip
          key={folder.id}
          label={folder.name}
          count={countByFolder.get(folder.id!) ?? 0}
          active={selected === folder.id}
          onSelect={() => onSelect(folder.id!)}
          onRename={() => onRenameFolder(folder)}
          onDelete={() => onDeleteFolder(folder)}
        />
      ))}
      <button
        type="button"
        onClick={onCreateFolder}
        className="shrink-0 rounded-full border border-dashed border-white/20 px-3 py-1.5 text-sm text-gray-400 whitespace-nowrap hover:border-white/40 hover:text-gray-200"
      >
        + Nueva carpeta
      </button>
    </div>
  )
}
