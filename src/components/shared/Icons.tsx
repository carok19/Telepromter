// Set de iconos SVG propio para el rediseño visual de la consola de control
// remoto (y cualquier otra pantalla que los necesite después) — el proyecto
// no traía ninguna librería de iconos instalada, y agregar una solo para
// ~10 iconos sería una dependencia entera por muy poco. Mismo trazo/tamaño
// en todos (viewBox 24x24) para que se vean como un solo set consistente.
interface IconProps {
  className?: string
}

const DEFAULT_SIZE = 'h-5 w-5'

// Iconos "sólidos" (reproducción) — un triángulo/barras rellenas se leen
// mejor como botón físico que un trazo fino.
export function PlayIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  )
}

export function PauseIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

export function RewindIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <polygon points="11 19 2 12 11 5 11 19" />
      <polygon points="22 19 13 12 22 5 22 19" />
    </svg>
  )
}

export function FastForwardIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <polygon points="13 19 22 12 13 5 13 19" />
      <polygon points="2 19 11 12 2 5 2 19" />
    </svg>
  )
}

// Iconos de trazo (interfaz/controles secundarios).
const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function ChevronDownIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function ChevronUpIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

export function FileTextIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  )
}

export function WifiIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M5 13a10 10 0 0 1 14 0" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  )
}

export function WifiOffIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

export function RotateCcwIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

export function MinusIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} strokeWidth={2.25} className={className} aria-hidden="true">
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  )
}

export function PlusIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} strokeWidth={2.25} className={className} aria-hidden="true">
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  )
}

export function ArrowLeftRightIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  )
}

export function ArrowUpDownIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </svg>
  )
}

export function SettingsIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function SearchIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
    </svg>
  )
}

export function FolderIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.5l2 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
    </svg>
  )
}

// Reemplaza los caracteres de texto "⋯"/"⋮" (glifos de la fuente del
// sistema, no coherentes con el resto del set) usados como botón de "más
// acciones" — puntos rellenos, misma familia que Play/Pause.
export function MoreHorizontalIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  )
}

export function MoreVerticalIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

export function FolderPlusIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.5l2 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
      <line x1="12" x2="12" y1="11" y2="16" />
      <line x1="9.5" x2="14.5" y1="13.5" y2="13.5" />
    </svg>
  )
}

export function FilePlusIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" x2="12" y1="12" y2="18" />
      <line x1="9" x2="15" y1="15" y2="15" />
    </svg>
  )
}

// Los siguientes cinco se agregan para la pantalla de Ayuda (una por
// sección) — mismo trazo/tamaño que el resto del set, nada nuevo que
// aprender visualmente.

export function SmartphoneIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <line x1="12" x2="12.01" y1="18" y2="18" />
    </svg>
  )
}

export function SlidersIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <line x1="4" x2="20" y1="7" y2="7" />
      <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
      <line x1="4" x2="20" y1="17" y2="17" />
      <circle cx="15" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GamepadIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <line x1="6" x2="10" y1="12" y2="12" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="11" r="1" fill="currentColor" stroke="none" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.152A4 4 0 0 0 17.32 5Z" />
    </svg>
  )
}

export function DownloadIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

export function AlertCircleIcon({ className = DEFAULT_SIZE }: IconProps) {
  return (
    <svg {...strokeProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  )
}
