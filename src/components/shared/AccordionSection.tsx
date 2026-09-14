// Sección plegable genérica para páginas largas de solo lectura (por ahora,
// la pantalla de Ayuda). Deliberadamente CONTROLADA desde afuera (recibe
// `open`/`onToggle`, no maneja su propio estado interno) — a diferencia del
// `Section` privado de CalibrationSettingsPanel.tsx, acá hace falta poder
// abrir una sección puntual desde código (los accesos directos "?" que
// llegan con un ancla en la URL, ver HelpPage.tsx) y no solo con un click.
import type { ComponentType, ReactNode } from 'react'
import { ChevronDownIcon } from './Icons'
import { FONT_DISPLAY, RADIUS_CARD, SURFACE, SURFACE_BORDER } from '../../styles/tokens'

interface AccordionSectionProps {
  id: string
  title: string
  icon: ComponentType<{ className?: string }>
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function AccordionSection({ id, title, icon: Icon, open, onToggle, children }: AccordionSectionProps) {
  return (
    <div id={id} className={`${RADIUS_CARD} ${SURFACE} ${SURFACE_BORDER} scroll-mt-4 overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <Icon className="h-5 w-5 shrink-0 text-accent" />
        <span className={`flex-1 text-[15px] font-semibold text-gray-100 ${FONT_DISPLAY}`}>{title}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="flex flex-col gap-3 px-4 pb-4 text-sm leading-relaxed text-gray-300">{children}</div>}
    </div>
  )
}
