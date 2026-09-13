import { FolderIcon } from '../shared/Icons'
import { FONT_DISPLAY, RADIUS_CARD, SURFACE, SURFACE_BORDER, SURFACE_HOVER, TEXT_FAINT, TEXT_MUTED } from '../../styles/tokens'

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
      className={`flex h-[128px] flex-col items-center justify-center gap-2 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-3 text-center transition-colors ${SURFACE_HOVER}`}
    >
      <FolderIcon className="h-8 w-8 text-gray-300" />
      <div className="w-full min-w-0">
        {/* max-h + overflow-hidden (no line-clamp): envuelve a 2 líneas sin
            recortar a mitad de palabra, pero sin agrandar la tarjeta — un
            nombre de una sola línea o de dos ocupa el mismo alto reservado
            acá, así toda la fila de la cuadrícula queda pareja. */}
        <p className={`max-h-9 overflow-hidden text-[13px] leading-snug font-semibold text-white ${FONT_DISPLAY}`}>{name}</p>
        <p className={`mt-1 truncate text-[11px] ${TEXT_MUTED}`}>
          {scriptsLabel}
          {draftsLabel}
        </p>
        {updatedLabel && <p className={`mt-0.5 truncate text-[11px] ${TEXT_FAINT}`}>{updatedLabel}</p>}
      </div>
    </button>
  )
}
