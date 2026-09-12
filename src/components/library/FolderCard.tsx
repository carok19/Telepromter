import {
  LIB_CARD_BORDER,
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
    <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden="true">
      <rect x="21" y="9" width="26" height="34" rx="3" fill="#d1d5db" transform="rotate(-6 34 26)" />
      <rect x="25" y="7" width="26" height="34" rx="3" fill="#f3f4f6" transform="rotate(4 38 24)" />
      <path
        d="M6 20a3 3 0 0 1 3-3h14l4 5h28a3 3 0 0 1 3 3v25a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z"
        fill="#3b82f6"
      />
      <path d="M4 30h56v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill="#2563eb" />
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
      className={`flex h-[128px] flex-col items-center justify-center gap-2 ${LIB_RADIUS_CARD} ${LIB_SURFACE} ${LIB_CARD_BORDER} px-3 text-center transition-colors ${LIB_SURFACE_HOVER}`}
    >
      <FolderGraphic />
      <div className="w-full min-w-0">
        {/* max-h + overflow-hidden (no line-clamp): envuelve a 2 líneas sin
            recortar a mitad de palabra, pero sin agrandar la tarjeta — un
            nombre de una sola línea o de dos ocupa el mismo alto reservado
            acá, así toda la fila de la cuadrícula queda pareja. */}
        <p className="max-h-9 overflow-hidden text-[13px] leading-snug font-semibold text-white">{name}</p>
        <p className={`mt-1 truncate text-[11px] ${LIB_TEXT_MUTED}`}>
          {scriptsLabel}
          {draftsLabel}
        </p>
        {updatedLabel && <p className={`mt-0.5 truncate text-[11px] ${LIB_TEXT_FAINT}`}>{updatedLabel}</p>}
      </div>
    </button>
  )
}
