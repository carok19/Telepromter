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
