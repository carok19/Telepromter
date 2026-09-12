import {
  LIB_CARD_PADDING,
  LIB_RADIUS_CARD,
  LIB_SURFACE,
  LIB_SURFACE_HOVER,
  LIB_TEXT_FAINT,
  LIB_TEXT_MUTED,
} from '../../styles/libraryTokens'

// Tarjeta de carpeta de la cuadrícula de Nivel 1 (Biblioteca). Es un
// gráfico decorativo simple (carpeta + dos hojas asomando) en vez de un
// ícono genérico de Icons.tsx — no se reutiliza en ningún otro lado, así
// que vive acá en vez de inflar el set de iconos compartido con una
// ilustración de un solo uso.
function FolderGraphic() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
      <rect x="21" y="9" width="26" height="34" rx="3" fill="#3a3d47" transform="rotate(-6 34 26)" />
      <rect x="25" y="7" width="26" height="34" rx="3" fill="#4b4e5a" transform="rotate(4 38 24)" />
      <path
        d="M6 20a3 3 0 0 1 3-3h14l4 5h28a3 3 0 0 1 3 3v25a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z"
        fill="#c6c8d1"
      />
      <path d="M4 30h56v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill="#e4e5ea" />
    </svg>
  )
}

interface FolderCardProps {
  name: string
  scriptCount: number
  draftCount: number
  updatedLabel: string | null
  onOpen: () => void
}

export function FolderCard({ name, scriptCount, draftCount, updatedLabel, onOpen }: FolderCardProps) {
  const scriptsLabel = `${scriptCount} ${scriptCount === 1 ? 'guion' : 'guiones'}`
  const draftsLabel = draftCount > 0 ? `, ${draftCount} ${draftCount === 1 ? 'borrador' : 'borradores'}` : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col items-center gap-3 ${LIB_RADIUS_CARD} ${LIB_SURFACE} ${LIB_CARD_PADDING} py-6 text-center transition-colors ${LIB_SURFACE_HOVER}`}
    >
      <FolderGraphic />
      <div className="w-full min-w-0">
        <p className="truncate text-[15px] font-semibold text-white">{name}</p>
        <p className={`mt-1 truncate text-xs ${LIB_TEXT_MUTED}`}>
          {scriptsLabel}
          {draftsLabel}
        </p>
        {updatedLabel && <p className={`mt-0.5 text-xs ${LIB_TEXT_FAINT}`}>{updatedLabel}</p>}
      </div>
    </button>
  )
}
