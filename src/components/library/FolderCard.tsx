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
    // Handoff: tarjeta alineada a la izquierda (ícono arriba, texto debajo),
    // no centrada — antes tenía un alto fijo (128px) para que toda la fila
    // de la cuadrícula quedara pareja aunque el nombre ocupara 1 o 2
    // líneas; ahora cada tarjeta crece según su contenido (line-clamp-2 en
    // el nombre evita que una crezca sin límite), como en el diseño.
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col items-start gap-3 ${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} px-3.5 py-4 text-left transition-colors ${SURFACE_HOVER}`}
    >
      <FolderIcon className="h-6 w-6 text-accent" />
      <div className="w-full min-w-0">
        <p className={`line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.4px] text-white ${FONT_DISPLAY}`}>
          {name}
        </p>
        <p className={`mt-1 truncate text-[13px] ${TEXT_MUTED}`}>
          {scriptsLabel}
          {draftsLabel}
        </p>
        {updatedLabel && <p className={`mt-0.5 truncate text-[13px] ${TEXT_FAINT}`}>{updatedLabel}</p>}
      </div>
    </button>
  )
}
