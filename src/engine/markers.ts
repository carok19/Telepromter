// Vocabulario de marcadores embebidos en el HTML del guion.
// El TeleprompterEngine (Fase 2) leerá estas mismas clases/atributos para
// decidir si un marcador de pausa debe detener el autoscroll. En Fase 1
// solo se prepara la estructura del contenido; no hay reproducción todavía.
import { ACCENT_BG, ACCENT_SOFT_BG, ACCENT_TEXT, ON_ACCENT } from '../styles/tokens'

export const PAUSE_MARKER_CLASS = 'tp-marker-pause'
export const NOTE_MARKER_CLASS = 'tp-note'
export const AUTO_PAUSE_ATTR = 'data-auto-pause'

// Handoff: la "pausa" del mockup es una píldora lisa (bg acento suave,
// texto acento, sin borde) — acá se mantienen DOS variantes (a diferencia
// del mockup, que solo tiene una) porque acá sí importa distinguir "pausa
// solo visual" de "pausa automática" (Fase 2 la usará para el autoscroll):
// la automática usa el acento SÓLIDO (como un chip ya "activado"), no un
// tono más fuerte del mismo borde.
const PAUSE_VISUAL_STYLE = `${ACCENT_SOFT_BG} ${ACCENT_TEXT}`
const PAUSE_AUTO_STYLE = `${ACCENT_BG} ${ON_ACCENT}`

export function getPauseMarkerClassName(autoPause: boolean): string {
  return `${PAUSE_MARKER_CLASS} rounded-full px-2.5 py-0.5 text-[13px] font-semibold align-middle ${
    autoPause ? PAUSE_AUTO_STYLE : PAUSE_VISUAL_STYLE
  }`
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildPauseMarkerHtml(autoPause = false): string {
  const label = autoPause ? '⏸ PAUSA' : '[PAUSA]'
  return `<span class="${getPauseMarkerClassName(autoPause)}" contenteditable="false" ${AUTO_PAUSE_ATTR}="${autoPause}" data-marker="pause" title="Clic para alternar entre pausa visual y pausa automática (se usará en Fase 2)">${label}</span>&nbsp;`
}

export function buildNoteMarkerHtml(text = 'Nota: ', tempId?: string): string {
  const idAttr = tempId ? ` data-temp-id="${tempId}"` : ''
  return `<span class="${NOTE_MARKER_CLASS} italic text-sky-300/90"${idAttr} data-marker="note">${escapeHtml(text)}</span>`
}
